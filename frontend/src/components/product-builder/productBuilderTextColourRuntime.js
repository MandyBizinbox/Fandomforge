// Builder V2 text colour guard.
// React owns profile/stocked-colour state; this runtime only prevents the legacy
// native RGB text colour input from appearing when the active layer requires a
// stocked manufacturing colour. The stocked-colour selector remains the single
// visible colour control for HTV/adhesive-vinyl text layers.

function normaliseText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function studioRoot() {
  if (typeof document === "undefined") return null;
  return document.querySelector('[data-testid="product-artwork-studio"]');
}

function findInspector(root) {
  if (!root) return null;
  const headings = [...root.querySelectorAll("h3")];
  const activeHeading = headings.find((node) => normaliseText(node.textContent).includes("text layer"));
  return activeHeading?.closest("aside") || null;
}

function findTextEditor(inspector) {
  if (!inspector) return null;
  return [...inspector.querySelectorAll("div")].find((node) => {
    const text = normaliseText(node.textContent);
    return text.includes("text editor") && text.includes("text render size") && text.includes("colour");
  }) || null;
}

function labelForNativeColourInput(textEditor) {
  if (!textEditor) return null;
  const colourInput = textEditor.querySelector('input[type="color"]');
  if (!colourInput) return null;
  return colourInput.closest("label") || colourInput.parentElement;
}

function activeLayerRequiresStockedColour(inspector) {
  if (!inspector) return false;
  return normaliseText(inspector.textContent).includes("stocked colour required");
}

function hideNativeTextColourPickerWhenStocked() {
  const root = studioRoot();
  const inspector = findInspector(root);
  const textEditor = findTextEditor(inspector);
  const colourLabel = labelForNativeColourInput(textEditor);
  if (!colourLabel) return;

  const requiresStocked = activeLayerRequiresStockedColour(inspector);
  colourLabel.style.display = requiresStocked ? "none" : "";
  colourLabel.setAttribute("aria-hidden", requiresStocked ? "true" : "false");

  const input = colourLabel.querySelector('input[type="color"]');
  if (input) input.disabled = requiresStocked;
}

function runTextColourGuard() {
  hideNativeTextColourPickerWhenStocked();
  window.setTimeout(hideNativeTextColourPickerWhenStocked, 60);
  window.setTimeout(hideNativeTextColourPickerWhenStocked, 200);
}

if (typeof window !== "undefined") {
  if (!window.__ffBuilderTextColourGuardAttached) {
    window.__ffBuilderTextColourGuardAttached = true;
    window.addEventListener("load", runTextColourGuard);
    window.addEventListener("click", runTextColourGuard, true);
    window.addEventListener("change", runTextColourGuard, true);
    window.addEventListener("input", runTextColourGuard, true);

    const observer = new MutationObserver(runTextColourGuard);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
}
