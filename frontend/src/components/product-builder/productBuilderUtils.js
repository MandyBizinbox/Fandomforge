export function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.results)) return value.results;
  return [];
}

export function money(value) {
  return `R ${Number(value || 0).toFixed(2)}`;
}

export function makeId(prefix = "id") {
  return `${prefix}-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`;
}

export function getTemplateImage(template, selectedArea) {
  if (!template) return "";

  if (selectedArea?.screen_id) {
    const screen = asArray(template.mockup_screens).find((item) => item.id === selectedArea.screen_id);
    if (screen?.image_url) return screen.image_url;
  }

  const primary = asArray(template.mockup_screens).find((item) => item.is_primary && item.image_url);
  if (primary?.image_url) return primary.image_url;

  const firstScreen = asArray(template.mockup_screens).find((item) => item.image_url);
  if (firstScreen?.image_url) return firstScreen.image_url;

  return template.product_image_url || template.mockup_url || asArray(template.mockup_images)[0] || "";
}

export function getVariationAttributes(variation) {
  return variation?.attributes || variation?.attribute_values || {};
}

export function getAttrValue(variation, keys) {
  const attrs = getVariationAttributes(variation);
  const candidates = Array.isArray(keys) ? keys : [keys];
  for (const key of candidates) {
    const direct = attrs[key];
    if (direct !== undefined && direct !== null && String(direct).trim() !== "") return String(direct);
    const foundKey = Object.keys(attrs).find((item) => item.toLowerCase() === String(key).toLowerCase());
    if (foundKey && attrs[foundKey] !== undefined && attrs[foundKey] !== null) return String(attrs[foundKey]);
  }
  return "";
}

export function getVariationColour(variation) {
  return getAttrValue(variation, ["Colour", "Color", "colour", "color"]) || variation?.color || "Default";
}

export function getVariationSize(variation) {
  return getAttrValue(variation, ["Size", "size"]) || variation?.size || "One Size";
}

const ATTRIBUTE_ALIASES = {
  Size: ["Size", "size", "Sizes", "sizes"],
  Colour: ["Colour", "Color", "colour", "color"],
  Capacity: ["Capacity", "capacity", "Volume", "volume", "ml", "ML"],
  Material: ["Material", "material", "Fabric", "fabric"],
  Shape: ["Shape", "shape"],
  Pieces: ["Pieces", "pieces", "Piece Count", "piece_count"],
  Format: ["Format", "format", "Type", "type"],
  Finish: ["Finish", "finish"],
  Style: ["Style", "style"],
  Fit: ["Fit", "fit", "Cut", "cut"],
  Closure: ["Closure", "closure"],
  Dimensions: ["Dimensions", "dimensions", "Dimension", "dimension"],
  AgeGroup: ["Age Group", "age_group", "Age", "age", "Audience", "audience"],
};

const DISPLAY_ATTRIBUTE_LABELS = {
  Size: "Sizes",
  Colour: "Colours",
  Capacity: "Capacity",
  Material: "Material",
  Shape: "Shapes",
  Pieces: "Pieces",
  Format: "Formats",
  Finish: "Finish",
  Style: "Styles",
  Fit: "Fit",
  Closure: "Closure",
  Dimensions: "Dimensions",
  AgeGroup: "Age groups",
};

const ATTRIBUTE_PRIORITY = ["Size", "Colour", "Capacity", "Material", "Shape", "Pieces", "Format", "Finish", "Style", "Fit", "Closure", "Dimensions", "AgeGroup"];
const ADULT_SIZE_ORDER = ["XXS", "XS", "S", "SMALL", "M", "MEDIUM", "L", "LARGE", "XL", "XXL", "2XL", "XXXL", "3XL", "XXXXL", "4XL", "5XL", "6XL", "7XL", "8XL"];
const ADULT_SIZE_LABELS = { SMALL: "Small", MEDIUM: "Medium", LARGE: "Large", XXL: "2XL", XXXL: "3XL", XXXXL: "4XL" };

function uniqCompact(values) {
  return [...new Set(asArray(values).map((value) => String(value || "").trim()).filter(Boolean))];
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function canonicalAttributeKey(key) {
  const normalized = normalizeKey(key);
  for (const [canonical, aliases] of Object.entries(ATTRIBUTE_ALIASES)) {
    if (aliases.some((alias) => normalizeKey(alias) === normalized)) return canonical;
  }
  return String(key || "").trim();
}

function getAttributeLabel(key) {
  const canonical = canonicalAttributeKey(key);
  return DISPLAY_ATTRIBUTE_LABELS[canonical] || canonical || "Attributes";
}

function canonicalSizeValue(value) {
  const raw = String(value || "").trim();
  const upper = raw.toUpperCase();
  return ADULT_SIZE_LABELS[upper] || raw;
}

function adultSizeIndex(value) {
  const upper = String(value || "").trim().toUpperCase();
  return ADULT_SIZE_ORDER.indexOf(upper);
}

function kidsSizeStart(value) {
  const match = String(value || "").match(/(\d{1,2})\s*[-–]\s*(\d{1,2})/);
  return match ? Number(match[1]) : null;
}

function sortSizeValues(values) {
  return [...values].sort((a, b) => {
    const aAdult = adultSizeIndex(a);
    const bAdult = adultSizeIndex(b);
    if (aAdult !== -1 && bAdult !== -1) return aAdult - bAdult;
    if (aAdult !== -1) return -1;
    if (bAdult !== -1) return 1;

    const aKids = kidsSizeStart(a);
    const bKids = kidsSizeStart(b);
    if (aKids !== null && bKids !== null) return aKids - bKids;
    if (aKids !== null) return -1;
    if (bKids !== null) return 1;

    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  });
}

function sortByPriority(keys) {
  return [...keys].sort((a, b) => {
    const aIndex = ATTRIBUTE_PRIORITY.indexOf(canonicalAttributeKey(a));
    const bIndex = ATTRIBUTE_PRIORITY.indexOf(canonicalAttributeKey(b));
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return String(a).localeCompare(String(b));
  });
}

export function getVariationAttributeValue(variation, aliases) {
  const candidates = Array.isArray(aliases) ? aliases : ATTRIBUTE_ALIASES[aliases] || [aliases];
  const fromAttrs = getAttrValue(variation, candidates);
  if (fromAttrs) return fromAttrs;

  for (const key of candidates) {
    const direct = variation?.[key];
    if (direct !== undefined && direct !== null && String(direct).trim() !== "") return String(direct);
    const normalized = normalizeKey(key);
    const foundKey = Object.keys(variation || {}).find((item) => normalizeKey(item) === normalized);
    if (foundKey && variation[foundKey] !== undefined && variation[foundKey] !== null && String(variation[foundKey]).trim() !== "") {
      return String(variation[foundKey]);
    }
  }

  return "";
}

export function getTemplateVariationAttributeKeys(template) {
  const keys = [];
  asArray(template?.variations).forEach((variation) => {
    Object.keys(getVariationAttributes(variation)).forEach((key) => keys.push(key));
    ["size", "color", "colour"].forEach((key) => {
      if (variation?.[key]) keys.push(key);
    });
  });
  return sortByPriority([...new Set(keys)]);
}

export function classifySizeGroup(size) {
  const value = String(size || "").trim();
  const normalized = value.toLowerCase();
  if (!value || normalized === "one size" || normalized === "default") return "Other";
  if (/\b(kids?|child|children)\b/.test(normalized) || kidsSizeStart(value) !== null) return "Kids";
  if (/\b(youth|junior|teen)\b/.test(normalized)) return "Youth / Teen";
  if (/\b(adult|mens|men's|ladies|women's|unisex)\b/.test(normalized) || adultSizeIndex(value) !== -1) return "Adults";
  return "Other";
}

export function sortAttributeValues(values, attributeKey) {
  const canonical = canonicalAttributeKey(attributeKey);
  const unique = uniqCompact(values);
  if (canonical === "Size") return sortSizeValues(unique).map(canonicalSizeValue);
  if (canonical === "Pieces" || canonical === "Capacity") {
    return [...unique].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" }));
  }
  return [...unique].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" }));
}

export function formatAttributeRange(values, attributeKey) {
  const canonical = canonicalAttributeKey(attributeKey);
  const sorted = sortAttributeValues(values, canonical);
  if (!sorted.length) return "";
  if (canonical === "Size" && sorted.length > 1) return `${sorted[0]}-${sorted[sorted.length - 1]}`;
  if (["Colour", "Shape", "Format", "Style", "AgeGroup"].includes(canonical) && sorted.length > 3) return String(sorted.length);
  if (sorted.length <= 4) return sorted.join(", ");
  return `${sorted.slice(0, 3).join(", ")} +${sorted.length - 3}`;
}

export function getTemplateShortDescription(template) {
  return [template?.description, template?.category, template?.brand]
    .map((value) => String(value || "").trim())
    .find(Boolean) || "Product option";
}

export function getTemplateSizeSummary(template) {
  const byGroup = { Adults: [], Kids: [], "Youth / Teen": [], Other: [] };
  asArray(template?.variations).forEach((variation) => {
    const size = getVariationAttributeValue(variation, "Size") || getVariationSize(variation);
    if (!size || size === "One Size") return;
    byGroup[classifySizeGroup(size)].push(size);
  });

  const lines = [];
  Object.entries(byGroup).forEach(([group, values]) => {
    const sorted = sortAttributeValues(values, "Size");
    if (!sorted.length) return;
    if (group === "Other") {
      lines.push(`Sizes: ${formatAttributeRange(sorted, "Size")}`);
      return;
    }
    lines.push(`${group}: ${formatAttributeRange(sorted, "Size")}`);
  });
  return lines;
}

export function getTemplateColourSummary(template) {
  const colours = sortAttributeValues(asArray(template?.variations).map((variation) => getVariationAttributeValue(variation, "Colour") || getVariationColour(variation)).filter((value) => value && value !== "Default"), "Colour");
  if (!colours.length) return "";
  return colours.length > 3 ? `Colours: ${colours.length}` : `Colours: ${colours.join(", ")}`;
}

function collectAttributeValues(template) {
  const valuesByKey = new Map();
  asArray(template?.variations).forEach((variation) => {
    Object.entries(getVariationAttributes(variation)).forEach(([key, value]) => {
      if (value === undefined || value === null || String(value).trim() === "") return;
      const canonical = canonicalAttributeKey(key);
      if (!valuesByKey.has(canonical)) valuesByKey.set(canonical, []);
      valuesByKey.get(canonical).push(String(value));
    });

    [["Size", getVariationAttributeValue(variation, "Size")], ["Colour", getVariationAttributeValue(variation, "Colour")]].forEach(([key, value]) => {
      if (!value) return;
      if (!valuesByKey.has(key)) valuesByKey.set(key, []);
      valuesByKey.get(key).push(value);
    });
  });
  return valuesByKey;
}

export function getTemplateAvailableOptionsSummary(template) {
  const variations = asArray(template?.variations).filter((variation) => variation.enabled !== false && variation.status !== "archived");
  const valuesByKey = collectAttributeValues({ ...template, variations });
  const lines = [];

  getTemplateSizeSummary({ ...template, variations }).forEach((line) => lines.push(line));
  const colourLine = getTemplateColourSummary({ ...template, variations });
  if (colourLine) lines.push(colourLine);

  sortByPriority([...valuesByKey.keys()])
    .filter((key) => !["Size", "Colour"].includes(canonicalAttributeKey(key)))
    .forEach((key) => {
      if (lines.length >= 4) return;
      const label = getAttributeLabel(key);
      const formatted = formatAttributeRange(valuesByKey.get(key), key);
      if (formatted) lines.push(`${label}: ${formatted}`);
    });

  if (variations.length) lines.push(`${variations.length} total ${variations.length === 1 ? "option" : "options"}`);

  if (!lines.length && variations.length) {
    const keys = getTemplateVariationAttributeKeys(template).map(getAttributeLabel);
    return [`Options: ${variations.length}`, keys.length ? `Attributes: ${keys.join(", ")}` : "Attribute data incomplete"];
  }

  if (!lines.length) return ["Options pending", "Attribute data incomplete"];
  return lines.slice(0, 5);
}

export function getTemplateOptionSummary(template) {
  return getTemplateAvailableOptionsSummary(template).join(" · ");
}

export function getTemplateSizeRange(template) {
  const firstSizeLine = getTemplateSizeSummary(template)[0];
  return firstSizeLine ? firstSizeLine.replace(/^[^:]+:\s*/, "Sizes ") : "";
}

export function getTemplateColourCount(template) {
  const colours = uniqCompact(asArray(template?.variations).map((variation) => getVariationAttributeValue(variation, "Colour") || getVariationColour(variation)).filter((colour) => colour !== "Default"));
  return colours.length;
}

export function getTemplateAttributeRange(template) {
  return getTemplateOptionSummary(template);
}

export function getVariationSizeGroupSections(variations) {
  const groups = [];
  const byGroup = new Map();
  asArray(variations).forEach((variation) => {
    const group = classifySizeGroup(getVariationSize(variation));
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group).push(variation);
  });

  ["Adults", "Kids", "Youth / Teen", "Other"].forEach((group) => {
    const items = byGroup.get(group) || [];
    if (!items.length) return;
    const sizes = sortSizeValues(uniqCompact(items.map(getVariationSize)));
    const { rows } = getVariationMatrix(items);
    groups.push({ group, label: group === "Other" ? "Other sizes" : `${group} sizes`, sizes, rows, items });
  });

  return groups;
}

export function getVariationLabel(variation) {
  const attrs = getVariationAttributes(variation);
  const label = Object.entries(attrs)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" / ");

  return label || [variation?.size, variation?.color].filter(Boolean).join(" / ") || variation?.sku || "Variation";
}

export function getCreatorBlankPrice(source, template) {
  const value = source?.creator_blank_price ?? template?.creator_blank_price ?? source?.base_price ?? template?.base_price ?? 0;
  return Number(value || 0);
}

export function getVariationCost(variation, template) {
  return getCreatorBlankPrice(variation, template);
}

export function getPrintOptionLabel(option) {
  if (!option) return "Print option";
  return [option.print_method || option.method, option.print_size]
    .filter(Boolean)
    .join(" · ") || option.name || "Print option";
}

export function getPrintOptionCost(option) {
  return Number(option?.print_cost_max || 0);
}

export const DEFAULT_PLATFORM_COMMISSION_RATE = 0.15;

export function resolveCreatorCommissionRate(creatorOrProduct = {}, fallbackRate = DEFAULT_PLATFORM_COMMISSION_RATE) {
  const percent = creatorOrProduct?.platform_commission_rate_percent;
  if (percent !== undefined && percent !== null && percent !== "") {
    const value = Number(percent);
    if (Number.isFinite(value)) return Math.max(0, Math.min(value / 100, 1));
  }

  const rawRate = creatorOrProduct?.commission_rate;
  if (rawRate !== undefined && rawRate !== null && rawRate !== "") {
    const value = Number(rawRate);
    if (Number.isFinite(value)) return Math.max(0, Math.min(value > 1 ? value / 100 : value, 1));
  }

  return fallbackRate;
}

export function resolveCreatorCommissionSource(creatorOrProduct = {}) {
  if (creatorOrProduct?.platform_commission_rate_percent !== undefined && creatorOrProduct?.platform_commission_rate_percent !== null && creatorOrProduct?.platform_commission_rate_percent !== "") {
    return creatorOrProduct?.platform_commission_source || "creator_override";
  }
  if (creatorOrProduct?.commission_rate !== undefined && creatorOrProduct?.commission_rate !== null && creatorOrProduct?.commission_rate !== "") {
    const rate = resolveCreatorCommissionRate(creatorOrProduct);
    return Math.abs(rate - DEFAULT_PLATFORM_COMMISSION_RATE) >= 0.0001 ? "creator_override" : "default";
  }
  return "default";
}

export function getEffectivePricingStatus(product = {}, pricing = {}) {
  if (product?.pricing_override_approved || pricing?.pricingOverrideApproved) return "override_approved";
  if (pricing?.canPublishProfitably) return "approved";
  if (product?.requires_creator_pricing_approval || product?.creator_pricing_approval_status === "pending_creator_approval") return "pending_creator_approval";
  if (Number(product?.estimated_creator_profit || pricing?.profit || 0) < 0) return "price_below_minimum";
  return product?.creator_pricing_approval_status || "not_required";
}

export function hasEffectivePricingBlocker(product = {}, pricing = {}) {
  return ["pending_creator_approval", "price_below_minimum", "rejected"].includes(getEffectivePricingStatus(product, pricing));
}

export function effectivePricingStatusLabel(product = {}, pricing = {}) {
  const status = getEffectivePricingStatus(product, pricing);
  if (status === "override_approved") return "Override approved";
  if (status === "approved") return "Approved";
  if (status === "pending_creator_approval") return "Pending creator approval";
  if (status === "price_below_minimum") return "Price below minimum";
  if (status === "not_required") return "Not required";
  return String(status || "Review may be required").replace(/_/g, " ");
}

export function calculatePricing({ sellingPrice = 0, blankCost = 0, printCost = 0, commissionRate = DEFAULT_PLATFORM_COMMISSION_RATE, commissionSource = "default", pricingOverrideApproved = false }) {
  const price = Number(sellingPrice || 0);
  const blankPayout = Math.round(Number(blankCost || 0) * 100) / 100;
  const printPayout = Math.round(Number(printCost || 0) * 100) / 100;
  const production = Math.round((blankPayout + printPayout) * 100) / 100;
  const rate = Number(commissionRate || 0);
  const commission = Math.round(price * rate * 100) / 100;
  const profit = Math.round((price - production - commission) * 100) / 100;
  const minimumSellingPrice = rate >= 1 ? production : Math.ceil((production / (1 - rate)) * 100) / 100;

  return {
    blank: blankPayout,
    blankSupplierCost: blankPayout,
    print: printPayout,
    platformPrintCost: printPayout,
    production,
    rate,
    commissionSource,
    commission,
    profit,
    minimumSellingPrice,
    pricingOverrideApproved: Boolean(pricingOverrideApproved),
    canPublishProfitably: price > 0 && profit >= 0,
    canPublishWithOverride: price > 0 && (profit >= 0 || pricingOverrideApproved),
  };
}

export function buildProductVariations(template, selectedIds, priceOverrides = {}) {
  const templateVars = asArray(template?.variations);
  const ids = selectedIds?.length ? selectedIds : templateVars.map((item) => item.id);

  return templateVars
    .filter((item) => ids.includes(item.id))
    .map((item) => {
      const rawOverride = priceOverrides?.[item.id];
      const priceOverride = rawOverride === "" || rawOverride === null || rawOverride === undefined
        ? null
        : Number(rawOverride);

      return {
        id: item.id,
        template_variation_id: item.id,
        sku: item.sku || undefined,
        stock_status: "made_to_order",
        price_override: Number.isFinite(priceOverride) ? priceOverride : null,
        attribute_values: item.attributes || {},
        size: getVariationSize(item),
        color: getVariationColour(item),
      };
    });
}

export function getAreaPreviewImage(template, selectedArea, variationId = "") {
  if (!template) return "";
  const variation = asArray(template?.variations).find((item) => item.id === variationId);

  if (variation?.mockup_screen_overrides && selectedArea?.screen_id) {
    const override = variation.mockup_screen_overrides[selectedArea.screen_id] || variation.mockup_screen_overrides[selectedArea.screen_view];
    if (override) return override;
  }

  if (variation?.image_url) return variation.image_url;

  return getTemplateImage(template, selectedArea);
}

export function getVariationMatrix(variations) {
  const rows = [];
  const sizes = [];
  const byColour = new Map();

  asArray(variations).forEach((variation) => {
    const colour = getVariationColour(variation);
    const size = getVariationSize(variation);
    if (!sizes.includes(size)) sizes.push(size);
    if (!byColour.has(colour)) byColour.set(colour, []);
    byColour.get(colour).push(variation);
  });

  byColour.forEach((items, colour) => rows.push({ colour, items }));

  return {
    colours: rows.map((row) => row.colour),
    sizes,
    rows,
  };
}

export function getSelectedVariations(template, selectedIds) {
  const ids = new Set(asArray(selectedIds));
  return asArray(template?.variations).filter((variation) => ids.has(variation.id));
}

export function getEnabledTemplateVariations(template) {
  return asArray(template?.variations).filter((variation) => variation.enabled !== false && variation.status !== "archived");
}

export function templateHasSelectableVariations(template) {
  return getEnabledTemplateVariations(template).length > 0;
}

export function buildStandardProductVariation(template = {}) {
  const baseCost = getCreatorBlankPrice(template);
  return {
    id: "standard",
    template_variation_id: null,
    label: "Standard",
    sku: template?.blank_sku ? `${template.blank_sku}-STANDARD` : undefined,
    stock_status: "made_to_order",
    price_override: null,
    attribute_values: {},
    attributes: {},
    size: "One Size",
    color: "Default",
    creator_blank_price: baseCost,
    base_price: baseCost,
  };
}

export function createDefaultArtworkGroup() {
  return {
    id: "default-all",
    label: "Default artwork",
    scope_type: "all",
    attribute_key: null,
    attribute_value: null,
    variation_ids: [],
    inherits_from: null,
    artworks: [],
    primary_mockup_image_url: "",
    sort_order: 0,
  };
}

export function createColourArtworkGroups(selectedVariations) {
  const { rows } = getVariationMatrix(selectedVariations);
  return rows.map((row, index) => ({
    id: `colour-${row.colour.toLowerCase().replace(/[^a-z0-9]+/g, "-") || index}`,
    label: row.colour,
    scope_type: "attribute",
    attribute_key: "Colour",
    attribute_value: row.colour,
    variation_ids: row.items.map((variation) => variation.id),
    inherits_from: "default-all",
    artworks: [],
    primary_mockup_image_url: "",
    sort_order: index,
  }));
}

export function createVariationArtworkGroups(selectedVariations) {
  return asArray(selectedVariations).map((variation, index) => ({
    id: `variation-${variation.id}`,
    label: getVariationLabel(variation),
    scope_type: "variation",
    attribute_key: null,
    attribute_value: null,
    variation_ids: [variation.id],
    inherits_from: "default-all",
    artworks: [],
    primary_mockup_image_url: "",
    sort_order: index,
  }));
}

export function getGroupRepresentativeVariationId(group, selectedVariations) {
  if (group?.variation_ids?.length) return group.variation_ids[0];
  return asArray(selectedVariations)[0]?.id || "";
}

export function flattenArtworkGroups(groups) {
  const out = [];
  asArray(groups).forEach((group) => {
    asArray(group.artworks).forEach((artwork) => {
      out.push({ ...artwork, artwork_group_id: group.id, artwork_group_label: group.label });
    });
  });
  return out;
}

export function getUniquePrintCostFromGroups(groups, printOptions, template = {}) {
  let total = 0;

  flattenArtworkGroups(groups).forEach((slot) => {
    if (!slot.print_option_id || !slot.original_url) return;
    total += getPrintCostForArtworkSlot(slot, printOptions, template);
  });

  return Math.round(total * 100) / 100;
}

export function getPrimaryMockupFromGroups(groups) {
  for (const group of asArray(groups)) {
    if (group.primary_mockup_image_url) return group.primary_mockup_image_url;
    const mockup = asArray(group.artworks).find((artwork) => artwork.mockup_image_url)?.mockup_image_url;
    if (mockup) return mockup;
  }
  return "";
}

export function calculateAreaPrintCost(slot = {}, area = {}, option = {}) {
  const calculationType = option.calculation_type || slot.calculation_type || "fixed";

  const placement = slot.placement || {};
  const areaWidthMm = Number(area.width_mm || slot.width_mm || option.width_mm || 0);
  const areaHeightMm = Number(area.height_mm || slot.height_mm || option.height_mm || 0);

  const placementWidthPct = Number(placement.width ?? placement.width_pct ?? 100);
  const placementHeightPct = Number(placement.height ?? placement.height_pct ?? 100);

  const boxWidthMm = areaWidthMm * (placementWidthPct / 100);
  const boxHeightMm = areaHeightMm * (placementHeightPct / 100);

  const artworkWidthPx = Number(slot.original_width_px || slot.artwork_width_px || 0);
  const artworkHeightPx = Number(slot.original_height_px || slot.artwork_height_px || 0);
  const aspectRatio = artworkWidthPx > 0 && artworkHeightPx > 0 ? artworkWidthPx / artworkHeightPx : Number(slot.artwork_aspect_ratio || 0);

  let printWidthMm = boxWidthMm;
  let printHeightMm = boxHeightMm;

  // The preview uses object-contain, so the actual printed image should be the contained image,
  // not the whole placement box. If no image dimensions are known, fall back to the box.
  if (aspectRatio > 0 && boxWidthMm > 0 && boxHeightMm > 0) {
    const boxRatio = boxWidthMm / boxHeightMm;

    if (boxRatio > aspectRatio) {
      printHeightMm = boxHeightMm;
      printWidthMm = printHeightMm * aspectRatio;
    } else {
      printWidthMm = boxWidthMm;
      printHeightMm = printWidthMm / aspectRatio;
    }
  }

  const areaCm2 = (printWidthMm / 10) * (printHeightMm / 10);
  const pricingSource = aspectRatio > 0 && boxWidthMm > 0 && boxHeightMm > 0 ? "actual_artwork_size" : "print_area_fallback";

  if (calculationType === "fixed") {
    const cost = Number(option.print_cost_max || slot.print_cost_max || 0);
    return {
      calculation_type: "fixed",
      placement_box_width_mm: Math.round(boxWidthMm * 10) / 10,
      placement_box_height_mm: Math.round(boxHeightMm * 10) / 10,
      artwork_aspect_ratio: Math.round(aspectRatio * 10000) / 10000,
      print_area_width_mm: Math.round(areaWidthMm * 10) / 10,
      print_area_height_mm: Math.round(areaHeightMm * 10) / 10,
      artwork_width_mm: Math.round(printWidthMm * 10) / 10,
      artwork_height_mm: Math.round(printHeightMm * 10) / 10,
      charged_width_mm: Math.round(printWidthMm * 10) / 10,
      charged_height_mm: Math.round(printHeightMm * 10) / 10,
      charged_area_cm2: Math.round(areaCm2 * 100) / 100,
      pricing_source: pricingSource,
      print_width_mm: Math.round(printWidthMm * 10) / 10,
      print_height_mm: Math.round(printHeightMm * 10) / 10,
      area_cm2: Math.round(areaCm2 * 100) / 100,
      raw_print_cost: Math.round(cost * 100) / 100,
      calculated_print_cost: Math.round(cost * 100) / 100,
    };
  }

  let costPerCm2 = Number(option.cost_per_cm2 || slot.cost_per_cm2 || 0);

  if (calculationType === "area_from_sheet" && !costPerCm2) {
    const sheetWidthCm = Number(option.sheet_width_mm || slot.sheet_width_mm || 0) / 10;
    const sheetHeightCm = Number(option.sheet_height_mm || slot.sheet_height_mm || 0) / 10;
    const sheetAreaCm2 = sheetWidthCm * sheetHeightCm;
    const sheetCost = Number(option.sheet_cost || slot.sheet_cost || 0);
    costPerCm2 = sheetAreaCm2 > 0 ? sheetCost / sheetAreaCm2 : 0;
  }

  let raw = areaCm2 * costPerCm2;
  const waste = Number(option.waste_percentage || slot.waste_percentage || 0);
  const markup = Number(option.markup_percentage || slot.markup_percentage || 0);
  const minimum = Number(option.minimum_print_cost || slot.minimum_print_cost || 0);

  raw = raw * (1 + waste / 100);
  raw = raw * (1 + markup / 100);

  const finalCost = Math.max(raw, minimum);

  return {
    calculation_type: calculationType,
    placement_box_width_mm: Math.round(boxWidthMm * 10) / 10,
    placement_box_height_mm: Math.round(boxHeightMm * 10) / 10,
    artwork_aspect_ratio: Math.round(aspectRatio * 10000) / 10000,
    print_area_width_mm: Math.round(areaWidthMm * 10) / 10,
    print_area_height_mm: Math.round(areaHeightMm * 10) / 10,
    artwork_width_mm: Math.round(printWidthMm * 10) / 10,
    artwork_height_mm: Math.round(printHeightMm * 10) / 10,
    charged_width_mm: Math.round(printWidthMm * 10) / 10,
    charged_height_mm: Math.round(printHeightMm * 10) / 10,
    charged_area_cm2: Math.round(areaCm2 * 100) / 100,
    pricing_source: pricingSource,
    print_width_mm: Math.round(printWidthMm * 10) / 10,
    print_height_mm: Math.round(printHeightMm * 10) / 10,
    area_cm2: Math.round(areaCm2 * 100) / 100,
    raw_print_cost: Math.round(raw * 100) / 100,
    calculated_print_cost: Math.round(finalCost * 100) / 100,
  };
}

export function getPrintCostForArtworkSlot(slot = {}, printOptions = [], template = {}) {
  const option = asArray(printOptions).find((item) => item.id === slot.print_option_id) || slot;
  const area = asArray(template?.print_areas).find((item) => item.id === slot.print_area_id) || {};
  const result = calculateAreaPrintCost(slot, area, option);
  return Number(result.calculated_print_cost || 0);
}
