// Runtime safeguards for the Builder V2 sprint.
// This file is intentionally small and side-effect only. It protects the current Builder
// flow while the larger ProductBuilder component is being refactored.

const DRAFT_STORAGE_PREFIX = "ff_builder_v2_draft:";

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
  element.dir = "ltr";
  element.setAttribute("dir", "ltr");
  element.style.direction = "ltr";
  element.style.unicodeBidi = "isolate";
  element.style.textAlign = "left";
}

function builderShell() {
  return document.querySelector('[data-testid="creator-product-builder"], [data-testid="admin-product-builder"], .product-builder-main, .product-builder-layout');
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

  // Template descriptions are generally longer than a user's short manual product blurb.
  // Move only when Specs is empty and Description appears to be auto-filled.
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
  const label = labels.find((item) => String(item.textContent || "").toLowerCase().includes(text.toLowerCase()));
  if (!label) return null;
  if (label.querySelector) {
    const nested = label.querySelector("input");
    if (nested) return nested;
  }
  const parent = label.parentElement;
  if (parent) {
    const within = parent.querySelector("input");
    if (within) return within;
  }
  return null;
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

  input.addEventListener("focus", () => {
    window.setTimeout(() => input.select(), 0);
  });

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

function draftKey() {
  return `${DRAFT_STORAGE_PREFIX}${window.location.pathname}`;
}

function fieldKey(element, index) {
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
  collectDraftFields().forEach((element, index) => {
    data[fieldKey(element, index)] = element.value;
  });
  try {
    window.localStorage.setItem(draftKey(), JSON.stringify({ saved_at: Date.now(), data }));
  } catch (error) {
    // Ignore storage quota/private mode failures.
  }
}

function restoreBuilderDraft() {
  if (typeof window === "undefined") return;
  let parsed = null;
  try {
    parsed = JSON.parse(window.localStorage.getItem(draftKey()) || "null");
  } catch (error) {
    parsed = null;
  }
  if (!parsed?.data) return;
  collectDraftFields().forEach((element, index) => {
    const key = fieldKey(element, index);
    const value = parsed.data[key];
    if (value === undefined || value === null || String(element.value || "").trim() !== "") return;
    setNativeValue(element, value);
  });
}

function attachDraftHandlers() {
  const shell = builderShell();
  if (!shell || shell.dataset.ffDraftHandlersAttached) return;
  shell.dataset.ffDraftHandlersAttached = "1";
  shell.addEventListener("input", () => window.setTimeout(saveBuilderDraft, 50));
  shell.addEventListener("change", () => window.setTimeout(saveBuilderDraft, 50));
  shell.addEventListener("click", (event) => {
    const button = event.target?.closest?.("button");
    const text = String(button?.textContent || "").toLowerCase();
    if (text.includes("next") || text.includes("save")) saveBuilderDraft();
  }, true);
}

function runBuilderV2Safeguards() {
  moveTemplateDescriptionToSpecs();
  stabiliseMoneyInputs();
  stabiliseBuilderInputs();
  stabiliseTextRenderSizeInput();
  attachDraftHandlers();
  restoreBuilderDraft();
}

function scheduleBuilderV2Safeguards() {
  window.requestAnimationFrame(() => {
    runBuilderV2Safeguards();
    window.setTimeout(runBuilderV2Safeguards, 120);
    window.setTimeout(runBuilderV2Safeguards, 350);
  });
}

if (typeof window !== "undefined" && !window.__fandomForgeBuilderV2RuntimeLoaded) {
  window.__fandomForgeBuilderV2RuntimeLoaded = true;
  scheduleBuilderV2Safeguards();
  const observer = new MutationObserver(scheduleBuilderV2Safeguards);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["type", "value", "class", "dir", "style"] });
}
