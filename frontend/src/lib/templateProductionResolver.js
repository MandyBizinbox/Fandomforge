import { safeArray } from "../components/template-studio/templateStudioUtils";
import {
  hasUsablePrintArea,
  normalisePrintAreaGeometry,
} from "./printAreaGeometry";
import {
  PRODUCTION_CONFIG_KEY,
  getVariationProductionConfiguration,
} from "./variationProductionConfig";

export function normaliseProductionKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function variationLabel(variation = {}) {
  const values = Object.values(variation.attributes || {}).filter(Boolean);
  return values.length
    ? values.join(" / ")
    : variation.sku
      || variation.supplier_sku
      || variation.id
      || "Variation";
}

export function activeTemplateVariations(template = {}) {
  return safeArray(template.variations).filter(
    (variation) =>
      variation
      && variation.enabled !== false
      && variation.status !== "archived"
      && !variation.archived
      && !variation.deleted
  );
}

function hasStoredProductionConfiguration(variation = {}) {
  return Boolean(
    variation?.print_area_overrides?.[PRODUCTION_CONFIG_KEY]
    && typeof variation.print_area_overrides[PRODUCTION_CONFIG_KEY] === "object"
  );
}

function activeRows(rows) {
  return safeArray(rows).filter(
    (row) =>
      row
      && row.status !== "archived"
      && !row.archived
      && !row.deleted
      && row.disabled !== true
  );
}

export function activeTemplatePrintAreas(template = {}, variation = null) {
  if (variation && hasStoredProductionConfiguration(variation)) {
    return activeRows(getVariationProductionConfiguration(variation, template).print_areas);
  }
  return activeRows(template.print_areas);
}

export function activeTemplateScreens(template = {}, variation = null) {
  if (variation && hasStoredProductionConfiguration(variation)) {
    return activeRows(getVariationProductionConfiguration(variation, template).screens);
  }
  return activeRows(template.mockup_screens);
}

export function variationAttributeValue(variation = {}, attributeKey = "") {
  const wanted = normaliseProductionKey(attributeKey);
  const attrs = variation.attributes || {};

  for (const [key, value] of Object.entries(attrs)) {
    if (normaliseProductionKey(key) === wanted) return value;
  }

  return "";
}

export function ruleLabel(rule = {}) {
  if (rule.name) return rule.name;
  const conditions = safeArray(rule.conditions);
  if (!conditions.length) return "Production rule";

  return conditions
    .map(
      (condition) =>
        `${condition.attribute_key || "Attribute"} = ${condition.attribute_value || "Value"}`
    )
    .join(" + ");
}

export function ruleMatchesVariation(rule = {}, variation = {}) {
  if (rule.enabled === false || rule.status === "archived") return false;
  const conditions = safeArray(rule.conditions);
  if (!conditions.length) return false;

  return conditions.every((condition) => {
    const actual = variationAttributeValue(
      variation,
      condition.attribute_key
    );
    return (
      normaliseProductionKey(actual)
      === normaliseProductionKey(condition.attribute_value)
    );
  });
}

export function matchingProductionRules(template = {}, variation = {}) {
  return safeArray(
    template.variation_production_rules || template.production_rules
  )
    .filter((rule) => ruleMatchesVariation(rule, variation))
    .sort(
      (a, b) =>
        safeArray(a.conditions).length - safeArray(b.conditions).length
    );
}

function firstTruthy(...values) {
  return (
    values.find(
      (value) =>
        value !== undefined
        && value !== null
        && value !== ""
    ) || ""
  );
}

function mergeDefined(base = {}, patch = {}) {
  const merged = { ...base };

  Object.entries(patch || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      merged[key] = value;
    }
  });

  return merged;
}

function areaOverrideForSource(source = {}, area = {}) {
  const overrides = source.print_area_overrides || {};
  const keys = [
    area.id,
    area.area_key,
    area.view_key,
    area.screen_view,
    "default",
  ].filter(Boolean);

  for (const key of keys) {
    const value = overrides[key];
    if (value && typeof value === "object" && key !== PRODUCTION_CONFIG_KEY) return value;
  }

  return source.print_area_override || {};
}

export function screenOverrideUrl(source = {}, screen = {}) {
  const overrides =
    source.mockup_screen_overrides
    || source.view_overrides
    || {};

  return firstTruthy(
    overrides[screen.id],
    overrides[screen.view_key],
    overrides[screen.name],
    overrides[screen.screen_view]
  );
}

function matchingConfigurationScreen(configuration = {}, wanted = {}, area = {}) {
  const screens = activeRows(configuration.screens);
  const wantedKeys = [
    wanted.id,
    wanted.view_key,
    wanted.view,
    wanted.screen_view,
    wanted.name,
    area.screen_id,
    area.view_key,
    area.screen_view,
  ].filter(Boolean).map(normaliseProductionKey);

  return screens.find((screen) => {
    const screenKeys = [screen.id, screen.view_key, screen.view, screen.screen_view, screen.name]
      .filter(Boolean)
      .map(normaliseProductionKey);
    return wantedKeys.some((key) => screenKeys.includes(key));
  }) || screens[0] || {};
}

function matchingConfigurationArea(configuration = {}, wanted = {}, option = {}) {
  const areas = activeRows(configuration.print_areas);
  const optionId = option?.id ? String(option.id) : "";
  const wantedKeys = [wanted.id, wanted.area_key, wanted.view_key, wanted.screen_view, wanted.name]
    .filter(Boolean)
    .map(normaliseProductionKey);
  const optionMatch = areas.find(
    (area) => optionId && safeArray(area.allowed_print_option_ids).map(String).includes(optionId)
  );
  if (optionMatch) return optionMatch;

  const semanticMatch = areas.find((area) => {
    const areaKeys = [area.id, area.area_key, area.view_key, area.screen_view, area.name]
      .filter(Boolean)
      .map(normaliseProductionKey);
    return wantedKeys.some((key) => areaKeys.includes(key));
  });
  if (semanticMatch) return semanticMatch;

  return wantedKeys.length ? null : areas[0] || null;
}

function disabledRuntimeArea(defaultArea = {}) {
  return normalisePrintAreaGeometry({
    id: defaultArea.id || "disabled-variation-area",
    name: defaultArea.name || "Unavailable for this variation",
    area_key: defaultArea.area_key || "disabled",
    view_key: defaultArea.view_key || defaultArea.screen_view || "",
    screen_view: defaultArea.screen_view || defaultArea.view_key || "",
    screen_id: "__disabled__",
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    x_pct: 0,
    y_pct: 0,
    width_pct: 0,
    height_pct: 0,
    width_mm: 0,
    height_mm: 0,
    allowed_print_option_ids: [],
    status: "archived",
    archived: true,
    disabled: true,
  });
}

function resolveStoredVariationConfiguration(template = {}, variation = {}, options = {}) {
  const configuration = getVariationProductionConfiguration(variation, template);
  const defaultArea = options.area || options.defaultPrintArea || {};
  const configuredArea = matchingConfigurationArea(configuration, defaultArea, options.printOption || options.option || {});
  const configuredScreen = matchingConfigurationScreen(configuration, options.screen || {}, configuredArea || defaultArea);
  const printAreaOverride = configuredArea
    ? normalisePrintAreaGeometry({
        ...configuredArea,
        id: defaultArea.id || configuredArea.id,
        screen_id: defaultArea.screen_id || configuredArea.screen_id,
      })
    : disabledRuntimeArea(defaultArea);
  const imageUrl = firstTruthy(
    configuredScreen.image_url,
    variation.image_url,
    template.product_image_url,
    template.mockup_url,
    safeArray(template.mockup_images)[0]
  );
  const platformBlankCost = Number(
    variation.platform_blank_cost
      || variation.base_blank_cost
      || variation.cost
      || template.platform_blank_cost
      || template.base_blank_cost
      || template.base_price
      || 0
  );
  const creatorBlankPrice = Number(
    variation.creator_blank_price
      || template.creator_blank_price
      || platformBlankCost * 1.1
      || 0
  );

  return {
    variation,
    matchingRules: [],
    productionConfiguration: configuration,
    imageUrl,
    viewImageUrl: imageUrl,
    canvasImageUrl: imageUrl,
    printAreaOverride,
    printAreaGeometry: printAreaOverride,
    platformBlankCost,
    creatorBlankPrice,
    sourceMap: {
      image: "variation production configuration",
      viewImage: "variation production configuration",
      printArea: configuredArea ? "variation production configuration" : "variation production configuration: unavailable",
      blankCost: "exact variation",
      creatorBlankPrice: "exact variation",
    },
  };
}

export function resolveEffectiveProductionSetup(
  template = {},
  variation = {},
  options = {}
) {
  if (hasStoredProductionConfiguration(variation)) {
    return resolveStoredVariationConfiguration(template, variation, options);
  }

  const screen = options.screen || {};
  const defaultArea = options.area || options.defaultPrintArea || {};
  const rules = matchingProductionRules(template, variation);
  const sourceMap = {};

  let imageUrl = firstTruthy(
    template.product_image_url,
    template.mockup_url,
    safeArray(template.mockup_images)[0],
    screen.image_url
  );
  sourceMap.image = imageUrl ? "template" : "none";

  let viewImageUrl = firstTruthy(
    screen.image_url,
    template.product_image_url,
    template.mockup_url,
    safeArray(template.mockup_images)[0]
  );
  sourceMap.viewImage = viewImageUrl ? "template" : "none";

  let printAreaOverride = normalisePrintAreaGeometry(defaultArea);
  sourceMap.printArea = hasUsablePrintArea(printAreaOverride)
    ? "template"
    : "none";

  let platformBlankCost = Number(
    template.platform_blank_cost
      || template.base_blank_cost
      || template.base_price
      || 0
  );
  let creatorBlankPrice = Number(
    template.creator_blank_price
      || platformBlankCost * 1.1
      || 0
  );
  sourceMap.blankCost = platformBlankCost ? "template" : "none";
  sourceMap.creatorBlankPrice = creatorBlankPrice ? "template" : "none";

  rules.forEach((rule) => {
    const ruleName = ruleLabel(rule);
    const ruleViewImage =
      screenOverrideUrl(rule, screen)
      || rule.image_url
      || rule.product_image_url
      || rule.mockup_image_url;

    if (ruleViewImage) {
      viewImageUrl = ruleViewImage;
      imageUrl = ruleViewImage;
      sourceMap.viewImage = ruleName;
      sourceMap.image = ruleName;
    }

    const ruleArea = areaOverrideForSource(rule, defaultArea);
    if (Object.keys(ruleArea).length) {
      printAreaOverride = normalisePrintAreaGeometry(
        mergeDefined(printAreaOverride, ruleArea)
      );
      sourceMap.printArea = ruleName;
    }

    if (rule.platform_blank_cost || rule.base_blank_cost || rule.cost) {
      platformBlankCost = Number(
        rule.platform_blank_cost
          || rule.base_blank_cost
          || rule.cost
          || platformBlankCost
      );
      sourceMap.blankCost = ruleName;
    }

    if (rule.creator_blank_price) {
      creatorBlankPrice = Number(rule.creator_blank_price);
      sourceMap.creatorBlankPrice = ruleName;
    }
  });

  const variationImage = firstTruthy(
    variation.image_url,
    variation.product_image_url,
    variation.mockup_image_url
  );

  if (variationImage) {
    imageUrl = variationImage;
    if (!viewImageUrl) viewImageUrl = variationImage;
    sourceMap.image = "exact variation";
  }

  const variationViewImage = screenOverrideUrl(variation, screen);
  if (variationViewImage) {
    viewImageUrl = variationViewImage;
    imageUrl = variationViewImage;
    sourceMap.viewImage = "exact variation";
    sourceMap.image = "exact variation";
  }

  const variationArea = areaOverrideForSource(variation, defaultArea);
  if (Object.keys(variationArea).length) {
    printAreaOverride = normalisePrintAreaGeometry(
      mergeDefined(printAreaOverride, variationArea)
    );
    sourceMap.printArea = "exact variation";
  }

  const widthMm = firstTruthy(
    printAreaOverride.width_mm,
    variation.print_width_mm,
    variation.width_mm,
    variation.print_area_width_mm
  );
  const heightMm = firstTruthy(
    printAreaOverride.height_mm,
    variation.print_height_mm,
    variation.height_mm,
    variation.print_area_height_mm
  );

  if (widthMm) printAreaOverride.width_mm = Number(widthMm);
  if (heightMm) printAreaOverride.height_mm = Number(heightMm);
  printAreaOverride = normalisePrintAreaGeometry(printAreaOverride);

  if (
    variation.platform_blank_cost
    || variation.base_blank_cost
    || variation.cost
  ) {
    platformBlankCost = Number(
      variation.platform_blank_cost
        || variation.base_blank_cost
        || variation.cost
        || platformBlankCost
    );
    sourceMap.blankCost = "exact variation";
  }

  if (variation.creator_blank_price) {
    creatorBlankPrice = Number(variation.creator_blank_price);
    sourceMap.creatorBlankPrice = "exact variation";
  }

  return {
    variation,
    matchingRules: rules,
    imageUrl,
    viewImageUrl,
    canvasImageUrl: viewImageUrl || imageUrl,
    printAreaOverride,
    printAreaGeometry: printAreaOverride,
    platformBlankCost,
    creatorBlankPrice,
    sourceMap,
  };
}

export function resolveEffectivePrintAreas(template = {}, variation = {}) {
  if (hasStoredProductionConfiguration(variation)) {
    const configuration = getVariationProductionConfiguration(variation, template);
    return activeRows(configuration.print_areas).map((area) => {
      const screen = matchingConfigurationScreen(configuration, {}, area);
      return {
        ...area,
        effective_source: "variation production configuration",
        effective_image_url: screen.image_url || variation.image_url || template.product_image_url || "",
      };
    });
  }

  const areas = activeTemplatePrintAreas(template);

  if (!areas.length) {
    const setup = resolveEffectiveProductionSetup(
      template,
      variation,
      { defaultPrintArea: {} }
    );

    return hasUsablePrintArea(setup.printAreaOverride)
      ? [setup.printAreaOverride]
      : [];
  }

  return areas.map((area) => {
    const screen = safeArray(template.mockup_screens).find(
      (item) =>
        item.id === area.screen_id
        || item.view_key === area.view_key
        || item.view === area.screen_view
    );

    const setup = resolveEffectiveProductionSetup(
      template,
      variation,
      {
        area,
        defaultPrintArea: area,
        screen: screen || {},
      }
    );

    return {
      ...area,
      ...setup.printAreaOverride,
      effective_source: setup.sourceMap.printArea,
      effective_image_url: setup.canvasImageUrl,
    };
  });
}

export function templatePrintAreaCoverage(template = {}) {
  const variations = activeTemplateVariations(template);
  const rows = variations.length ? variations : [{}];

  const coverage = rows.map((variation) => {
    const effectiveAreas = resolveEffectivePrintAreas(template, variation);
    const configured = effectiveAreas.some(hasUsablePrintArea);

    return {
      variation_id: variation.id || null,
      variation_label: variations.length
        ? variationLabel(variation)
        : "Single product",
      configured,
      effective_areas: effectiveAreas,
    };
  });

  return {
    total: coverage.length,
    configured: coverage.filter((row) => row.configured).length,
    complete: coverage.every((row) => row.configured),
    rows: coverage,
  };
}

export function resolveTemplateArtworkModes(template = {}) {
  const explicit = safeArray(template.artwork_modes).filter(Boolean);
  if (explicit.length) return explicit;

  const variations = activeTemplateVariations(template);
  const areas = variations.length
    ? variations.flatMap((variation) => activeTemplatePrintAreas(template, variation))
    : activeTemplatePrintAreas(template);
  const keys = areas.map((area) =>
    normaliseProductionKey(
      area.area_key || area.view_key || area.screen_view
    )
  );

  const modes = [];
  if (keys.some((key) => key.includes("wrap"))) {
    modes.push("full_wrap");
  }
  if (keys.some((key) => key === "front") && keys.some((key) => key === "back")) {
    modes.push("front_back");
  }
  if (!modes.length) modes.push("single_area");

  return modes;
}
