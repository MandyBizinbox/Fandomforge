import React, { useMemo } from "react";
import VariationMockupGeneratorFixed from "./VariationMockupGeneratorFixed";
import { asArray, getVariationColour } from "./productBuilderUtils";

const normalise = (value) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");

function getColourKey(variation) {
  return normalise(getVariationColour(variation) || "default");
}

/**
 * Mockups are colour/view based, never size based. The builder can contain
 * dozens of size x colour combinations, so pass the generator one real
 * representative variation per colour while retaining each artwork scope's
 * original membership on the product builder state.
 */
export default function VariationMockupGeneratorColourScoped({
  template,
  artworkGroups,
  selectedVariations,
  onArtworkGroupsChange,
}) {
  const variations = asArray(selectedVariations);

  const { representatives, representativeByOriginalId } = useMemo(() => {
    const reps = [];
    const byId = new Map();
    const seen = new Map();

    variations.forEach((variation) => {
      const key = getColourKey(variation);
      let representative = seen.get(key);
      if (!representative) {
        representative = variation;
        seen.set(key, representative);
        reps.push(representative);
      }
      byId.set(variation.id, representative);
    });

    return { representatives: reps, representativeByOriginalId: byId };
  }, [variations]);

  const scopedGroups = useMemo(() => asArray(artworkGroups).map((group) => {
    const originalIds = group?.scope_type === "all"
      ? variations.map((variation) => variation.id)
      : asArray(group?.variation_ids);

    const mappedIds = [...new Set(
      originalIds
        .map((id) => representativeByOriginalId.get(id)?.id)
        .filter(Boolean)
    )];

    return {
      ...group,
      variation_ids: mappedIds,
      _original_variation_ids: originalIds,
    };
  }), [artworkGroups, representativeByOriginalId, variations]);

  return (
    <VariationMockupGeneratorFixed
      template={template}
      artworkGroups={scopedGroups}
      selectedVariations={representatives}
      onArtworkGroupsChange={(nextGroups) => {
        const originalGroups = asArray(artworkGroups);
        const restored = asArray(nextGroups).map((nextGroup) => {
          const original = originalGroups.find((group) => group.id === nextGroup.id) || {};
          return {
            ...original,
            ...nextGroup,
            variation_ids: asArray(original.variation_ids),
            variation_mockups: asArray(nextGroup.variation_mockups),
          };
        });
        onArtworkGroupsChange(restored);
      }}
    />
  );
}
