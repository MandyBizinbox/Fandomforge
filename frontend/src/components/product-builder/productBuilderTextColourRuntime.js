// Builder V2 text control guard.
// React owns profile, stocked-colour, text and font state. This runtime only
// guards UI edge cases in the active Text Layer inspector while the larger
// Builder Studio is being stabilised.

const GOOGLE_FONT_FAMILIES = new Set([
  "Roboto", "Montserrat", "Poppins", "Oswald", "Bebas Neue", "Anton", "Raleway",
  "Playfair Display", "Lobster", "Pacifico", "Bangers", "Permanent Marker",
]);

function normaliseText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function rawText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function fontCssFamily(fontFamily) {
  return GOOGLE_FONT_FAMILIES.has(fontFamily)
    ? `"${fontFamily}", Arial, sans-serif`
    : `${fontFamily || "Arial"}, Arial, sans-serif`;
}

function googleFontHref(fontFamily) {
  const family = String(fontFamily || "").trim().replace(/\s+/g, "+");
  return `https://fonts.googleapis.com/css2?family=${family}:wght@400;600;700;900&display=swap`;
}

function ensureGoogleFontLink(fontFamily) {
  if (typeof document === "undefined" || !GOOGLE_FONT_FAMILIES.has(fontFamily)) return;
  const id = `ff-google-font-${String(fontFamily).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = googleFontHref(fontFamily);
  document.head.appendChild(link);
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

function findFieldByLabel(textEditor, labelText, selector) {
  if (!textEditor) return null;
  const labels = [...textEditor.querySelectorAll("label")];
  const label = labels.find((node) => normaliseText(node.textContent).startsWith(normaliseText(labelText)));
  return label?.querySelector(selector) || null;
}

function activeTextSettings(root, inspector) {
  const textEditor = findTextEditor(inspector);
  const textarea = textEditor?.querySelector("textarea") || null;
  const fontSelect = findFieldByLabel(textEditor, "Font", "select");
  const weightSelect = findFieldByLabel(textEditor, "Weight", "select");
  const text = rawText(textarea?.value || textarea?.textContent || "");
  return {
    text,
    fontFamily: fontSelect?.value || "Roboto",
    fontWeight: weightSelect?.value || "700",
  };
}

function findActivePreviewTextNodes(root, text) {
  if (!root || !text) return [];
  const main = root.querySelector("main");
  if (!main) return [];
  const candidates = [...main.querySelectorAll("div")].filter((node) => {
    if (node.querySelector("div, img, button, textarea, select, input")) return false;
    return rawText(node.textContent) === text;
  });
  return candidates;
}

function textEditorContainsTarget(target) {
  const root = studioRoot();
  const inspector = findInspector(root);
  const textEditor = findTextEditor(inspector);
  return Boolean(textEditor && target instanceof Element && textEditor.contains(target));
}

function markTextLayerEditRafSuppression(event) {
  const target = event?.target;
  if (!textEditorContainsTarget(target)) return;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;

  // ProductArtworkStudio currently regenerates the text layer and then schedules a
  // requestAnimationFrame placement recalculation using the previous render's slot.
  // That stale frame can overwrite the just-selected font/text settings back to
  // the old value, most visibly reverting fonts to Roboto. Suppress the next
  // immediate frame for text-editor changes; the atomic React text patch already
  // includes the new asset and placement.
  window.__ffSuppressNextTextLayerRafCount = Math.max(Number(window.__ffSuppressNextTextLayerRafCount || 0), 1);
}

function installTextLayerRafGuard() {
  if (typeof window === "undefined" || window.__ffTextLayerRafGuardInstalled) return;
  window.__ffTextLayerRafGuardInstalled = true;
  const nativeRequestAnimationFrame = window.requestAnimationFrame?.bind(window);
  if (!nativeRequestAnimationFrame) return;

  window.requestAnimationFrame = (callback) => {
    if (Number(window.__ffSuppressNextTextLayerRafCount || 0) > 0) {
      window.__ffSuppressNextTextLayerRafCount = Number(window.__ffSuppressNextTextLayerRafCount || 0) - 1;
      return nativeRequestAnimationFrame(() => undefined);
    }
    return nativeRequestAnimationFrame(callback);
  };
}

async function applyActiveTextFont() {
  const root = studioRoot();
  const inspector = findInspector(root);
  if (!root || !inspector) return;

  const { text, fontFamily, fontWeight } = activeTextSettings(root, inspector);
  if (!text || !fontFamily) return;

  ensureGoogleFontLink(fontFamily);
  try {
    if (document.fonts?.load) {
      await document.fonts.load(`${fontWeight || "700"} 48px "${fontFamily}"`);
    }
  } catch (error) {
    // Font loading failures should not block the Builder UI.
  }

  const nodes = findActivePreviewTextNodes(root, text);
  nodes.forEach((node) => {
    node.style.fontFamily = fontCssFamily(fontFamily);
    node.style.fontWeight = fontWeight || "700";
  });
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

function runTextControlGuard() {
  hideNativeTextColourPickerWhenStocked();
  applyActiveTextFont();
  window.setTimeout(() => {
    hideNativeTextColourPickerWhenStocked();
    applyActiveTextFont();
  }, 60);
  window.setTimeout(() => {
    hideNativeTextColourPickerWhenStocked();
    applyActiveTextFont();
  }, 200);
}

if (typeof window !== "undefined") {
  if (!window.__ffBuilderTextColourGuardAttached) {
    window.__ffBuilderTextColourGuardAttached = true;
    installTextLayerRafGuard();
    window.addEventListener("load", runTextControlGuard);
    window.addEventListener("change", markTextLayerEditRafSuppression, true);
    window.addEventListener("input", markTextLayerEditRafSuppression, true);
    window.addEventListener("click", runTextControlGuard, true);
    window.addEventListener("change", runTextControlGuard, true);
    window.addEventListener("input", runTextControlGuard, true);

    const observer = new MutationObserver(runTextControlGuard);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
}
