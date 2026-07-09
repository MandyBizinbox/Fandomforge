// Builder V2 manufacturing-rules runtime helper.
// Server validation remains authoritative. This file only nudges the creator UI
// toward manufacturable colour choices while the full Builder component evolves.

const RULE_CACHE_KEY = "ff_builder_production_rules:v1";
const HTV_METHOD_TERMS = ["htv", "heat transfer vinyl"];
const VINYL_METHOD_TERMS = ["adhesive vinyl", "vinyl decal", "cut vinyl"];
const DTF_METHOD_TERMS = ["dtf"];
const UV_DTF_METHOD_TERMS = ["uv dtf", "uvdtf"];
const SUBLIMATION_METHOD_TERMS = ["sublimation"];

let rulesCache = null;
let colourGuardTimer = null;
let lastMethodKey = "";

function normalise(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function hex(value) {
  const raw = String(value || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw.slice(1).split("").map((ch) => ch + ch).join("")}`.toLowerCase();
  }
  return "";
}

function builderShell() {
  return document.querySelector('[data-testid="creator-product-builder"], [data-testid="admin-product-builder"], .product-builder-main, .product-builder-layout');
}

function apiBase() {
  return process.env.REACT_APP_API_URL || "/api";
}

function readCachedRules() {
  if (rulesCache) return rulesCache;
  try {
    const cached = JSON.parse(window.localStorage.getItem(RULE_CACHE_KEY) || "null");
    if (cached?.methods?.length) {
      rulesCache = cached;
      return rulesCache;
    }
  } catch (error) {
    // Ignore malformed cache.
  }
  return { methods: [], stockedColours: [] };
}

async function fetchRules() {
  try {
    const [methodRes, colourRes] = await Promise.all([
      fetch(`${apiBase()}/production-rules/methods`, { credentials: "include" }),
      fetch(`${apiBase()}/production-rules/stocked-colours`, { credentials: "include" }),
    ]);
    if (!methodRes.ok || !colourRes.ok) return readCachedRules();
    const methods = await methodRes.json();
    const stockedColours = await colourRes.json();
    rulesCache = { methods: Array.isArray(methods) ? methods : [], stockedColours: Array.isArray(stockedColours) ? stockedColours : [], fetchedAt: Date.now() };
    window.localStorage.setItem(RULE_CACHE_KEY, JSON.stringify(rulesCache));
    return rulesCache;
  } catch (error) {
    return readCachedRules();
  }
}

function methodFromText(text) {
  const value = normalise(text);
  if (!value) return "";

  // UV DTF must be checked before DTF so it does not collapse into normal DTF.
  if (UV_DTF_METHOD_TERMS.some((term) => value.includes(term))) return "uv_dtf";

  // Prefer DTF before HTV/Vinyl when reading a selected option. The previous helper
  // scanned too much page text and could find HTV in unselected option lists.
  if (DTF_METHOD_TERMS.some((term) => new RegExp(`(^|[^a-z0-9])${term}([^a-z0-9]|$)`).test(value))) return "dtf";
  if (SUBLIMATION_METHOD_TERMS.some((term) => value.includes(term))) return "sublimation";
  if (HTV_METHOD_TERMS.some((term) => value.includes(term))) return "htv";
  if (VINYL_METHOD_TERMS.some((term) => value.includes(term))) return "adhesive_vinyl";
  return "";
}

function methodContextText(node) {
  if (!node) return "";
  const candidates = [
    node.getAttribute?.("aria-label"),
    node.getAttribute?.("placeholder"),
    node.getAttribute?.("name"),
    node.getAttribute?.("id"),
    node.getAttribute?.("data-field"),
    node.getAttribute?.("data-testid"),
    node.closest?.("label")?.textContent,
    node.closest?.(".field, .form-field, .select-field, .builder-field, .control, .panel, .section")?.textContent,
  ];
  return normalise(candidates.filter(Boolean).join(" "));
}

function selectedSelectMethod(shell) {
  const selects = [...shell.querySelectorAll("select")];

  for (const select of selects) {
    const selectedOption = select.selectedOptions?.[0] || select.options?.[select.selectedIndex];
    const selectedText = `${selectedOption?.textContent || ""} ${select.value || ""}`;
    const methodKey = methodFromText(selectedText);
    if (!methodKey) continue;

    const context = methodContextText(select);
    const looksLikePrintMethodField = context.includes("print method") || context.includes("production method") || context.includes("manufacturing method") || context.includes("method");
    if (looksLikePrintMethodField) return methodKey;
  }

  // Fallback: if exactly one select has a selected production method, use it. This
  // prevents reading unselected options from a select's full textContent.
  const selectedMethodKeys = selects
    .map((select) => {
      const selectedOption = select.selectedOptions?.[0] || select.options?.[select.selectedIndex];
      return methodFromText(`${selectedOption?.textContent || ""} ${select.value || ""}`);
    })
    .filter(Boolean);
  const unique = [...new Set(selectedMethodKeys)];
  return unique.length === 1 ? unique[0] : "";
}

function selectedControlMethod(shell) {
  const controls = [
    ...shell.querySelectorAll('[data-print-method], [data-production-method], [data-manufacturing-method], [data-method-key]'),
    ...shell.querySelectorAll('[role="option"][aria-selected="true"], [aria-selected="true"], [aria-checked="true"], [data-state="checked"], [data-state="active"]'),
  ];

  for (const node of controls) {
    if (node instanceof HTMLOptionElement) continue;
    const values = [
      node.getAttribute?.("data-print-method"),
      node.getAttribute?.("data-production-method"),
      node.getAttribute?.("data-manufacturing-method"),
      node.getAttribute?.("data-method-key"),
      node.getAttribute?.("aria-label"),
      node.getAttribute?.("title"),
      node.textContent,
    ];
    const methodKey = methodFromText(values.filter(Boolean).join(" "));
    if (methodKey) return methodKey;
  }
  return "";
}

function currentMethodKey() {
  const shell = builderShell();
  if (!shell) return "";

  // The selected print-method control is authoritative. Do not scan the full builder
  // text because dropdown option lists include unselected methods such as HTV.
  return selectedSelectMethod(shell) || selectedControlMethod(shell) || "";
}

function methodRule(methodKey) {
  const { methods } = readCachedRules();
  return methods.find((method) => method.method_key === methodKey || method.internal_id === methodKey) || null;
}

function colourLibraryFor(methodKey, rule) {
  const cache = readCachedRules();
  const coloursFromRule = rule?.supported_colours?.colours || [];
  const colours = coloursFromRule.length ? coloursFromRule : cache.stockedColours.filter((colour) => (colour.applies_to_methods || []).includes(methodKey));
  return colours
    .filter((colour) => colour && colour.active !== false && hex(colour.hex))
    .map((colour) => ({ id: colour.id || colour.name || colour.hex, name: colour.name || colour.id || colour.hex, hex: hex(colour.hex) }));
}

function closestColour(value, library) {
  const current = hex(value);
  if (!current || !library.length) return library[0]?.hex || "#000000";
  const exact = library.find((colour) => colour.hex === current);
  if (exact) return exact.hex;
  const rgb = current.match(/[0-9a-f]{2}/gi).map((part) => parseInt(part, 16));
  let best = library[0];
  let bestScore = Number.MAX_SAFE_INTEGER;
  library.forEach((colour) => {
    const parts = colour.hex.match(/[0-9a-f]{2}/gi).map((part) => parseInt(part, 16));
    const score = Math.pow(rgb[0] - parts[0], 2) + Math.pow(rgb[1] - parts[1], 2) + Math.pow(rgb[2] - parts[2], 2);
    if (score < bestScore) {
      best = colour;
      bestScore = score;
    }
  });
  return best.hex;
}

function setNativeValue(element, value) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  if (descriptor?.set) descriptor.set.call(element, value);
  else element.value = value;
  element.setAttribute("value", value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function ensureNotice(shell, methodKey, rule, library) {
  let notice = document.getElementById("ff-builder-production-rule-notice");
  if (!notice) {
    notice = document.createElement("div");
    notice.id = "ff-builder-production-rule-notice";
    notice.style.margin = "10px 0";
    notice.style.padding = "10px 12px";
    notice.style.border = "1px solid rgba(255,255,255,0.18)";
    notice.style.background = "rgba(255,255,255,0.04)";
    notice.style.color = "#fff";
    notice.style.fontSize = "12px";
    notice.style.fontWeight = "700";
    notice.style.textTransform = "uppercase";
    notice.style.letterSpacing = "0.08em";
    const target = shell.querySelector(".product-builder-main") || shell;
    target.prepend(notice);
  }
  const mode = rule?.creator_restrictions?.colour_picker || rule?.supported_colours?.mode || "rgb";
  if (mode === "stocked_library") {
    notice.textContent = `${rule.display_name || methodKey}: stocked manufacturing colours only (${library.length} colours). Server validation will block unsupported colours.`;
    notice.style.borderColor = "rgba(255,193,7,0.65)";
  } else {
    notice.textContent = `${rule?.display_name || methodKey || "Selected method"}: full RGB colour is allowed. Server validation still checks size, material and print area rules.`;
    notice.style.borderColor = "rgba(52,199,89,0.55)";
  }
}

function ensureSwatchPicker(input, library) {
  if (!(input instanceof HTMLInputElement) || !library.length) return;
  let picker = input.parentElement?.querySelector?.(`[data-ff-colour-picker-for="${input.dataset.ffProductionColourId}"]`);
  if (!picker) {
    picker = document.createElement("select");
    picker.dataset.ffColourPickerFor = input.dataset.ffProductionColourId;
    picker.style.marginLeft = "8px";
    picker.style.maxWidth = "180px";
    picker.style.background = "#111";
    picker.style.color = "#fff";
    picker.style.border = "1px solid rgba(255,255,255,0.2)";
    picker.style.padding = "6px";
    input.insertAdjacentElement("afterend", picker);
    picker.addEventListener("change", () => setNativeValue(input, picker.value));
  }
  const current = input.value;
  const options = library.map((colour) => `<option value="${colour.hex}">${colour.name}</option>`).join("");
  if (picker.dataset.ffOptions !== options) {
    picker.innerHTML = options;
    picker.dataset.ffOptions = options;
  }
  picker.value = closestColour(current, library);
}

function removeSwatchPickers(shell) {
  shell.querySelectorAll("select[data-ff-colour-picker-for]").forEach((picker) => picker.remove());
  shell.querySelectorAll('input[data-ff-manufacturing-colour-restricted="1"]').forEach((input) => {
    input.removeAttribute("data-ff-manufacturing-colour-restricted");
  });
}

function guardColourInputs() {
  if (typeof document === "undefined") return;
  const shell = builderShell();
  if (!shell) return;
  const methodKey = currentMethodKey();
  if (!methodKey) {
    removeSwatchPickers(shell);
    return;
  }
  const rule = methodRule(methodKey);
  if (!rule) {
    removeSwatchPickers(shell);
    return;
  }
  const mode = rule?.creator_restrictions?.colour_picker || rule?.supported_colours?.mode || "rgb";
  const library = colourLibraryFor(methodKey, rule);
  ensureNotice(shell, methodKey, rule, library);

  if (mode !== "stocked_library" || !library.length) {
    removeSwatchPickers(shell);
    lastMethodKey = methodKey;
    return;
  }

  shell.querySelectorAll('input[type="color"], input[data-ff-colour-input="1"], input[data-ff-color-input="1"]').forEach((input, index) => {
    if (!(input instanceof HTMLInputElement)) return;
    if (!input.dataset.ffProductionColourId) input.dataset.ffProductionColourId = `colour-${index}-${Math.random().toString(16).slice(2)}`;
    input.dataset.ffManufacturingColourRestricted = "1";
    const approved = closestColour(input.value, library);
    if (hex(input.value) !== approved || methodKey !== lastMethodKey) {
      setNativeValue(input, approved);
    }
    ensureSwatchPicker(input, library);
  });

  lastMethodKey = methodKey;
}

function startProductionRulesRuntime() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  fetchRules().then(() => guardColourInputs());
  if (colourGuardTimer) window.clearInterval(colourGuardTimer);
  colourGuardTimer = window.setInterval(() => {
    guardColourInputs();
  }, 1200);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startProductionRulesRuntime, { once: true });
} else {
  startProductionRulesRuntime();
}
