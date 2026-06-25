import React, { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  asArray,
  createColourArtworkGroups,
  createDefaultArtworkGroup,
  createVariationArtworkGroups,
  getVariationLabel,
  getVariationMatrix,
  makeId,
} from "./productBuilderUtils";

function groupSummary(group, selectedVariations) {
  if (group.scope_type === "all") return `${selectedVariations.length} variation(s)`;
  if (group.scope_type === "attribute") return `${group.attribute_key}: ${group.attribute_value}`;
  if (group.scope_type === "variation") return `${asArray(group.variation_ids).length} exact variation(s)`;
  return `${asArray(group.variation_ids).length || selectedVariations.length} selected variation(s)`;
}

export default function ArtworkScopeSelector({ selectedVariations, groups, onChange }) {
  const [customLabel, setCustomLabel] = useState("");
  const matrix = useMemo(() => getVariationMatrix(selectedVariations), [selectedVariations]);
  const safeGroups = asArray(groups);

  const applyPreset = (preset) => {
    if (preset === "all") {
      onChange([createDefaultArtworkGroup()]);
      return;
    }
    if (preset === "colour") {
      onChange(createColourArtworkGroups(selectedVariations));
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

  const setColourScope = (groupId, colour) => {
    const row = matrix.rows.find((item) => item.colour === colour);
    patchGroup(groupId, {
      scope_type: "attribute",
      attribute_key: "Colour",
      attribute_value: colour,
      variation_ids: asArray(row?.items).map((variation) => variation.id),
    });
  };

  return (
    <div className="space-y-5" data-testid="artwork-scope-selector">
      <div>
        <div className="overline mb-1">Artwork Scope</div>
        <p className="text-sm text-zinc-500 max-w-3xl">
          Decide where artwork must be unique. Most products only need one artwork setup for all variations or one setup per colour.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <button type="button" className="card text-left hover:border-[#FF3B30]" onClick={() => applyPreset("all")}>
          <div className="font-display text-2xl uppercase mb-2">Same for all</div>
          <p className="text-sm text-zinc-500">One set of artwork applies to every selected variation.</p>
        </button>
        <button type="button" className="card text-left hover:border-[#FF3B30]" onClick={() => applyPreset("colour")}>
          <div className="font-display text-2xl uppercase mb-2">Per colour</div>
          <p className="text-sm text-zinc-500">Best default. Black, white, red, etc. each get their own artwork.</p>
        </button>
        <button type="button" className="card text-left hover:border-[#FF3B30]" onClick={() => applyPreset("variation")}>
          <div className="font-display text-2xl uppercase mb-2">Per variation</div>
          <p className="text-sm text-zinc-500">Maximum control. Every size/colour can have unique artwork.</p>
        </button>
      </div>

      <div className="card">
        <div className="flex flex-col lg:flex-row lg:items-end gap-3 justify-between mb-4">
          <div>
            <div className="overline mb-1">Artwork Groups</div>
            <p className="text-xs text-zinc-500">These groups appear in the artwork studio.</p>
          </div>
          <div className="flex gap-2">
            <input className="input-base min-w-[220px]" placeholder="Custom group label" value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} />
            <button type="button" className="btn-primary" onClick={addCustomGroup}><Plus size={14} /> Add</button>
          </div>
        </div>

        <div className="space-y-3">
          {safeGroups.map((group) => (
            <div key={group.id} className="border border-white/10 bg-black/30 p-4 rounded-xl">
              <div className="grid lg:grid-cols-[1fr_220px_180px_auto] gap-3 items-start">
                <div>
                  <label className="label">Group label</label>
                  <input className="input-base" value={group.label || ""} onChange={(e) => patchGroup(group.id, { label: e.target.value })} />
                  <div className="text-xs text-zinc-500 mt-2">{groupSummary(group, selectedVariations)}</div>
                </div>
                <div>
                  <label className="label">Scope</label>
                  <select
                    className="input-base"
                    value={group.scope_type || "custom"}
                    onChange={(e) => patchGroup(group.id, { scope_type: e.target.value })}
                  >
                    <option value="all">All variations</option>
                    <option value="attribute">Colour group</option>
                    <option value="variation">Exact variation</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div>
                  <label className="label">Colour shortcut</label>
                  <select className="input-base" value={group.scope_type === "attribute" ? group.attribute_value || "" : ""} onChange={(e) => e.target.value && setColourScope(group.id, e.target.value)}>
                    <option value="">— choose —</option>
                    {matrix.colours.map((colour) => <option key={colour} value={colour}>{colour}</option>)}
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
          ))}

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
