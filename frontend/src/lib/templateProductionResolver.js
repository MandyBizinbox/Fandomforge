import { safeArray } from "../components/template-studio/templateStudioUtils";
import {
  hasUsablePrintArea,
  normalisePrintAreaGeometry,
} from "./printAreaGeometry";

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

export function activeTemplatePrintAreas(template = {}) {
  return safeArray(template.print_areas).filter(
    (area) =>
      area
      && area.status !== "archived"
      && !area.archived
      && !area.deleted
  );
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
    if (value && typeof value === "object") return value;
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

export function resolveEffectiveProductionSetup(
  template = {},
  variation = {},
  options = {}
) {
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

  const keys = activeTemplatePrintAreas(template).map((area) =>
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
