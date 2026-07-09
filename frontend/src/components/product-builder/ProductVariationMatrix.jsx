import React, { useMemo, useState } from "react";
import { Check, CheckSquare, Image as ImageIcon, Square } from "lucide-react";
import { assetUrl } from "../../lib/api";
import {
  asArray,
  getVariationAttributes,
  getVariationCost,
  getVariationLabel,
  money,
} from "./productBuilderUtils";

function firstTruthy(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "") || "";
}

function getVariationOverrideImage(variation = {}) {
  const overrides = variation.mockup_screen_overrides || {};
  return Object.values(overrides).find(Boolean) || "";
}

function getTemplateFallbackImage(template = {}) {
  return firstTruthy(
    template.creator_catalogue_thumbnail_url,
    template.product_image_url,
    template.mockup_url,
    asArray(template.mockup_images)[0],
    asArray(template.mockup_screens).find((screen) => screen.image_url)?.image_url
  );
}

function getVariationImage(variation = {}, template = {}) {
  return firstTruthy(
    variation.image_url,
    variation.product_image_url,
    variation.mockup_image_url,
    getVariationOverrideImage(variation),
    getTemplateFallbackImage(template)
  );
}

function VariationImagePreview({ image, label }) {
  return (
    <div className="w-16 h-16 shrink-0 rounded-lg border border-white/10 bg-black/40 flex items-center justify-center overflow-hidden">
      {image ? (
        <img
          src={assetUrl(image)}
          alt={label || "Variation"}
          className="w-full h-full object-contain"
          onError={(event) => { event.currentTarget.style.display = "none"; }}
        />
      ) : (
        <ImageIcon size={20} className="text-zinc-700" />
      )}
    </div>
  );
}

function normalise(value) {
  return String(value || "").trim().toLowerCase();
}

function collectAttributeKeys(variations = []) {
  const keys = [];
  asArray(variations).forEach((variation) => {
    Object.keys(getVariationAttributes(variation)).forEach((key) => {
      if (!keys.includes(key)) keys.push(key);
    });
  });

  return keys.sort((a, b) => {
    const priority = ["Colour", "Color", "Size", "Keyring Size", "Keyring Material", "Material"];
    const ai = priority.findIndex((item) => normalise(item) === normalise(a));
    const bi = priority.findIndex((item) => normalise(item) === normalise(b));
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return String(a).localeCompare(String(b), undefined, { sensitivity: "base" });
  });
}

function collectAttributeValues(variations = [], key = "") {
  const values = new Set();
  asArray(variations).forEach((variation) => {
    const attrs = getVariationAttributes(variation);
    const actualKey = Object.keys(attrs).find((item) => normalise(item) === normalise(key));
    const value = actualKey ? attrs[actualKey] : "";
    if (value !== undefined && value !== null && String(value).trim() !== "") values.add(String(value));
  });
  return [...values].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" }));
}

function variationMatchesAttribute(variation, key, value) {
  if (!key || !value) return true;
  const attrs = getVariationAttributes(variation);
  const actualKey = Object.keys(attrs).find((item) => normalise(item) === normalise(key));
  return actualKey && normalise(attrs[actualKey]) === normalise(value);
}

export default function ProductVariationMatrix({ template, selectedIds, onChange, hasTemplateVariations = true }) {
  const [filter, setFilter] = useState("");
  const [attributeFilterKey, setAttributeFilterKey] = useState("");
  const [attributeFilterValue, setAttributeFilterValue] = useState("");

  const sourceVariations = useMemo(
    () => asArray(template?.variations).filter((variation) => variation.enabled !== false && variation.status !== "archived"),
    [template]
  );

  const attributeKeys = useMemo(() => collectAttributeKeys(sourceVariations), [sourceVariations]);
  const attributeFilterValues = useMemo(() => collectAttributeValues(sourceVariations, attributeFilterKey), [sourceVariations, attributeFilterKey]);

  const variations = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return sourceVariations.filter((variation) => {
      const searchText = `${getVariationLabel(variation)} ${variation.sku || ""} ${JSON.stringify(getVariationAttributes(variation))}`.toLowerCase();
      const matchesSearch = !q || searchText.includes(q);
      const matchesAttribute = variationMatchesAttribute(variation, attributeFilterKey, attributeFilterValue);
      return matchesSearch && matchesAttribute;
    });
  }, [sourceVariations, filter, attributeFilterKey, attributeFilterValue]);

  const selected = useMemo(() => new Set(asArray(selectedIds)), [selectedIds]);
  const setSelected = (nextSet) => onChange([...nextSet]);

  const toggleOne = (variationId) => {
    const next = new Set(selected);
    if (next.has(variationId)) next.delete(variationId);
    else next.add(variationId);
    setSelected(next);
  };

  const selectAll = () => setSelected(new Set(sourceVariations.map((variation) => variation.id)));
  const selectVisible = () => {
    const next = new Set(selected);
    variations.forEach((variation) => next.add(variation.id));
    setSelected(next);
  };
  const clearVisible = () => {
    const next = new Set(selected);
    variations.forEach((variation) => next.delete(variation.id));
    setSelected(next);
  };
  const clearAll = () => setSelected(new Set());

  return (
    <div className="space-y-4 product-variation-matrix-shell" data-testid="product-variation-matrix">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
        <div>
          <div className="overline mb-1">Variation Selection</div>
          <p className="text-sm text-zinc-500">
            Select the exact template variations this sellable product will offer. This now supports any template attributes, not only Colour and Size.
          </p>
        </div>
        {hasTemplateVariations && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={selectAll}>Select all</button>
            <button type="button" className="btn-secondary" onClick={selectVisible}>Select visible</button>
            <button type="button" className="btn-secondary" onClick={clearVisible}>Clear visible</button>
            <button type="button" className="btn-secondary" onClick={clearAll}>Clear all</button>
          </div>
        )}
      </div>

      {hasTemplateVariations && (
        <div className="grid md:grid-cols-[minmax(0,1fr)_220px_220px] gap-3">
          <input
            className="input-base"
            placeholder="Filter by variation, SKU or attribute"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <select
            className="input-base"
            value={attributeFilterKey}
            onChange={(event) => {
              setAttributeFilterKey(event.target.value);
              setAttributeFilterValue("");
            }}
          >
            <option value="">All attributes</option>
            {attributeKeys.map((key) => <option key={key} value={key}>{key}</option>)}
          </select>
          <select
            className="input-base"
            value={attributeFilterValue}
            onChange={(event) => setAttributeFilterValue(event.target.value)}
            disabled={!attributeFilterKey}
          >
            <option value="">All values</option>
            {attributeFilterValues.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-black/30 p-4 min-h-[420px]">
        {hasTemplateVariations && variations.length > 0 && (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
            {variations.map((variation) => {
              const active = selected.has(variation.id);
              const attrs = getVariationAttributes(variation);
              const image = getVariationImage(variation, template);

              return (
                <button
                  key={variation.id}
                  type="button"
                  onClick={() => toggleOne(variation.id)}
                  className={`text-left border rounded-xl p-3 transition ${active ? "border-[#FF3B30] bg-[#FF3B30]/15" : "border-white/10 bg-black/30 hover:border-white/30"}`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`mt-1 ${active ? "text-[#34C759]" : "text-zinc-500"}`}>
                      {active ? <CheckSquare size={16} /> : <Square size={16} />}
                    </span>
                    <VariationImagePreview image={image} label={getVariationLabel(variation)} />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-white leading-tight">{getVariationLabel(variation)}</div>
                      <div className="text-[11px] text-zinc-500 mt-1 break-all">{variation.sku || variation.supplier_sku || variation.id}</div>
                      <div className="mt-3 flex flex-wrap gap-1">
                        {Object.entries(attrs).map(([key, value]) => (
                          <span key={`${variation.id}-${key}`} className="rounded border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-zinc-300">
                            <span className="text-zinc-500">{key}:</span> {String(value)}
                          </span>
                        ))}
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                        <span className="rounded border border-white/10 px-2 py-1 text-zinc-400">Blank {money(getVariationCost(variation, template))}</span>
                        <span className={`rounded border px-2 py-1 ${image ? "border-[#34C759]/40 text-[#B8F5C3]" : "border-white/10 text-zinc-500"}`}>{image ? "Image ready" : "No image"}</span>
                      </div>
                    </div>
                    {active && <Check size={14} className="text-[#34C759] shrink-0" />}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {hasTemplateVariations && variations.length === 0 && (
          <div className="p-8 text-center text-zinc-500">No variations match this filter.</div>
        )}

        {!hasTemplateVariations && (
          <div className="p-8 text-center text-zinc-500">
            This product option has no selectable variations. It will be created as a standard/default product.
          </div>
        )}
      </div>
    </div>
  );
}
