import {
  calculationFieldGroups,
  methodProfiles,
  methodPayload,
  normaliseCostingProfile,
  profileColourIds,
  profileColourMode,
  profileSummary,
} from "./unifiedManufacturingCosting";

describe("unified manufacturing costing helpers", () => {
  test("normalises a canonical area profile with compatibility aliases", () => {
    const profile = normaliseCostingProfile({
      id: "legacy-dtf",
      display_name: "Standard DTF",
      outsourced_rate_profile_key: "standard_dtf",
      cost_per_cm2: 0.07,
      minimum_area_cm2: 100,
      application_cost: 7.5,
    }, "dtf");
    expect(profile.id).toBe("profile:dtf:standard_dtf");
    expect(profile.legacy_print_option_ids).toContain("legacy-dtf");
    expect(profileSummary(profile)).toContain("R 0.0700/cm²");
  });

  test("method profiles expose one default", () => {
    const profiles = methodProfiles({
      method_key: "htv",
      default_costing_profile_id: "profile:htv:classic_htv",
      costing_profiles: [
        { id: "profile:htv:classic_htv", display_name: "Classic HTV", status: "active" },
        { id: "profile:htv:glitter_htv", display_name: "Glitter HTV", status: "active" },
      ],
    });
    expect(profiles.filter((profile) => profile.is_default)).toHaveLength(1);
    expect(profiles[0].id).toBe("profile:htv:classic_htv");
  });

  test("calculation fields are conditional", () => {
    expect(calculationFieldGroups("area_fixed_rate").primary).toEqual([
      "cost_per_cm2",
      "minimum_area_cm2",
      "application_cost",
    ]);
    expect(calculationFieldGroups("fixed").primary).toEqual([
      "print_cost_max",
      "creator_print_price",
    ]);
    expect(calculationFieldGroups("area_from_sheet").primary).toEqual([
      "sheet_width_mm",
      "sheet_height_mm",
      "sheet_cost",
    ]);
    expect(calculationFieldGroups("full_sheet").primary).toEqual([
      "sheet_width_mm",
      "sheet_height_mm",
      "sheet_cost",
    ]);
  });

  test("profile stocked colours default to method inheritance", () => {
    const profile = normaliseCostingProfile({
      id: "profile:htv:classic_htv",
      display_name: "Classic HTV",
    }, "htv");
    expect(profileColourMode(profile)).toBe("inherit_method");
    expect(profileColourIds(profile)).toEqual([]);
  });

  test("profile stocked colour restrictions survive normalisation and payload", () => {
    const payload = methodPayload({
      method_key: "htv",
      display_name: "HTV",
      active: true,
      colourMode: "stocked_library",
      selectedColourIds: ["black", "white", "rose_gold"],
      profiles: [normaliseCostingProfile({
        id: "profile:htv:metallic_htv",
        display_name: "Metallic HTV",
        status: "active",
        is_default: true,
        colour_selection_mode: "restricted",
        supported_colour_ids: ["rose_gold", "not_in_method_pool"],
      }, "htv")],
    }, [
      { id: "black", name: "Black", hex: "#000000", active: true },
      { id: "white", name: "White", hex: "#ffffff", active: true },
      { id: "rose_gold", name: "Rose Gold", hex: "#b76e79", active: true },
    ]);
    expect(payload.costing_profiles[0].colour_selection_mode).toBe("restricted");
    expect(payload.costing_profiles[0].supported_colour_ids).toEqual(["rose_gold"]);
    expect(payload.costing_profiles[0].available_colour_ids).toEqual(["rose_gold"]);
  });

  test("method payload writes canonical profiles only", () => {
    const payload = methodPayload({
      method_key: "dtf",
      display_name: "DTF Transfer",
      active: true,
      colourMode: "rgb",
      profiles: [
        normaliseCostingProfile({
          id: "profile:dtf:standard_dtf",
          display_name: "Standard DTF",
          status: "active",
          is_default: true,
          calculation_type: "area_fixed_rate",
          cost_per_cm2: 0.07,
          minimum_area_cm2: 100,
          application_cost: 7.5,
          markup_percentage: 5,
        }, "dtf"),
      ],
    }, []);
    expect(payload.costing_profiles).toHaveLength(1);
    expect(payload.default_costing_profile_id).toBe("profile:dtf:standard_dtf");
    expect(payload.legacy_print_option_costing_profiles).toBeUndefined();
    expect(payload.cost_calculation_model).toBeUndefined();
  });
});