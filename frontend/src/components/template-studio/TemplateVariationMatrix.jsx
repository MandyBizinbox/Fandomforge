import React, { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Square,
  CheckSquare,
  Wand2,
} from "lucide-react";
import { http, assetUrl } from "../../lib/api";
import { toast } from "sonner";
import {
  buildVariationCombinations,
  findAttributeByKind,
  getVariationKey,
  money,
  safeArray,
} from "./templateStudioUtils";

const DEFAULT_COLUMN = "Default";

function getAttrValue(variation, names, fallback = "") {
  const attrs = variation?.attributes || {};

  for (const name of names) {
    if (attrs[name]) return attrs[name];
  }

  const entries = Object.entries(attrs);
  const match = entries.find(([key]) => names.some((name) => key.toLowerCase() === name.toLowerCase()));
  return match ? match[1] : fallback;
}

function variationLabel(variation) {
  const values = Object.values(variation?.attributes || {}).filter(Boolean);
  return values.length ? values.join(" / ") : "Variation";
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

function ImageBox({ src, alt, className = "" }) {
  return (
    <div className={`bg-black border border-white/10 rounded-lg overflow-hidden flex items-center justify-center ${className}`}>
      {src ? (
        <img src={assetUrl(src)} alt={alt} className="w-full h-full object-contain" />
      ) : (
        <ImageIcon size={18} className="text-zinc-700" />
      )}
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
  const [expandedColor, setExpandedColor] = useState(null);
  const [uploadingKey, setUploadingKey] = useState("");
  const [detailSearch, setDetailSearch] = useState("");

  const selectedAttributes = useMemo(
    () => safeArray(attributes).filter((attribute) => safeArray(selectedAttributeIds).includes(attribute.id)),
    [attributes, selectedAttributeIds]
  );

  const colorAttribute = findAttributeByKind(selectedAttributes, "colour") || findAttributeByKind(selectedAttributes, "color");
  const sizeAttribute = findAttributeByKind(selectedAttributes, "size");
  const colorName = colorAttribute?.name || colorAttribute?.slug || "Colour";
  const sizeName = sizeAttribute?.name || sizeAttribute?.slug || "Size";

  const selectedValuesFor = (attribute) => {
    if (!attribute) return [];
    const key = attributeValueKey(attribute);
    if (!key) return safeArray(attribute?.values);
    const hasExplicitValues = Object.prototype.hasOwnProperty.call(selectedAttributeValues || {}, key);
    return hasExplicitValues ? safeArray(selectedAttributeValues[key]) : safeArray(attribute?.values);
  };

  const colors = colorAttribute
    ? selectedValuesFor(colorAttribute)
    : Array.from(new Set(safeArray(variations).map((variation) => getAttrValue(variation, [colorName, "Colour", "Color"], "Default")))).filter(Boolean);
  const sizes = sizeAttribute ? selectedValuesFor(sizeAttribute) : [];
  const matrixColumns = sizeAttribute ? sizes : [DEFAULT_COLUMN];
  const hasColorRows = Boolean(colorAttribute);
  const hasSizeColumns = Boolean(sizeAttribute);
  const simpleListMode = !hasColorRows;
  const colourOnlyMode = hasColorRows && !hasSizeColumns;

  const variationByColorSize = useMemo(() => {
    const map = new Map();
    safeArray(variations).forEach((variation) => {
      const color = getAttrValue(variation, [colorName, "Colour", "Color"], "Default");
      const size = hasSizeColumns ? getAttrValue(variation, [sizeName, "Size"], DEFAULT_COLUMN) : DEFAULT_COLUMN;
      map.set(`${color}|||${size}`, variation);
    });
    return map;
  }, [variations, colorName, sizeName, hasSizeColumns]);

  const activeCount = safeArray(variations).filter((variation) => variation.enabled !== false).length;
  const selectedAttrValues = selectedAttributes
    .map((attribute) => {
      const values = selectedValuesFor(attribute);
      return `${attribute.name}: ${values.length ? values.join(", ") : "No values selected"}`;
    })
    .join(" · ");
  const validScreensForOverrides = safeArray(screens).filter((screen) => screen && screen.id);
  const visibleSimpleVariations = safeArray(variations).filter((variation) => {
    if (!detailSearch.trim()) return true;
    return variationLabel(variation).toLowerCase().includes(detailSearch.toLowerCase());
  });

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
    toast.success(`${generated.length} variations generated`);
  };

  const updateVariation = (variationId, patch) => {
    onVariationsChange(safeArray(variations).map((variation) => (variation.id === variationId ? { ...variation, ...patch } : variation)));
  };

  const toggleVariation = (variation) => {
    updateVariation(variation.id, { enabled: variation.enabled === false, status: variation.enabled === false ? "active" : "draft" });
  };

  const setVariationsEnabled = (variationIds, enabled) => {
    const idSet = new Set(variationIds);
    onVariationsChange(safeArray(variations).map((variation) => (idSet.has(variation.id) ? { ...variation, enabled, status: enabled ? "active" : "draft" } : variation)));
  };

  const setAllEnabled = (enabled) => {
    onVariationsChange(safeArray(variations).map((variation) => ({ ...variation, enabled, status: enabled ? "active" : "draft" })));
  };

  const rowVariations = (color) => matrixColumns.map((size) => variationByColorSize.get(`${color}|||${size}`)).filter(Boolean);
  const rowActiveCount = (color) => rowVariations(color).filter((variation) => variation.enabled !== false).length;

  const setRowEnabled = (color, enabled) => {
    setVariationsEnabled(rowVariations(color).map((variation) => variation.id), enabled);
  };

  const setColumnEnabled = (size, enabled) => {
    const ids = safeArray(variations)
      .filter((variation) => !hasSizeColumns || getAttrValue(variation, [sizeName, "Size"], DEFAULT_COLUMN) === size)
      .map((variation) => variation.id);
    setVariationsEnabled(ids, enabled);
  };

  const updateRowCost = (color, cost) => {
    const rowIds = new Set(rowVariations(color).map((variation) => variation.id));
    onVariationsChange(safeArray(variations).map((variation) => (rowIds.has(variation.id) ? { ...variation, ...resolveVariationCostPatch(cost) } : variation)));
  };

  const updateRowCreatorPrice = (color, creatorPrice) => {
    const rowIds = new Set(rowVariations(color).map((variation) => variation.id));
    onVariationsChange(safeArray(variations).map((variation) => (rowIds.has(variation.id) ? { ...variation, ...resolveVariationCostPatch(variationPlatformCost(variation), creatorPrice) } : variation)));
  };

  const updateColumnCost = (size, cost) => {
    onVariationsChange(
      safeArray(variations).map((variation) => {
        const variationSize = hasSizeColumns ? getAttrValue(variation, [sizeName, "Size"], DEFAULT_COLUMN) : DEFAULT_COLUMN;
        return variationSize === size ? { ...variation, ...resolveVariationCostPatch(cost) } : variation;
      })
    );
  };

  const updateColumnCreatorPrice = (size, creatorPrice) => {
    onVariationsChange(
      safeArray(variations).map((variation) => {
        const variationSize = hasSizeColumns ? getAttrValue(variation, [sizeName, "Size"], DEFAULT_COLUMN) : DEFAULT_COLUMN;
        return variationSize === size ? { ...variation, ...resolveVariationCostPatch(variationPlatformCost(variation), creatorPrice) } : variation;
      })
    );
  };

  const applyBulkCost = () => {
    onVariationsChange(safeArray(variations).map((variation) => ({ ...variation, ...resolveVariationCostPatch(bulkCost) })));
  };

  const applyBulkCreatorPrice = () => {
    onVariationsChange(safeArray(variations).map((variation) => ({ ...variation, ...resolveVariationCostPatch(variationPlatformCost(variation), bulkCreatorPrice) })));
  };

  const uploadVariationImage = async (variationIds, file, label = "Variation image") => {
    if (!file || !safeArray(variationIds).length) return;
    const uploadKey = `${label}-${Date.now()}`;
    setUploadingKey(uploadKey);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("subdir", "template-variation-images");
      const response = await http.post("/files/image", formData, { headers: { "Content-Type": "multipart/form-data" } });
      const idSet = new Set(safeArray(variationIds));
      onVariationsChange(safeArray(variations).map((variation) => (idSet.has(variation.id) ? { ...variation, image_url: response.data.url } : variation)));
      toast.success(`${label} uploaded`);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Image upload failed");
    } finally {
      setUploadingKey("");
    }
  };

  const uploadColourImage = (color, file) => {
    uploadVariationImage(rowVariations(color).map((variation) => variation.id), file, `${color} variation image`);
  };

  const colorImage = (color) => {
    const item = rowVariations(color).find((variation) => imageForVariation(variation));
    return imageForVariation(item);
  };

  const colourScreenOverride = (color, screen) => {
    const found = rowVariations(color).find((variation) => {
      const overrides = variation.mockup_screen_overrides || {};
      return overrides[screen.id] || overrides[screen.view_key] || overrides[screen.name];
    });
    const overrides = found?.mockup_screen_overrides || {};
    return overrides[screen.id] || overrides[screen.view_key] || overrides[screen.name] || "";
  };

  const setColourScreenOverride = (color, screen, imageUrl) => {
    const rowIds = new Set(rowVariations(color).map((variation) => variation.id));
    onVariationsChange(
      safeArray(variations).map((variation) => {
        if (!rowIds.has(variation.id)) return variation;
        return { ...variation, mockup_screen_overrides: { ...(variation.mockup_screen_overrides || {}), [screen.id]: imageUrl } };
      })
    );
  };

  const clearColourScreenOverride = (color, screen) => {
    const rowIds = new Set(rowVariations(color).map((variation) => variation.id));
    onVariationsChange(
      safeArray(variations).map((variation) => {
        if (!rowIds.has(variation.id)) return variation;
        const overrides = { ...(variation.mockup_screen_overrides || {}) };
        delete overrides[screen.id];
        if (screen.view_key) delete overrides[screen.view_key];
        if (screen.name) delete overrides[screen.name];
        return { ...variation, mockup_screen_overrides: overrides };
      })
    );
  };

  const uploadColourScreenOverride = async (color, screen, file) => {
    if (!file || !screen?.id) return;
    const uploadKey = `${color}-${screen.id || screen.name || "screen"}`;
    setUploadingKey(uploadKey);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("subdir", "template-variation-views");
      const response = await http.post("/files/image", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setColourScreenOverride(color, screen, response.data.url);
      toast.success(`${color} ${screen.name || screen.view_key || screen.screen_view || "view"} image uploaded`);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not upload variation view image");
    } finally {
      setUploadingKey("");
    }
  };

  return (
    <div className="studio-panel variation-matrix-panel">
      <div className="studio-panel-header">
        <div>
          <div className="overline mb-1">Variations</div>
          <h2 className="font-display text-2xl uppercase">Variation Matrix</h2>
          <p className="text-xs text-zinc-500 mt-1">Configure supplier variation images, blank costs, creator prices, SKUs and colour-specific mockup overrides.</p>
          {colourOnlyMode && <p className="text-xs text-[#FFB020] mt-2">Colour-only mode active. Use the arrow on each colour row to open image, pricing and override controls.</p>}
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
          <p className="text-xs text-zinc-500 mt-3">{selectedAttrValues || "Select variation attributes. Colour-only products such as mugs are supported."}</p>

          {selectedAttributes.length > 0 && (
            <div className="mt-5 space-y-4 border-t border-white/10 pt-4">
              <div>
                <div className="label">Attribute values to generate</div>
                <p className="text-xs text-zinc-500 mt-1">Untick supplier colours/sizes that are not available for this specific template before generating.</p>
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
          <div className="label">Active variations</div>
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
        <div className="studio-empty-state"><Wand2 size={24} className="text-zinc-600" /><p className="font-bold uppercase tracking-widest text-sm">No variations generated yet</p><p className="text-zinc-500 text-sm">Select one or more attributes, then click Generate.</p></div>
      ) : simpleListMode ? (
        <SimpleVariationList variations={visibleSimpleVariations} detailSearch={detailSearch} setDetailSearch={setDetailSearch} updateVariation={updateVariation} toggleVariation={toggleVariation} uploadVariationImage={uploadVariationImage} />
      ) : (
        <div className="variation-matrix-board">
          {hasSizeColumns && (
            <div className="variation-size-bar">
              <div className="variation-size-bar-spacer">Colour</div>
              <div className="variation-size-grid" style={{ gridTemplateColumns: `repeat(${matrixColumns.length}, minmax(120px, 1fr))` }}>
                {matrixColumns.map((size) => (
                  <div key={size} className="variation-size-header-card">
                    <div className="font-bold">{size}</div>
                    <div className="variation-mini-actions"><button type="button" onClick={() => setColumnEnabled(size, true)}>All</button><button type="button" onClick={() => setColumnEnabled(size, false)}>None</button></div>
                    <input className="studio-mini-input mt-2" type="number" placeholder="Platform cost" onBlur={(event) => event.target.value && updateColumnCost(size, event.target.value)} />
                    <input className="studio-mini-input mt-2" type="number" placeholder="Creator price" onBlur={(event) => event.target.value && updateColumnCreatorPrice(size, event.target.value)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="variation-row-stack">
            {colors.map((color) => {
              const image = colorImage(color);
              const rowExpanded = expandedColor === color;
              const activeInRow = rowActiveCount(color);
              const totalInRow = rowVariations(color).length;

              return (
                <div key={color} className="variation-colour-row">
                  <div className="variation-colour-card">
                    <button type="button" className="variation-expand-button" onClick={() => setExpandedColor(rowExpanded ? null : color)} title={rowExpanded ? "Close row details" : "Open row details"}>{rowExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
                    <ImageBox src={image} alt={color} className="variation-colour-image" />
                    <div className="variation-colour-meta">
                      <div className="font-bold leading-tight">{color}</div>
                      <div className="text-xs text-zinc-500">{activeInRow} of {totalInRow} active</div>
                      <div className="variation-mini-actions mt-2">
                        <label className="studio-file-button text-[10px]">{uploadingKey.startsWith(`${color} variation`) ? "Uploading" : "Upload colour image"}<input type="file" accept="image/*" className="hidden" onChange={(event) => uploadColourImage(color, event.target.files?.[0])} /></label>
                        <button type="button" onClick={() => setRowEnabled(color, true)}>All</button>
                        <button type="button" onClick={() => setRowEnabled(color, false)}>None</button>
                      </div>
                    </div>
                    <div className="variation-row-cost-box">
                      <label><span>Row platform cost</span><input className="studio-mini-input" type="number" placeholder="Actual cost" onBlur={(event) => event.target.value && updateRowCost(color, event.target.value)} /></label>
                      <label><span>Row creator price</span><input className="studio-mini-input" type="number" placeholder="Creator pays" onBlur={(event) => event.target.value && updateRowCreatorPrice(color, event.target.value)} /></label>
                    </div>
                  </div>

                  {hasSizeColumns && (
                    <div className="variation-size-grid" style={{ gridTemplateColumns: `repeat(${matrixColumns.length}, minmax(120px, 1fr))` }}>
                      {matrixColumns.map((size) => {
                        const variation = variationByColorSize.get(`${color}|||${size}`);
                        if (!variation) return <div key={size} className="variation-cell missing">—</div>;
                        const enabled = variation.enabled !== false;
                        return (
                          <div key={variation.id} className={enabled ? "variation-cell active" : "variation-cell"}>
                            <button type="button" onClick={() => toggleVariation(variation)} className="variation-cell-toggle" title={`${color} / ${size}`}>{enabled ? <CheckSquare size={16} /> : <Square size={16} />}<span>{enabled ? "On" : "Off"}</span></button>
                            <input className="studio-mini-input" type="number" step="0.01" value={variationPlatformCost(variation)} onChange={(event) => updateVariation(variation.id, { ...resolveVariationCostPatch(event.target.value, variation.creator_blank_price) })} />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {rowExpanded && (
                    <VariationRowDetail color={color} matrixColumns={matrixColumns} hasSizeColumns={hasSizeColumns} variationByColorSize={variationByColorSize} validScreensForOverrides={validScreensForOverrides} uploadingKey={uploadingKey} colourScreenOverride={colourScreenOverride} uploadColourScreenOverride={uploadColourScreenOverride} clearColourScreenOverride={clearColourScreenOverride} updateVariation={updateVariation} toggleVariation={toggleVariation} uploadVariationImage={uploadVariationImage} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SimpleVariationList({ variations, detailSearch, setDetailSearch, updateVariation, toggleVariation, uploadVariationImage }) {
  return (
    <div className="studio-subpanel">
      <p className="text-zinc-400 text-sm mb-4">No Colour attribute is selected. Edit generated variations below.</p>
      <input className="input-base mb-4" value={detailSearch} onChange={(event) => setDetailSearch(event.target.value)} placeholder="Search variations" />
      <div className="variation-list-editor">
        {safeArray(variations).map((variation) => (
          <div key={variation.id || getVariationKey(variation)} className="variation-list-row">
            <div className="flex items-center gap-3 min-w-0"><ImageBox src={imageForVariation(variation)} alt={variationLabel(variation)} className="variation-colour-image shrink-0" /><div><div className="font-bold text-sm">{variationLabel(variation)}</div><div className="text-xs text-zinc-500">{variation.supplier_sku || "No supplier SKU"}</div></div></div>
            <label className="studio-file-button text-[10px]">Upload image<input type="file" accept="image/*" className="hidden" onChange={(event) => uploadVariationImage([variation.id], event.target.files?.[0], variationLabel(variation))} /></label>
            <input className="studio-mini-input" type="number" step="0.01" value={variationPlatformCost(variation)} onChange={(event) => updateVariation(variation.id, { ...resolveVariationCostPatch(event.target.value, variation.creator_blank_price) })} />
            <button type="button" onClick={() => toggleVariation(variation)} className={variation.enabled === false ? "matrix-toggle compact" : "matrix-toggle compact active"}>{variation.enabled === false ? "Off" : "On"}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function VariationRowDetail({ color, matrixColumns, hasSizeColumns, variationByColorSize, validScreensForOverrides, uploadingKey, colourScreenOverride, uploadColourScreenOverride, clearColourScreenOverride, updateVariation, toggleVariation, uploadVariationImage }) {
  const variations = matrixColumns.map((size) => ({ size, variation: variationByColorSize.get(`${color}|||${size}`) })).filter((item) => item.variation);

  return (
    <div className="variation-row-detail space-y-5">
      <div className="variation-detail-card">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="font-bold text-sm">Variation image and blank pricing</div>
            <p className="text-xs text-zinc-500 mt-1">This is the supplier variation image, blank cost, creator blank price and supplier SKU setup.</p>
          </div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">{variations.length} record(s)</div>
        </div>

        <div className="grid lg:grid-cols-2 gap-3">
          {variations.map(({ size, variation }) => (
            <div key={variation.id} className="border border-white/10 bg-black/20 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3 min-w-0"><ImageBox src={imageForVariation(variation)} alt={variationLabel(variation)} className="w-16 h-16 shrink-0" /><div><div className="font-bold text-sm">{hasSizeColumns ? `${color} / ${size}` : color}</div><div className="text-xs text-zinc-500 break-all">{variation.id}</div></div></div>
                <button type="button" onClick={() => toggleVariation(variation)} className={variation.enabled === false ? "studio-pill" : "studio-pill active"}>{variation.enabled === false ? "Disabled" : "Enabled"}</button>
              </div>

              <div className="grid sm:grid-cols-2 gap-2">
                <label className="sm:col-span-2 studio-file-button justify-center text-xs">Upload this variation image<input type="file" accept="image/*" className="hidden" onChange={(event) => uploadVariationImage([variation.id], event.target.files?.[0], variationLabel(variation))} /></label>
                <label><span className="label">Platform blank cost</span><input className="input-base text-sm" type="number" step="0.01" value={variationPlatformCost(variation)} onChange={(event) => updateVariation(variation.id, { ...resolveVariationCostPatch(event.target.value, variation.creator_blank_price) })} /></label>
                <label><span className="label">Creator blank price</span><input className="input-base text-sm" type="number" step="0.01" value={variationCreatorPrice(variation)} onChange={(event) => updateVariation(variation.id, { ...resolveVariationCostPatch(variationPlatformCost(variation), event.target.value) })} /></label>
                <div className="variation-profit-summary"><span>Profit</span><strong>{money(variationCreatorPrice(variation) - variationPlatformCost(variation))}</strong></div>
                <div className="variation-profit-summary"><span>Margin</span><strong>{Number(variation.platform_blank_margin_percent || 0).toFixed(2)}%</strong></div>
                <label className="sm:col-span-2"><span className="label">Supplier SKU</span><input className="input-base text-sm" value={variation.supplier_sku || ""} onChange={(event) => updateVariation(variation.id, { supplier_sku: event.target.value })} /></label>
              </div>
            </div>
          ))}
        </div>
      </div>

      {validScreensForOverrides.length > 0 && (
        <div className="variation-detail-card variation-override-panel">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-4">
            <div><div className="font-bold text-sm">Colour-specific mockup view overrides</div><p className="text-xs text-zinc-500 mt-1">Only upload these when this colour needs a different front/back/wrap/base image than the template default.</p></div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">Applies to all {color} variations</div>
          </div>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {validScreensForOverrides.map((screen) => {
              const override = colourScreenOverride(color, screen);
              const fallback = screen.image_url || "";
              const baseViewLabel = screen.name || screen.view_key || screen.screen_view || "View";
              const uploadKey = `${color}-${screen.id || screen.name || "screen"}`;
              return (
                <div key={screen.id} className="border border-white/10 bg-black/20 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2 mb-3"><div><div className="text-[10px] uppercase tracking-widest text-zinc-500">Base view</div><div className="font-bold text-xs">{baseViewLabel}</div></div><span className={override ? "studio-pill active" : "studio-pill"}>{override ? "Override" : fallback ? "Default" : "Empty"}</span></div>
                  <div className="grid grid-cols-2 gap-2 mb-3"><div><div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Default</div><ImageBox src={fallback} alt={`Base ${baseViewLabel}`} className="aspect-[4/3]" /></div><div><div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Override</div><ImageBox src={override} alt={`${color} ${baseViewLabel} override`} className="aspect-[4/3]" /></div></div>
                  <div className="flex gap-2"><label className="studio-file-button text-[10px] flex-1 justify-center">{uploadingKey === uploadKey ? "Uploading" : override ? "Replace" : "Upload"}<input type="file" accept="image/*" className="hidden" onChange={(event) => uploadColourScreenOverride(color, screen, event.target.files?.[0])} /></label>{override && <button type="button" className="btn-secondary text-[10px]" onClick={() => clearColourScreenOverride(color, screen)}>Clear</button>}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
