import {
  resolveEffectivePrintAreas,
  resolveEffectiveProductionSetup,
  templatePrintAreaCoverage,
} from "./templateProductionResolver";
import { setVariationProductionConfiguration } from "./variationProductionConfig";

function configuredVariation(id, imageUrl, geometryType, widthMm) {
  return setVariationProductionConfiguration(
    {
      id,
      enabled: true,
      status: "active",
      platform_blank_cost: 20,
      creator_blank_price: 25,
    },
    {
      screens: [
        {
          id: "variation-screen",
          name: "Front",
          view: "front",
          view_key: "front",
          image_url: imageUrl,
          status: "active",
        },
      ],
      print_areas: [
        {
          id: "variation-area",
          name: "Front",
          screen_id: "variation-screen",
          area_key: "front",
          view_key: "front",
          geometry_type: geometryType,
          width_mm: widthMm,
          height_mm: widthMm,
          x: 10,
          y: 10,
          width: 80,
          height: 80,
          allowed_print_option_ids: ["sublimation-flat"],
          status: "active",
        },
      ],
      print_option_ids: ["sublimation-flat"],
    }
  );
}

describe("variation production routing", () => {
  test("uses selected variation geometry while preserving parent runtime ids", () => {
    const circle = configuredVariation("circle", "/circle.png", "circle", 100);
    const square = configuredVariation("square", "/square.png", "rectangle", 95);
    const template = {
      product_image_url: "/fallback.png",
      variations: [circle, square],
      mockup_screens: [{ id: "anchor-screen", view_key: "front", image_url: "/fallback.png" }],
      print_areas: [{ id: "anchor-area", screen_id: "anchor-screen", area_key: "front", width_mm: 1, height_mm: 1 }],
    };

    const circleSetup = resolveEffectiveProductionSetup(template, circle, {
      screen: template.mockup_screens[0],
      area: template.print_areas[0],
    });
    const squareSetup = resolveEffectiveProductionSetup(template, square, {
      screen: template.mockup_screens[0],
      area: template.print_areas[0],
    });

    expect(circleSetup.canvasImageUrl).toBe("/circle.png");
    expect(circleSetup.printAreaOverride.geometry_type).toBe("circle");
    expect(circleSetup.printAreaOverride.width_mm).toBe(100);
    expect(circleSetup.printAreaOverride.id).toBe("anchor-area");
    expect(circleSetup.printAreaOverride.screen_id).toBe("anchor-screen");

    expect(squareSetup.canvasImageUrl).toBe("/square.png");
    expect(squareSetup.printAreaOverride.geometry_type).toBe("rectangle");
    expect(squareSetup.printAreaOverride.width_mm).toBe(95);
    expect(squareSetup.printAreaOverride.id).toBe("anchor-area");
    expect(squareSetup.printAreaOverride.screen_id).toBe("anchor-screen");
  });

  test("returns only the variation-owned print areas for readiness", () => {
    const circle = configuredVariation("circle", "/circle.png", "circle", 100);
    const template = {
      variations: [circle],
      print_areas: [
        { id: "parent-a", screen_id: "parent", area_key: "front", width_mm: 10, height_mm: 10 },
        { id: "parent-b", screen_id: "parent", area_key: "back", width_mm: 10, height_mm: 10 },
      ],
    };

    const areas = resolveEffectivePrintAreas(template, circle);
    const coverage = templatePrintAreaCoverage(template);

    expect(areas).toHaveLength(1);
    expect(areas[0].id).toBe("variation-area");
    expect(coverage.total).toBe(1);
    expect(coverage.configured).toBe(1);
    expect(coverage.complete).toBe(true);
  });
});
