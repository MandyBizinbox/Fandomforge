// Runtime safeguards for the Builder V2 sprint.
// This file is intentionally small and side-effect only. It protects the current Builder
// flow while the larger ProductBuilder component is being refactored.

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

function moveTemplateDescriptionToSpecs() {
  if (typeof document === "undefined") return;
  const shell = document.querySelector('[data-testid="creator-product-builder"], [data-testid="admin-product-builder"]');
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

function runBuilderV2Safeguards() {
  moveTemplateDescriptionToSpecs();
  stabiliseMoneyInputs();
  stabiliseBuilderInputs();
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
