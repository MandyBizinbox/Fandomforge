import React, { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  asArray,
  createDefaultArtworkGroup,
  createVariationArtworkGroups,
  getVariationAttributes,
  getVariationLabel,
  makeId,
} from "./productBuilderUtils";

function normalise(value) {
  return String(value || "").trim().toLowerCase();
}

function groupSummary(group, selectedVariations, hasTemplateVariations = true) {
  if (!hasTemplateVariations) return "Standard product";
  if (group.scope_type === "all") return `${selectedVariations.length} variation(s)`;
  if (group.scope_type === "attribute") return `${group.attribute_key}: ${group.attribute_value}`;
  if (group.scope_type === "variation") return `${asArray(group.variation_ids).length} exact variation(s)`;
  return `${asArray(group.variation_ids).length || selectedVariations.length} selected variation(s)`;
}

function collectAttributeOptions(variations = []) {
  const map = new Map();
  asArray(variations).forEach((variation) => {
    Object.entries(getVariationAttributes(variation)).forEach(([key, value]) => {
      if (value === undefined || value === null || String(value).trim() === "") return;
      if (!map.has(key)) map.set(key, new Set());
      map.get(key).add(String(value));
    });
  });

  return [...map.entries()]
    .map(([key, values]) => ({
      key,
      label: key,
      values: [...values].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" })),
    }))
    .sort((a, b) => {
      const priority = ["Colour", "Color", "Size", "Keyring Size", "Keyring Material", "Material"];
      const ai = priority.findIndex((item) => normalise(item) === normalise(a.key));
      const bi = priority.findIndex((item) => normalise(item) === normalise(b.key));
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.key.localeCompare(b.key, undefined, { sensitivity: "base" });
    });
}

function matchingVariationsForAttribute(variations, attributeKey, attributeValue) {
  return asArray(variations).filter((variation) => {
    const attrs = getVariationAttributes(variation);
    const actualKey = Object.keys(attrs).find((key) => normalise(key) === normalise(attributeKey));
    return actualKey && normalise(attrs[actualKey]) === normalise(attributeValue);
  });
}

function createAttributeArtworkGroups(selectedVariations, attributeKey) {
  const values = new Set();
  asArray(selectedVariations).forEach((variation) => {
    const attrs = getVariationAttributes(variation);
    const actualKey = Object.keys(attrs).find((key) => normalise(key) === normalise(attributeKey));
    const value = actualKey ? attrs[actualKey] : "";
    if (value !== undefined && value !== null && String(value).trim() !== "") values.add(String(value));
  });

  return [...values]
    .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" }))
    .map((value, index) => {
      const items = matchingVariationsForAttribute(selectedVariations, attributeKey, value);
      const safeKey = `${attributeKey}-${value}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      return {
        id: `attribute-${safeKey || index}`,
        label: `${attributeKey}: ${value}`,
        scope_type: "attribute",
        attribute_key: attributeKey,
        attribute_value: value,
        variation_ids: items.map((variation) => variation.id),
        inherits_from: "default-all",
        artworks: [],
        primary_mockup_image_url: "",
        sort_order: index,
      };
    });
}

export default function ArtworkScopeSelector({ selectedVariations, hasTemplateVariations = true, groups, onChange }) {
  const [customLabel, setCustomLabel] = useState("");
  const [presetAttributeKey, setPresetAttributeKey] = useState("");
  const safeGroups = asArray(groups);
  const attributeOptions = useMemo(() => collectAttributeOptions(selectedVariations), [selectedVariations]);
  const defaultAttributeKey = presetAttributeKey || attributeOptions[0]?.key || "";

  useEffect(() => {
    if (hasTemplateVariations || safeGroups.length) return;
    onChange([createDefaultArtworkGroup()]);
  }, [hasTemplateVariations, onChange, safeGroups.length]);

  const applyPreset = (preset) => {
    if (preset === "all") {
      onChange([createDefaultArtworkGroup()]);
      return;
    }
    if (preset === "attribute") {
      if (!defaultAttributeKey) return;
      onChange(createAttributeArtworkGroups(selectedVariations, defaultAttributeKey));
      return;
    }
    if (preset === "variation") {
      onChange(createVariationArtworkGroups(selectedVariations));
    }
  };

  const addCustomGroup = () => {
    const next = {
      id: makeId("group"),
      label: customLabel.trim() || "Custom artwork group",
      scope_type: "custom",
      attribute_key: null,
      attribute_value: null,
      variation_ids: [],
      inherits_from: "default-all",
      artworks: [],
      primary_mockup_image_url: "",
      sort_order: safeGroups.length,
    };
    onChange([...safeGroups, next]);
    setCustomLabel("");
  };

  const patchGroup = (groupId, patch) => {
    onChange(safeGroups.map((group) => (group.id === groupId ? { ...group, ...patch } : group)));
  };

  const removeGroup = (groupId) => {
    onChange(safeGroups.filter((group) => group.id !== groupId));
  };

  const toggleVariationInGroup = (groupId, variationId) => {
    const group = safeGroups.find((item) => item.id === groupId);
    if (!group) return;
    const ids = new Set(asArray(group.variation_ids));
    if (ids.has(variationId)) ids.delete(variationId);
    else ids.add(variationId);
    patchGroup(groupId, { variation_ids: [...ids], scope_type: "custom" });
  };

  const setAttributeScope = (groupId, attributeKey, attributeValue) => {
    const matches = matchingVariationsForAttribute(selectedVariations, attributeKey, attributeValue);
    patchGroup(groupId, {
      scope_type: "attribute",
      attribute_key: attributeKey,
      attribute_value: attributeValue,
      variation_ids: matches.map((variation) => variation.id),
    });
  };

  return (
    <div className="space-y-5" data-testid="artwork-scope-selector">
      <div>
        <div className="overline mb-1">Artwork Scope</div>
        <p className="text-sm text-zinc-500 max-w-3xl">
          {hasTemplateVariations
            ? "Decide where artwork must be unique. You can group artwork by any selected variation attribute, for example Colour, Size, Keyring Size or Keyring Material."
            : "This standard product has no variations, so one global artwork setup is enough."}
        </p>
      </div>

      <div className={hasTemplateVariations ? "grid md:grid-cols-3 gap-3" : "grid gap-3"}>
        <button type="button" className="card text-left hover:border-[#FF3B30]" onClick={() => applyPreset("all")}>
          <div className="font-display text-2xl uppercase mb-2">Same for all</div>
          <p className="text-sm text-zinc-500">
            {hasTemplateVariations
              ? "One set of artwork applies to every selected variation."
              : "Automatically selected because this product has no variations."}
          </p>
        </button>
        {hasTemplateVariations && (
          <>
            <button type="button" className="card text-left hover:border-[#FF3B30] disabled:opacity-40 disabled:cursor-not-allowed" disabled={!attributeOptions.length} onClick={() => applyPreset("attribute")}>
              <div className="font-display text-2xl uppercase mb-2">Per attribute</div>
              <p className="text-sm text-zinc-500">Create one group per value of the selected attribute.</p>
              {attributeOptions.length > 0 && (
                <select
                  className="input-base mt-3"
                  value={defaultAttributeKey}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => setPresetAttributeKey(event.target.value)}
                >
                  {attributeOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                </select>
              )}
            </button>
            <button type="button" className="card text-left hover:border-[#FF3B30]" onClick={() => applyPreset("variation")}>
              <div className="font-display text-2xl uppercase mb-2">Per variation</div>
              <p className="text-sm text-zinc-500">Maximum control. Every exact variation can have unique artwork.</p>
            </button>
          </>
        )}
      </div>

      <div className="card">
        <div className="flex flex-col lg:flex-row lg:items-end gap-3 justify-between mb-4">
          <div>
            <div className="overline mb-1">Artwork Groups</div>
            <p className="text-xs text-zinc-500">These groups appear in the artwork studio.</p>
          </div>
          {hasTemplateVariations && (
            <div className="flex gap-2">
              <input className="input-base min-w-[220px]" placeholder="Custom group label" value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} />
              <button type="button" className="btn-primary" onClick={addCustomGroup}><Plus size={14} /> Add</button>
            </div>
          )}
        </div>

        <div className="space-y-3">
          {safeGroups.map((group) => {
            const selectedAttribute = attributeOptions.find((option) => option.key === group.attribute_key) || attributeOptions[0] || null;
            return (
              <div key={group.id} className="border border-white/10 bg-black/30 p-4 rounded-xl">
                <div className="grid lg:grid-cols-[1fr_190px_190px_190px_auto] gap-3 items-start">
                  <div>
                    <label className="label">Group label</label>
                    <input className="input-base" value={group.label || ""} onChange={(event) => patchGroup(group.id, { label: event.target.value })} />
                    <div className="text-xs text-zinc-500 mt-2">{groupSummary(group, selectedVariations, hasTemplateVariations)}</div>
                  </div>
                  <div>
                    <label className="label">Scope</label>
                    <select
                      className="input-base"
                      value={group.scope_type || "custom"}
                      onChange={(event) => patchGroup(group.id, { scope_type: event.target.value })}
                    >
                      <option value="all">All variations</option>
                      {hasTemplateVariations && <option value="attribute">Attribute group</option>}
                      {hasTemplateVariations && <option value="variation">Exact variation</option>}
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Attribute</label>
                    <select
                      className="input-base"
                      value={group.attribute_key || ""}
                      disabled={!hasTemplateVariations || group.scope_type === "all"}
                      onChange={(event) => patchGroup(group.id, { attribute_key: event.target.value, attribute_value: "", variation_ids: [] })}
                    >
                      <option value="">— choose —</option>
                      {attributeOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Attribute value</label>
                    <select
                      className="input-base"
                      value={group.scope_type === "attribute" ? group.attribute_value || "" : ""}
                      disabled={!hasTemplateVariations || group.scope_type === "all" || !selectedAttribute}
                      onChange={(event) => event.target.value && setAttributeScope(group.id, group.attribute_key || selectedAttribute?.key, event.target.value)}
                    >
                      <option value="">— choose —</option>
                      {asArray(selectedAttribute?.values).map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </div>
                  <button type="button" className="text-zinc-500 hover:text-[#FF3B30] mt-8" onClick={() => removeGroup(group.id)}><Trash2 size={16} /></button>
                </div>

                {group.scope_type !== "all" && (
                  <details className="mt-4">
                    <summary className="text-xs uppercase tracking-widest text-zinc-400 cursor-pointer">Exact variation override checkboxes</summary>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3">
                      {selectedVariations.map((variation) => (
                        <label key={variation.id} className="flex items-center gap-2 border border-white/10 bg-black/30 px-3 py-2 text-xs">
                          <input
                            type="checkbox"
                            checked={asArray(group.variation_ids).includes(variation.id)}
                            onChange={() => toggleVariationInGroup(group.id, variation.id)}
                          />
                          <span>{getVariationLabel(variation)}</span>
                        </label>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            );
          })}

          {!safeGroups.length && (
            <div className="border border-dashed border-white/15 p-6 text-center text-zinc-500">
              Choose a preset to create artwork groups.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
