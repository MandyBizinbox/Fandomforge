import {
  calculateAreaPrintCost,
  getAggregatedPrintCostLines,
} from "./productBuilderUtils";

const standardDtf = {
  id: "dtf-standard",
  method_key: "dtf",
  calculation_type: "area_fixed_rate",
  cost_per_cm2: 0.07,
  minimum_area_cm2: 100,
  application_cost: 7.5,
  minimum_print_cost: 0,
  waste_percentage: 0,
  markup_percentage: 5,
};

const template = {
  print_areas: [
    {
      id: "front-area",
      screen_id: "front-screen",
      width_mm: 100,
      height_mm: 100,
    },
    {
      id: "back-area",
      screen_id: "back-screen",
      width_mm: 100,
      height_mm: 100,
    },
  ],
};

function layer(id, overrides = {}) {
  return {
    id,
    print_option_id: "dtf-standard",
    method_key: "dtf",
    print_area_id: "front-area",
    screen_id: "front-screen",
    original_url: `/${id}.png`,
    placement: {
      x: 0,
      y: 0,
      width: 50,
      height: 100,
    },
    ...overrides,
  };
}

describe("outsourced production area pricing", () => {
  test("calculates the approved Standard DTF screenshot example", () => {
    const result = calculateAreaPrintCost(
      {
        ...layer("combined"),
        combined_area_cm2: 618.3,
        combined_layer_count: 4,
      },
      template.print_areas[0],
      standardDtf
    );

    expect(result.area_cm2).toBe(618.3);
    expect(result.chargeable_area_cm2).toBe(618.3);
    expect(result.material_cost).toBe(43.28);
    expect(result.application_cost).toBe(7.5);
    expect(result.production_subtotal_before_markup).toBe(50.78);
    expect(result.markup_amount).toBe(2.54);
    expect(result.calculated_print_cost).toBe(53.32);
  });

  test("uses the 100 cm² minimum rather than a monetary minimum", () => {
    const result = calculateAreaPrintCost(
      layer("small"),
      template.print_areas[0],
      standardDtf
    );

    expect(result.area_cm2).toBe(50);
    expect(result.minimum_area_applied).toBe(true);
    expect(result.chargeable_area_cm2).toBe(100);
    expect(result.material_cost).toBe(7);
    expect(result.calculated_print_cost).toBe(15.23);
  });

  test("combines actual layer areas and charges application once", () => {
    const groups = [{
      id: "default-all",
      label: "Default artwork",
      artworks: [
        layer("first"),
        layer("second"),
      ],
    }];

    const lines = getAggregatedPrintCostLines(
      groups,
      [standardDtf],
      template
    );

    expect(lines).toHaveLength(1);
    expect(lines[0].combined).toBe(true);
    expect(lines[0].layer_count).toBe(2);
    expect(lines[0].combined_area_cm2).toBe(100);
    expect(lines[0].chargeable_area_cm2).toBe(100);
    expect(lines[0].application_cost).toBe(7.5);
    expect(lines[0].cost).toBe(15.23);
  });

  test("keeps different production profiles as separate jobs", () => {
    const premium = {
      ...standardDtf,
      id: "dtf-premium",
      cost_per_cm2: 0.08,
    };
    const groups = [{
      id: "default-all",
      label: "Default artwork",
      artworks: [
        layer("standard"),
        layer("premium", {
          print_option_id: "dtf-premium",
        }),
      ],
    }];

    const lines = getAggregatedPrintCostLines(
      groups,
      [standardDtf, premium],
      template
    );

    expect(lines).toHaveLength(2);
    expect(lines.reduce((total, line) => total + line.application_cost, 0)).toBe(15);
  });

  test("keeps front and back as separate application jobs", () => {
    const groups = [{
      id: "default-all",
      label: "Default artwork",
      artworks: [
        layer("front"),
        layer("back", {
          print_area_id: "back-area",
          screen_id: "back-screen",
        }),
      ],
    }];

    const lines = getAggregatedPrintCostLines(
      groups,
      [standardDtf],
      template
    );

    expect(lines).toHaveLength(2);
    expect(lines.reduce((total, line) => total + line.cost, 0)).toBe(30.46);
  });
});
