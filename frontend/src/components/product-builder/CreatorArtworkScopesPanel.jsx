import React, { useEffect, useMemo, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { asArray, createDefaultArtworkGroup, getVariationAttributes, getVariationLabel, makeId } from "./productBuilderUtils";

const normalise = (value) => String(value ?? "").trim().toLowerCase();

function collectAttributes(variations = []) {
  const map = new Map();
  asArray(variations).forEach((variation) => Object.entries(getVariationAttributes(variation)).forEach(([key, value]) => {
    if (value === undefined || value === null || String(value).trim() === "") return;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(String(value));
  }));
  const priority = ["Colour", "Color", "Size", "Material"];
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

function createAttributeGroup(variations, key, values, label, index = 0) {
  return {
    id: makeId("group"),
    label: label || `Artwork ${String.fromCharCode(65 + index)} — ${key}: ${values.join(" + ")}`,
    scope_type: "attribute",
    attribute_key: key,
    attribute_value: values.length === 1 ? values[0] : "",
    attribute_values: values,
    variation_ids: asArray(variations).filter((variation) => matchesAttribute(variation, key, values)).map((variation) => variation.id),
    inherits_from: "default-all",
    artworks: [],
    primary_mockup_image_url: "",
    variation_mockups: [],
    derived_mockup_images: [],
    sort_order: index,
  };
}

export default function CreatorArtworkScopesPanel({
  selectedVariations,
  hasTemplateVariations = true,
  groups,
  onChange,
  activeGroupId = "",
  onActiveGroupChange,
}) {
  const variations = asArray(selectedVariations);
  const safeGroups = asArray(groups);
  const attributes = useMemo(() => collectAttributes(variations), [variations]);
  const [mode, setMode] = useState("all");
  const [attributeKey, setAttributeKey] = useState(attributes[0]?.key || "");
  const [attributeValues, setAttributeValues] = useState([]);

  useEffect(() => {
    if (!attributeKey && attributes[0]?.key) setAttributeKey(attributes[0].key);
  }, [attributeKey, attributes]);

  useEffect(() => {
    if (hasTemplateVariations || safeGroups.length) return;
    const group = { ...createDefaultArtworkGroup(), scope_type: "all", variation_ids: [], label: "Artwork A — standard product" };
    onChange([group]);
    onActiveGroupChange?.(group.id);
  }, [hasTemplateVariations, onActiveGroupChange, onChange, safeGroups.length]);

  const valuesForKey = attributes.find((item) => item.key === attributeKey)?.values || [];
  const toggleValue = (value) => setAttributeValues((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  const setActive = (id) => onActiveGroupChange?.(id);

  const applyAll = () => {
    const group = {
      ...createDefaultArtworkGroup(),
      scope_type: "all",
      variation_ids: variations.map((variation) => variation.id),
      label: "Artwork A — all selected variations",
    };
    onChange([group]);
    setActive(group.id);
  };

  const addAttribute = () => {
    if (!attributeKey || !attributeValues.length) return;
    const group = createAttributeGroup(variations, attributeKey, attributeValues, "", safeGroups.length);
    onChange([...safeGroups, group]);
    setAttributeValues([]);
    setActive(group.id);
  };

  const addCustom = () => {
    const group = {
      id: makeId("group"),
      label: `Artwork ${String.fromCharCode(65 + safeGroups.length)}`,
      scope_type: "custom",
      variation_ids: [],
      artworks: [],
      primary_mockup_image_url: "",
      variation_mockups: [],
      derived_mockup_images: [],
      sort_order: safeGroups.length,
    };
    onChange([...safeGroups, group]);
    setActive(group.id);
  };

  const patchGroup = (id, patch) => onChange(safeGroups.map((group) => group.id === id ? { ...group, ...patch } : group));
  const removeGroup = (id) => {
    const next = safeGroups.filter((group) => group.id !== id);
    onChange(next);
    if (activeGroupId === id) onActiveGroupChange?.(next[0]?.id || "");
  };
  const toggleCustomVariation = (group, variationId) => {
    const ids = new Set(asArray(group.variation_ids));
    if (ids.has(variationId)) ids.delete(variationId); else ids.add(variationId);
    patchGroup(group.id, { scope_type: "custom", variation_ids: [...ids] });
  };

  return (
    <div className="creator-studio-scopes-panel" data-testid="creator-artwork-scopes-panel">
      <div className="creator-studio-scope-mode-row">
        <button type="button" className={mode === "all" ? "is-active" : ""} onClick={() => { setMode("all"); applyAll(); }}>Same artwork</button>
        <button type="button" className={mode === "attribute" ? "is-active" : ""} onClick={() => setMode("attribute")}>By attribute</button>
        <button type="button" onClick={addCustom}>Exact</button>
      </div>

      {mode === "attribute" && hasTemplateVariations && (
        <div className="creator-studio-scope-builder">
          <label className="creator-studio-field">
            <span>Attribute</span>
            <select value={attributeKey} onChange={(event) => { setAttributeKey(event.target.value); setAttributeValues([]); }}>
              {attributes.map((attribute) => <option key={attribute.key} value={attribute.key}>{attribute.key}</option>)}
            </select>
          </label>
          <div className="creator-studio-scope-values">
            {valuesForKey.map((value) => {
              const checked = attributeValues.includes(value);
              return <button key={value} type="button" className={checked ? "is-active" : ""} onClick={() => toggleValue(value)}>{checked && <Check size={11} />}{value}</button>;
            })}
          </div>
          <button type="button" className="btn-secondary creator-studio-small-action" disabled={!attributeValues.length} onClick={addAttribute}><Plus size={13} /> Add scope</button>
        </div>
      )}

      <div className="creator-studio-scope-list">
        {safeGroups.map((group, index) => {
          const active = group.id === activeGroupId || (!activeGroupId && index === 0);
          return (
            <div key={group.id} className={`creator-studio-scope-row ${active ? "is-active" : ""}`}>
              <button type="button" className="creator-studio-scope-row-main" onClick={() => setActive(group.id)}>
                <strong>{group.label || `Artwork ${String.fromCharCode(65 + index)}`}</strong>
                <span>{group.scope_type === "all" ? `All ${variations.length || 1} variations` : group.scope_type === "attribute" ? `${group.attribute_key}: ${asArray(group.attribute_values).join(" + ") || group.attribute_value}` : `${asArray(group.variation_ids).length} exact variation(s)`}</span>
              </button>
              <button type="button" className="creator-studio-scope-delete" onClick={() => removeGroup(group.id)} aria-label="Delete artwork scope"><Trash2 size={14} /></button>
              {group.scope_type === "custom" && active && (
                <div className="creator-studio-exact-list">
                  {variations.map((variation) => (
                    <label key={variation.id}>
                      <input type="checkbox" checked={asArray(group.variation_ids).includes(variation.id)} onChange={() => toggleCustomVariation(group, variation.id)} />
                      <span>{getVariationLabel(variation)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {!safeGroups.length && <div className="creator-studio-note">Choose how artwork should vary. For most products, “Same artwork” is all you need.</div>}
      </div>
    </div>
  );
}
