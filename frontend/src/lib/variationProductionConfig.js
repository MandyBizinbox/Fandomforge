import { newId, safeArray } from "../components/template-studio/templateStudioUtils";

export const PRODUCTION_CONFIG_KEY = "__production_configuration__";
export const PRODUCTION_CONFIG_VERSION = 3;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function compact(value) {
  return String(value || "").trim();
}

function normaliseKey(value) {
  return compact(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function activeRows(rows) {
  return safeArray(rows).filter((row) => row && row.status !== "archived" && !row.archived && !row.deleted && row.disabled !== true);
}

function screenIdentity(screen = {}) {
  return normaliseKey(screen.view_key || screen.view || screen.screen_view || screen.name || screen.id || "front");
}

function areaIdentity(area = {}) {
  return normaliseKey(area.area_key || area.name || area.id || "print-area");
}

function withOccurrenceKeys(rows, identity) {
  const counts = new Map();
  return safeArray(rows).map((row) => {
    const base = identity(row) || "item";
    const occurrence = counts.get(base) || 0;
    counts.set(base, occurrence + 1);
    return { row, slotKey: `${base}::${occurrence}` };
  });
}

export function blankProductionConfiguration() {
  return {
    version: PRODUCTION_CONFIG_VERSION,
    screens: [],
    print_areas: [],
    print_option_ids: [],
    print_options: [],
    configured_at: null,
  };
}

export function normaliseProductionConfiguration(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const screens = activeRows(source.screens || source.mockup_screens).map((screen, index) => ({
    ...clone(screen),
    id: screen.id || newId("screen"),
    name: screen.name || screen.view_key || screen.view || `View ${index + 1}`,
    view: screen.view || screen.view_key || "front",
    view_key: screen.view_key || screen.view || "front",
    sort_order: Number(screen.sort_order ?? index),
    status: screen.status || "active",
  }));
  const screenIds = new Set(screens.map((screen) => screen.id));
  const firstScreenId = screens[0]?.id || "";
  const printAreas = activeRows(source.print_areas).map((area, index) => ({
    ...clone(area),
    id: area.id || newId("area"),
    name: area.name || area.area_key || `Print area ${index + 1}`,
    screen_id: screenIds.has(area.screen_id) ? area.screen_id : firstScreenId,
    screen_view: area.screen_view || area.view_key || "front",
    view_key: area.view_key || area.screen_view || "front",
    area_key: area.area_key || area.view_key || `area_${index + 1}`,
    allowed_print_option_ids: safeArray(area.allowed_print_option_ids),
    status: area.status || "active",
  }));
  const optionIds = new Set([
    ...safeArray(source.print_option_ids),
    ...safeArray(source.print_options).map((option) => option?.id).filter(Boolean),
    ...printAreas.flatMap((area) => safeArray(area.allowed_print_option_ids)),
  ]);

  return {
    version: PRODUCTION_CONFIG_VERSION,
    screens,
    print_areas: printAreas,
    print_option_ids: Array.from(optionIds),
    print_options: safeArray(source.print_options).map(clone),
    configured_at: source.configured_at || null,
  };
}

function legacyAreaOverride(variation = {}, area = {}) {
  const overrides = variation.print_area_overrides || {};
  const keys = [area.id, area.area_key, area.view_key, area.screen_view, "default"].filter(Boolean);
  for (const key of keys) {
    const value = overrides[key];
    if (value && typeof value === "object" && key !== PRODUCTION_CONFIG_KEY) return value;
  }
  return {};
}

export function getVariationProductionConfiguration(variation = {}, template = {}) {
  const stored = variation?.print_area_overrides?.[PRODUCTION_CONFIG_KEY];
  if (stored && typeof stored === "object") return normaliseProductionConfiguration(stored);

  const templateScreens = activeRows(template.mockup_screens);
  const screens = templateScreens.map((screen) => ({
    ...clone(screen),
    image_url:
      variation?.mockup_screen_overrides?.[screen.id]
      || variation?.mockup_screen_overrides?.[screen.view_key]
      || variation?.mockup_screen_overrides?.[screen.view]
      || screen.image_url
      || variation.image_url
      || "",
  }));
  const printAreas = activeRows(template.print_areas).map((area) => ({
    ...clone(area),
    ...clone(legacyAreaOverride(variation, area)),
    id: area.id,
    screen_id: area.screen_id,
  }));

  return normaliseProductionConfiguration({
    screens,
    print_areas: printAreas,
    print_option_ids: template.print_option_ids,
    print_options: template.print_options,
  });
}

export function setVariationProductionConfiguration(variation = {}, configuration = {}) {
  const config = normaliseProductionConfiguration(configuration);
  return {
    ...variation,
    print_area_overrides: {
      ...(variation.print_area_overrides || {}),
      [PRODUCTION_CONFIG_KEY]: {
        ...clone(config),
        configured_at: new Date().toISOString(),
      },
    },
  };
}

export function cloneProductionConfiguration(configuration = {}) {
  return normaliseProductionConfiguration(clone(configuration));
}

export function productionConfigurationComplete(configuration = {}) {
  const config = normaliseProductionConfiguration(configuration);
  const screensReady = config.screens.length > 0 && config.screens.every((screen) => Boolean(screen.image_url));
  const areasReady = config.print_areas.length > 0 && config.print_areas.every((area) => (
    Number(area.width_mm || 0) > 0
    && Number(area.height_mm || 0) > 0
    && Number(area.width_pct ?? area.width ?? 0) > 0
    && Number(area.height_pct ?? area.height ?? 0) > 0
    && safeArray(area.allowed_print_option_ids).length > 0
  ));
  return screensReady && areasReady;
}


export function productionImageConfigurationComplete(configuration = {}) {
  const config = normaliseProductionConfiguration(configuration);
  return (
    config.screens.length > 0
    && config.screens.every((screen) => Boolean(screen.image_url))
  );
}

export function productionGeometryConfigurationComplete(configuration = {}) {
  const config = normaliseProductionConfiguration(configuration);
  return (
    config.print_areas.length > 0
    && config.print_areas.every((area) => (
      Number(area.width_mm || 0) > 0
      && Number(area.height_mm || 0) > 0
      && Number(area.width_pct ?? area.width ?? 0) > 0
      && Number(area.height_pct ?? area.height ?? 0) > 0
      && safeArray(area.allowed_print_option_ids).length > 0
    ))
  );
}

export function attributeProfileKey(value) {
  return normaliseKey(value) || "default";
}

export function getVariationAttributeValue(variation = {}, attributeName = "") {
  const attributes = variation?.attributes || {};
  const expected = normaliseKey(attributeName);

  const matchingKey = Object.keys(attributes).find(
    (key) => normaliseKey(key) === expected
  );

  return matchingKey ? attributes[matchingKey] : "";
}

export function getAttributeProfileConfiguration(profiles = {}, value = "") {
  const rows = profiles && typeof profiles === "object" ? profiles : {};
  const direct = rows[attributeProfileKey(value)];
  const fallback = Object.values(rows).find(
    (row) => normaliseKey(row?.attribute_value) === normaliseKey(value)
  );
  const profile = direct || fallback;

  if (!profile) return null;

  return normaliseProductionConfiguration(
    profile.configuration || profile
  );
}

function activeVariationRows(variations = []) {
  return safeArray(variations).filter(
    (variation) => (
      variation
      && variation.enabled !== false
      && variation.status !== "archived"
    )
  );
}

function uniqueAttributeValues(variations, attributeName) {
  return Array.from(
    new Set(
      activeVariationRows(variations)
        .map((variation) => getVariationAttributeValue(variation, attributeName))
        .filter(Boolean)
    )
  );
}

export function initialiseAttributeProductionProfiles(
  template = {},
  variations = [],
  imageAttribute = "",
  productionAttribute = ""
) {
  const currentOwnership = template.variation_inheritance || {};

  const imageProfiles = (
    currentOwnership.image_attribute === imageAttribute
      ? clone(template.attribute_image_profiles || {})
      : {}
  ) || {};

  const productionProfiles = (
    currentOwnership.production_attribute === productionAttribute
      ? clone(template.attribute_production_profiles || {})
      : {}
  ) || {};

  uniqueAttributeValues(variations, imageAttribute).forEach((value) => {
    const key = attributeProfileKey(value);

    if (imageProfiles[key]) return;

    const sourceVariation = activeVariationRows(variations).find(
      (variation) => (
        getVariationAttributeValue(variation, imageAttribute) === value
      )
    );

    const source = sourceVariation
      ? getVariationProductionConfiguration(sourceVariation, template)
      : blankProductionConfiguration();

    imageProfiles[key] = {
      attribute_value: value,
      configuration: normaliseProductionConfiguration({
        screens: source.screens,
        print_areas: [],
        print_option_ids: [],
        print_options: [],
      }),
      updated_at: new Date().toISOString(),
    };
  });

  uniqueAttributeValues(variations, productionAttribute).forEach((value) => {
    const key = attributeProfileKey(value);

    if (productionProfiles[key]) return;

    const sourceVariation = activeVariationRows(variations).find(
      (variation) => (
        getVariationAttributeValue(variation, productionAttribute) === value
      )
    );

    const source = sourceVariation
      ? getVariationProductionConfiguration(sourceVariation, template)
      : blankProductionConfiguration();

    productionProfiles[key] = {
      attribute_value: value,
      configuration: cloneProductionConfiguration(source),
      updated_at: new Date().toISOString(),
    };
  });

  return {
    variation_inheritance: {
      mode: "attribute",
      image_attribute: imageAttribute,
      production_attribute: productionAttribute,
    },
    attribute_image_profiles: imageProfiles,
    attribute_production_profiles: productionProfiles,
  };
}

export function resolveVariationProductionConfiguration(
  variation = {},
  template = {}
) {
  const base = getVariationProductionConfiguration(variation, template);
  const ownership = template.variation_inheritance || {};

  if (ownership.mode !== "attribute") return base;

  const imageAttribute = ownership.image_attribute || "";
  const productionAttribute = ownership.production_attribute || "";

  if (!imageAttribute || !productionAttribute) return base;

  const imageValue = getVariationAttributeValue(
    variation,
    imageAttribute
  );

  const productionValue = getVariationAttributeValue(
    variation,
    productionAttribute
  );

  const imageConfiguration = (
    getAttributeProfileConfiguration(
      template.attribute_image_profiles,
      imageValue
    )
    || base
  );

  const productionConfiguration = (
    getAttributeProfileConfiguration(
      template.attribute_production_profiles,
      productionValue
    )
    || base
  );

  const screens = safeArray(imageConfiguration.screens).length
    ? clone(imageConfiguration.screens)
    : clone(base.screens);

  const targetScreenBySlot = new Map(
    screenSlotRows({ screens }).map(
      ({ row, slotKey }) => [slotKey, row]
    )
  );

  screenSlotRows(productionConfiguration).forEach(
    ({ row, slotKey }) => {
      if (targetScreenBySlot.has(slotKey)) return;

      const fallback = {
        ...clone(row),
        id: `attribute-screen-${attributeProfileKey(imageValue)}-${normaliseKey(slotKey)}`,
        image_url: "",
        status: "active",
      };

      screens.push(fallback);
      targetScreenBySlot.set(slotKey, fallback);
    }
  );

  const printAreas = areaSlotRows(productionConfiguration).map(
    ({ row, screenSlot }) => {
      const targetScreen = (
        targetScreenBySlot.get(screenSlot)
        || screens[0]
      );

      return {
        ...clone(row),
        screen_id: targetScreen?.id || row.screen_id,
      };
    }
  );

  return normaliseProductionConfiguration({
    screens,
    print_areas: printAreas,
    print_option_ids: productionConfiguration.print_option_ids,
    print_options: productionConfiguration.print_options,
    configured_at: (
      productionConfiguration.configured_at
      || imageConfiguration.configured_at
      || base.configured_at
    ),
  });
}

export function applyProductionConfigurationToVariations(variations = [], configuration = {}, variationIds = null) {
  const selected = variationIds ? new Set(safeArray(variationIds)) : null;
  const source = cloneProductionConfiguration(configuration);
  return safeArray(variations).map((variation) => {
    if (selected && !selected.has(variation.id)) return variation;
    return setVariationProductionConfiguration(variation, cloneProductionConfiguration(source));
  });
}

function screenSlotRows(config = {}) {
  return withOccurrenceKeys(normaliseProductionConfiguration(config).screens, screenIdentity);
}

function areaSlotRows(config = {}) {
  const normalised = normaliseProductionConfiguration(config);
  const screenSlots = screenSlotRows(normalised);
  const screenSlotById = new Map(screenSlots.map(({ row, slotKey }) => [row.id, slotKey]));
  const counts = new Map();

  return normalised.print_areas.map((area) => {
    const screenSlot = screenSlotById.get(area.screen_id) || screenIdentity({ view_key: area.view_key || area.screen_view });
    const base = `${screenSlot}::${areaIdentity(area)}`;
    const occurrence = counts.get(base) || 0;
    counts.set(base, occurrence + 1);
    return { row: area, slotKey: `${base}::${occurrence}`, screenSlot };
  });
}

function uniqueOptions(configurations = []) {
  const byId = new Map();
  configurations.forEach((config) => {
    safeArray(config.print_options).forEach((option) => {
      if (option?.id && !byId.has(option.id)) byId.set(option.id, clone(option));
    });
  });
  return Array.from(byId.values());
}

function compiledVariationConfiguration(
  config,
  variation,
  template,
  screenAnchors,
  areaAnchors
) {
  const configScreens = new Map(screenSlotRows(config).map((entry) => [entry.slotKey, entry.row]));
  const configAreas = new Map(areaSlotRows(config).map((entry) => [entry.slotKey, entry.row]));

  const screens = screenAnchors
    .map((anchor) => {
      const source = configScreens.get(anchor.production_slot_key);
      if (!source) return null;
      return {
        ...clone(source),
        id: anchor.id,
        name: source.name || anchor.name,
        view: source.view || anchor.view,
        view_key: source.view_key || anchor.view_key,
        image_url: source.image_url || variation.image_url || template.product_image_url || template.mockup_url || "",
        sort_order: anchor.sort_order,
        status: "active",
      };
    })
    .filter(Boolean);

  const screenIds = new Set(screens.map((screen) => screen.id));
  const printAreas = areaAnchors
    .map((anchor) => {
      const source = configAreas.get(anchor.production_slot_key);
      if (!source) return null;
      return {
        ...clone(source),
        id: anchor.id,
        screen_id: screenIds.has(anchor.screen_id) ? anchor.screen_id : screens[0]?.id || anchor.screen_id,
        name: source.name || anchor.name,
        status: "active",
      };
    })
    .filter(Boolean);

  return normaliseProductionConfiguration({
    ...config,
    screens,
    print_areas: printAreas,
    configured_at: config.configured_at || new Date().toISOString(),
  });
}

export function compileVariableTemplateProduction(template = {}, variations = []) {
  const activeVariations = safeArray(variations).filter((variation) => variation && variation.enabled !== false && variation.status !== "archived");
  if (!activeVariations.length) {
    return {
      ...template,
      variations,
    };
  }

  const rows = activeVariations.map((variation) => ({
    variation,
    config: resolveVariationProductionConfiguration(variation, template),
  }));

  const screenRepresentatives = new Map();
  const areaRepresentatives = new Map();
  rows.forEach(({ config }) => {
    screenSlotRows(config).forEach(({ row, slotKey }) => {
      if (!screenRepresentatives.has(slotKey)) screenRepresentatives.set(slotKey, row);
    });
    areaSlotRows(config).forEach(({ row, slotKey, screenSlot }) => {
      if (!areaRepresentatives.has(slotKey)) areaRepresentatives.set(slotKey, { row, screenSlot });
    });
  });

  const screenAnchors = Array.from(screenRepresentatives.entries()).map(([slotKey, representative], index) => ({
    ...clone(representative),
    id: `vp-screen-${index + 1}-${normaliseKey(slotKey).slice(0, 40)}`,
    image_url: representative.image_url || template.product_image_url || template.mockup_url || "",
    sort_order: index,
    status: "active",
    production_slot_key: slotKey,
  }));
  const screenAnchorBySlot = new Map(screenAnchors.map((screen) => [screen.production_slot_key, screen]));

  const areaAnchors = Array.from(areaRepresentatives.entries()).map(([slotKey, entry], index) => {
    const screenAnchor = screenAnchorBySlot.get(entry.screenSlot) || screenAnchors[0];
    return {
      ...clone(entry.row),
      id: `vp-area-${index + 1}-${normaliseKey(slotKey).slice(0, 40)}`,
      screen_id: screenAnchor?.id || "",
      x: Number(entry.row.x ?? entry.row.x_pct ?? 0),
      y: Number(entry.row.y ?? entry.row.y_pct ?? 0),
      width: Number(entry.row.width ?? entry.row.width_pct ?? 1),
      height: Number(entry.row.height ?? entry.row.height_pct ?? 1),
      x_pct: Number(entry.row.x_pct ?? entry.row.x ?? 0),
      y_pct: Number(entry.row.y_pct ?? entry.row.y ?? 0),
      width_pct: Number(entry.row.width_pct ?? entry.row.width ?? 1),
      height_pct: Number(entry.row.height_pct ?? entry.row.height ?? 1),
      production_slot_key: slotKey,
      status: "active",
    };
  });

  const compiledVariations = safeArray(variations).map((variation) => {
    if (!activeVariations.some((active) => active.id === variation.id)) return variation;

    const sourceConfig = resolveVariationProductionConfiguration(variation, template);
    const config = compiledVariationConfiguration(
      sourceConfig,
      variation,
      template,
      screenAnchors,
      areaAnchors
    );
    const configScreensById = new Map(config.screens.map((screen) => [screen.id, screen]));
    const configAreasById = new Map(config.print_areas.map((area) => [area.id, area]));
    const screenOverrides = {};
    const areaOverrides = {
      [PRODUCTION_CONFIG_KEY]: clone(config),
    };

    screenAnchors.forEach((anchor) => {
      const screen = configScreensById.get(anchor.id);
      screenOverrides[anchor.id] = screen?.image_url || variation.image_url || template.product_image_url || "";
    });

    areaAnchors.forEach((anchor) => {
      const area = configAreasById.get(anchor.id);
      if (!area) {
        areaOverrides[anchor.id] = {
          id: anchor.id,
          screen_id: anchor.screen_id,
          name: anchor.name,
          area_key: anchor.area_key,
          view_key: anchor.view_key,
          x: 0,
          y: 0,
          width: 0.01,
          height: 0.01,
          x_pct: 0,
          y_pct: 0,
          width_pct: 0.01,
          height_pct: 0.01,
          width_mm: 0,
          height_mm: 0,
          allowed_print_option_ids: [],
          status: "archived",
          disabled: true,
        };
        return;
      }
      areaOverrides[anchor.id] = clone(area);
    });

    return {
      ...variation,
      mockup_screen_overrides: screenOverrides,
      print_area_overrides: areaOverrides,
    };
  });

  const configurations = rows.map((row) => row.config);
  const optionIds = new Set([
    ...configurations.flatMap((config) => safeArray(config.print_option_ids)),
    ...areaAnchors.flatMap((area) => safeArray(area.allowed_print_option_ids)),
  ]);

  return {
    ...template,
    variations: compiledVariations,
    mockup_screens: screenAnchors.map(({ production_slot_key, ...screen }) => screen),
    print_areas: areaAnchors.map(({ production_slot_key, ...area }) => area),
    print_option_ids: Array.from(optionIds),
    print_options: uniqueOptions(configurations),
  };
}

export function variationProductionSummary(variation = {}, template = {}) {
  const config = resolveVariationProductionConfiguration(variation, template);
  return {
    screens: config.screens.length,
    printAreas: config.print_areas.length,
    printRules: new Set(config.print_areas.flatMap((area) => safeArray(area.allowed_print_option_ids))).size,
    complete: productionConfigurationComplete(config),
  };
}
