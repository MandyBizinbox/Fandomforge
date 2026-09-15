import {
  activeTemplateVariations,
  templatePrintAreaCoverage,
} from "./templateProductionResolver";
import {
  normaliseKey,
  safeArray,
  templatePricingInfo,
} from "./cataloguePricingUtils";

function firstTruthy(...values) {
  return values.find(
    (value) => value !== undefined && value !== null && value !== ""
  ) || "";
}

function firstVariationOverrideImage(variation = {}) {
  return Object.values(variation.mockup_screen_overrides || {}).find(Boolean) || "";
}

export function templateImage(template = {}) {
  const gallery = safeArray(template.template_gallery)
    .filter((row) => row && row.status !== "archived" && row.image_url)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));

  const galleryPrimary = gallery.find((row) => row.is_primary)?.image_url;
  const galleryCatalogue = gallery.find(
    (row) => row.role === "catalogue_thumbnail"
  )?.image_url;
  const galleryCreator = gallery.find(
    (row) => row.role === "creator_selection"
  )?.image_url;

  return firstTruthy(
    galleryPrimary,
    galleryCatalogue,
    galleryCreator,
    template.creator_catalogue_thumbnail_url,
    template.product_image_url,
    template.mockup_url,
    safeArray(template.mockup_images)[0],
    activeTemplateVariations(template).find((variation) => variation.image_url)?.image_url,
    activeTemplateVariations(template)
      .map(firstVariationOverrideImage)
      .find(Boolean),
    safeArray(template.mockup_screens)
      .find((screen) => screen.status !== "archived" && screen.image_url)
      ?.image_url
  );
}

export function templateHasVariationImage(variation = {}) {
  return Boolean(
    variation.image_url
    || variation.product_image_url
    || variation.mockup_image_url
    || firstVariationOverrideImage(variation)
  );
}

export function templateBlankCost(template = {}) {
  const variationCosts = activeTemplateVariations(template)
    .map((variation) => Number(
      variation.creator_blank_price
      ?? variation.base_blank_cost
      ?? variation.platform_blank_cost
      ?? variation.cost
      ?? 0
    ))
    .filter((value) => value > 0);

  if (variationCosts.length) return Math.min(...variationCosts);

  return Number(
    template.creator_blank_price
    ?? template.base_blank_cost
    ?? template.base_price
    ?? template.platform_blank_cost
    ?? 0
  );
}

export function activeTemplateScreens(template = {}) {
  return safeArray(template.mockup_screens).filter(
    (screen) =>
      screen
      && screen.status !== "archived"
      && !screen.archived
      && !screen.deleted
  );
}

export function activeTemplateGallery(template = {}) {
  return safeArray(template.template_gallery).filter(
    (row) =>
      row
      && row.status !== "archived"
      && !row.archived
      && !row.deleted
      && row.image_url
  );
}

export function templateReadiness(template = {}, globalPrintOptions = []) {
  const enabledVariations = activeTemplateVariations(template);
  const activeScreens = activeTemplateScreens(template);
  const gallery = activeTemplateGallery(template);
  const pricingInfo = templatePricingInfo(template, globalPrintOptions);
  const coverage = pricingInfo.printAreaCoverage || templatePrintAreaCoverage(template);
  const blankCost = templateBlankCost(template);
  const statusKey = normaliseKey(template.status);

  const hasTemplateImageFallback = Boolean(
    activeScreens.some((screen) => screen.image_url)
    || gallery.some((row) => row.image_url)
    || template.product_image_url
    || template.mockup_url
    || safeArray(template.mockup_images)[0]
  );

  const hasMockupRole = gallery.some((row) =>
    [
      "front_mockup",
      "back_mockup",
      "side_mockup",
      "angled_mockup",
      "catalogue_thumbnail",
      "creator_selection",
    ].includes(row.role)
  );

  const checks = {
    mainImage: Boolean(templateImage(template)),
    variationImages:
      enabledVariations.length === 0
      || hasTemplateImageFallback
      || enabledVariations.every(templateHasVariationImage),
    blankCost: blankCost > 0,
    activePrintMethod: pricingInfo.activeOptions.length > 0,
    printAreas: coverage.total > 0 && coverage.complete,
    printAreaViews: activeScreens.length > 0,
    mockup: Boolean(
      hasMockupRole
      || template.mockup_url
      || safeArray(template.mockup_images)[0]
      || activeScreens.some((screen) => screen.image_url)
    ),
    creatorPricing: pricingInfo.hasPricing && blankCost > 0,
    creatorVisible: template.creator_visible !== false,
    adminVisible: template.admin_visible !== false,
  };

  const missing = [];
  if (!checks.mainImage) missing.push("image");
  if (!checks.variationImages) missing.push("variation images");
  if (!checks.blankCost) missing.push("blank cost");
  if (!checks.activePrintMethod) missing.push("V1 print method");
  if (!checks.printAreas) missing.push("print areas");
  if (!checks.printAreaViews) missing.push("print area views");
  if (!checks.mockup) missing.push("mockups");
  if (!checks.creatorPricing) missing.push("creator pricing");
  if (!checks.creatorVisible) missing.push("creator visibility");

  const pricingReady =
    checks.blankCost
    && checks.activePrintMethod
    && checks.creatorPricing;
  const launchReady =
    statusKey === "launch ready"
    || statusKey === "launch_ready"
    || (
      statusKey === "active"
      && missing.length === 0
    );

  let label = "Draft";
  if (statusKey === "inactive" || statusKey === "archived") {
    label = "Inactive";
  } else if (!checks.creatorVisible && statusKey === "active") {
    label = "Hidden from creators";
  } else if (launchReady) {
    label = "Launch ready";
  } else if (!checks.mainImage) {
    label = "Needs images";
  } else if (!checks.variationImages) {
    label = "Needs variation images";
  } else if (!checks.printAreas || !checks.printAreaViews) {
    label = "Needs print areas";
  } else if (!checks.blankCost || !checks.creatorPricing) {
    label = "Needs pricing";
  } else if (!checks.mockup) {
    label = "Needs mockups";
  } else if (pricingReady) {
    label = "Pricing ready";
  }

  return {
    checks,
    missing,
    pricingReady,
    launchReady,
    isLaunchReady: launchReady,
    label,
    activeMethods: pricingInfo.activeOptions,
    options: pricingInfo.activeOptions,
    pricingInfo,
    bands: pricingInfo.bands,
    printAreaCoverage: coverage,
    blankCost,
  };
}
