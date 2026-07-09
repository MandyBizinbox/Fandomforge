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

function moveTemplateDescriptionToSpecs() {
  if (typeof document === "undefined") return;
  const shell = document.querySelector('[data-testid="creator-product-builder"], [data-testid="admin-product-builder"]');
  if (!shell) return;

  const description = shell.querySelector('[data-format-field="description"]');
  const specs = shell.querySelector('[data-format-field="specs"]');
  if (!description || !specs) return;

  const descriptionValue = String(description.value || "").trim();
  const specsValue = String(specs.value || "").trim();

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

function scheduleDetailsFieldFix() {
  window.requestAnimationFrame(() => {
    moveTemplateDescriptionToSpecs();
    window.setTimeout(moveTemplateDescriptionToSpecs, 120);
    window.setTimeout(moveTemplateDescriptionToSpecs, 350);
  });
}

if (typeof window !== "undefined" && !window.__fandomForgeBuilderV2RuntimeLoaded) {
  window.__fandomForgeBuilderV2RuntimeLoaded = true;
  scheduleDetailsFieldFix();
  const observer = new MutationObserver(scheduleDetailsFieldFix);
  observer.observe(document.body, { childList: true, subtree: true });
}
