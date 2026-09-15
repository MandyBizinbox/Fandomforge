import { templateReadiness } from "./templateReadiness";

describe("template readiness", () => {
  const printRule = {
    id: "sublimation-flat",
    rule_name: "Sublimation Flat",
    print_method: "Sublimation",
    method_key: "sublimation",
    calculation_type: "area_fixed_rate",
    cost_per_cm2: 0.1,
    status: "active",
  };

  const template = {
    name: "Cork Coaster",
    status: "active",
    creator_visible: true,
    admin_visible: true,
    product_image_url: "/images/coaster.png",
    platform_blank_cost: 37.05,
    creator_blank_price: 40.76,
    print_option_ids: [printRule.id],
    print_options: [{ id: printRule.id }],
    mockup_screens: [
      {
        id: "top-screen",
        name: "Top",
        view_key: "top",
        image_url: "/images/coaster.png",
        status: "active",
      },
    ],
    print_areas: [
      {
        id: "top-area",
        screen_id: "top-screen",
        view_key: "top",
        area_key: "top",
        width_pct: 80,
        height_pct: 80,
        allowed_print_option_ids: [printRule.id],
        status: "active",
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

  test("recognises inherited and variation-level production data", () => {
    const ready = templateReadiness(template, [printRule]);

    expect(ready.checks.creatorPricing).toBe(true);
    expect(ready.checks.printAreas).toBe(true);
    expect(ready.checks.creatorVisible).toBe(true);
    expect(ready.launchReady).toBe(true);
    expect(ready.label).toBe("Launch ready");
  });

  test("does not call an active but creator-hidden template launch ready", () => {
    const ready = templateReadiness(
      { ...template, creator_visible: false },
      [printRule]
    );

    expect(ready.checks.creatorVisible).toBe(false);
    expect(ready.launchReady).toBe(false);
    expect(ready.label).toBe("Hidden from creators");
  });
});
