import {
  collectStudioAttributeOptions,
  creatorStudioBackPath,
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
      Size: ["M", "S"],
    });
  });

  test("prefers size as the pricing scope", () => {
    expect(inferStudioPricingAttribute(variations)).toBe("Size");
  });

  test("returns directly to the originating catalogue product", () => {
    expect(creatorStudioBackPath("template 123")).toBe("/creator?section=catalogue&template=template%20123");
  });
});
