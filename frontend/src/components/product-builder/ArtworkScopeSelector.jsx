import React, { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { asArray, createDefaultArtworkGroup, getVariationAttributes, getVariationLabel, makeId } from "./productBuilderUtils";

const normalise = (value) => String(value ?? "").trim().toLowerCase();

function collectAttributes(variations = []) {
  const map = new Map();
  asArray(variations).forEach((variation) => Object.entries(getVariationAttributes(variation)).forEach(([key, value]) => {
    if (value === undefined || value === null || String(value).trim() === "") return;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(String(value));
  }));
  const priority = ["Colour", "Color", "Size", "Keyring Size", "Keyring Material", "Material"];
  return [...map.entries()].map(([key, values]) => ({ key, values: [...values].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })) })).sort((a, b) => {
    const ai = priority.findIndex((item) => normalise(item) === normalise(a.key));
    const bi = priority.findIndex((item) => normalise(item) === normalise(b.key));
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.key.localeCompare(b.key);
  });
}

function matchesAttribute(variation, key, values) {
  const attrs = getVariationAttributes(variation);
  const actual = Object.keys(attrs).find((item) => normalise(item) === normalise(key));
  return actual && values.map(normalise).includes(normalise(attrs[actual]));
}

function createAttributeGroup(variations, key, values, label) {
  const ids = asArray(variations).filter((variation) => matchesAttribute(variation, key, values)).map((variation) => variation.id);
  return { id: makeId("group"), label: label || `${key}: ${values.join(" + ")}`, scope_type: "attribute", attribute_key: key, attribute_value: values.length === 1 ? values[0] : "", attribute_values: values, variation_ids: ids, inherits_from: "default-all", artworks: [], primary_mockup_image_url: "", variation_mockups: [], derived_mockup_images: [], sort_order: 0 };
}

export default function ArtworkScopeSelector({ selectedVariations, hasTemplateVariations = true, groups, onChange }) {
  const variations = asArray(selectedVariations);
  const safeGroups = asArray(groups);
  const attributes = useMemo(() => collectAttributes(variations), [variations]);
  const [mode, setMode] = useState(safeGroups.length ? "custom" : "all");
  const [attributeKey, setAttributeKey] = useState(attributes[0]?.key || "");
  const [attributeValues, setAttributeValues] = useState([]);
  useEffect(() => { if (!attributeKey && attributes[0]?.key) setAttributeKey(attributes[0].key); }, [attributes, attributeKey]);
  useEffect(() => { if (!hasTemplateVariations && !safeGroups.length) onChange([createDefaultArtworkGroup()]); }, [hasTemplateVariations, safeGroups.length, onChange]);
  const valuesForKey = attributes.find((item) => item.key === attributeKey)?.values || [];
  const toggleValue = (value) => setAttributeValues((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  const applyAll = () => onChange([{ ...createDefaultArtworkGroup(), scope_type: "all", variation_ids: variations.map((variation) => variation.id), label: "Artwork A — all selected variations" }]);
  const applyAttribute = () => { if (!attributeKey || !attributeValues.length) return; onChange([createAttributeGroup(variations, attributeKey, attributeValues, `Artwork A — ${attributeKey}: ${attributeValues.join(" + ")}`)]); };
  const addAttributeGroup = () => { if (!attributeKey || !attributeValues.length) return; const next = createAttributeGroup(variations, attributeKey, attributeValues, `Artwork ${String.fromCharCode(65 + safeGroups.length)} — ${attributeKey}: ${attributeValues.join(" + ")}`); onChange([...safeGroups, next]); setAttributeValues([]); };
  const addCustom = () => onChange([...safeGroups, { id: makeId("group"), label: `Artwork ${String.fromCharCode(65 + safeGroups.length)}`, scope_type: "custom", variation_ids: [], artworks: [], primary_mockup_image_url: "", variation_mockups: [], derived_mockup_images: [], sort_order: safeGroups.length }]);
  const removeGroup = (id) => onChange(safeGroups.filter((group) => group.id !== id));
  const patchGroup = (id, patch) => onChange(safeGroups.map((group) => group.id === id ? { ...group, ...patch } : group));
  const toggleCustomVariation = (group, variationId) => { const ids = new Set(asArray(group.variation_ids)); if (ids.has(variationId)) ids.delete(variationId); else ids.add(variationId); patchGroup(group.id, { scope_type: "custom", variation_ids: [...ids] }); };
  return <div className="space-y-5" data-testid="artwork-scope-selector">
    <section className="card space-y-5"><div><div className="overline mb-1">Artwork scope</div><h2 className="font-display text-3xl uppercase">How does the artwork vary?</h2><p className="text-sm text-zinc-500 mt-2 max-w-3xl">Create artwork scopes, not artwork for every size. An artwork scope can cover one colour, several colours, every size of a colour, or an arbitrary set of exact variations.</p></div>
      {hasTemplateVariations && <div className="grid md:grid-cols-3 gap-3"><button type="button" className={`card text-left ${mode === "all" ? "border-emerald-400 bg-emerald-500/10" : ""}`} onClick={() => { setMode("all"); applyAll(); }}><div className="font-display text-xl uppercase">Same artwork</div><p className="text-xs text-zinc-500 mt-1">One artwork scope covers every selected variation.</p></button><button type="button" className={`card text-left ${mode === "attribute" ? "border-emerald-400 bg-emerald-500/10" : ""}`} onClick={() => setMode("attribute")}><div className="font-display text-xl uppercase">By attribute</div><p className="text-xs text-zinc-500 mt-1">For example: one artwork for Red + Blue and another for Green.</p></button><button type="button" className="card text-left" onClick={addCustom}><div className="font-display text-xl uppercase">Custom variations</div><p className="text-xs text-zinc-500 mt-1">Choose exact variations when an artwork really is unique to a specific combination.</p></button></div>}
      {hasTemplateVariations && mode === "attribute" && <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-4"><div className="grid md:grid-cols-2 gap-3"><div><label className="label">Attribute</label><select className="input-base" value={attributeKey} onChange={(event) => { setAttributeKey(event.target.value); setAttributeValues([]); }}>{attributes.map((attribute) => <option key={attribute.key} value={attribute.key}>{attribute.key}</option>)}</select></div><div><label className="label">Values this artwork covers</label><div className="grid grid-cols-2 gap-2">{valuesForKey.map((value) => <label key={value} className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer ${attributeValues.includes(value) ? "border-emerald-400 bg-emerald-500/10" : "border-white/10"}`}><input type="checkbox" checked={attributeValues.includes(value)} onChange={() => toggleValue(value)} /><span className="text-sm">{value}</span></label>)}</div></div></div><button type="button" className="btn-primary" disabled={!attributeValues.length} onClick={safeGroups.length ? addAttributeGroup : applyAttribute}><Plus size={14} /> {safeGroups.length ? "Add artwork scope" : "Use these values"}</button></div>}
    </section>
    <section className="card space-y-3"><div className="flex items-center justify-between gap-3"><div><div className="overline">Artwork scopes</div><p className="text-xs text-zinc-500">Each scope is uploaded and edited once, then reused by every variation ID in its scope.</p></div>{hasTemplateVariations && <button type="button" className="btn-secondary" onClick={addCustom}><Plus size={14} /> Custom scope</button>}</div>
      {safeGroups.map((group, index) => <div key={group.id} className="rounded-xl border border-white/10 bg-black/20 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><input className="input-base font-bold" value={group.label || `Artwork ${String.fromCharCode(65 + index)}`} onChange={(event) => patchGroup(group.id, { label: event.target.value })} /><div className="text-xs text-zinc-500 mt-2">{group.scope_type === "all" ? `All ${variations.length} selected variations` : group.scope_type === "attribute" ? `${group.attribute_key}: ${asArray(group.attribute_values).join(" + ") || group.attribute_value}` : `${asArray(group.variation_ids).length} exact variation(s)`}</div></div><button type="button" className="text-zinc-500 hover:text-[#FF3B30]" onClick={() => removeGroup(group.id)}><Trash2 size={16} /></button></div>{group.scope_type === "custom" && <details className="mt-4"><summary className="text-xs uppercase tracking-widest text-zinc-400 cursor-pointer">Choose exact variations</summary><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3">{variations.map((variation) => <label key={variation.id} className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs"><input type="checkbox" checked={asArray(group.variation_ids).includes(variation.id)} onChange={() => toggleCustomVariation(group, variation.id)} /><span>{getVariationLabel(variation)}</span></label>)}</div></details>}</div>)}
      {!safeGroups.length && <div className="border border-dashed border-white/10 rounded-xl p-6 text-center text-sm text-zinc-500">Choose a scope type above to get started.</div>}
    </section>
  </div>;
}
