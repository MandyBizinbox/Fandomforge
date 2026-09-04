import { buildVariationCombinations } from "../components/template-studio/templateStudioUtils";

describe("template variation regeneration", () => {
  test("reactivates selected combinations that were previously disabled or archived", () => {
    const attributes = [
      { id: "size", name: "Size", values: ["XS", "3/4 yrs"] },
      { id: "colour", name: "Color", values: ["White"] },
    ];
    const existing = [
      {
        id: "adult-xs-white",
        attributes: { Size: "XS", Color: "White" },
        enabled: false,
        status: "archived",
        supplier_sku: "KEEP-XS-WHITE",
      },
      {
        id: "youth-white",
        attributes: { Size: "3/4 yrs", Color: "White" },
        enabled: true,
        status: "active",
      },
    ];

    const generated = buildVariationCombinations(
      attributes,
      existing,
      10,
      {
        size: ["XS", "3/4 yrs"],
        colour: ["White"],
      }
    );

    expect(generated).toHaveLength(2);
    const adult = generated.find((row) => row.id === "adult-xs-white");
    expect(adult.enabled).toBe(true);
    expect(adult.status).toBe("active");
    expect(adult.supplier_sku).toBe("KEEP-XS-WHITE");
  });
});
