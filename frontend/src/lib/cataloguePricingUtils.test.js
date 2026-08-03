import {
  effectiveOptionPricingRows,
  templatePricingInfo,
} from "./cataloguePricingUtils";

describe("catalogue pricing", () => {
  const printRule = {
    id: "sublimation-flat",
    rule_name: "Sublimation Flat",
    print_method: "Sublimation",
    method_key: "sublimation",
    calculation_type: "area_fixed_rate",
    cost_per_cm2: 0.1,
    minimum_print_cost: 0,
    status: "active",
  };

  const template = {
    name: "Cork Coaster",
    status: "active",
    creator_visible: true,
    platform_blank_cost: 37.05,
    creator_blank_price: 40.76,
    print_option_ids: [printRule.id],
    print_options: [{ id: printRule.id }],
    print_areas: [
      {
        id: "top-area",
        name: "Top",
        view_key: "top",
        area_key: "top",
        width_pct: 80,
        height_pct: 80,
        width_mm: 0,
        height_mm: 0,
        allowed_print_option_ids: [printRule.id],
      },
    ],
    variations: [
      {
        id: "circle",
        enabled: true,
        status: "active",
        attributes: { Shape: "Circle" },
        creator_blank_price: 40.76,
        print_area_overrides: {
          default: {
            geometry_type: "circle",
            width_mm: 100,
            height_mm: 100,
          },
        },
      },
      {
        id: "square",
        enabled: true,
        status: "active",
        attributes: { Shape: "Square" },
        creator_blank_price: 40.76,
        print_area_overrides: {
          default: {
            geometry_type: "rectangle",
            width_mm: 100,
            height_mm: 100,
          },
        },
      },
    ],
  };

  test("prices dynamic rules from effective variation dimensions", () => {
    const rows = effectiveOptionPricingRows(template, printRule);

    expect(rows).toHaveLength(2);
    expect(rows[0].cost).toBeCloseTo(10, 5);
    expect(rows[1].cost).toBeCloseTo(10, 5);
  });

  test("marks the template as priced when only variation areas hold dimensions", () => {
    const info = templatePricingInfo(template, [printRule]);

    expect(info.hasActiveMethods).toBe(true);
    expect(info.hasPricing).toBe(true);
    expect(info.pricedOptions).toHaveLength(1);
    expect(info.printAreaCoverage.complete).toBe(true);
  });
});
