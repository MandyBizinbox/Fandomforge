import React, { useEffect, useMemo, useState } from "react";
import ProductArtworkStudio from "./ProductArtworkStudio";
import { asArray, getVariationLabel } from "./productBuilderUtils";

function scopeLabel(group, selectedVariations) {
  if (!group) return "No artwork scope selected";
  if (group.scope_type === "all") return `All selected variations (${selectedVariations.length})`;
  if (group.scope_type === "attribute") return `${group.attribute_key || "Attribute"}: ${group.attribute_value || "Selected value"}`;
  if (group.scope_type === "variation") {
    const variation = selectedVariations.find((item) => item.id === asArray(group.variation_ids)[0]);
    return variation ? `Exact variation: ${getVariationLabel(variation)}` : "Exact variation";
  }
  return group.label || "Custom artwork scope";
}

function scopeDescription(group, selectedVariations) {
  if (!group) return "Choose an artwork scope before uploading artwork.";
  const ids = asArray(group.variation_ids);
  const count = group.scope_type === "all" ? selectedVariations.length : ids.length;
  if (group.scope_type === "attribute") {
    return `Artwork uploaded here will be used for all ${count} selected variation(s) in this ${group.attribute_key || "attribute"} scope. Sizes and other attributes do not create separate artwork uploads.`;
  }
  if (group.scope_type === "variation") return "Artwork uploaded here belongs only to this exact variation.";
  if (group.scope_type === "all") return "One artwork set is shared by every selected variation.";
  return `Artwork uploaded here applies to ${count || 1} selected variation(s) in this custom scope.`;
}

export default function ScopedProductArtworkStudio({
  template,
  printOptions,
  artworkGroups,
  onArtworkGroupsChange,
  selectedVariations,
  isAdmin = false,
}) {
  const groups = asArray(artworkGroups);
  const variations = asArray(selectedVariations);
  const [activeGroupId, setActiveGroupId] = useState(groups[0]?.id || "");

  useEffect(() => {
    if (!groups.length) {
      setActiveGroupId("");
      return;
    }
    if (!groups.some((group) => group.id === activeGroupId)) {
      setActiveGroupId(groups[0].id);
    }
  }, [groups, activeGroupId]);

  const activeGroup = useMemo(
    () => groups.find((group) => group.id === activeGroupId) || groups[0] || null,
    [groups, activeGroupId]
  );

  const scopedGroups = activeGroup ? [activeGroup] : [];
  const scopedVariations = useMemo(() => {
    if (!activeGroup) return [];
    const ids = new Set(asArray(activeGroup.variation_ids));
    if (activeGroup.scope_type === "all") return variations;
    return variations.filter((variation) => ids.has(variation.id));
  }, [activeGroup, variations]);

  const updateScopedGroups = (nextScopedGroups) => {
    const next = nextScopedGroups[0];
    if (!next) return;
    onArtworkGroupsChange(groups.map((group) => group.id === next.id ? next : group));
  };

  return (
    <div className="space-y-4">
      <section className="border border-[#FF3B30]/40 bg-black/40 rounded-xl p-4 space-y-3" data-testid="artwork-scope-context">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
          <div>
            <div className="overline mb-1">Artwork scope controls the studio</div>
            <h2 className="font-display text-2xl uppercase">Upload artwork for the selected scope</h2>
            <p className="text-sm text-zinc-400 mt-1">The studio is locked to one artwork group at a time. This prevents a Colour scope from accidentally becoming one upload per Size × Colour combination.</p>
          </div>
          <div className="min-w-[260px]">
            <label className="label">Active artwork scope</label>
            <select className="input-base" value={activeGroup?.id || ""} onChange={(event) => setActiveGroupId(event.target.value)} disabled={!groups.length}>
              {groups.map((group) => <option key={group.id} value={group.id}>{scopeLabel(group, variations)}</option>)}
            </select>
          </div>
        </div>
        {activeGroup && (
          <div className="grid md:grid-cols-2 gap-3 text-xs">
            <div className="border border-white/10 bg-black/30 rounded-lg p-3">
              <div className="overline">Current scope</div>
              <div className="font-display text-xl uppercase mt-1">{scopeLabel(activeGroup, variations)}</div>
            </div>
            <div className="border border-white/10 bg-black/30 rounded-lg p-3">
              <div className="overline">Applies to</div>
              <div className="text-zinc-300 mt-1">{scopeDescription(activeGroup, variations)}</div>
              {scopedVariations.length > 0 && <div className="text-zinc-500 mt-2">{scopedVariations.length} selected variation(s) share this artwork scope.</div>}
            </div>
          </div>
        )}
      </section>

      {activeGroup ? (
        <ProductArtworkStudio
          template={template}
          printOptions={printOptions}
          artworkGroups={scopedGroups}
          onArtworkGroupsChange={updateScopedGroups}
          selectedVariations={scopedVariations}
          isAdmin={isAdmin}
        />
      ) : (
        <div className="border border-dashed border-white/15 rounded-xl p-8 text-center text-zinc-500">Create an artwork scope first.</div>
      )}
    </div>
  );
}
