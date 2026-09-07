import { deriveSelectedIds, seedSelections } from "./ProductVariationMatrix";

const variations = [
  { id: "black-s", attributes: { Colour: "Black", Size: "Small" } },
  { id: "black-m", attributes: { Colour: "Black", Size: "Medium" } },
  { id: "black-l", attributes: { Colour: "Black", Size: "Large" } },
  { id: "red-s", attributes: { Colour: "Red", Size: "Small" } },
  { id: "red-m", attributes: { Colour: "Red", Size: "Medium" } },
  { id: "red-l", attributes: { Colour: "Red", Size: "Large" } },
];

describe("ProductVariationMatrix independent attribute selection", () => {
  test("does not imply every colour when all sizes are selected", () => {
    expect(deriveSelectedIds(variations, {
      Colour: ["Black"],
      Size: ["Small", "Medium", "Large"],
    })).toEqual(["black-s", "black-m", "black-l"]);
  });

  test("does not generate combinations until every attribute dimension has an explicit choice", () => {
    expect(deriveSelectedIds(variations, {
      Colour: [],
      Size: ["Small", "Medium", "Large"],
    })).toEqual([]);

    expect(deriveSelectedIds(variations, {
      Colour: ["Black"],
      Size: [],
    })).toEqual([]);
  });

  test("multiple colours only generate the explicitly selected size combinations", () => {
    expect(deriveSelectedIds(variations, {
      Colour: ["Black", "Red"],
      Size: ["Medium"],
    })).toEqual(["black-m", "red-m"]);
  });

  test("persisted cartesian selections hydrate the independent checkbox values", () => {
    expect(seedSelections(variations, ["black-s", "black-m", "black-l"])).toEqual({
      Colour: ["Black"],
      Size: ["Large", "Medium", "Small"],
    });
  });
});
