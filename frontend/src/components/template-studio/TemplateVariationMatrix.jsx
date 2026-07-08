import React, { useMemo, useState } from "react";
import { CheckSquare, Image as ImageIcon, Square, Wand2 } from "lucide-react";
import { http, assetUrl } from "../../lib/api";
import { toast } from "sonner";
import {
  buildVariationCombinations,
  getVariationKey,
  money,
  safeArray,
} from "./templateStudioUtils";

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

function variationPrintX(variation) {
  const override = variationOverride(variation);
  return valueOrBlank(override.x_pct, variation?.print_area_x_pct, variation?.x_pct);
}

function variationPrintY(variation) {
  const override = variationOverride(variation);
  return valueOrBlank(override.y_pct, variation?.print_area_y_pct, variation?.y_pct);
}

function variationPrintBoxWidth(variation) {
  const override = variationOverride(variation);
  return valueOrBlank(override.width_pct, variation?.print_area_width_pct, variation?.width_pct);
}

function variationPrintBoxHeight(variation) {
  const override = variationOverride(variation);
  return valueOrBlank(override.height_pct, variation?.print_area_height_pct, variation?.height_pct);
}

function variationPrintSizeKey(variation) {
  const override = variationOverride(variation);
  return valueOrBlank(override.standard_print_size_key, variation?.standard_print_size_key, variation?.print_size, variation?.size_label);
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
  const [selectedVariationId, setSelectedVariationId] = useState("");
  const [uploadingKey, setUploadingKey] = useState("");
  const [search, setSearch] = useState("");

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

  const selectedVariation = useMemo(() => {
    return safeArray(variations).find((variation) => variation.id === selectedVariationId) || filteredVariations[0] || null;
  }, [filteredVariations, selectedVariationId, variations]);

  const validScreensForOverrides = safeArray(screens).filter((screen) => screen && screen.id);

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
    setSelectedVariationId(generated[0]?.id || "");
    toast.success(`${generated.length} variation combination(s) generated`);
  };

  const updateVariation = (variationId, patch) => {
    onVariationsChange(safeArray(variations).map((variation) => (variation.id === variationId ? { ...variation, ...patch } : variation)));
  };

  const updateSelectedVariation = (patch) => {
    if (!selectedVariation?.id) return;
    updateVariation(selectedVariation.id, patch);
  };

  const updateSelectedPrintOverride = (patch) => {
    if (!selectedVariation?.id) return;

    const currentOverride = variationOverride(selectedVariation);
    const nextOverride = { ...currentOverride, ...patch };
    const width = valueOrBlank(nextOverride.width_mm, selectedVariation.print_width_mm, selectedVariation.width_mm);
    const height = valueOrBlank(nextOverride.height_mm, selectedVariation.print_height_mm, selectedVariation.height_mm);
    const xPct = valueOrBlank(nextOverride.x_pct, selectedVariation.print_area_x_pct, selectedVariation.x_pct);
    const yPct = valueOrBlank(nextOverride.y_pct, selectedVariation.print_area_y_pct, selectedVariation.y_pct);
    const widthPct = valueOrBlank(nextOverride.width_pct, selectedVariation.print_area_width_pct, selectedVariation.width_pct);
    const heightPct = valueOrBlank(nextOverride.height_pct, selectedVariation.print_area_height_pct, selectedVariation.height_pct);
    const sizeKey = valueOrBlank(nextOverride.standard_print_size_key, selectedVariation.standard_print_size_key, selectedVariation.print_size);

    updateVariation(selectedVariation.id, {
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
        ...(selectedVariation.print_area_overrides || {}),
        default: {
          ...nextOverride,
          width_mm: width,
          height_mm: height,
          x_pct: xPct,
          y_pct: yPct,
          width_pct: widthPct,
          height_pct: heightPct,
          standard_print_size_key: sizeKey,
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

  const setScreenOverride = (screen, imageUrl) => {
    if (!selectedVariation?.id || !screen?.id) return;
    updateSelectedVariation({
      mockup_screen_overrides: {
        ...(selectedVariation.mockup_screen_overrides || {}),
        [screen.id]: imageUrl,
      },
    });
  };

  const clearScreenOverride = (screen) => {
    if (!selectedVariation?.id || !screen?.id) return;
    const overrides = { ...(selectedVariation.mockup_screen_overrides || {}) };
    delete overrides[screen.id];
    if (screen.view_key) delete overrides[screen.view_key];
    if (screen.name) delete overrides[screen.name];
    updateSelectedVariation({ mockup_screen_overrides: overrides });
  };

  const uploadScreenOverride = async (screen, file) => {
    if (!file || !screen?.id || !selectedVariation?.id) return;
    const uploadKey = `${selectedVariation.id}-${screen.id}`;
    setUploadingKey(uploadKey);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("subdir", "template-variation-views");
      const response = await http.post("/files/image", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setScreenOverride(screen, response.data.url);
      toast.success(`${variationLabel(selectedVariation)} ${screen.name || screen.view_key || "view"} image uploaded`);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not upload variation view image");
    } finally {
      setUploadingKey("");
    }
  };

  const selectedOverride = selectedVariation ? variationOverride(selectedVariation) : {};

  return (
    <div className="studio-panel variation-matrix-panel">
      <div className="studio-panel-header">
        <div>
          <div className="overline mb-1">Variations</div>
          <h2 className="font-display text-2xl uppercase">Variation Production Cards</h2>
          <p className="text-xs text-zinc-500 mt-1">
            Each generated variation combination is its own production record. Open a card to set images, print area overrides, blank cost and supplier SKU.
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
        <div className="grid xl:grid-cols-[minmax(0,1fr)_420px] gap-5">
          <div className="studio-subpanel">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div>
                <div className="label">Variation production cards</div>
                <p className="text-xs text-zinc-500 mt-1">Click a card to edit exact production overrides for that combination.</p>
              </div>
              <input className="input-base sm:w-72" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search variation cards" />
            </div>

            <div className="grid md:grid-cols-2 2xl:grid-cols-3 gap-3">
              {filteredVariations.map((variation) => {
                const active = variation.enabled !== false;
                const selected = selectedVariation?.id === variation.id;
                return (
                  <button
                    key={variation.id || getVariationKey(variation)}
                    type="button"
                    onClick={() => setSelectedVariationId(variation.id)}
                    className={`text-left border rounded-xl p-3 transition-colors ${selected ? "border-[#FF3B30] bg-[#FF3B30]/10" : "border-white/10 bg-black/20 hover:border-white/30"}`}
                  >
                    <div className="flex gap-3">
                      <ImageBox src={imageForVariation(variation)} alt={variationLabel(variation)} className="w-20 h-20 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-bold text-sm leading-tight">{variationLabel(variation)}</div>
                          <span className={active ? "studio-pill active" : "studio-pill"}>{active ? "On" : "Off"}</span>
                        </div>
                        <div className="text-[11px] text-zinc-500 mt-1 break-all">{variation.supplier_sku || variation.sku || variation.id}</div>
                        <div className="grid grid-cols-2 gap-2 mt-3 text-[11px] text-zinc-400">
                          <div className="border border-white/10 p-2 rounded-lg"><span className="overline block mb-1">Blank</span>{money(variationCreatorPrice(variation))}</div>
                          <div className="border border-white/10 p-2 rounded-lg"><span className="overline block mb-1">Print</span>{variationPrintWidth(variation) || "—"}×{variationPrintHeight(variation) || "—"}mm</div>
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-2">{imageOverrideCount(variation)} view override(s)</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="studio-subpanel xl:sticky xl:top-4 self-start">
            {selectedVariation ? (
              <div>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <div className="label">Selected production record</div>
                    <h3 className="font-display text-2xl uppercase mt-1">{variationLabel(selectedVariation)}</h3>
                    <p className="text-xs text-zinc-500 mt-1">Set exact overrides for this variation combination only.</p>
                  </div>
                  <button type="button" onClick={() => toggleVariation(selectedVariation)} className={selectedVariation.enabled === false ? "studio-pill" : "studio-pill active"}>
                    {selectedVariation.enabled === false ? "Disabled" : "Enabled"}
                  </button>
                </div>

                <div className="space-y-5">
                  <div className="border border-white/10 bg-black/20 rounded-xl p-4">
                    <div className="font-bold text-sm mb-3">Variation image</div>
                    <div className="flex items-center gap-3">
                      <ImageBox src={imageForVariation(selectedVariation)} alt={variationLabel(selectedVariation)} className="w-24 h-24 shrink-0" />
                      <div className="flex-1">
                        <label className="studio-file-button justify-center text-xs w-full">
                          {uploadingKey.startsWith(variationLabel(selectedVariation)) ? "Uploading" : "Upload / replace variation image"}
                          <input type="file" accept="image/*" className="hidden" onChange={(event) => uploadVariationImage(selectedVariation.id, event.target.files?.[0], variationLabel(selectedVariation))} />
                        </label>
                        <p className="text-[11px] text-zinc-500 mt-2">This should represent the exact blank combination, for example White 5cm or Clear 7cm.</p>
                      </div>
                    </div>
                  </div>

                  <div className="border border-white/10 bg-black/20 rounded-xl p-4">
                    <div className="font-bold text-sm mb-3">Variation print area override</div>
                    <div className="grid grid-cols-2 gap-2">
                      <label><span className="label">Print width mm</span><input className="input-base text-sm" type="number" step="0.1" value={variationPrintWidth(selectedVariation)} onChange={(event) => updateSelectedPrintOverride({ width_mm: event.target.value })} /></label>
                      <label><span className="label">Print height mm</span><input className="input-base text-sm" type="number" step="0.1" value={variationPrintHeight(selectedVariation)} onChange={(event) => updateSelectedPrintOverride({ height_mm: event.target.value })} /></label>
                      <label className="col-span-2"><span className="label">Print size key / label</span><input className="input-base text-sm" value={variationPrintSizeKey(selectedVariation)} onChange={(event) => updateSelectedPrintOverride({ standard_print_size_key: event.target.value })} placeholder="e.g. 5cm, 7cm, 50x50mm" /></label>
                      <label><span className="label">Area X %</span><input className="input-base text-sm" type="number" step="0.1" value={variationPrintX(selectedVariation)} onChange={(event) => updateSelectedPrintOverride({ x_pct: event.target.value })} placeholder="Use template default" /></label>
                      <label><span className="label">Area Y %</span><input className="input-base text-sm" type="number" step="0.1" value={variationPrintY(selectedVariation)} onChange={(event) => updateSelectedPrintOverride({ y_pct: event.target.value })} placeholder="Use template default" /></label>
                      <label><span className="label">Area W %</span><input className="input-base text-sm" type="number" step="0.1" value={variationPrintBoxWidth(selectedVariation)} onChange={(event) => updateSelectedPrintOverride({ width_pct: event.target.value })} placeholder="Use template default" /></label>
                      <label><span className="label">Area H %</span><input className="input-base text-sm" type="number" step="0.1" value={variationPrintBoxHeight(selectedVariation)} onChange={(event) => updateSelectedPrintOverride({ height_pct: event.target.value })} placeholder="Use template default" /></label>
                    </div>
                    <div className="text-[11px] text-zinc-500 border border-white/10 bg-black/20 rounded-xl p-3 mt-3">
                      These values override the template default print area for this exact variation. Leave position fields blank to inherit the template area placement.
                    </div>
                  </div>

                  <div className="border border-white/10 bg-black/20 rounded-xl p-4">
                    <div className="font-bold text-sm mb-3">Blank pricing and supplier</div>
                    <div className="grid grid-cols-2 gap-2">
                      <label><span className="label">Platform blank cost</span><input className="input-base text-sm" type="number" step="0.01" value={variationPlatformCost(selectedVariation)} onChange={(event) => updateSelectedVariation({ ...resolveVariationCostPatch(event.target.value, selectedVariation.creator_blank_price) })} /></label>
                      <label><span className="label">Creator blank price</span><input className="input-base text-sm" type="number" step="0.01" value={variationCreatorPrice(selectedVariation)} onChange={(event) => updateSelectedVariation({ ...resolveVariationCostPatch(variationPlatformCost(selectedVariation), event.target.value) })} /></label>
                      <div className="variation-profit-summary"><span>Profit</span><strong>{money(variationCreatorPrice(selectedVariation) - variationPlatformCost(selectedVariation))}</strong></div>
                      <div className="variation-profit-summary"><span>Margin</span><strong>{Number(selectedVariation.platform_blank_margin_percent || 0).toFixed(2)}%</strong></div>
                      <label className="col-span-2"><span className="label">Supplier SKU</span><input className="input-base text-sm" value={selectedVariation.supplier_sku || ""} onChange={(event) => updateSelectedVariation({ supplier_sku: event.target.value })} /></label>
                    </div>
                  </div>

                  {validScreensForOverrides.length > 0 && (
                    <div className="border border-white/10 bg-black/20 rounded-xl p-4">
                      <div className="font-bold text-sm mb-1">Variation base view overrides</div>
                      <p className="text-xs text-zinc-500 mb-3">Use this when the exact variation needs a different blank image for front/back/wrap views.</p>
                      <div className="space-y-3">
                        {validScreensForOverrides.map((screen) => {
                          const override = selectedVariation.mockup_screen_overrides?.[screen.id] || selectedVariation.mockup_screen_overrides?.[screen.view_key] || selectedVariation.mockup_screen_overrides?.[screen.name] || "";
                          const fallback = screen.image_url || "";
                          const uploadKey = `${selectedVariation.id}-${screen.id}`;
                          return (
                            <div key={screen.id} className="border border-white/10 rounded-xl p-3">
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div>
                                  <div className="text-[10px] uppercase tracking-widest text-zinc-500">Base view</div>
                                  <div className="font-bold text-xs">{screen.name || screen.view_key || screen.screen_view || "View"}</div>
                                </div>
                                <span className={override ? "studio-pill active" : "studio-pill"}>{override ? "Override" : "Default"}</span>
                              </div>
                              <div className="grid grid-cols-2 gap-2 mb-3">
                                <div><div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Default</div><ImageBox src={fallback} alt="Default view" className="aspect-[4/3]" /></div>
                                <div><div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Override</div><ImageBox src={override} alt="Override view" className="aspect-[4/3]" /></div>
                              </div>
                              <div className="flex gap-2">
                                <label className="studio-file-button text-[10px] flex-1 justify-center">
                                  {uploadingKey === uploadKey ? "Uploading" : override ? "Replace" : "Upload"}
                                  <input type="file" accept="image/*" className="hidden" onChange={(event) => uploadScreenOverride(screen, event.target.files?.[0])} />
                                </label>
                                {override && <button type="button" className="btn-secondary text-[10px]" onClick={() => clearScreenOverride(screen)}>Clear</button>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-zinc-500 text-sm">Select a variation card to edit production overrides.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
