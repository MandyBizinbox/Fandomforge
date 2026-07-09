// Runtime safeguards for the Builder V2 sprint.
// This file is intentionally side-effect only. It protects the current Builder flow
// while the larger ProductBuilder component is being refactored.

const DRAFT_STORAGE_PREFIX = "ff_builder_v2_draft:";
const PATH_STORAGE_PREFIX = "ff_builder_v2_path:";
let safeguardTimer = null;
let lastSafeguardRun = 0;
let restoreTimer = null;
let restoreAttempts = 0;
let creatingServerDraft = false;

function normaliseText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function lowerText(value) {
  return normaliseText(value).toLowerCase();
}

function setNativeValue(element, value) {
  if (!element) return;
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  if (descriptor?.set) descriptor.set.call(element, value);
  else element.value = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function forceLtrField(element) {
  if (!element) return;
  if (element.dir !== "ltr") element.dir = "ltr";
  if (element.getAttribute("dir") !== "ltr") element.setAttribute("dir", "ltr");
  if (element.style.direction !== "ltr") element.style.direction = "ltr";
  if (element.style.unicodeBidi !== "isolate") element.style.unicodeBidi = "isolate";
  if (element.style.textAlign !== "left") element.style.textAlign = "left";
}

function builderShell() {
  return document.querySelector('[data-testid="creator-product-builder"], [data-testid="admin-product-builder"]');
}

function builderMain() {
  return document.querySelector(".product-builder-main") || builderShell();
}

function stepFromText(text) {
  const value = lowerText(text);
  if (value.includes("1 product type")) return "product_type";
  if (value.includes("2 product option")) return "product_option";
  if (value.includes("3 details")) return "details";
  if (value.includes("4 variations")) return "variations";
  if (value.includes("5 artwork scope")) return "scope";
  if (value.includes("6 artwork")) return "artwork";
  if (value.includes("7 pricing")) return "pricing";
  if (value.includes("8 review")) return "review";
  return "";
}

function currentScreenKey() {
  const main = builderMain();
  const text = lowerText(main?.textContent || "");
  if (text.includes("choose product type")) return "product_type";
  if (text.includes("choose product option")) return "product_option";
  if (text.includes("product details") || text.includes("create the sellable product shell")) return "details";
  if (text.includes("variation selection")) return "variations";
  if (text.includes("artwork scope")) return "scope";
  if (text.includes("artwork studio")) return "artwork";
  if (text.includes("pricing")) return "pricing";
  if (text.includes("final review")) return "review";
  return "";
}

function draftKey() {
  return `${DRAFT_STORAGE_PREFIX}${window.location.pathname}`;
}

function pathKey() {
  return `${PATH_STORAGE_PREFIX}${window.location.pathname}`;
}

function readJson(key) {
  try {
    return JSON.parse(window.localStorage.getItem(key) || "null") || {};
  } catch (error) {
    return {};
  }
}

function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // Ignore storage quota/private mode failures.
  }
}

function getPathDraft() {
  return readJson(pathKey());
}

function setPathDraft(patch) {
  writeJson(pathKey(), { ...getPathDraft(), ...patch, saved_at: Date.now() });
}

function showTransientNotice(message, tone = "info") {
  let node = document.getElementById("ff-builder-runtime-notice");
  if (!node) {
    node = document.createElement("div");
    node.id = "ff-builder-runtime-notice";
    node.style.position = "fixed";
    node.style.right = "18px";
    node.style.bottom = "18px";
    node.style.zIndex = "99999";
    node.style.padding = "12px 14px";
    node.style.border = "1px solid rgba(255,255,255,0.18)";
    node.style.background = "#111";
    node.style.color = "#fff";
    node.style.fontSize = "12px";
    node.style.fontWeight = "700";
    node.style.textTransform = "uppercase";
    node.style.letterSpacing = "0.08em";
    document.body.appendChild(node);
  }
  node.textContent = message;
  node.style.borderColor = tone === "error" ? "#FF3B30" : "#34C759";
  window.setTimeout(() => {
    if (node?.parentElement) node.parentElement.removeChild(node);
  }, 3500);
}

function moveTemplateDescriptionToSpecs() {
  if (typeof document === "undefined") return;
  const shell = builderShell();
  if (!shell) return;
  const description = shell.querySelector('[data-format-field="description"]');
  const specs = shell.querySelector('[data-format-field="specs"]');
  if (!description || !specs) return;
  const descriptionValue = String(description.value || "").trim();
  const specsValue = String(specs.value || "").trim();
  forceLtrField(description);
  forceLtrField(specs);
  if (!descriptionValue || specsValue || description.dataset.ffMovedToSpecs === "1") return;
  if (document.activeElement === description || document.activeElement === specs) return;
  if (descriptionValue.length < 12) return;
  description.dataset.ffMovedToSpecs = "1";
  specs.dataset.ffReceivedTemplateSpecs = "1";
  setNativeValue(specs, description.value);
  setNativeValue(description, "");
}

function stabiliseMoneyInputs() {
  if (typeof document === "undefined") return;
  const inputs = document.querySelectorAll(
    '.pricing-step-full-width input[type="number"], [data-testid="variation-pricing-matrix"] input[type="number"], .pricing-step-full-width input[data-ff-money-input="1"], [data-testid="variation-pricing-matrix"] input[data-ff-money-input="1"]'
  );
  inputs.forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    input.dataset.ffMoneyInput = "1";
    input.type = "text";
    input.inputMode = "decimal";
    input.autocomplete = "off";
    input.setAttribute("pattern", "[0-9]*[.,]?[0-9]*");
    forceLtrField(input);
    if (!input.dataset.ffMoneyHandlersAttached) {
      input.dataset.ffMoneyHandlersAttached = "1";
      input.addEventListener("wheel", (event) => {
        if (document.activeElement === input) event.preventDefault();
      }, { passive: false });
      input.addEventListener("keydown", (event) => {
        const allowed = ["Backspace", "Delete", "Tab", "Escape", "Enter", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
        if (event.ctrlKey || event.metaKey || allowed.includes(event.key)) return;
        if (/^[0-9]$/.test(event.key)) return;
        if ((event.key === "." || event.key === ",") && !String(input.value || "").includes(".") && !String(input.value || "").includes(",")) return;
        event.preventDefault();
      });
      input.addEventListener("blur", () => {
        const cleaned = String(input.value || "").replace(",", ".");
        if (cleaned !== input.value) setNativeValue(input, cleaned);
      });
    }
  });
}

function stabiliseBuilderInputs() {
  if (typeof document === "undefined") return;
  document.querySelectorAll(
    '.product-builder-main input, .product-builder-main textarea, .product-builder-layout input, .product-builder-layout textarea, [data-testid="product-artwork-studio"] input'
  ).forEach((element) => forceLtrField(element));
}

function inputForLabelText(text) {
  const labels = [...document.querySelectorAll("label, .label")];
  const label = labels.find((item) => lowerText(item.textContent).includes(text.toLowerCase()));
  if (!label) return null;
  const nested = label.querySelector?.("input, textarea, select");
  if (nested) return nested;
  const parent = label.parentElement;
  return parent?.querySelector?.("input, textarea, select") || null;
}

function mutateInputText(input, nextValue) {
  input.value = nextValue;
  input.setAttribute("value", nextValue);
  input.dispatchEvent(new Event("keyup", { bubbles: true }));
}

function stabiliseTextRenderSizeInput() {
  if (typeof document === "undefined") return;
  const input = inputForLabelText("Text render size");
  if (!(input instanceof HTMLInputElement)) return;
  input.type = "text";
  input.inputMode = "numeric";
  input.autocomplete = "off";
  input.dataset.ffTextRenderInput = "1";
  forceLtrField(input);
  if (input.dataset.ffTextRenderHandlersAttached) return;
  input.dataset.ffTextRenderHandlersAttached = "1";
  input.addEventListener("focus", () => window.setTimeout(() => input.select(), 0));
  input.addEventListener("beforeinput", (event) => {
    const data = event.data || "";
    if (event.inputType === "insertText" && !/^\d+$/.test(data)) {
      event.preventDefault();
      return;
    }
    if (event.inputType === "insertText") {
      event.preventDefault();
      event.stopPropagation();
      const start = input.selectionStart ?? String(input.value || "").length;
      const end = input.selectionEnd ?? start;
      const next = `${String(input.value || "").slice(0, start)}${data}${String(input.value || "").slice(end)}`.replace(/\D+/g, "").slice(0, 4);
      mutateInputText(input, next);
      input.setSelectionRange(next.length, next.length);
    }
  });
  input.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || ["Tab", "Escape", "Enter", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      event.stopPropagation();
      const value = String(input.value || "");
      const start = input.selectionStart ?? value.length;
      const end = input.selectionEnd ?? start;
      let next = value;
      let cursor = start;
      if (start !== end) next = `${value.slice(0, start)}${value.slice(end)}`;
      else if (event.key === "Backspace" && start > 0) { next = `${value.slice(0, start - 1)}${value.slice(end)}`; cursor = start - 1; }
      else if (event.key === "Delete") next = `${value.slice(0, start)}${value.slice(start + 1)}`;
      mutateInputText(input, next.replace(/\D+/g, "").slice(0, 4));
      input.setSelectionRange(Math.max(0, cursor), Math.max(0, cursor));
    }
  });
  input.addEventListener("blur", () => {
    const raw = Number(String(input.value || "").replace(/\D+/g, ""));
    const finalValue = Math.max(24, Math.min(raw || 180, 1200));
    setNativeValue(input, String(finalValue));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function fieldKey(element, index) {
  const formatField = element.dataset?.formatField;
  if (formatField) return `format:${formatField}`;
  const label = element.closest("label")?.textContent || element.getAttribute("aria-label") || element.name || element.id || element.placeholder || `field-${index}`;
  return String(label).replace(/\s+/g, " ").trim().slice(0, 90) || `field-${index}`;
}

function collectDraftFields() {
  const shell = builderShell();
  if (!shell) return [];
  return [...shell.querySelectorAll("input, textarea, select")]
    .filter((element) => !element.type || !["file", "button", "submit", "checkbox", "radio"].includes(element.type))
    .filter((element) => !element.disabled);
}

function saveBuilderDraft() {
  if (typeof window === "undefined") return;
  const data = {};
  const detailFields = {};
  collectDraftFields().forEach((element, index) => {
    const key = fieldKey(element, index);
    data[key] = element.value;
    if (element.dataset?.formatField) detailFields[element.dataset.formatField] = element.value;
  });
  const titleInput = inputForLabelText("Product title");
  if (titleInput) detailFields.title = titleInput.value;
  writeJson(draftKey(), { saved_at: Date.now(), data, detailFields });
  if (Object.keys(detailFields).length) setPathDraft({ detailFields });
}

function restoreDetailsFromDraft() {
  const path = getPathDraft();
  const draft = readJson(draftKey());
  const detailFields = { ...(draft.detailFields || {}), ...(path.detailFields || {}) };
  if (!Object.keys(detailFields).length) return false;
  let restored = false;
  const titleInput = inputForLabelText("Product title");
  if (titleInput && detailFields.title && String(titleInput.value || "") !== String(detailFields.title)) {
    setNativeValue(titleInput, detailFields.title);
    restored = true;
  }
  document.querySelectorAll("[data-format-field]").forEach((element) => {
    const key = element.dataset.formatField;
    const value = detailFields[key];
    if (value === undefined || value === null) return;
    if (String(element.value || "") === String(value)) return;
    setNativeValue(element, value);
    restored = true;
  });
  return restored;
}

function restoreBuilderDraft() {
  if (typeof window === "undefined") return;
  const parsed = readJson(draftKey());
  if (!parsed?.data) return;
  collectDraftFields().forEach((element, index) => {
    const key = fieldKey(element, index);
    const value = parsed.data[key];
    if (value === undefined || value === null || String(element.value || "").trim() !== "") return;
    setNativeValue(element, value);
  });
  restoreDetailsFromDraft();
}

function isStepperButton(button) {
  return Boolean(stepFromText(button?.textContent || ""));
}

function isNavigationButton(button) {
  const text = lowerText(button?.textContent || "");
  return ["next", "previous", "back", "save", "create", "select all", "clear all", "clear visible", "select visible"].some((item) => text === item || text.includes(item));
}

function isNewBuilderUrl() {
  return /\/creator\/products\/new\/?$/.test(window.location.pathname) || /\/admin\/products\/new\/?$/.test(window.location.pathname);
}

function apiUrl(path) {
  return `${window.location.origin}/api${path}`;
}

function authHeaders() {
  const token = window.localStorage.getItem("mf_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function buildServerDraftPayload() {
  saveBuilderDraft();
  const path = getPathDraft();
  const details = path.detailFields || readJson(draftKey()).detailFields || {};
  const titleInput = inputForLabelText("Product title");
  const description = document.querySelector('[data-format-field="description"]');
  const specs = document.querySelector('[data-format-field="specs"]');
  return {
    draft_product_id: path.draftProductId || null,
    product_type_choice: path.productTypeChoice || "",
    product_option_choice: path.productOptionChoice || "",
    title: titleInput?.value || details.title || "",
    description: description?.value || details.description || "",
    specs: specs?.value || details.specs || "",
  };
}

async function createServerDraftAfterDetails() {
  if (creatingServerDraft || !isNewBuilderUrl()) return false;
  const payload = buildServerDraftPayload();
  if (!payload.product_option_choice) {
    showTransientNotice("Select a product option before draft save", "error");
    return false;
  }
  if (!normaliseText(payload.title)) {
    showTransientNotice("Enter a product title before draft save", "error");
    return false;
  }

  creatingServerDraft = true;
  showTransientNotice("Saving draft product…");
  try {
    const response = await fetch(apiUrl("/builder-drafts/product"), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "Draft product save failed");
    if (!data?.id) throw new Error("Draft product created without id");
    setPathDraft({ draftProductId: data.id, activeStep: "variations" });
    showTransientNotice("Draft saved. Opening draft…");
    window.location.assign(`/creator/products/${data.id}`);
    return true;
  } catch (error) {
    showTransientNotice(error.message || "Could not save draft product", "error");
    return false;
  } finally {
    creatingServerDraft = false;
  }
}

function rememberBuilderClick(event) {
  const shell = builderShell();
  if (!shell) return;
  const button = event.target?.closest?.("button");
  if (!button || !shell.contains(button)) return;
  const text = normaliseText(button.textContent || "");
  const step = stepFromText(text);
  if (step) {
    setPathDraft({ activeStep: step });
    return;
  }
  const screen = currentScreenKey();
  if (screen === "product_type" && !isNavigationButton(button)) {
    setPathDraft({ productTypeChoice: text });
  }
  if (screen === "product_option" && !isNavigationButton(button)) {
    setPathDraft({ productOptionChoice: text });
  }
  if (screen === "details" && lowerText(text).includes("next") && isNewBuilderUrl()) {
    event.preventDefault();
    event.stopPropagation();
    createServerDraftAfterDetails();
    return;
  }
  if (text.toLowerCase().includes("next") || text.toLowerCase().includes("save")) saveBuilderDraft();
}

function findMatchingButton(choiceText, scope = document) {
  const choice = lowerText(choiceText);
  if (!choice) return null;
  const buttons = [...scope.querySelectorAll("button")].filter((button) => !isStepperButton(button) && !isNavigationButton(button));
  return buttons.find((button) => lowerText(button.textContent) === choice)
    || buttons.find((button) => lowerText(button.textContent).includes(choice.slice(0, 80)))
    || buttons.find((button) => choice.includes(lowerText(button.textContent).slice(0, 80)));
}

function clickStep(stepKey) {
  const button = [...document.querySelectorAll("button")].find((item) => stepFromText(item.textContent) === stepKey);
  if (button) {
    button.click();
    return true;
  }
  return false;
}

function replayBuilderPath() {
  const path = getPathDraft();
  if (!path.productTypeChoice && !path.productOptionChoice && !path.detailFields && !path.activeStep) return;
  if (restoreAttempts > 40) return;
  restoreAttempts += 1;
  const screen = currentScreenKey();
  const main = builderMain();
  if (path.productTypeChoice && screen === "product_type") {
    const selected = main?.querySelector?.('button[aria-pressed="true"]');
    if (!selected) {
      const button = findMatchingButton(path.productTypeChoice, main || document);
      if (button) {
        button.click();
        return;
      }
    }
  }
  if (path.productOptionChoice && isNewBuilderUrl()) {
    if (screen !== "product_option" && screen !== "details") {
      clickStep("product_option");
      return;
    }
    if (screen === "product_option") {
      const selected = main?.querySelector?.('button[aria-pressed="true"]');
      if (!selected) {
        const button = findMatchingButton(path.productOptionChoice, main || document);
        if (button) {
          button.click();
          return;
        }
      }
    }
  }
  if (path.detailFields && isNewBuilderUrl()) {
    if (currentScreenKey() !== "details") {
      clickStep("details");
      return;
    }
    restoreDetailsFromDraft();
  }
  if (!isNewBuilderUrl() && path.activeStep === "variations" && currentScreenKey() !== "variations") {
    clickStep("variations");
  }
}

function scheduleReplayBuilderPath() {
  if (restoreTimer) return;
  restoreTimer = window.setTimeout(() => {
    restoreTimer = null;
    replayBuilderPath();
  }, 180);
}

function attachDraftHandlers() {
  const shell = builderShell();
  if (!shell || shell.dataset.ffDraftHandlersAttached) return;
  shell.dataset.ffDraftHandlersAttached = "1";
  shell.addEventListener("input", () => window.setTimeout(saveBuilderDraft, 50));
  shell.addEventListener("change", () => window.setTimeout(saveBuilderDraft, 50));
  shell.addEventListener("click", rememberBuilderClick, true);
}

function runBuilderV2Safeguards() {
  const now = Date.now();
  if (now - lastSafeguardRun < 250) return;
  lastSafeguardRun = now;
  moveTemplateDescriptionToSpecs();
  stabiliseMoneyInputs();
  stabiliseBuilderInputs();
  stabiliseTextRenderSizeInput();
  attachDraftHandlers();
  restoreBuilderDraft();
  scheduleReplayBuilderPath();
}

function scheduleBuilderV2Safeguards() {
  if (safeguardTimer) return;
  safeguardTimer = window.setTimeout(() => {
    safeguardTimer = null;
    runBuilderV2Safeguards();
  }, 120);
}

if (typeof window !== "undefined" && !window.__fandomForgeBuilderV2RuntimeLoaded) {
  window.__fandomForgeBuilderV2RuntimeLoaded = true;
  runBuilderV2Safeguards();
  window.setTimeout(runBuilderV2Safeguards, 350);
  window.setInterval(scheduleReplayBuilderPath, 500);
  const observer = new MutationObserver(scheduleBuilderV2Safeguards);
  observer.observe(document.body, { childList: true, subtree: true });
}
