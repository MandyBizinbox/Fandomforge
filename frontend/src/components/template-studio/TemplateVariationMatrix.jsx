import React, { useMemo, useRef, useState } from "react";
import { CheckSquare, Copy, Image as ImageIcon, Square, Wand2, X } from "lucide-react";
import { http, assetUrl } from "../../lib/api";
import { toast } from "sonner";
import {
  buildVariationCombinations,
  getVariationKey,
  money,
  safeArray,
} from "./templateStudioUtils";
import { resolveEffectiveProductionSetup } from "../../lib/templateProductionResolver";

const DEFAULT_BOX = { x_pct: 30, y_pct: 25, width_pct: 40, height_pct: 40 };
const MIN_BOX_PERCENT = 2;

function variationLabel(variation) {
  const values = Object.values(variation?.attributes || {}).filter(Boolean);
  return values.length ? values.join(" / ") : variation?.sku || variation?.supplier_sku || "Variation";
}

function attributeValueKey(attribute) {
  return attribute?.id || attribute?.name || attribute?.slug || "";
}

function moneyRound(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function firstTruthy(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "") || "";
}

function resolveVariationCostPatch(platformCostInput, creatorPriceInput = null) {
  const platformCost = moneyRound(platformCostInput);
  const hasCreatorPrice = creatorPriceInput !== null && creatorPriceInput !== undefined && creatorPriceInput !== "";
  const creatorPrice = moneyRound(hasCreatorPrice ? creatorPriceInput : platformCost * 1.1);
  const profit = moneyRound(creatorPrice - platformCost);
  const margin = platformCost ? moneyRound((profit / platformCost) * 100) : 0;

  return {
    cost: platformCost,
    base_blank_cost: platformCost,
    platform_blank_cost: platformCost,
    creator_blank_price: creatorPrice,
    platform_blank_profit: profit,
    platform_blank_margin_percent: margin,
  };
}

function variationPlatformCost(variation) {
  return Number(variation?.platform_blank_cost ?? variation?.base_blank_cost ?? variation?.cost ?? 0);
}

function variationCreatorPrice(variation) {
  return Number(variation?.creator_blank_price ?? moneyRound(variationPlatformCost(variation) * 1.1));
}

function imageForVariation(variation) {
  return variation?.image_url || variation?.product_image_url || variation?.mockup_image_url || "";
}

function variationOverride(variation) {
  return variation?.print_area_overrides?.default || {};
}

function valueOrBlank(...values) {
  const found = values.find((value) => value !== undefined && value !== null && value !== "");
  return found === undefined ? "" : found;
}

function variationPrintWidth(variation) {
  const override = variationOverride(variation);
  return valueOrBlank(override.width_mm, variation?.print_width_mm, variation?.width_mm, variation?.print_area_width_mm);
}

function variationPrintHeight(variation) {
  const override = variationOverride(variation);
  return valueOrBlank(override.height_mm, variation?.print_height_mm, variation?.height_mm, variation?.print_area_height_mm);
}

function variationPrintSizeKey(variation) {
  const override = variationOverride(variation);
  return valueOrBlank(override.standard_print_size_key, variation?.standard_print_size_key, variation?.print_size, variation?.size_label);
}

function variationBox(variation) {
  const override = variationOverride(variation);
  const width = clampNumber(valueOrBlank(override.width_pct, variation?.print_area_width_pct, variation?.width_pct, DEFAULT_BOX.width_pct), MIN_BOX_PERCENT, 100);
  const height = clampNumber(valueOrBlank(override.height_pct, variation?.print_area_height_pct, variation?.height_pct, DEFAULT_BOX.height_pct), MIN_BOX_PERCENT, 100);
  const x = clampNumber(valueOrBlank(override.x_pct, variation?.print_area_x_pct, variation?.x_pct, DEFAULT_BOX.x_pct), 0, Math.max(0, 100 - width));
  const y = clampNumber(valueOrBlank(override.y_pct, variation?.print_area_y_pct, variation?.y_pct, DEFAULT_BOX.y_pct), 0, Math.max(0, 100 - height));

  return { x_pct: x, y_pct: y, width_pct: width, height_pct: height };
}

function imageOverrideCount(variation) {
  return Object.values(variation?.mockup_screen_overrides || {}).filter(Boolean).length;
}

function ImageBox({ src, alt, className = "" }) {
  return (
    <div className={`bg-black border border-white/10 rounded-lg overflow-hidden flex items-center justify-center ${className}`}>
      {src ? <img src={assetUrl(src)} alt={alt} className="w-full h-full object-contain" /> : <ImageIcon size={18} className="text-zinc-700" />}
    </div>
  );
}

function screenOverrideUrl(variation, screen) {
  const overrides = variation?.mockup_screen_overrides || {};
  return firstTruthy(overrides[screen?.id], overrides[screen?.view_key], overrides[screen?.name], overrides[screen?.screen_view]);
}

function resolveCanvasImage(variation, screen) {
  return screenOverrideUrl(variation, screen) || imageForVariation(variation) || screen?.image_url || "";
}

function canvasImageSourceLabel(variation, screen) {
  if (screenOverrideUrl(variation, screen)) return "Selected view override";
  if (imageForVariation(variation)) return "Variation image";
  if (screen?.image_url) return "Template base view";
  return "No image";
}

function pointerToPercent(event, element) {
  const rect = element.getBoundingClientRect();
  const width = rect.width || 1;
  const height = rect.height || 1;
  return {
    x: clampNumber(((event.clientX - rect.left) / width) * 100, 0, 100),
    y: clampNumber(((event.clientY - rect.top) / height) * 100, 0, 100),
  };
}

function VariationPrintAreaBuilder({ variation, screen, onBoxChange, onPhysicalChange }) {
  const canvasRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const box = variationBox(variation);
  const image = resolveCanvasImage(variation, screen);
  const sourceLabel = canvasImageSourceLabel(variation, screen);

  const applyBox = (nextBox) => {
    const width = clampNumber(nextBox.width_pct, MIN_BOX_PERCENT, 100);
    const height = clampNumber(nextBox.height_pct, MIN_BOX_PERCENT, 100);
    const x = clampNumber(nextBox.x_pct, 0, Math.max(0, 100 - width));
    const y = clampNumber(nextBox.y_pct, 0, Math.max(0, 100 - height));
    onBoxChange({ x_pct: x, y_pct: y, width_pct: width, height_pct: height });
  };

  const startDrag = (event, type, handle = "") => {
    if (!canvasRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch (error) {}
    setDrag({ type, handle, startPoint: pointerToPercent(event, canvasRef.current), startBox: box });
  };

  const moveDrag = (event) => {
    if (!drag || !canvasRef.current) return;
    event.preventDefault();
    const point = pointerToPercent(event, canvasRef.current);
    const dx = point.x - drag.startPoint.x;
    const dy = point.y - drag.startPoint.y;
    const start = drag.startBox;

    if (drag.type === "move") {
      applyBox({ ...start, x_pct: start.x_pct + dx, y_pct: start.y_pct + dy });
      return;
    }

    let next = { ...start };
    if (drag.handle.includes("e")) next.width_pct = start.width_pct + dx;
    if (drag.handle.includes("s")) next.height_pct = start.height_pct + dy;
    if (drag.handle.includes("w")) {
      const right = start.x_pct + start.width_pct;
      next.x_pct = start.x_pct + dx;
      next.width_pct = right - next.x_pct;
    }
    if (drag.handle.includes("n")) {
      const bottom = start.y_pct + start.height_pct;
      next.y_pct = start.y_pct + dy;
      next.height_pct = bottom - next.y_pct;
    }
    applyBox(next);
  };

  return (
    <div className="space-y-4">
      <div className="border border-white/10 bg-black/20 rounded-xl p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="font-bold text-sm">Visual print area override</div>
            <p className="text-xs text-zinc-500 mt-1">Drag the box to move it. Drag a corner to resize it for this exact variation.</p>
          </div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 text-right">
            Source: {sourceLabel}<br />
            {Math.round(box.x_pct * 10) / 10}% / {Math.round(box.y_pct * 10) / 10}% · {Math.round(box.width_pct * 10) / 10}% × {Math.round(box.height_pct * 10) / 10}%
          </div>
        </div>

        {!image ? (
          <div className="h-[440px] flex items-center justify-center text-center text-zinc-500 border border-white/10 rounded-xl bg-black/30">
            Upload a variation image or base view image before drawing the print area.
          </div>
        ) : (
          <div
            ref={canvasRef}
            className="relative h-[520px] bg-black/50 border border-white/10 rounded-xl overflow-hidden select-none touch-none flex items-center justify-center"
            onPointerMove={moveDrag}
            onPointerUp={() => setDrag(null)}
            onPointerCancel={() => setDrag(null)}
          >
            <img src={assetUrl(image)} alt={variationLabel(variation)} className="max-w-full max-h-full object-contain pointer-events-none" draggable="false" />
            <div
              className="absolute border-2 border-[#FF3B30] bg-[#FF3B30]/10 cursor-move shadow-[0_0_0_9999px_rgba(0,0,0,0.15)]"
              style={{ left: `${box.x_pct}%`, top: `${box.y_pct}%`, width: `${box.width_pct}%`, height: `${box.height_pct}%` }}
              onPointerDown={(event) => startDrag(event, "move")}
            >
              <div className="absolute left-1 top-1 text-[10px] uppercase tracking-widest bg-black/70 px-2 py-1 rounded">Print area</div>
              {[
                ["nw", "left-[-6px] top-[-6px] cursor-nwse-resize"],
                ["ne", "right-[-6px] top-[-6px] cursor-nesw-resize"],
                ["sw", "left-[-6px] bottom-[-6px] cursor-nesw-resize"],
                ["se", "right-[-6px] bottom-[-6px] cursor-nwse-resize"],
              ].map(([handle, className]) => (
                <button
                  key={handle}
                  type="button"
                  className={`absolute w-3 h-3 rounded-full bg-[#FF3B30] border border-white ${className}`}
                  onPointerDown={(event) => startDrag(event, "resize", handle)}
                  aria-label={`Resize ${handle}`}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="border border-white/10 bg-black/20 rounded-xl p-4">
        <div className="font-bold text-sm mb-3">Physical print dimensions</div>
        <div className="grid sm:grid-cols-2 gap-2">
          <label><span className="label">Print width mm</span><input className="input-base text-sm" type="number" step="0.1" value={variationPrintWidth(variation)} onChange={(event) => onPhysicalChange({ width_mm: event.target.value })} /></label>
          <label><span className="label">Print height mm</span><input className="input-base text-sm" type="number" step="0.1" value={variationPrintHeight(variation)} onChange={(event) => onPhysicalChange({ height_mm: event.target.value })} /></label>
          <label className="sm:col-span-2"><span className="label">Print size key / label</span><input className="input-base text-sm" value={variationPrintSizeKey(variation)} onChange={(event) => onPhysicalChange({ standard_print_size_key: event.target.value })} placeholder="e.g. 5cm, 7cm, 50x50mm" /></label>
        </div>
      </div>
    </div>
  );
}

function matchingVariationIds(variations, attributeKey, attributeValue) {
  const wantedKey = String(attributeKey || "").trim().toLowerCase();
  const wantedValue = String(attributeValue || "").trim().toLowerCase();

  return safeArray(variations)
    .filter((variation) => Object.entries(variation.attributes || {}).some(([key, value]) => (
      String(key || "").trim().toLowerCase() === wantedKey && String(value || "").trim().toLowerCase() === wantedValue
    )))
    .map((variation) => variation.id);
}

export default function TemplateVariationMatrix({
  attributes = [],
  selectedAttributeIds = [],
  onSelectedAttributeIdsChange,
  selectedAttributeValues = {},
  onSelectedAttributeValuesChange = () => {},
  variations = [],
  onVariationsChange,
  screens = [],
  baseCost,
  baseCreatorPrice,
}) {
  const [bulkCost, setBulkCost] = useState("");
  const [bulkCreatorPrice, setBulkCreatorPrice] = useState("");
  const [modalVariationId, setModalVariationId] = useState("");
  const [uploadingKey, setUploadingKey] = useState("");
  const [search, setSearch] = useState("");
  const [activeScreenId, setActiveScreenId] = useState("");

  const selectedAttributes = useMemo(
    () => safeArray(attributes).filter((attribute) => safeArray(selectedAttributeIds).includes(attribute.id)),
    [attributes, selectedAttributeIds]
  );

  const selectedValuesFor = (attribute) => {
    if (!attribute) return [];
    const key = attributeValueKey(attribute);
    if (!key) return safeArray(attribute?.values);
    const hasExplicitValues = Object.prototype.hasOwnProperty.call(selectedAttributeValues || {}, key);
    return hasExplicitValues ? safeArray(selectedAttributeValues[key]) : safeArray(attribute?.values);
  };

  const selectedAttrValues = selectedAttributes
    .map((attribute) => {
      const values = selectedValuesFor(attribute);
      return `${attribute.name}: ${values.length ? values.join(", ") : "No values selected"}`;
    })
    .join(" · ");

  const activeCount = safeArray(variations).filter((variation) => variation.enabled !== false).length;
  const filteredVariations = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return safeArray(variations);
    return safeArray(variations).filter((variation) => {
      const attrs = Object.entries(variation.attributes || {}).map(([key, value]) => `${key} ${value}`).join(" ");
      return `${variationLabel(variation)} ${attrs} ${variation.supplier_sku || ""}`.toLowerCase().includes(term);
    });
  }, [variations, search]);

  const modalVariation = useMemo(
    () => safeArray(variations).find((variation) => variation.id === modalVariationId) || null,
    [modalVariationId, variations]
  );

  const validScreensForOverrides = safeArray(screens).filter((screen) => screen && screen.id);
  const activeScreen = validScreensForOverrides.find((screen) => screen.id === activeScreenId) || validScreensForOverrides[0] || null;
  const effectiveSetup = modalVariation ? resolveEffectiveProductionSetup({ mockup_screens: screens }, modalVariation, { screen: activeScreen }) : null;

  const toggleAttribute = (attributeId) => {
    const attribute = safeArray(attributes).find((item) => item.id === attributeId);
    const key = attributeValueKey(attribute);

    if (safeArray(selectedAttributeIds).includes(attributeId)) {
      onSelectedAttributeIdsChange(safeArray(selectedAttributeIds).filter((id) => id !== attributeId));
      if (key) {
        const nextValues = { ...(selectedAttributeValues || {}) };
        delete nextValues[key];
        onSelectedAttributeValuesChange(nextValues);
      }
      return;
    }

    onSelectedAttributeIdsChange([...safeArray(selectedAttributeIds), attributeId]);
    if (key && !Object.prototype.hasOwnProperty.call(selectedAttributeValues || {}, key)) {
      onSelectedAttributeValuesChange({ ...(selectedAttributeValues || {}), [key]: safeArray(attribute?.values) });
    }
  };

  const setAttributeValues = (attribute, values) => {
    const key = attributeValueKey(attribute);
    if (!key) return;
    onSelectedAttributeValuesChange({ ...(selectedAttributeValues || {}), [key]: safeArray(values) });
  };

  const toggleAttributeValue = (attribute, value) => {
    const current = selectedValuesFor(attribute);
    const exists = current.includes(value);
    setAttributeValues(attribute, exists ? current.filter((item) => item !== value) : [...current, value]);
  };

  const generateVariations = () => {
    if (!selectedAttributes.length) {
      toast.error("Select at least one variation attribute first.");
      return;
    }

    const emptyAttributes = selectedAttributes.filter((attribute) => selectedValuesFor(attribute).length === 0);
    if (emptyAttributes.length) {
      toast.error(`Select at least one value for: ${emptyAttributes.map((attribute) => attribute.name).join(", ")}`);
      return;
    }

    const generated = buildVariationCombinations(selectedAttributes, variations, Number(baseCost || 0), selectedAttributeValues).map((variation) => {
      const existingCreatorPrice = variation.creator_blank_price || baseCreatorPrice;
      const platformCost = variationPlatformCost(variation) || Number(baseCost || 0);
      return { ...variation, ...resolveVariationCostPatch(platformCost, existingCreatorPrice) };
    });

    onVariationsChange(generated);
    toast.success(`${generated.length} variation combination(s) generated`);
  };

  const updateVariation = (variationId, patch) => {
    onVariationsChange(safeArray(variations).map((variation) => (variation.id === variationId ? { ...variation, ...patch } : variation)));
  };

  const updatePrintOverride = (variation, patch) => {
    if (!variation?.id) return;
    const currentOverride = variationOverride(variation);
    const nextOverride = { ...currentOverride, ...patch };
    const width = valueOrBlank(nextOverride.width_mm, variation.print_width_mm, variation.width_mm);
    const height = valueOrBlank(nextOverride.height_mm, variation.print_height_mm, variation.height_mm);
    const xPct = valueOrBlank(nextOverride.x_pct, variation.print_area_x_pct, variation.x_pct, DEFAULT_BOX.x_pct);
    const yPct = valueOrBlank(nextOverride.y_pct, variation.print_area_y_pct, variation.y_pct, DEFAULT_BOX.y_pct);
    const widthPct = valueOrBlank(nextOverride.width_pct, variation.print_area_width_pct, variation.width_pct, DEFAULT_BOX.width_pct);
    const heightPct = valueOrBlank(nextOverride.height_pct, variation.print_area_height_pct, variation.height_pct, DEFAULT_BOX.height_pct);
    const sizeKey = valueOrBlank(nextOverride.standard_print_size_key, variation.standard_print_size_key, variation.print_size);

    updateVariation(variation.id, {
      print_width_mm: width,
      print_height_mm: height,
      width_mm: width,
      height_mm: height,
      print_area_width_mm: width,
      print_area_height_mm: height,
      print_area_x_pct: xPct,
      print_area_y_pct: yPct,
      print_area_width_pct: widthPct,
      print_area_height_pct: heightPct,
      x_pct: xPct,
      y_pct: yPct,
      width_pct: widthPct,
      height_pct: heightPct,
      standard_print_size_key: sizeKey,
      print_size: sizeKey,
      print_area_overrides: {
        ...(variation.print_area_overrides || {}),
        default: {
          ...nextOverride,
          width_mm: width,
          height_mm: height,
          x_pct: xPct,
          y_pct: yPct,
          width_pct: widthPct,
          height_pct: heightPct,
          standard_print_size_key: sizeKey,
          source: "variation_modal_builder",
        },
      },
    });
  };

  const toggleVariation = (variation) => {
    updateVariation(variation.id, { enabled: variation.enabled === false, status: variation.enabled === false ? "active" : "draft" });
  };

  const setAllEnabled = (enabled) => {
    onVariationsChange(safeArray(variations).map((variation) => ({ ...variation, enabled, status: enabled ? "active" : "draft" })));
  };

  const applyBulkCost = () => {
    onVariationsChange(safeArray(variations).map((variation) => ({ ...variation, ...resolveVariationCostPatch(bulkCost) })));
  };

  const applyBulkCreatorPrice = () => {
    onVariationsChange(safeArray(variations).map((variation) => ({ ...variation, ...resolveVariationCostPatch(variationPlatformCost(variation), bulkCreatorPrice) })));
  };

  const uploadVariationImage = async (variationId, file, label = "Variation image") => {
    if (!file || !variationId) return;
    const uploadKey = `${label}-${Date.now()}`;
    setUploadingKey(uploadKey);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("subdir", "template-variation-images");
      const response = await http.post("/files/image", formData, { headers: { "Content-Type": "multipart/form-data" } });
      updateVariation(variationId, { image_url: response.data.url });
      toast.success(`${label} uploaded`);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Image upload failed");
    } finally {
      setUploadingKey("");
    }
  };

  const setScreenOverride = (variation, screen, imageUrl) => {
    if (!variation?.id || !screen?.id) return;
    updateVariation(variation.id, {
      mockup_screen_overrides: {
        ...(variation.mockup_screen_overrides || {}),
        [screen.id]: imageUrl,
      },
    });
  };

  const clearScreenOverride = (variation, screen) => {
    if (!variation?.id || !screen?.id) return;
    const overrides = { ...(variation.mockup_screen_overrides || {}) };
    delete overrides[screen.id];
    if (screen.view_key) delete overrides[screen.view_key];
    if (screen.name) delete overrides[screen.name];
    updateVariation(variation.id, { mockup_screen_overrides: overrides });
  };

  const uploadScreenOverride = async (variation, screen, file) => {
    if (!file || !screen?.id || !variation?.id) return;
    const uploadKey = `${variation.id}-${screen.id}`;
    setUploadingKey(uploadKey);
    setActiveScreenId(screen.id);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("subdir", "template-variation-views");
      const response = await http.post("/files/image", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setScreenOverride(variation, screen, response.data.url);
      toast.success(`${variationLabel(variation)} ${screen.name || screen.view_key || "view"} image uploaded`);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not upload variation view image");
    } finally {
      setUploadingKey("");
    }
  };

  const applyCurrentOverrideToAttributeValue = (sourceVariation, attributeKey, attributeValue, includeImage = false) => {
    if (!sourceVariation?.id) return;

    const matchingIds = new Set(matchingVariationIds(variations, attributeKey, attributeValue));
    if (!matchingIds.size) return;

    const sourceOverride = variationOverride(sourceVariation);
    const patch = {
      print_width_mm: variationPrintWidth(sourceVariation),
      print_height_mm: variationPrintHeight(sourceVariation),
      width_mm: variationPrintWidth(sourceVariation),
      height_mm: variationPrintHeight(sourceVariation),
      print_area_width_mm: variationPrintWidth(sourceVariation),
      print_area_height_mm: variationPrintHeight(sourceVariation),
      print_area_x_pct: sourceOverride.x_pct ?? variationBox(sourceVariation).x_pct,
      print_area_y_pct: sourceOverride.y_pct ?? variationBox(sourceVariation).y_pct,
      print_area_width_pct: sourceOverride.width_pct ?? variationBox(sourceVariation).width_pct,
      print_area_height_pct: sourceOverride.height_pct ?? variationBox(sourceVariation).height_pct,
      x_pct: sourceOverride.x_pct ?? variationBox(sourceVariation).x_pct,
      y_pct: sourceOverride.y_pct ?? variationBox(sourceVariation).y_pct,
      width_pct: sourceOverride.width_pct ?? variationBox(sourceVariation).width_pct,
      height_pct: sourceOverride.height_pct ?? variationBox(sourceVariation).height_pct,
      standard_print_size_key: variationPrintSizeKey(sourceVariation),
      print_size: variationPrintSizeKey(sourceVariation),
      print_area_overrides: {
        ...(sourceVariation.print_area_overrides || {}),
        default: {
          ...sourceOverride,
          inherited_from_attribute: `${attributeKey}=${attributeValue}`,
          source: "bulk_attribute_override",
        },
      },
    };

    onVariationsChange(safeArray(variations).map((variation) => {
      if (!matchingIds.has(variation.id)) return variation;
      return {
        ...variation,
        ...patch,
        image_url: includeImage ? sourceVariation.image_url || variation.image_url : variation.image_url,
        mockup_screen_overrides: includeImage
          ? { ...(variation.mockup_screen_overrides || {}), ...(sourceVariation.mockup_screen_overrides || {}) }
          : variation.mockup_screen_overrides,
      };
    }));

    toast.success(`Applied ${includeImage ? "image and print area" : "print area"} to ${matchingIds.size} variation(s) where ${attributeKey} = ${attributeValue}`);
  };

  return (
    <div className="studio-panel variation-matrix-panel">
      <div className="studio-panel-header">
        <div>
          <div className="overline mb-1">Variations</div>
          <h2 className="font-display text-2xl uppercase">Variation Production Cards</h2>
          <p className="text-xs text-zinc-500 mt-1">
            Each generated combination is its own production record. Click Configure Production to open the visual print-area builder.
          </p>
        </div>
        <button type="button" onClick={generateVariations} className="btn-primary text-xs"><Wand2 size={14} /> Generate</button>
      </div>

      <div className="variation-toolbar-grid mb-4">
        <div className="studio-subpanel">
          <div className="label">Attributes used for variations</div>
          <div className="flex flex-wrap gap-2">
            {safeArray(attributes).map((attribute) => (
              <button key={attribute.id} type="button" onClick={() => toggleAttribute(attribute.id)} className={safeArray(selectedAttributeIds).includes(attribute.id) ? "studio-pill active" : "studio-pill"}>{attribute.name}</button>
            ))}
          </div>
          <p className="text-xs text-zinc-500 mt-3">{selectedAttrValues || "Select one or more variation attributes. Any attribute combination can have its own image and print area."}</p>

          {selectedAttributes.length > 0 && (
            <div className="mt-5 space-y-4 border-t border-white/10 pt-4">
              <div>
                <div className="label">Attribute values to generate</div>
                <p className="text-xs text-zinc-500 mt-1">Untick supplier values that are not available for this specific template before generating.</p>
              </div>
              {selectedAttributes.map((attribute) => {
                const selectedValues = selectedValuesFor(attribute);
                const totalValues = safeArray(attribute.values);
                return (
                  <div key={attribute.id} className="border border-white/10 bg-black/20 p-3 rounded-xl">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div>
                        <div className="font-bold text-sm">{attribute.name}</div>
                        <div className="text-[11px] text-zinc-500">{selectedValues.length} of {totalValues.length} value(s) selected</div>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" className="btn-secondary text-[10px]" onClick={() => setAttributeValues(attribute, totalValues)}>All</button>
                        <button type="button" className="btn-secondary text-[10px]" onClick={() => setAttributeValues(attribute, [])}>None</button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {totalValues.map((value) => {
                        const active = selectedValues.includes(value);
                        return (
                          <button key={`${attribute.id}-${value}`} type="button" onClick={() => toggleAttributeValue(attribute, value)} className={active ? "studio-pill active" : "studio-pill"}>
                            {active ? <CheckSquare size={13} /> : <Square size={13} />} {value}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="studio-subpanel variation-count-card">
          <div className="label">Active production records</div>
          <div className="font-display text-3xl leading-none">{activeCount}</div>
          <div className="text-xs text-zinc-500">of {safeArray(variations).length}</div>
        </div>
      </div>

      <div className="variation-action-row mb-4">
        <div className="variation-bulk-cost-control">
          <label><span className="label">Global platform blank cost</span><input className="input-base" type="number" step="0.01" value={bulkCost} onChange={(event) => setBulkCost(event.target.value)} placeholder="Actual blank cost" /></label>
          <button type="button" onClick={applyBulkCost} className="btn-secondary text-xs">Apply platform cost</button>
          <label><span className="label">Global creator blank price</span><input className="input-base" type="number" step="0.01" value={bulkCreatorPrice} onChange={(event) => setBulkCreatorPrice(event.target.value)} placeholder="Creator pays" /></label>
          <button type="button" onClick={applyBulkCreatorPrice} className="btn-secondary text-xs">Apply creator price</button>
        </div>
        <div className="variation-enable-actions">
          <button type="button" onClick={() => setAllEnabled(true)} className="btn-secondary text-xs">Select all</button>
          <button type="button" onClick={() => setAllEnabled(false)} className="btn-secondary text-xs">Clear all</button>
        </div>
      </div>

      {safeArray(variations).length === 0 ? (
        <div className="studio-empty-state"><Wand2 size={24} className="text-zinc-600" /><p className="font-bold uppercase tracking-widest text-sm">No variation cards generated yet</p><p className="text-zinc-500 text-sm">Select one or more attributes, then click Generate.</p></div>
      ) : (
        <div className="studio-subpanel">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <div className="label">Variation production cards</div>
              <p className="text-xs text-zinc-500 mt-1">Cards stay compact. Open the popup for image, pricing and print-area configuration.</p>
            </div>
            <input className="input-base sm:w-72" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search variation cards" />
          </div>

          <div className="grid md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
            {filteredVariations.map((variation) => {
              const active = variation.enabled !== false;
              return (
                <div key={variation.id || getVariationKey(variation)} className="border border-white/10 bg-black/20 hover:border-white/30 rounded-xl p-3 transition-colors">
                  <div className="flex gap-3">
                    <ImageBox src={imageForVariation(variation)} alt={variationLabel(variation)} className="w-20 h-20 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-bold text-sm leading-tight">{variationLabel(variation)}</div>
                        <button type="button" onClick={() => toggleVariation(variation)} className={active ? "studio-pill active" : "studio-pill"}>{active ? "On" : "Off"}</button>
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-1 break-all">{variation.supplier_sku || variation.sku || variation.id}</div>
                      <div className="grid grid-cols-2 gap-2 mt-3 text-[11px] text-zinc-400">
                        <div className="border border-white/10 p-2 rounded-lg"><span className="overline block mb-1">Blank</span>{money(variationCreatorPrice(variation))}</div>
                        <div className="border border-white/10 p-2 rounded-lg"><span className="overline block mb-1">Print</span>{variationPrintWidth(variation) || "—"}×{variationPrintHeight(variation) || "—"}mm</div>
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-2">{imageOverrideCount(variation)} view override(s)</div>
                    </div>
                  </div>
                  <button type="button" className="btn-secondary text-xs w-full mt-3" onClick={() => setModalVariationId(variation.id)}>Configure Production</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {modalVariation && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm p-4 md:p-6 overflow-y-auto">
          <div className="max-w-7xl mx-auto bg-[#101010] border border-white/15 rounded-2xl shadow-2xl">
            <div className="sticky top-0 z-10 bg-[#101010]/95 backdrop-blur border-b border-white/10 p-4 md:p-5 flex items-start justify-between gap-4 rounded-t-2xl">
              <div>
                <div className="overline mb-1">Variation production editor</div>
                <h3 className="font-display text-3xl uppercase leading-none">{variationLabel(modalVariation)}</h3>
                <p className="text-xs text-zinc-500 mt-2">Configure this exact variation combination. Save the template after closing this popup.</p>
              </div>
              <button type="button" className="btn-secondary text-xs" onClick={() => setModalVariationId("")}><X size={14} /> Close</button>
            </div>

            <div className="p-4 md:p-5 grid xl:grid-cols-[minmax(0,1fr)_420px] gap-5">
              <div className="space-y-5">
                <div className="border border-white/10 bg-black/20 rounded-xl p-4">
                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <ImageBox src={imageForVariation(modalVariation)} alt={variationLabel(modalVariation)} className="w-28 h-28 shrink-0" />
                    <div className="flex-1">
                      <div className="font-bold text-sm mb-2">Variation image</div>
                      <label className="studio-file-button justify-center text-xs w-full md:w-auto">
                        {uploadingKey.startsWith(variationLabel(modalVariation)) ? "Uploading" : "Upload / replace variation image"}
                        <input type="file" accept="image/*" className="hidden" onChange={(event) => uploadVariationImage(modalVariation.id, event.target.files?.[0], variationLabel(modalVariation))} />
                      </label>
                      <p className="text-[11px] text-zinc-500 mt-2">This should represent the exact blank combination, for example White 5cm or Clear 7cm.</p>
                    </div>
                    <button type="button" onClick={() => toggleVariation(modalVariation)} className={modalVariation.enabled === false ? "studio-pill" : "studio-pill active"}>{modalVariation.enabled === false ? "Disabled" : "Enabled"}</button>
                  </div>
                </div>

                {validScreensForOverrides.length > 0 && (
                  <div className="border border-white/10 bg-black/20 rounded-xl p-4">
                    <div className="font-bold text-sm mb-3">Canvas base view</div>
                    <div className="grid md:grid-cols-[220px_1fr] gap-3 items-end">
                      <label>
                        <span className="label">View used for print-area builder</span>
                        <select className="input-base text-sm" value={activeScreen?.id || ""} onChange={(event) => setActiveScreenId(event.target.value)}>
                          {validScreensForOverrides.map((screen) => <option key={screen.id} value={screen.id}>{screen.name || screen.view_key || screen.screen_view || "View"}</option>)}
                        </select>
                      </label>
                      <p className="text-xs text-zinc-500">The builder now uses the selected view override first, then the variation image, then the template base view.</p>
                    </div>
                  </div>
                )}

                <VariationPrintAreaBuilder
                  variation={modalVariation}
                  screen={activeScreen}
                  onBoxChange={(patch) => updatePrintOverride(modalVariation, patch)}
                  onPhysicalChange={(patch) => updatePrintOverride(modalVariation, patch)}
                />
              </div>

              <div className="space-y-5">
                <div className="border border-white/10 bg-black/20 rounded-xl p-4">
                  <div className="font-bold text-sm mb-3">Effective production setup</div>
                  <div className="space-y-2 text-xs text-zinc-400">
                    <div className="flex justify-between gap-3"><span>Image source</span><strong>{canvasImageSourceLabel(modalVariation, activeScreen)}</strong></div>
                    <div className="flex justify-between gap-3"><span>Print area source</span><strong>{effectiveSetup?.sourceMap?.printArea || "exact variation"}</strong></div>
                    <div className="flex justify-between gap-3"><span>Matching rules</span><strong>{safeArray(effectiveSetup?.matchingRules).length}</strong></div>
                  </div>
                </div>

                <div className="border border-white/10 bg-black/20 rounded-xl p-4">
                  <div className="font-bold text-sm mb-2">Apply this setup to matching variations</div>
                  <p className="text-xs text-zinc-500 mb-3">Use this for T-shirt size rules: configure one 2XL card, then apply the print area to all colours where Size = 2XL.</p>
                  <div className="space-y-2">
                    {Object.entries(modalVariation.attributes || {}).map(([key, value]) => {
                      const count = matchingVariationIds(variations, key, value).length;
                      return (
                        <div key={`${key}-${value}`} className="border border-white/10 rounded-xl p-3">
                          <div className="font-bold text-xs mb-2">{key} = {value} · {count} variation(s)</div>
                          <div className="grid grid-cols-2 gap-2">
                            <button type="button" className="btn-secondary text-[10px]" onClick={() => applyCurrentOverrideToAttributeValue(modalVariation, key, value, false)}><Copy size={12} /> Apply print area</button>
                            <button type="button" className="btn-secondary text-[10px]" onClick={() => applyCurrentOverrideToAttributeValue(modalVariation, key, value, true)}><Copy size={12} /> Apply image + area</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="border border-white/10 bg-black/20 rounded-xl p-4">
                  <div className="font-bold text-sm mb-3">Blank pricing and supplier</div>
                  <div className="grid grid-cols-2 gap-2">
                    <label><span className="label">Platform blank cost</span><input className="input-base text-sm" type="number" step="0.01" value={variationPlatformCost(modalVariation)} onChange={(event) => updateVariation(modalVariation.id, { ...resolveVariationCostPatch(event.target.value, modalVariation.creator_blank_price) })} /></label>
                    <label><span className="label">Creator blank price</span><input className="input-base text-sm" type="number" step="0.01" value={variationCreatorPrice(modalVariation)} onChange={(event) => updateVariation(modalVariation.id, { ...resolveVariationCostPatch(variationPlatformCost(modalVariation), event.target.value) })} /></label>
                    <div className="variation-profit-summary"><span>Profit</span><strong>{money(variationCreatorPrice(modalVariation) - variationPlatformCost(modalVariation))}</strong></div>
                    <div className="variation-profit-summary"><span>Margin</span><strong>{Number(modalVariation.platform_blank_margin_percent || 0).toFixed(2)}%</strong></div>
                    <label className="col-span-2"><span className="label">Supplier SKU</span><input className="input-base text-sm" value={modalVariation.supplier_sku || ""} onChange={(event) => updateVariation(modalVariation.id, { supplier_sku: event.target.value })} /></label>
                  </div>
                </div>

                {validScreensForOverrides.length > 0 && (
                  <div className="border border-white/10 bg-black/20 rounded-xl p-4">
                    <div className="font-bold text-sm mb-1">Variation base view overrides</div>
                    <p className="text-xs text-zinc-500 mb-3">Use this when the exact variation needs a different blank image for front/back/wrap views.</p>
                    <div className="space-y-3 max-h-[640px] overflow-y-auto pr-1">
                      {validScreensForOverrides.map((screen) => {
                        const override = screenOverrideUrl(modalVariation, screen);
                        const fallback = screen.image_url || "";
                        const uploadKey = `${modalVariation.id}-${screen.id}`;
                        const isActive = activeScreen?.id === screen.id;
                        return (
                          <div key={screen.id} className={isActive ? "border border-[#FF3B30] rounded-xl p-3" : "border border-white/10 rounded-xl p-3"}>
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div>
                                <div className="text-[10px] uppercase tracking-widest text-zinc-500">Base view</div>
                                <div className="font-bold text-xs">{screen.name || screen.view_key || screen.screen_view || "View"}</div>
                              </div>
                              <span className={override ? "studio-pill active" : "studio-pill"}>{override ? "Override" : "Default"}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mb-3">
                              <div><div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Default</div><ImageBox src={fallback} alt="Default view" className="aspect-[4/3]" /></div>
                              <button type="button" onClick={() => setActiveScreenId(screen.id)} className="text-left"><div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Override</div><ImageBox src={override} alt="Override view" className="aspect-[4/3]" /></button>
                            </div>
                            <div className="flex gap-2">
                              <label className="studio-file-button text-[10px] flex-1 justify-center">
                                {uploadingKey === uploadKey ? "Uploading" : override ? "Replace" : "Upload"}
                                <input type="file" accept="image/*" className="hidden" onChange={(event) => uploadScreenOverride(modalVariation, screen, event.target.files?.[0])} />
                              </label>
                              <button type="button" className="btn-secondary text-[10px]" onClick={() => setActiveScreenId(screen.id)}>Use in builder</button>
                              {override && <button type="button" className="btn-secondary text-[10px]" onClick={() => clearScreenOverride(modalVariation, screen)}>Clear</button>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
