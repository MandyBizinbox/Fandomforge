export const UNIFIED_COSTING_ENGINE_VERSION = "unified_manufacturing_costing_v1";

export const CALCULATION_TYPES = [
  ["area_fixed_rate", "Area fixed rate / cm²"],
  ["area_from_sheet", "Area from sheet"],
  ["fixed", "Fixed cost"],
  ["full_sheet", "Full sheet"],
];

export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function nullableNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function listText(value) {
  return safeArray(value).join("\n");
}

export function textList(value) {
  return [...new Set(String(value || "").split(/[\n,]+/).map((item) => item.trim()).filter(Boolean))];
}

export function slug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function profileName(profile = {}) {
  return profile.display_name
    || profile.profile_name
    || profile.profile_label
    || profile.rule_name
    || profile.print_method
    || profile.print_size
    || "Costing profile";
}

export function makeCanonicalProfileId(methodKey, profile = {}) {
  const explicit = profile.manufacturing_profile_id || profile.profile_id || profile.id || "";
  if (String(explicit).startsWith("profile:")) return explicit;
  const key = profile.outsourced_rate_profile_key || slug(profileName(profile)) || "standard";
  return `profile:${methodKey}:${key}`;
}

export function normaliseCostingProfile(profile = {}, methodKey = "method", index = 0) {
  const id = makeCanonicalProfileId(methodKey, profile);
  const aliases = [
    ...safeArray(profile.legacy_print_option_ids),
    profile.print_option_id,
    profile.source_print_option_id,
    profile.legacy_print_option_id,
    profile.id,
    profile.profile_id,
  ].map((value) => String(value || "").trim()).filter((value, idx, all) => value && value !== id && all.indexOf(value) === idx);

  return {
    ...profile,
    id,
    profile_id: id,
    manufacturing_profile_id: id,
    display_name: profileName(profile),
    profile_name: profileName(profile),
    status: profile.status || "active",
    is_default: Boolean(profile.is_default),
    calculation_type: profile.calculation_type || "area_fixed_rate",
    platform_print_cost: profile.platform_print_cost ?? profile.print_cost_max ?? 0,
    print_cost_max: profile.print_cost_max ?? profile.platform_print_cost ?? 0,
    cost_per_cm2: profile.cost_per_cm2 ?? 0,
    minimum_area_cm2: profile.minimum_area_cm2 ?? 100,
    application_cost: profile.application_cost ?? 7.5,
    minimum_print_cost: profile.minimum_print_cost ?? 0,
    sheet_width_mm: profile.sheet_width_mm ?? 0,
    sheet_height_mm: profile.sheet_height_mm ?? 0,
    sheet_cost: profile.sheet_cost ?? 0,
    creator_print_price: profile.creator_print_price ?? 0,
    waste_percentage: profile.waste_percentage ?? 0,
    markup_percentage: profile.markup_percentage ?? 5,
    platform_print_markup_type: profile.platform_print_markup_type || "manual",
    platform_print_markup_value: profile.platform_print_markup_value ?? 0,
    pricing_notes: profile.pricing_notes || "",
    print_positions: safeArray(profile.print_positions).length ? safeArray(profile.print_positions) : safeArray(profile.placement_tags),
    placement_tags: safeArray(profile.print_positions).length ? safeArray(profile.print_positions) : safeArray(profile.placement_tags),
    legacy_print_option_ids: aliases,
    costing_engine_version: profile.costing_engine_version || UNIFIED_COSTING_ENGINE_VERSION,
    _key: id || `${methodKey}-${index}`,
    _advancedOpen: false,
  };
}

export function methodProfiles(method = {}) {
  const source = safeArray(method.costing_profiles).length
    ? method.costing_profiles
    : safeArray(method.legacy_print_option_costing_profiles);
  const profiles = source.map((profile, index) => normaliseCostingProfile(profile, method.method_key || "method", index));
  if (!profiles.length && method.cost_calculation_model) {
    profiles.push(normaliseCostingProfile({
      ...method.cost_calculation_model,
      display_name: method.display_name || method.method_key,
      is_default: true,
    }, method.method_key || "method", 0));
  }
  const defaultId = method.default_costing_profile_id
    || profiles.find((profile) => profile.is_default)?.id
    || profiles.find((profile) => profile.status === "active")?.id
    || profiles[0]?.id;
  return profiles.map((profile) => ({ ...profile, is_default: profile.id === defaultId }));
}

export function calculationFieldGroups(type) {
  const calculationType = type || "area_fixed_rate";
  if (calculationType === "fixed") {
    return {
      primary: ["print_cost_max", "creator_print_price"],
      sheet: [],
      area: [],
    };
  }
  if (calculationType === "area_from_sheet") {
    return {
      primary: ["sheet_width_mm", "sheet_height_mm", "sheet_cost"],
      sheet: ["cost_per_cm2"],
      area: ["minimum_area_cm2", "application_cost"],
    };
  }
  if (calculationType === "full_sheet") {
    return {
      primary: ["sheet_width_mm", "sheet_height_mm", "sheet_cost"],
      sheet: [],
      area: ["application_cost"],
    };
  }
  return {
    primary: ["cost_per_cm2", "minimum_area_cm2", "application_cost"],
    sheet: [],
    area: [],
  };
}

export function derivedSheetRate(profile = {}) {
  const width = numberValue(profile.sheet_width_mm);
  const height = numberValue(profile.sheet_height_mm);
  const cost = numberValue(profile.sheet_cost);
  const areaCm2 = (width / 10) * (height / 10);
  return areaCm2 > 0 && cost > 0 ? cost / areaCm2 : 0;
}

export function profileSummary(profile = {}) {
  const type = profile.calculation_type || "fixed";
  if (type === "fixed") return `Fixed · R ${numberValue(profile.print_cost_max).toFixed(2)}`;
  if (type === "area_from_sheet") {
    const rate = derivedSheetRate(profile) || numberValue(profile.cost_per_cm2);
    return `Sheet-derived · R ${rate.toFixed(4)}/cm²`;
  }
  if (type === "full_sheet") return `Full sheet · R ${numberValue(profile.sheet_cost).toFixed(2)}`;
  return `R ${numberValue(profile.cost_per_cm2).toFixed(4)}/cm² · min ${numberValue(profile.minimum_area_cm2).toFixed(0)} cm² · application R ${numberValue(profile.application_cost).toFixed(2)}`;
}

export function newCostingProfile(methodKey, index = 0) {
  return normaliseCostingProfile({
    id: `profile:${methodKey}:new_${Date.now()}_${index}`,
    display_name: "New costing profile",
    status: "active",
    calculation_type: "area_fixed_rate",
    minimum_area_cm2: 100,
    application_cost: 7.5,
    markup_percentage: 5,
  }, methodKey, index);
}

export function duplicateCostingProfile(profile, methodKey, index = 0) {
  return normaliseCostingProfile({
    ...profile,
    id: `profile:${methodKey}:${slug(profileName(profile)) || "profile"}_copy_${Date.now()}_${index}`,
    display_name: `${profileName(profile)} Copy`,
    profile_name: `${profileName(profile)} Copy`,
    is_default: false,
    legacy_print_option_ids: [],
    status: "active",
  }, methodKey, index);
}

export function methodDraft(method = {}, colours = []) {
  const supported = method.supported_colours || {};
  const tokens = new Set(safeArray(supported.colours).flatMap((colour) => [colour.id, colour.name, colour.hex]).filter(Boolean).map((value) => String(value).toLowerCase()));
  return {
    ...method,
    profiles: methodProfiles(method),
    categoriesText: listText(method.supported_product_categories),
    materialsText: listText(method.supported_materials),
    artworkTypesText: listText(method.supported_artwork_types),
    colourMode: ["stocked_library", "restricted_library"].includes(supported.mode) ? "stocked_library" : "rgb",
    selectedColourIds: colours.filter((colour) => tokens.has(String(colour.id || "").toLowerCase()) || tokens.has(String(colour.name || "").toLowerCase()) || tokens.has(String(colour.hex || "").toLowerCase())).map((colour) => colour.id),
    maxLayers: method.layer_behaviour?.max_layers ?? "",
    everyColourCreatesLayer: Boolean(method.layer_behaviour?.colour_creates_layer || method.layer_behaviour?.every_colour_creates_layer),
    pressCountModel: method.press_behaviour?.press_count_model || method.press_behaviour?.model || "one_press_per_print_area",
    secondsPerPress: method.press_behaviour?.seconds_per_press ?? "",
    setupSeconds: method.press_behaviour?.setup_seconds ?? "",
  };
}

export function profilePayload(profile = {}) {
  const { _key, _advancedOpen, ...source } = profile;
  return {
    ...source,
    id: profile.id,
    profile_id: profile.id,
    manufacturing_profile_id: profile.id,
    display_name: profile.display_name || profileName(profile),
    profile_name: profile.display_name || profileName(profile),
    status: profile.status || "active",
    is_default: Boolean(profile.is_default),
    calculation_type: profile.calculation_type || "area_fixed_rate",
    print_cost_max: nullableNumber(profile.print_cost_max) || 0,
    platform_print_cost: nullableNumber(profile.print_cost_max) || 0,
    cost_per_cm2: nullableNumber(profile.cost_per_cm2) || 0,
    minimum_area_cm2: nullableNumber(profile.minimum_area_cm2) || 0,
    application_cost: nullableNumber(profile.application_cost) || 0,
    minimum_print_cost: nullableNumber(profile.minimum_print_cost) || 0,
    sheet_width_mm: nullableNumber(profile.sheet_width_mm) || 0,
    sheet_height_mm: nullableNumber(profile.sheet_height_mm) || 0,
    sheet_cost: nullableNumber(profile.sheet_cost) || 0,
    creator_print_price: nullableNumber(profile.creator_print_price) || 0,
    waste_percentage: nullableNumber(profile.waste_percentage) || 0,
    markup_percentage: nullableNumber(profile.markup_percentage) || 0,
    platform_print_markup_type: profile.platform_print_markup_type || "manual",
    platform_print_markup_value: nullableNumber(profile.platform_print_markup_value) || 0,
    pricing_notes: profile.pricing_notes || "",
    print_positions: textList(Array.isArray(profile.print_positions) ? profile.print_positions.join("\n") : profile.print_positions),
    placement_tags: textList(Array.isArray(profile.print_positions) ? profile.print_positions.join("\n") : profile.print_positions),
    legacy_print_option_ids: safeArray(profile.legacy_print_option_ids),
  };
}

export function methodPayload(draft = {}, colours = []) {
  const profiles = safeArray(draft.profiles).map(profilePayload);
  const defaultProfile = profiles.find((profile) => profile.is_default) || profiles.find((profile) => profile.status === "active") || profiles[0];
  const selectedColours = colours.filter((colour) => safeArray(draft.selectedColourIds).includes(colour.id)).map((colour) => ({ id: colour.id, name: colour.name, hex: colour.hex, aliases: colour.aliases || [], active: colour.active !== false }));
  const stocked = draft.colourMode === "stocked_library";
  return {
    display_name: draft.display_name || draft.method_key,
    description: draft.description || "",
    active: draft.active !== false,
    default_production_lead_time_days: numberValue(draft.default_production_lead_time_days),
    supported_product_categories: textList(draft.categoriesText),
    supported_materials: textList(draft.materialsText),
    supported_artwork_types: textList(draft.artworkTypesText),
    maximum_artwork_width_mm: nullableNumber(draft.maximum_artwork_width_mm),
    maximum_artwork_height_mm: nullableNumber(draft.maximum_artwork_height_mm),
    minimum_artwork_width_mm: nullableNumber(draft.minimum_artwork_width_mm),
    minimum_artwork_height_mm: nullableNumber(draft.minimum_artwork_height_mm),
    minimum_resolution_dpi: numberValue(draft.minimum_resolution_dpi, 300),
    transparent_background_required: Boolean(draft.transparent_background_required),
    mirror_artwork_required: Boolean(draft.mirror_artwork_required),
    gang_sheet_capable: Boolean(draft.gang_sheet_capable),
    supported_colours: {
      ...(draft.supported_colours || {}),
      mode: stocked ? "restricted_library" : "unlimited_rgb",
      library_id: stocked ? "default-stocked-vinyl-colours" : null,
      colours: stocked ? selectedColours : [],
    },
    creator_restrictions: {
      ...(draft.creator_restrictions || {}),
      colour_picker: stocked ? "stocked_library" : "rgb",
      requires_stocked_colour_selection: stocked,
    },
    layer_behaviour: {
      ...(draft.layer_behaviour || {}),
      colour_creates_layer: Boolean(draft.everyColourCreatesLayer),
      every_colour_creates_layer: Boolean(draft.everyColourCreatesLayer),
      max_layers: draft.maxLayers === "" ? null : numberValue(draft.maxLayers),
    },
    press_behaviour: {
      ...(draft.press_behaviour || {}),
      press_count_model: draft.pressCountModel || "one_press_per_print_area",
      model: draft.pressCountModel || "one_press_per_print_area",
      seconds_per_press: nullableNumber(draft.secondsPerPress),
      setup_seconds: nullableNumber(draft.setupSeconds),
    },
    costing_profiles: profiles.map((profile) => ({ ...profile, is_default: profile.id === defaultProfile?.id })),
    default_costing_profile_id: defaultProfile?.id || null,
    validation_rules: {
      ...(draft.validation_rules || {}),
      enforce_colour_library: stocked,
    },
    admin_notes: draft.admin_notes || "",
  };
}
