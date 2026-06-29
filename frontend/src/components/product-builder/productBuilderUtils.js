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

function uniqCompact(values) {
  return [...new Set(asArray(values).map((value) => String(value || "").trim()).filter(Boolean))];
}

function sortSizeValues(values) {
  const order = ["XXS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL", "7XL", "8XL"];
  return [...values].sort((a, b) => {
    const aIndex = order.indexOf(String(a).toUpperCase());
    const bIndex = order.indexOf(String(b).toUpperCase());
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  });
}

export function getTemplateShortDescription(template) {
  return [template?.description, template?.category, template?.brand]
    .map((value) => String(value || "").trim())
    .find(Boolean) || "Product option";
}

export function getTemplateSizeRange(template) {
  const sizes = sortSizeValues(uniqCompact(asArray(template?.variations).map(getVariationSize)).filter((size) => size !== "One Size"));
  if (!sizes.length) return "";
  if (sizes.length === 1) return `Size ${sizes[0]}`;
  return `Sizes ${sizes[0]}-${sizes[sizes.length - 1]}`;
}

export function getTemplateColourCount(template) {
  const colours = uniqCompact(asArray(template?.variations).map(getVariationColour)).filter((colour) => colour !== "Default");
  return colours.length;
}

export function getTemplateAttributeRange(template) {
  const variations = asArray(template?.variations);
  const sizeRange = getTemplateSizeRange(template);
  const colourCount = getTemplateColourCount(template);
  const parts = [];

  if (sizeRange) parts.push(sizeRange);
  if (colourCount) parts.push(`${colourCount} ${colourCount === 1 ? "colour" : "colours"}`);
  if (parts.length) return parts.join(" · ");
  if (variations.length) return `${variations.length} ${variations.length === 1 ? "variation" : "variations"}`;
  return "Options pending";
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

export function calculatePricing({ sellingPrice = 0, blankCost = 0, printCost = 0, commissionRate = 0.15 }) {
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
    commission,
    profit,
    minimumSellingPrice,
    canPublishProfitably: price > 0 && profit >= 0,
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
