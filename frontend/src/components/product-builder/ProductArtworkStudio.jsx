import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ProductArtworkStudioBase from "./ProductArtworkStudioBase";

const FALLBACK_INSPECTOR_ID = "creator-toolbar-inspector-slot";
const LAYERS_INSPECTOR_ID = "creator-layer-inspector-slot";
const TEXT_FONT_OPTIONS = [
  "Roboto", "Montserrat", "Poppins", "Oswald", "Bebas Neue", "Anton", "Raleway",
  "Playfair Display", "Lobster", "Pacifico", "Bangers", "Permanent Marker",
  "Arial", "Impact", "Georgia", "Courier New",
];
const TEXT_WEIGHT_OPTIONS = [
  ["400", "Regular"],
  ["600", "Semi-bold"],
  ["700", "Bold"],
  ["900", "Heavy"],
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeColour(colour) {
  if (!colour && colour !== 0) return null;
  if (typeof colour === "string") {
    const value = colour.trim();
    if (!value) return null;
    return { id: value, value, label: value, hex: value.startsWith("#") ? value : "" };
  }
  if (typeof colour !== "object") return null;
  const value = String(colour.value || colour.id || colour.key || colour.name || colour.label || colour.hex || "").trim();
  if (!value) return null;
  return {
    id: String(colour.id || colour.key || value),
    value,
    label: String(colour.label || colour.name || colour.display_name || value),
    hex: String(colour.hex || colour.hex_code || (value.startsWith("#") ? value : "")),
  };
}

function activeArtworkSlot(artworkGroups, activeSlotId) {
  const slots = asArray(artworkGroups).flatMap((group) => asArray(group?.artworks));
  return slots.find((slot) => slot?.id === activeSlotId) || slots[0] || null;
}

function labelText(label) {
  return String(label?.querySelector?.(".label")?.textContent || label?.textContent || "").trim().toLowerCase();
}

function fieldForLabel(root, wanted) {
  if (!root) return null;
  const exact = String(wanted || "").trim().toLowerCase();
  return [...root.querySelectorAll("label")]
    .find((label) => labelText(label) === exact)
    ?.querySelector("input, textarea, select") || null;
}

function stockedColourSelect(root) {
  if (!root) return null;
  const blocks = [...root.querySelectorAll("div")];
  const block = blocks.find((node) => {
    const overline = node.querySelector(":scope > .overline");
    return String(overline?.textContent || "").trim().toLowerCase() === "stocked colour required";
  });
  return block?.querySelector("select") || null;
}

function setNativeValue(element, value) {
  if (!element) return false;
  const proto = element instanceof HTMLSelectElement
    ? HTMLSelectElement.prototype
    : element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(element, String(value ?? ""));
  else element.value = String(value ?? "");

  if (element instanceof HTMLSelectElement) {
    element.dispatchEvent(new Event("change", { bubbles: true }));
  } else {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }
  return true;
}

const TOOLBAR_STYLES = `
.ff-promoted-artwork-shell { position: relative; min-width: 0; }
.ff-promoted-artwork-shell .creator-artwork-toolbar {
  justify-content: flex-start;
  flex-wrap: wrap;
  align-items: flex-end;
}
.ff-promoted-artwork-shell .creator-artwork-toolbar-actions { flex: 0 0 auto; }
.ff-promoted-artwork-shell .creator-artwork-method {
  flex: 1 1 240px;
  min-width: 210px;
  max-width: 360px;
}
.ff-promoted-toolbar-controls {
  flex: 2 1 520px;
  min-width: 0;
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  gap: 8px;
  flex-wrap: wrap;
}
.ff-promoted-field {
  min-width: 110px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ff-promoted-field > span {
  color: var(--ff-muted-text);
  font-size: 0.64rem;
  line-height: 1;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 800;
}
.ff-promoted-field .input-base {
  min-height: 34px;
  height: 34px;
  padding-block: 5px;
}
.ff-promoted-field-text { flex: 1 1 180px; max-width: 300px; }
.ff-promoted-field-font { flex: 0 1 160px; }
.ff-promoted-field-weight { flex: 0 1 122px; }
.ff-promoted-field-size { flex: 0 0 94px; }
.ff-promoted-field-stock { flex: 0 1 190px; min-width: 165px; }
.ff-promoted-field-colour { flex: 0 0 72px; min-width: 72px; }
.ff-promoted-field textarea.input-base {
  min-height: 34px;
  height: 34px;
  resize: none;
  overflow: auto;
  line-height: 1.25;
}
.ff-promoted-field input[type="color"] {
  width: 72px;
  padding: 3px;
  cursor: pointer;
}
.ff-promoted-stock-select.is-missing {
  border-color: #FFCC00 !important;
}
#${FALLBACK_INSPECTOR_ID} { display: none !important; }
@media (max-width: 1020px) {
  .ff-promoted-artwork-shell .creator-artwork-toolbar { align-items: stretch; }
  .ff-promoted-artwork-shell .creator-artwork-method,
  .ff-promoted-toolbar-controls { width: 100%; max-width: none; flex-basis: 100%; }
  .ff-promoted-field-text { max-width: none; }
}
`;

function PromotedControls({ slot, inspectorId }) {
  const inspectorRoot = () => document.getElementById(inspectorId);
  const colours = useMemo(
    () => asArray(slot?.approved_stocked_colours).map(normalizeColour).filter(Boolean),
    [slot?.approved_stocked_colours]
  );
  const stockedRequired = Boolean(slot?.stocked_colour_required);
  const selectedStockedColour = String(slot?.selected_stocked_colour || slot?.stocked_colour || "");
  const isText = Boolean(slot?.text_layer);

  const updateInspectorField = (name, value) => {
    const run = () => setNativeValue(fieldForLabel(inspectorRoot(), name), value);
    if (run()) return;
    window.requestAnimationFrame(run);
  };

  const updateStockedColour = (value) => {
    const run = () => setNativeValue(stockedColourSelect(inspectorRoot()), value);
    if (run()) return;
    window.requestAnimationFrame(run);
  };

  if (!slot) return null;

  return (
    <div className="ff-promoted-toolbar-controls" data-testid="creator-artwork-toolbar-controls">
      {stockedRequired && (
        <label className="ff-promoted-field ff-promoted-field-stock">
          <span>Colour</span>
          <select
            className={`input-base ff-promoted-stock-select ${!selectedStockedColour ? "is-missing" : ""}`}
            value={selectedStockedColour}
            onChange={(event) => updateStockedColour(event.target.value)}
            aria-label="Approved print colour"
          >
            <option value="">Select approved colour</option>
            {colours.map((colour) => (
              <option key={colour.id || colour.value} value={colour.value}>{colour.label}</option>
            ))}
          </select>
        </label>
      )}

      {isText && (
        <>
          <label className="ff-promoted-field ff-promoted-field-text">
            <span>Text</span>
            <textarea
              className="input-base"
              rows={1}
              value={slot.text_content || ""}
              onChange={(event) => updateInspectorField("Text", event.target.value)}
              aria-label="Custom text"
            />
          </label>
          <label className="ff-promoted-field ff-promoted-field-font">
            <span>Font</span>
            <select
              className="input-base"
              value={slot.text_font_family || "Roboto"}
              onChange={(event) => updateInspectorField("Font", event.target.value)}
            >
              {TEXT_FONT_OPTIONS.map((font) => <option key={font} value={font}>{font}</option>)}
            </select>
          </label>
          <label className="ff-promoted-field ff-promoted-field-weight">
            <span>Weight</span>
            <select
              className="input-base"
              value={String(slot.text_font_weight || "700")}
              onChange={(event) => updateInspectorField("Weight", event.target.value)}
            >
              {TEXT_WEIGHT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="ff-promoted-field ff-promoted-field-size">
            <span>Render size</span>
            <input
              className="input-base"
              type="number"
              min="24"
              max="1200"
              value={Number(slot.text_font_size || 180)}
              onChange={(event) => updateInspectorField("Text render size", event.target.value)}
              onBlur={(event) => {
                const value = Math.min(1200, Math.max(24, Number(event.target.value || 180)));
                updateInspectorField("Text render size", value);
              }}
            />
          </label>
          {!stockedRequired && (
            <label className="ff-promoted-field ff-promoted-field-colour">
              <span>Colour</span>
              <input
                className="input-base"
                type="color"
                value={slot.text_color || "#111111"}
                onChange={(event) => updateInspectorField("Colour", event.target.value)}
                aria-label="Text colour"
              />
            </label>
          )}
        </>
      )}
    </div>
  );
}

export default function ProductArtworkStudio(props) {
  const hostRef = useRef(null);
  const [toolbarTarget, setToolbarTarget] = useState(null);
  const [layersInspectorAvailable, setLayersInspectorAvailable] = useState(false);
  const creatorMode = Boolean(props.creatorMode);
  const activeSlot = useMemo(
    () => activeArtworkSlot(props.artworkGroups, props.activeSlotId),
    [props.artworkGroups, props.activeSlotId]
  );

  useEffect(() => {
    if (!creatorMode || !hostRef.current) return undefined;
    const sync = () => {
      const next = hostRef.current?.querySelector(".creator-artwork-toolbar") || null;
      setToolbarTarget((current) => current === next ? current : next);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(hostRef.current, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [creatorMode]);

  useEffect(() => {
    if (!creatorMode || typeof document === "undefined") return undefined;
    const sync = () => setLayersInspectorAvailable(Boolean(document.getElementById(LAYERS_INSPECTOR_ID)));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [creatorMode]);

  if (!creatorMode) return <ProductArtworkStudioBase {...props} />;

  const inspectorPortalId = layersInspectorAvailable ? LAYERS_INSPECTOR_ID : FALLBACK_INSPECTOR_ID;

  return (
    <div ref={hostRef} className="ff-promoted-artwork-shell">
      <style>{TOOLBAR_STYLES}</style>
      <ProductArtworkStudioBase {...props} inspectorPortalId={inspectorPortalId} />
      <div id={FALLBACK_INSPECTOR_ID} aria-hidden="true" />
      {toolbarTarget && createPortal(
        <PromotedControls slot={activeSlot} inspectorId={inspectorPortalId} />,
        toolbarTarget
      )}
    </div>
  );
}
