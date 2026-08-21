import React, { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Image as ImageIcon } from "lucide-react";
import { assetUrl } from "../../lib/api";
import "./productBuilderV2.css";
import "./productBuilderV2Runtime";
import { asArray, getVariationAttributes, getVariationCost, getVariationLabel, money } from "./productBuilderUtils";

const normalise = (value) => String(value ?? "").trim().toLowerCase();

function collectAttributeOptions(variations = []) {
  const map = new Map();
  asArray(variations).forEach((variation) => {
    Object.entries(getVariationAttributes(variation)).forEach(([key, value]) => {
      if (value === undefined || value === null || String(value).trim() === "") return;
      if (!map.has(key)) map.set(key, new Set());
      map.get(key).add(String(value));
    });
  });
  const priority = ["Colour", "Color", "Size", "Keyring Size", "Keyring Material", "Material"];
  return [...map.entries()].map(([key, values]) => ({ key, label: key, values: [...values].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })) })).sort((a, b) => {
    const ai = priority.findIndex((item) => normalise(item) === normalise(a.key));
    const bi = priority.findIndex((item) => normalise(item) === normalise(b.key));
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.key.localeCompare(b.key, undefined, { sensitivity: "base" });
  });
}

function variationValue(variation, key) {
  const attrs = getVariationAttributes(variation);
  const actual = Object.keys(attrs).find((item) => normalise(item) === normalise(key));
  return actual ? String(attrs[actual]) : "";
}

function deriveSelectedIds(variations, options) {
  const activeKeys = Object.keys(options).filter((key) => asArray(options[key]).length);
  if (!activeKeys.length) return [];
  return asArray(variations).filter((variation) => activeKeys.every((key) => asArray(options[key]).map(normalise).includes(normalise(variationValue(variation, key))))).map((variation) => variation.id);
}

function seedSelections(variations, selectedIds) {
  const selected = new Set(asArray(selectedIds));
  const options = collectAttributeOptions(variations);
  return Object.fromEntries(options.map((option) => {
    const values = option.values.filter((value) => {
      const matching = variations.filter((variation) => normalise(variationValue(variation, option.key)) === normalise(value));
      return matching.length > 0 && matching.every((variation) => selected.has(variation.id));
    });
    return [option.key, values];
  }));
}

function getFallbackImage(template = {}) {
  return template.creator_catalogue_thumbnail_url || template.product_image_url || template.mockup_url || asArray(template.mockup_images)[0] || asArray(template.mockup_screens).find((screen) => screen.image_url)?.image_url || "";
}

export default function ProductVariationMatrix({ template, selectedIds, onChange, hasTemplateVariations = true }) {
  const sourceVariations = useMemo(() => asArray(template?.variations).filter((variation) => variation.enabled !== false && variation.status !== "archived"), [template]);
  const attributes = useMemo(() => collectAttributeOptions(sourceVariations), [sourceVariations]);
  const [selectedValues, setSelectedValues] = useState(() => seedSelections(sourceVariations, selectedIds));

  useEffect(() => { setSelectedValues(seedSelections(sourceVariations, selectedIds)); }, [template?.id]);

  useEffect(() => {
    const ids = deriveSelectedIds(sourceVariations, selectedValues);
    const current = asArray(selectedIds).slice().sort();
    const next = ids.slice().sort();
    if (JSON.stringify(next) !== JSON.stringify(current)) onChange(ids);
  }, [selectedValues, sourceVariations, selectedIds]);

  const selectedCount = asArray(selectedIds).length;
  const toggleValue = (key, value) => setSelectedValues((current) => {
    const next = { ...current, [key]: asArray(current[key]) };
    const values = new Set(next[key]);
    if (values.has(value)) values.delete(value); else values.add(value);
    next[key] = [...values];
    return next;
  });
  const clearAll = () => setSelectedValues(Object.fromEntries(attributes.map((option) => [option.key, []])));

  if (!template) return <div className="card text-sm text-zinc-500">Choose a template first.</div>;
  if (!hasTemplateVariations || !sourceVariations.length) return <div className="card text-sm text-zinc-500">This template has no selectable variations. It will use the standard/default product setup.</div>;

  return <div className="space-y-5" data-testid="product-variation-matrix">
    <section className="card space-y-5">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3"><div><div className="overline mb-1">Choose attributes</div><p className="text-sm text-zinc-500 max-w-3xl">Pick the colours, sizes and other attribute values you want to sell. FandomForge creates the actual combinations automatically — you do not need to tick Red XS, Red S, Red M one by one.</p></div><button type="button" className="btn-secondary" onClick={clearAll}>Clear all</button></div>
      <div className="space-y-4">{attributes.map((attribute) => { const active = new Set(asArray(selectedValues[attribute.key])); return <div key={attribute.key} className="rounded-xl border border-white/10 bg-black/20 p-4"><div className="flex items-center justify-between gap-3 mb-3"><div className="font-display text-xl uppercase">{attribute.label}</div><div className="text-[10px] uppercase tracking-widest text-zinc-500">{active.size} selected</div></div><div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">{attribute.values.map((value) => { const checked = active.has(value); return <label key={value} className={`flex items-center gap-3 rounded-lg border px-3 py-3 cursor-pointer transition ${checked ? "border-emerald-400 bg-emerald-500/10" : "border-white/10 bg-black/20 hover:border-white/30"}`}><input type="checkbox" checked={checked} onChange={() => toggleValue(attribute.key, value)} /><span className="text-sm text-white">{value}</span>{checked && <Check size={14} className="ml-auto text-emerald-300" />}</label>; })}</div></div>; })}</div>
      <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"><div><div className="overline">Generated combinations</div><div className="font-display text-3xl mt-1">{selectedCount}</div></div><div className="text-sm text-zinc-400 max-w-xl">Every selected attribute combination is stored as a real product variation for production, pricing and artwork scope. The creator only has to choose attributes.</div></div>
    </section>
    <details className="card"><summary className="flex items-center gap-2 cursor-pointer text-xs uppercase tracking-widest text-zinc-400"><ChevronDown size={14} /> Preview generated variations</summary><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 mt-4">{sourceVariations.filter((variation) => asArray(selectedIds).includes(variation.id)).slice(0, 60).map((variation) => <div key={variation.id} className="flex items-center gap-3 border border-white/10 rounded-lg p-3"><div className="w-12 h-12 shrink-0 rounded bg-black border border-white/10 flex items-center justify-center overflow-hidden">{(variation.image_url || getFallbackImage(template)) ? <img src={assetUrl(variation.image_url || getFallbackImage(template))} alt={getVariationLabel(variation)} className="w-full h-full object-contain" /> : <ImageIcon size={18} className="text-zinc-700" />}</div><div className="min-w-0"><div className="text-sm font-bold text-white truncate">{getVariationLabel(variation)}</div><div className="text-[10px] text-zinc-500">{variation.sku || variation.id}</div><div className="text-[10px] text-zinc-500 mt-1">Blank {money(getVariationCost(variation, template))}</div></div></div>)}</div></details>
  </div>;
}
