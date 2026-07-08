import { safeArray } from "../components/template-studio/templateStudioUtils";

export function normaliseProductionKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function variationLabel(variation = {}) {
  const values = Object.values(variation.attributes || {}).filter(Boolean);
  return values.length ? values.join(" / ") : variation.sku || variation.supplier_sku || variation.id || "Variation";
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
  return conditions.map((condition) => `${condition.attribute_key || "Attribute"} = ${condition.attribute_value || "Value"}`).join(" + ");
}

export function ruleMatchesVariation(rule = {}, variation = {}) {
  if (rule.enabled === false || rule.status === "archived") return false;
  const conditions = safeArray(rule.conditions);
  if (!conditions.length) return false;

  return conditions.every((condition) => {
    const actual = variationAttributeValue(variation, condition.attribute_key);
    return normaliseProductionKey(actual) === normaliseProductionKey(condition.attribute_value);
  });
}

export function matchingProductionRules(template = {}, variation = {}) {
  return safeArray(template.variation_production_rules || template.production_rules)
    .filter((rule) => ruleMatchesVariation(rule, variation))
    .sort((a, b) => safeArray(a.conditions).length - safeArray(b.conditions).length);
}

function firstTruthy(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "") || "";
}

function mergeDefined(base = {}, patch = {}) {
  const merged = { ...base };
  Object.entries(patch || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") merged[key] = value;
  });
  return merged;
}

export function screenOverrideUrl(source = {}, screen = {}) {
  const overrides = source.mockup_screen_overrides || source.view_overrides || {};
  return firstTruthy(
    overrides[screen.id],
    overrides[screen.view_key],
    overrides[screen.name],
    overrides[screen.screen_view]
  );
}

export function resolveEffectiveProductionSetup(template = {}, variation = {}, options = {}) {
  const screen = options.screen || {};
  const rules = matchingProductionRules(template, variation);
  const sourceMap = {};

  let imageUrl = firstTruthy(template.product_image_url, template.mockup_url, screen.image_url);
  sourceMap.image = imageUrl ? "template" : "none";

  let viewImageUrl = firstTruthy(screen.image_url, template.product_image_url, template.mockup_url);
  sourceMap.viewImage = viewImageUrl ? "template" : "none";

  let printAreaOverride = { ...(options.defaultPrintArea || {}) };
  sourceMap.printArea = Object.keys(printAreaOverride).length ? "template" : "none";

  let platformBlankCost = Number(template.platform_blank_cost || template.base_blank_cost || template.base_price || 0);
  let creatorBlankPrice = Number(template.creator_blank_price || platformBlankCost * 1.1 || 0);
  sourceMap.blankCost = platformBlankCost ? "template" : "none";
  sourceMap.creatorBlankPrice = creatorBlankPrice ? "template" : "none";

  rules.forEach((rule) => {
    const ruleName = ruleLabel(rule);
    const ruleViewImage = screenOverrideUrl(rule, screen) || rule.image_url || rule.product_image_url || rule.mockup_image_url;
    if (ruleViewImage) {
      viewImageUrl = ruleViewImage;
      imageUrl = ruleViewImage;
      sourceMap.viewImage = ruleName;
      sourceMap.image = ruleName;
    }

    const ruleArea = rule.print_area_overrides?.default || rule.print_area_override || {};
    if (Object.keys(ruleArea).length) {
      printAreaOverride = mergeDefined(printAreaOverride, ruleArea);
      sourceMap.printArea = ruleName;
    }

    if (rule.platform_blank_cost || rule.base_blank_cost || rule.cost) {
      platformBlankCost = Number(rule.platform_blank_cost || rule.base_blank_cost || rule.cost || platformBlankCost);
      sourceMap.blankCost = ruleName;
    }

    if (rule.creator_blank_price) {
      creatorBlankPrice = Number(rule.creator_blank_price);
      sourceMap.creatorBlankPrice = ruleName;
    }
  });

  const variationImage = firstTruthy(variation.image_url, variation.product_image_url, variation.mockup_image_url);
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

  const variationArea = variation.print_area_overrides?.default || {};
  if (Object.keys(variationArea).length) {
    printAreaOverride = mergeDefined(printAreaOverride, variationArea);
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

  if (widthMm) printAreaOverride.width_mm = widthMm;
  if (heightMm) printAreaOverride.height_mm = heightMm;

  if (variation.platform_blank_cost || variation.base_blank_cost || variation.cost) {
    platformBlankCost = Number(variation.platform_blank_cost || variation.base_blank_cost || variation.cost || platformBlankCost);
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
    platformBlankCost,
    creatorBlankPrice,
    sourceMap,
  };
}
