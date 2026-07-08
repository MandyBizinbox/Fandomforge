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

function attrNames(attribute, fallback) {
  return [attribute?.name, attribute?.slug, attribute?.id, fallback].filter(Boolean);
}

function attrLabel(attribute, fallback = "Attribute") {
  return attribute?.name || attribute?.slug || fallback;
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

function variationPrintWidth(variation) {
  return variation?.print_width_mm ?? variation?.width_mm ?? variation?.print_area_width_mm ?? "";
}

function variationPrintHeight(variation) {
  return variation?.print_height_mm ?? variation?.height_mm ?? variation?.print_area_height_mm ?? "";
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
  const [expandedRow, setExpandedRow] = useState(null);
  const [uploadingKey, setUploadingKey] = useState("");
  const [detailSearch, setDetailSearch] = useState("");

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

  const colorAttribute = findAttributeByKind(selectedAttributes, "colour") || findAttributeByKind(selectedAttributes, "color");
  const sizeAttribute = findAttributeByKind(selectedAttributes, "size");
  const rowAttribute = colorAttribute || selectedAttributes[0] || null;
  const columnAttribute =
    (sizeAttribute && rowAttribute && sizeAttribute.id !== rowAttribute.id ? sizeAttribute : null) ||
    selectedAttributes.find((attribute) => rowAttribute && attribute.id !== rowAttribute.id) ||
    null;

  const rowLabel = attrLabel(rowAttribute, "Variation");
  const columnLabel = attrLabel(columnAttribute, "Option");
  const rowValues = rowAttribute
    ? selectedValuesFor(rowAttribute)
    : Array.from(new Set(safeArray(variations).map((variation) => variationLabel(variation)))).filter(Boolean);
  const columnValues = columnAttribute ? selectedValuesFor(columnAttribute) : [DEFAULT_COLUMN];
  const hasRowAxis = Boolean(rowAttribute);
  const hasColumnAxis = Boolean(columnAttribute);
  const singleAxisMode = hasRowAxis && !hasColumnAxis;
  const simpleListMode = !hasRowAxis;

  const variationByRowColumn = useMemo(() => {
    const map = new Map();
    safeArray(variations).forEach((variation) => {
      const rowValue = rowAttribute ? getAttrValue(variation, attrNames(rowAttribute, rowLabel), DEFAULT_COLUMN) : variationLabel(variation);
      const columnValue = columnAttribute ? getAttrValue(variation, attrNames(columnAttribute, columnLabel), DEFAULT_COLUMN) : DEFAULT_COLUMN;
      map.set(`${rowValue}|||${columnValue}`, variation);
    });
    return map;
  }, [variations, rowAttribute, columnAttribute, rowLabel, columnLabel]);

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

  const updateVariationPrintSize = (variation, patch) => {
    const width = patch.print_width_mm ?? variationPrintWidth(variation);
    const height = patch.print_height_mm ?? variationPrintHeight(variation);
    updateVariation(variation.id, {
      ...patch,
      print_width_mm: width,
      print_height_mm: height,
      width_mm: width,
      height_mm: height,
      print_area_width_mm: width,
      print_area_height_mm: height,
      standard_print_size_key: patch.standard_print_size_key ?? variation.standard_print_size_key ?? `${width || "custom"}x${height || "custom"}`,
      print_area_overrides: {
        ...(variation.print_area_overrides || {}),
        default: {
          ...(variation.print_area_overrides?.default || {}),
          width_mm: width,
          height_mm: height,
          standard_print_size_key: patch.standard_print_size_key ?? variation.standard_print_size_key ?? `${width || "custom"}x${height || "custom"}`,
        },
      },
    });
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

  const rowVariations = (rowValue) => columnValues.map((columnValue) => variationByRowColumn.get(`${rowValue}|||${columnValue}`)).filter(Boolean);
  const rowActiveCount = (rowValue) => rowVariations(rowValue).filter((variation) => variation.enabled !== false).length;

  const setRowEnabled = (rowValue, enabled) => {
    setVariationsEnabled(rowVariations(rowValue).map((variation) => variation.id), enabled);
  };

  const setColumnEnabled = (columnValue, enabled) => {
    const ids = safeArray(variations)
      .filter((variation) => !hasColumnAxis || getAttrValue(variation, attrNames(columnAttribute, columnLabel), DEFAULT_COLUMN) === columnValue)
      .map((variation) => variation.id);
    setVariationsEnabled(ids, enabled);
  };

  const updateRowCost = (rowValue, cost) => {
    const rowIds = new Set(rowVariations(rowValue).map((variation) => variation.id));
    onVariationsChange(safeArray(variations).map((variation) => (rowIds.has(variation.id) ? { ...variation, ...resolveVariationCostPatch(cost) } : variation)));
  };

  const updateRowCreatorPrice = (rowValue, creatorPrice) => {
    const rowIds = new Set(rowVariations(rowValue).map((variation) => variation.id));
    onVariationsChange(safeArray(variations).map((variation) => (rowIds.has(variation.id) ? { ...variation, ...resolveVariationCostPatch(variationPlatformCost(variation), creatorPrice) } : variation)));
  };

  const updateColumnCost = (columnValue, cost) => {
    onVariationsChange(
      safeArray(variations).map((variation) => {
        const value = hasColumnAxis ? getAttrValue(variation, attrNames(columnAttribute, columnLabel), DEFAULT_COLUMN) : DEFAULT_COLUMN;
        return value === columnValue ? { ...variation, ...resolveVariationCostPatch(cost) } : variation;
      })
    );
  };

  const updateColumnCreatorPrice = (columnValue, creatorPrice) => {
    onVariationsChange(
      safeArray(variations).map((variation) => {
        const value = hasColumnAxis ? getAttrValue(variation, attrNames(columnAttribute, columnLabel), DEFAULT_COLUMN) : DEFAULT_COLUMN;
        return value === columnValue ? { ...variation, ...resolveVariationCostPatch(variationPlatformCost(variation), creatorPrice) } : variation;
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

  const uploadRowImage = (rowValue, file) => {
    uploadVariationImage(rowVariations(rowValue).map((variation) => variation.id), file, `${rowValue} variation image`);
  };

  const rowImage = (rowValue) => {
    const item = rowVariations(rowValue).find((variation) => imageForVariation(variation));
    return imageForVariation(item);
  };

  const rowScreenOverride = (rowValue, screen) => {
    const found = rowVariations(rowValue).find((variation) => {
      const overrides = variation.mockup_screen_overrides || {};
      return overrides[screen.id] || overrides[screen.view_key] || overrides[screen.name];
    });
    const overrides = found?.mockup_screen_overrides || {};
    return overrides[screen.id] || overrides[screen.view_key] || overrides[screen.name] || "";
  };

  const setRowScreenOverride = (rowValue, screen, imageUrl) => {
    const rowIds = new Set(rowVariations(rowValue).map((variation) => variation.id));
    onVariationsChange(
      safeArray(variations).map((variation) => {
        if (!rowIds.has(variation.id)) return variation;
        return { ...variation, mockup_screen_overrides: { ...(variation.mockup_screen_overrides || {}), [screen.id]: imageUrl } };
      })
    );
  };

  const clearRowScreenOverride = (rowValue, screen) => {
    const rowIds = new Set(rowVariations(rowValue).map((variation) => variation.id));
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

  const uploadRowScreenOverride = async (rowValue, screen, file) => {
    if (!file || !screen?.id) return;
    const uploadKey = `${rowValue}-${screen.id || screen.name || "screen"}`;
    setUploadingKey(uploadKey);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("subdir", "template-variation-views");
      const response = await http.post("/files/image", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setRowScreenOverride(rowValue, screen, response.data.url);
      toast.success(`${rowValue} ${screen.name || screen.view_key || screen.screen_view || "view"} image uploaded`);
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
          <p className="text-xs text-zinc-500 mt-1">Configure supplier variation images, print size overrides, blank costs, creator prices, SKUs and variation-specific mockup overrides.</p>
          {singleAxisMode && <p className="text-xs text-[#FFB020] mt-2">Single-axis mode active. Use the arrow on each {rowLabel.toLowerCase()} row to open image, pricing and override controls.</p>}
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
          <p className="text-xs text-zinc-500 mt-3">{selectedAttrValues || "Select one or more variation attributes. Any attribute set supports variation images."}</p>

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
        <SimpleVariationList variations={visibleSimpleVariations} detailSearch={detailSearch} setDetailSearch={setDetailSearch} updateVariation={updateVariation} toggleVariation={toggleVariation} uploadVariationImage={uploadVariationImage} updateVariationPrintSize={updateVariationPrintSize} />
      ) : (
        <div className="variation-matrix-board">
          {hasColumnAxis && (
            <div className="variation-size-bar">
              <div className="variation-size-bar-spacer">{rowLabel}</div>
              <div className="variation-size-grid" style={{ gridTemplateColumns: `repeat(${columnValues.length}, minmax(120px, 1fr))` }}>
                {columnValues.map((columnValue) => (
                  <div key={columnValue} className="variation-size-header-card">
                    <div className="font-bold">{columnValue}</div>
                    <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">{columnLabel}</div>
                    <div className="variation-mini-actions"><button type="button" onClick={() => setColumnEnabled(columnValue, true)}>All</button><button type="button" onClick={() => setColumnEnabled(columnValue, false)}>None</button></div>
                    <input className="studio-mini-input mt-2" type="number" placeholder="Platform cost" onBlur={(event) => event.target.value && updateColumnCost(columnValue, event.target.value)} />
                    <input className="studio-mini-input mt-2" type="number" placeholder="Creator price" onBlur={(event) => event.target.value && updateColumnCreatorPrice(columnValue, event.target.value)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="variation-row-stack">
            {rowValues.map((rowValue) => {
              const image = rowImage(rowValue);
              const rowExpanded = expandedRow === rowValue;
              const activeInRow = rowActiveCount(rowValue);
              const totalInRow = rowVariations(rowValue).length;

              return (
                <div key={rowValue} className="variation-colour-row">
                  <div className="variation-colour-card">
                    <button type="button" className="variation-expand-button" onClick={() => setExpandedRow(rowExpanded ? null : rowValue)} title={rowExpanded ? "Close row details" : "Open row details"}>{rowExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
                    <ImageBox src={image} alt={rowValue} className="variation-colour-image" />
                    <div className="variation-colour-meta">
                      <div className="text-[10px] uppercase tracking-widest text-zinc-500">{rowLabel}</div>
                      <div className="font-bold leading-tight">{rowValue}</div>
                      <div className="text-xs text-zinc-500">{activeInRow} of {totalInRow} active</div>
                      <div className="variation-mini-actions mt-2">
                        <label className="studio-file-button text-[10px]">{uploadingKey.startsWith(`${rowValue} variation`) ? "Uploading" : "Upload row image"}<input type="file" accept="image/*" className="hidden" onChange={(event) => uploadRowImage(rowValue, event.target.files?.[0])} /></label>
                        <button type="button" onClick={() => setRowEnabled(rowValue, true)}>All</button>
                        <button type="button" onClick={() => setRowEnabled(rowValue, false)}>None</button>
                      </div>
                    </div>
                    <div className="variation-row-cost-box">
                      <label><span>Row platform cost</span><input className="studio-mini-input" type="number" placeholder="Actual cost" onBlur={(event) => event.target.value && updateRowCost(rowValue, event.target.value)} /></label>
                      <label><span>Row creator price</span><input className="studio-mini-input" type="number" placeholder="Creator pays" onBlur={(event) => event.target.value && updateRowCreatorPrice(rowValue, event.target.value)} /></label>
                    </div>
                  </div>

                  {hasColumnAxis && (
                    <div className="variation-size-grid" style={{ gridTemplateColumns: `repeat(${columnValues.length}, minmax(120px, 1fr))` }}>
                      {columnValues.map((columnValue) => {
                        const variation = variationByRowColumn.get(`${rowValue}|||${columnValue}`);
                        if (!variation) return <div key={columnValue} className="variation-cell missing">—</div>;
                        const enabled = variation.enabled !== false;
                        return (
                          <div key={variation.id} className={enabled ? "variation-cell active" : "variation-cell"}>
                            <button type="button" onClick={() => toggleVariation(variation)} className="variation-cell-toggle" title={`${rowValue} / ${columnValue}`}>{enabled ? <CheckSquare size={16} /> : <Square size={16} />}<span>{enabled ? "On" : "Off"}</span></button>
                            <input className="studio-mini-input" type="number" step="0.01" value={variationPlatformCost(variation)} onChange={(event) => updateVariation(variation.id, { ...resolveVariationCostPatch(event.target.value, variation.creator_blank_price) })} />
                            <div className="text-[10px] text-zinc-500 mt-1">{variationPrintWidth(variation) || "—"}×{variationPrintHeight(variation) || "—"}mm</div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {rowExpanded && (
                    <VariationRowDetail rowValue={rowValue} rowLabel={rowLabel} columnValues={columnValues} columnLabel={columnLabel} hasColumnAxis={hasColumnAxis} variationByRowColumn={variationByRowColumn} validScreensForOverrides={validScreensForOverrides} uploadingKey={uploadingKey} rowScreenOverride={rowScreenOverride} uploadRowScreenOverride={uploadRowScreenOverride} clearRowScreenOverride={clearRowScreenOverride} updateVariation={updateVariation} updateVariationPrintSize={updateVariationPrintSize} toggleVariation={toggleVariation} uploadVariationImage={uploadVariationImage} />
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

function SimpleVariationList({ variations, detailSearch, setDetailSearch, updateVariation, toggleVariation, uploadVariationImage, updateVariationPrintSize }) {
  return (
    <div className="studio-subpanel">
      <p className="text-zinc-400 text-sm mb-4">No matrix axis is selected. Edit generated variations below.</p>
      <input className="input-base mb-4" value={detailSearch} onChange={(event) => setDetailSearch(event.target.value)} placeholder="Search variations" />
      <div className="variation-list-editor">
        {safeArray(variations).map((variation) => (
          <div key={variation.id || getVariationKey(variation)} className="variation-list-row">
            <div className="flex items-center gap-3 min-w-0"><ImageBox src={imageForVariation(variation)} alt={variationLabel(variation)} className="variation-colour-image shrink-0" /><div><div className="font-bold text-sm">{variationLabel(variation)}</div><div className="text-xs text-zinc-500">{variation.supplier_sku || "No supplier SKU"}</div></div></div>
            <label className="studio-file-button text-[10px]">Upload image<input type="file" accept="image/*" className="hidden" onChange={(event) => uploadVariationImage([variation.id], event.target.files?.[0], variationLabel(variation))} /></label>
            <input className="studio-mini-input" type="number" step="0.01" value={variationPlatformCost(variation)} onChange={(event) => updateVariation(variation.id, { ...resolveVariationCostPatch(event.target.value, variation.creator_blank_price) })} />
            <input className="studio-mini-input" type="number" step="0.1" placeholder="Print width mm" value={variationPrintWidth(variation)} onChange={(event) => updateVariationPrintSize(variation, { print_width_mm: event.target.value })} />
            <input className="studio-mini-input" type="number" step="0.1" placeholder="Print height mm" value={variationPrintHeight(variation)} onChange={(event) => updateVariationPrintSize(variation, { print_height_mm: event.target.value })} />
            <button type="button" onClick={() => toggleVariation(variation)} className={variation.enabled === false ? "matrix-toggle compact" : "matrix-toggle compact active"}>{variation.enabled === false ? "Off" : "On"}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function VariationRowDetail({ rowValue, rowLabel, columnValues, columnLabel, hasColumnAxis, variationByRowColumn, validScreensForOverrides, uploadingKey, rowScreenOverride, uploadRowScreenOverride, clearRowScreenOverride, updateVariation, updateVariationPrintSize, toggleVariation, uploadVariationImage }) {
  const variations = columnValues.map((columnValue) => ({ columnValue, variation: variationByRowColumn.get(`${rowValue}|||${columnValue}`) })).filter((item) => item.variation);

  return (
    <div className="variation-row-detail space-y-5">
      <div className="variation-detail-card">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="font-bold text-sm">Variation image, print size and blank pricing</div>
            <p className="text-xs text-zinc-500 mt-1">Each generated combination is its own production record. Set images and print dimensions per variation where needed.</p>
          </div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">{variations.length} record(s)</div>
        </div>

        <div className="grid lg:grid-cols-2 gap-3">
          {variations.map(({ columnValue, variation }) => (
            <div key={variation.id} className="border border-white/10 bg-black/20 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3 min-w-0"><ImageBox src={imageForVariation(variation)} alt={variationLabel(variation)} className="w-16 h-16 shrink-0" /><div><div className="font-bold text-sm">{hasColumnAxis ? `${rowValue} / ${columnValue}` : rowValue}</div><div className="text-[11px] text-zinc-500">{rowLabel}{hasColumnAxis ? ` · ${columnLabel}` : ""}</div><div className="text-xs text-zinc-500 break-all">{variation.id}</div></div></div>
                <button type="button" onClick={() => toggleVariation(variation)} className={variation.enabled === false ? "studio-pill" : "studio-pill active"}>{variation.enabled === false ? "Disabled" : "Enabled"}</button>
              </div>

              <div className="grid sm:grid-cols-2 gap-2">
                <label className="sm:col-span-2 studio-file-button justify-center text-xs">Upload this variation image<input type="file" accept="image/*" className="hidden" onChange={(event) => uploadVariationImage([variation.id], event.target.files?.[0], variationLabel(variation))} /></label>
                <label><span className="label">Variation print width mm</span><input className="input-base text-sm" type="number" step="0.1" value={variationPrintWidth(variation)} onChange={(event) => updateVariationPrintSize(variation, { print_width_mm: event.target.value })} /></label>
                <label><span className="label">Variation print height mm</span><input className="input-base text-sm" type="number" step="0.1" value={variationPrintHeight(variation)} onChange={(event) => updateVariationPrintSize(variation, { print_height_mm: event.target.value })} /></label>
                <label className="sm:col-span-2"><span className="label">Print size key / label</span><input className="input-base text-sm" value={variation.standard_print_size_key || ""} onChange={(event) => updateVariationPrintSize(variation, { standard_print_size_key: event.target.value })} placeholder="e.g. 5cm, 7cm, 50x50mm" /></label>
                <div className="sm:col-span-2 text-[11px] text-zinc-500 border border-white/10 bg-black/20 rounded-xl p-3">These values override the template print dimensions for this variation. Use this for items such as White 5cm, White 7cm, Clear 5cm and Clear 7cm.</div>
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
            <div><div className="font-bold text-sm">Variation-row mockup view overrides</div><p className="text-xs text-zinc-500 mt-1">Only upload these when this {rowLabel.toLowerCase()} needs a different front/back/wrap/base image than the template default.</p></div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">Applies to all {rowValue} variations</div>
          </div>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {validScreensForOverrides.map((screen) => {
              const override = rowScreenOverride(rowValue, screen);
              const fallback = screen.image_url || "";
              const baseViewLabel = screen.name || screen.view_key || screen.screen_view || "View";
              const uploadKey = `${rowValue}-${screen.id || screen.name || "screen"}`;
              return (
                <div key={screen.id} className="border border-white/10 bg-black/20 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2 mb-3"><div><div className="text-[10px] uppercase tracking-widest text-zinc-500">Base view</div><div className="font-bold text-xs">{baseViewLabel}</div></div><span className={override ? "studio-pill active" : "studio-pill"}>{override ? "Override" : fallback ? "Default" : "Empty"}</span></div>
                  <div className="grid grid-cols-2 gap-2 mb-3"><div><div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Default</div><ImageBox src={fallback} alt={`Base ${baseViewLabel}`} className="aspect-[4/3]" /></div><div><div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Override</div><ImageBox src={override} alt={`${rowValue} ${baseViewLabel} override`} className="aspect-[4/3]" /></div></div>
                  <div className="flex gap-2"><label className="studio-file-button text-[10px] flex-1 justify-center">{uploadingKey === uploadKey ? "Uploading" : override ? "Replace" : "Upload"}<input type="file" accept="image/*" className="hidden" onChange={(event) => uploadRowScreenOverride(rowValue, screen, event.target.files?.[0])} /></label>{override && <button type="button" className="btn-secondary text-[10px]" onClick={() => clearRowScreenOverride(rowValue, screen)}>Clear</button>}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
