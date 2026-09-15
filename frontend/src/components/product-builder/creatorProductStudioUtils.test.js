import {
  buildCreatorProductDraftFromTemplate,
  collectStudioAttributeOptions,
  creatorStudioBackPath,
  creatorTemplateDescription,
  creatorTemplateSpecs,
  deriveStudioVariationIds,
  inferStudioPricingAttribute,
  seedStudioSelections,
} from "./creatorProductStudioUtils";

const variations = [
  { id: "black-s", attributes: { Colour: "Black", Size: "S" } },
  { id: "black-m", attributes: { Colour: "Black", Size: "M" } },
  { id: "navy-s", attributes: { Colour: "Navy", Size: "S" } },
  { id: "navy-m", attributes: { Colour: "Navy", Size: "M" } },
];

describe("creator product studio helpers", () => {
  test("keeps creator-facing attributes compact and ordered", () => {
    expect(collectStudioAttributeOptions(variations)).toEqual([
      { key: "Colour", label: "Colour", values: ["Black", "Navy"] },
      { key: "Size", label: "Size", values: ["M", "S"] },
    ]);
  });

  test("derives real variation ids from simple attribute choices", () => {
    expect(deriveStudioVariationIds(variations, {
      Colour: ["Navy"],
      Size: ["S", "M"],
    })).toEqual(["navy-s", "navy-m"]);
  });

  test("hydrates attribute selections from saved variation ids", () => {
    expect(seedStudioSelections(variations, ["black-s", "black-m"])).toEqual({
      Colour: ["Black"],
      Size: ["M", "S"] },
    );
  });

  test("prefers size as the pricing scope", () => {
    expect(inferStudioPricingAttribute(variations)).toBe("Size");
  });

  test("creates an independent creator product draft from a template", () => {
    const template = {
      id: "template-1",
      name: "Classic Tee",
      short_description: "A soft everyday tee.",
      specs: "Material: Cotton\nGSM: 165",
      category: "T-Shirts",
      brand: "FWRD",
    };

    const draft = buildCreatorProductDraftFromTemplate(template);
    draft.title = "My Club Tee";

    expect(template.name).toBe("Classic Tee");
    expect(draft).toEqual({
      template_id: "template-1",
      title: "My Club Tee",
      description: "A soft everyday tee.",
      specs: "Material: Cotton\nGSM: 165",
      category: "T-Shirts",
      brand: "FWRD",
    });
  });

  test("does not copy a specification block into the storefront description", () => {
    const template = {
      id: "mug-1",
      name: "Inner Colour Mug",
      description: "Key Features & Attributes\nCapacity: 11oz\nMaterial: Ceramic",
    };

    expect(creatorTemplateDescription(template)).toBe("");
    expect(creatorTemplateSpecs(template)).toBe("Key Features & Attributes\nCapacity: 11oz\nMaterial: Ceramic");
  });

  test("returns directly to the originating catalogue product", () => {
    expect(creatorStudioBackPath("template 123")).toBe("/creator?section=catalogue&template=template%20123");
  });
});
