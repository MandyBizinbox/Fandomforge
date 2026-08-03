import {
  resolveEffectiveProductionSetup,
  resolveTemplateArtworkModes,
  templatePrintAreaCoverage,
} from "./templateProductionResolver";

describe("template production resolver", () => {
  const template = {
    product_image_url: "/images/coaster.png",
    platform_blank_cost: 37.05,
    creator_blank_price: 40.76,
    print_areas: [
      {
        id: "area-top",
        name: "Top",
        area_key: "top",
        view_key: "top",
        width_mm: 100,
        height_mm: 100,
        width_pct: 80,
        height_pct: 80,
        geometry_type: "rectangle",
      },
    ],
    variations: [
      {
        id: "circle",
        attributes: { Shape: "Circle" },
        print_area_overrides: {
          "area-top": {
            geometry_type: "circle",
            width_mm: 100,
            height_mm: 100,
          },
        },
      },
      {
        id: "square",
        attributes: { Shape: "Square" },
      },
    ],
  };

  test("uses exact variation geometry before the template fallback", () => {
    const setup = resolveEffectiveProductionSetup(
      template,
      template.variations[0],
      {
        area: template.print_areas[0],
        defaultPrintArea: template.print_areas[0],
      }
    );

    expect(setup.printAreaOverride.geometry_type).toBe("circle");
    expect(setup.printAreaOverride.width_mm).toBe(100);
    expect(setup.sourceMap.printArea).toBe("exact variation");
  });

  test("inherits the template print area where a variation needs no override", () => {
    const coverage = templatePrintAreaCoverage(template);

    expect(coverage.total).toBe(2);
    expect(coverage.configured).toBe(2);
    expect(coverage.complete).toBe(true);
    expect(coverage.rows[1].effective_areas[0].geometry_type).toBe("rectangle");
  });

  test("infers full wrap artwork mode from a wrap print area", () => {
    expect(
      resolveTemplateArtworkModes({
        print_areas: [{ area_key: "mug_wrap" }],
      })
    ).toEqual(["full_wrap"]);
  });
});
