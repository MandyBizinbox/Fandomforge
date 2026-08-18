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
  return ADULT_SIZE_ORDER.indexOf(String(value || "").trim().toUpperCase());
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
    if (foundKey && variation[foundKey] !== undefined && variation[foundKey] !== null && String(variation[foundKey]).trim() !== "") return String(variation[foundKey]);
  }
  return "";
}

export function getTemplateVariationAttributeKeys(template) {
  const keys = [];
  asArray(template?.variations).forEach((variation) => {
    Object.keys(getVariationAttributes(variation)).forEach((key) => keys.push(key));
    ["size", "color", "colour"].forEach((key) => { if (variation?.[key]) keys.push(key); });
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
  return [template?.description, template?.category, template?.brand].map((value) => String(value || "").trim()).find(Boolean) || "Product option";
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
    lines.push(group === "Other" ? `Sizes: ${formatAttributeRange(sorted, "Size")}` : `${group}: ${formatAttributeRange(sorted, "Size")}`);
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
  sortByPriority([...valuesByKey.keys()]).filter((key) => !["Size", "Colour"].includes(canonicalAttributeKey(key))).forEach((key) => {
    if (lines.length >= 4) return;
    const formatted = formatAttributeRange(valuesByKey.get(key), key);
    if (formatted) lines.push(`${getAttributeLabel(key)}: ${formatted}`);
  });
  if (variations.length) lines.push(`${variations.length} total ${variations.length === 1 ? "option" : "options"}`);
  if (!lines.length && variations.length) {
    const keys = getTemplateVariationAttributeKeys(template).map(getAttributeLabel);
    return [`Options: ${variations.length}`, keys.length ? `Attributes: ${keys.join(", ")}` : "Attribute data incomplete"];
  }
  if (!lines.length) return ["Options pending", "Attribute data incomplete"];
  return lines.slice(0, 5);
}

export function getTemplateOptionSummary(template) { return getTemplateAvailableOptionsSummary(template).join(" · "); }
export function getTemplateSizeRange(template) { const line = getTemplateSizeSummary(template)[0]; return line ? line.replace(/^[^:]+:\s*/, "Sizes ") : ""; }
export function getTemplateColourCount(template) { return uniqCompact(asArray(template?.variations).map((variation) => getVariationAttributeValue(variation, "Colour") || getVariationColour(variation)).filter((colour) => colour !== "Default")).length; }
export function getTemplateAttributeRange(template) { return getTemplateOptionSummary(template); }

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
  return { colours: rows.map((row) => row.colour), sizes, rows };
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
  const label = Object.entries(attrs).map(([key, value]) => `${key}: ${value}`).join(" / ");
  return label || [variation?.size, variation?.color].filter(Boolean).join(" / ") || variation?.sku || "Variation";
}

export function getCreatorBlankPrice(source, template) {
  const value = source?.creator_blank_price ?? template?.creator_blank_price ?? source?.base_price ?? template?.base_price ?? 0;
  return Number(value || 0);
}
export function getVariationCost(variation, template) { return getCreatorBlankPrice(variation, template); }
export function getPrintOptionLabel(option) {
  if (!option) return "Print option";
  return option.display_label || option.profile_name || option.rule_name || [option.print_method || option.method_name || option.method, option.print_size].filter(Boolean).join(" · ") || option.name || "Print option";
}
export function getPrintOptionCost(option) { return Number(option?.creator_print_price ?? option?.platform_print_cost ?? option?.print_cost_max ?? 0); }

export function normalizeProductionMethodKey(value) {
  const key = String(value || "").trim().toLowerCase().replace(/[-\s]+/g, "_");
  const aliases = { dtf_transfers: "dtf", dtf_transfer: "dtf", dtf_print: "dtf", uvdtf: "uv_dtf", uv_dtf_transfer: "uv_dtf", heat_transfer_vinyl: "htv", htv_vinyl: "htv", vinyl: "adhesive_vinyl", adhesive: "adhesive_vinyl", adhesive_vinyls: "adhesive_vinyl" };
  if (aliases[key]) return aliases[key];
  for (const [prefix, canonical] of [["adhesive_vinyl_", "adhesive_vinyl"], ["sublimation_", "sublimation"], ["uv_dtf_", "uv_dtf"], ["dtf_", "dtf"], ["htv_", "htv"]]) {
    if (key.startsWith(prefix)) return canonical;
  }
  return key;
}

function optionForSlot(slot, printOptions) {
  if (slot?.manufacturing_profile_id || slot?.production_profile_id) return slot;
  return asArray(printOptions).find((item) => item.id === slot.print_option_id) || slot;
}
function areaForSlot(slot, template) { return asArray(template?.print_areas).find((item) => item.id === slot.print_area_id) || {}; }
function methodForSlot(slot, option = {}) { return normalizeProductionMethodKey(option.method_key || slot.method_key || option.print_method || option.method_name || option.method || slot.print_method || slot.rule_name); }
function hasArtworkPayload(slot) { return Boolean(slot?.original_url || slot?.text_layer || slot?.text_content); }
function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function roundMoney(value) { return Math.round(safeNumber(value) * 100) / 100; }
function roundMm(value) { return Math.round(safeNumber(value) * 10) / 10; }
function roundArea(value) { return Math.round(safeNumber(value) * 100) / 100; }

export function isCombinablePrintMethod(methodKey, option = {}) {
  if (option.combine_same_method_layers === false || option.combine_layers === false || option.additive_layer_pricing === true) return false;
  if (["separate", "additive", "per_layer"].includes(String(option.same_method_layer_policy || option.layer_pricing_mode || "").toLowerCase())) return false;
  if (["combined", "bounding_area", "per_area"].includes(String(option.same_method_layer_policy || option.layer_pricing_mode || "").toLowerCase())) return true;
  return ["dtf", "sublimation", "uv_dtf"].includes(normalizeProductionMethodKey(methodKey));
}

function combinedSlotFromGroup(groupSlots, area, option) {
  const first = groupSlots[0] || {};
  const layerCostings = groupSlots.map((slot) => (
    calculateAreaPrintCost(slot, area, option)
  ));
  const combinedAreaCm2 = layerCostings.reduce(
    (total, costing) => total + Number(costing.area_cm2 || 0),
    0
  );

  return {
    ...first,
    combined_layer_count: groupSlots.length,
    combined_area_cm2: Math.round(combinedAreaCm2 * 100) / 100,
    combined_layer_areas: layerCostings.map((costing, index) => ({
      slot_id: groupSlots[index]?.id,
      area_cm2: Number(costing.area_cm2 || 0),
    })),
  };
}

export function calculateAreaPrintCost(slot = {}, area = {}, option = {}) {
  const calculationType = String(option.calculation_type || slot.calculation_type || "fixed").toLowerCase();
  const warnings = [];
  const placement = slot.placement || {};
  const areaWidthMm = safeNumber(area.width_mm || slot.print_area_width_mm || slot.width_mm || option.width_mm || 0);
  const areaHeightMm = safeNumber(area.height_mm || slot.print_area_height_mm || slot.height_mm || option.height_mm || 0);
  const placementWidthPct = safeNumber(placement.width ?? placement.width_pct ?? 100, 100);
  const placementHeightPct = safeNumber(placement.height ?? placement.height_pct ?? 100, 100);
  const printWidthMm = areaWidthMm * (placementWidthPct / 100);
  const printHeightMm = areaHeightMm * (placementHeightPct / 100);
  const placementAreaCm2 = Math.max(
    0,
    (printWidthMm / 10) * (printHeightMm / 10)
  );
  const explicitCombinedAreaCm2 = safeNumber(
    slot.combined_area_cm2 || 0
  );
  const areaCm2 = explicitCombinedAreaCm2 > 0
    ? explicitCombinedAreaCm2
    : placementAreaCm2;
  const artworkWidthPx = safeNumber(slot.original_width_px || slot.artwork_width_px || 0);
  const artworkHeightPx = safeNumber(slot.original_height_px || slot.artwork_height_px || 0);
  const aspectRatio = artworkWidthPx > 0 && artworkHeightPx > 0 ? artworkWidthPx / artworkHeightPx : safeNumber(slot.artwork_aspect_ratio || 0);
  const minimum = Math.max(0, safeNumber(option.minimum_print_cost ?? slot.minimum_print_cost ?? 0));
  const wastePct = Math.max(0, safeNumber(option.waste_percentage ?? slot.waste_percentage ?? 0));
  const markupPct = Math.max(0, safeNumber(option.markup_percentage ?? slot.markup_percentage ?? 0));
  let costPerCm2 = safeNumber(option.cost_per_cm2 ?? slot.cost_per_cm2 ?? 0);
  const sheetWidthMm = safeNumber(option.sheet_width_mm ?? slot.sheet_width_mm ?? 0);
  const sheetHeightMm = safeNumber(option.sheet_height_mm ?? slot.sheet_height_mm ?? 0);
  const sheetCost = safeNumber(option.sheet_cost ?? slot.sheet_cost ?? 0);
  const sheetAreaCm2 = (sheetWidthMm / 10) * (sheetHeightMm / 10);

  let baseProductionCost = 0;
  let calculationSource = calculationType;

  if (["fixed", "manual", "flat_rate", "flat"].includes(calculationType)) {
    baseProductionCost = safeNumber(option.creator_print_price ?? option.platform_print_cost ?? option.print_cost_max ?? slot.creator_print_price ?? slot.platform_print_cost ?? slot.print_cost_max ?? slot.calculated_print_cost ?? 0);
  } else if (["full_sheet", "sheet_full"].includes(calculationType)) {
    baseProductionCost = sheetCost || safeNumber(option.print_cost_max ?? slot.print_cost_max ?? 0);
  } else if (["sheet", "area_from_sheet"].includes(calculationType)) {
    if (!costPerCm2 && sheetAreaCm2 > 0 && sheetCost > 0) {
      costPerCm2 = sheetCost / sheetAreaCm2;
      calculationSource = "sheet_area_rate";
    }
    if (!costPerCm2 && sheetCost > 0 && calculationType === "sheet") {
      baseProductionCost = sheetCost;
      calculationSource = "sheet_flat_cost";
    } else {
      baseProductionCost = areaCm2 * costPerCm2;
    }
  } else if (["area_fixed_rate", "area", "cm2"].includes(calculationType)) {
    baseProductionCost = areaCm2 * costPerCm2;
  } else {
    warnings.push(`Unknown calculation type: ${calculationType}`);
    baseProductionCost = safeNumber(option.print_cost_max ?? slot.print_cost_max ?? slot.calculated_print_cost ?? 0);
    calculationSource = "fallback_fixed";
  }

  if (areaWidthMm <= 0 || areaHeightMm <= 0) warnings.push("Missing print-area physical dimensions");
  if (areaCm2 <= 0 && !["fixed", "manual", "flat_rate", "flat", "full_sheet", "sheet_full"].includes(calculationType)) warnings.push("Artwork area is zero");

  const wasteAmount = baseProductionCost * (wastePct / 100);
  const afterWaste = baseProductionCost + wasteAmount;
  const markupAmount = afterWaste * (markupPct / 100);
  const calculatedProfileCost = afterWaste + markupAmount;
  const minimumPrintCostApplied = minimum > 0 && calculatedProfileCost < minimum;
  const finalCost = Math.max(calculatedProfileCost, minimum);

  return {
    calculation_type: calculationType,
    placement_box_width_mm: roundMm(printWidthMm),
    placement_box_height_mm: roundMm(printHeightMm),
    artwork_aspect_ratio: Math.round(aspectRatio * 10000) / 10000,
    print_area_width_mm: roundMm(areaWidthMm),
    print_area_height_mm: roundMm(areaHeightMm),
    artwork_width_mm: roundMm(printWidthMm),
    artwork_height_mm: roundMm(printHeightMm),
    charged_width_mm: roundMm(printWidthMm),
    charged_height_mm: roundMm(printHeightMm),
    charged_area_cm2: roundArea(areaCm2),
    pricing_source: calculationSource,
    calculation_source: calculationSource,
    print_width_mm: roundMm(printWidthMm),
    print_height_mm: roundMm(printHeightMm),
    area_cm2: roundArea(areaCm2),
    combined_area_cm2: explicitCombinedAreaCm2 > 0
      ? roundArea(explicitCombinedAreaCm2)
      : null,
    combined_layer_count: Number(slot.combined_layer_count || 1),
    cost_per_cm2: costPerCm2,
    base_production_cost: roundMoney(baseProductionCost),
    waste_amount: roundMoney(wasteAmount),
    markup_amount: roundMoney(markupAmount),
    calculated_profile_cost: roundMoney(calculatedProfileCost),
    minimum_print_cost: roundMoney(minimum),
    minimum_print_cost_applied: minimumPrintCostApplied,
    final_artwork_production_cost: roundMoney(finalCost),
    raw_print_cost: roundMoney(calculatedProfileCost),
    calculated_print_cost: roundMoney(finalCost),
    warnings,
  };
}

export function getAggregatedPrintCostLines(groups, printOptions = [], template = {}) {
  const slots = flattenArtworkGroups(groups).filter((slot) => slot.print_option_id && hasArtworkPayload(slot));
  const additive = [];
  const combinable = new Map();
  slots.forEach((slot) => {
    const option = optionForSlot(slot, printOptions);
    const method = methodForSlot(slot, option);
    if (!method || !isCombinablePrintMethod(method, option)) {
      additive.push([slot]);
      return;
    }
    const key = [slot.artwork_group_id || "group", slot.screen_id || "screen", slot.print_area_id || "area", method, slot.print_option_id || option.id || "option"].join("|");
    if (!combinable.has(key)) combinable.set(key, []);
    combinable.get(key).push(slot);
  });

  const lines = [];
  additive.forEach((items) => {
    const slot = items[0];
    const option = optionForSlot(slot, printOptions);
    const area = areaForSlot(slot, template);
    const result = calculateAreaPrintCost(slot, area, option);
    lines.push({ slot_ids: [slot.id], method_key: methodForSlot(slot, option), print_area_id: slot.print_area_id, combined: false, layer_count: 1, cost: Number(result.calculated_print_cost || 0), costing: result });
  });

  combinable.forEach((items) => {
    const first = items[0] || {};
    const option = optionForSlot(first, printOptions);
    const area = areaForSlot(first, template);
    const slot = combinedSlotFromGroup(items, area, option);
    const result = calculateAreaPrintCost(slot, area, option);

    lines.push({
      slot_ids: items.map((item) => item.id),
      method_key: methodForSlot(slot, option),
      profile_id:
        slot.manufacturing_profile_id
        || slot.production_profile_id
        || slot.print_option_id,
      print_area_id: slot.print_area_id,
      screen_id: slot.screen_id,
      combined: items.length > 1,
      layer_count: items.length,
      combined_area_cm2: Number(result.area_cm2 || 0),
      layer_areas: slot.combined_layer_areas || [],
      cost: Number(result.calculated_print_cost || 0),
      costing: result,
    });
  });
  return lines;
}

export function getUniquePrintCostFromGroups(groups, printOptions, template = {}) {
  const total = getAggregatedPrintCostLines(groups, printOptions, template).reduce((sum, line) => sum + Number(line.cost || 0), 0);
  return Math.round(total * 100) / 100;
}

export function getPrintCostForArtworkSlot(slot = {}, printOptions = [], template = {}) {
  if (!slot.print_option_id || !hasArtworkPayload(slot)) return 0;
  const option = optionForSlot(slot, printOptions);
  const area = areaForSlot(slot, template);
  const result = calculateAreaPrintCost(slot, area, option);
  return Number(result.calculated_print_cost || 0);
}

export function estimateProductionOperationCostFromGroups(groups, printOptions = [], productionOperations = [], template = {}) {
  const lines = [];
  const chargedPerJob = new Set();
  let platformCost = 0;
  getAggregatedPrintCostLines(groups, printOptions, template).forEach((printLine) => {
    asArray(productionOperations).forEach((operation) => {
      if (operation.active === false) return;
      const appliesToRaw = Array.isArray(operation.applies_to_method) ? operation.applies_to_method : [operation.applies_to_method].filter(Boolean);
      const appliesTo = appliesToRaw.map(normalizeProductionMethodKey);
      if (!appliesTo.includes(printLine.method_key)) return;
      const costBasis = operation.cost_basis || "per_operation";
      const operationId = operation.id || operation.slug || operation.name || costBasis;
      const unitCost = Number(operation.cost || 0);
      const defaultQuantity = Number(operation.default_quantity || 1);
      const estimatedTime = Number(operation.estimated_time || 0);
      let quantity = defaultQuantity;
      if (costBasis === "per_job") {
        const perJobKey = `${printLine.method_key}:${operationId}`;
        if (chargedPerJob.has(perJobKey)) return;
        chargedPerJob.add(perJobKey);
      }
      if (costBasis === "per_minute") quantity = estimatedTime * defaultQuantity;
      if (costBasis === "per_cm2") quantity = Number(printLine.costing?.area_cm2 || 0) * defaultQuantity;
      const lineCost = Math.round(unitCost * quantity * 100) / 100;
      platformCost += lineCost;
      lines.push({ operation_id: operationId, operation_name: operation.name || operationId, operation_type: operation.operation_type || "", cost_basis: costBasis, method_key: printLine.method_key, print_area_id: costBasis === "per_job" ? null : printLine.print_area_id, unit_cost: unitCost, quantity, platform_cost: lineCost });
    });
  });
  platformCost = Math.round(platformCost * 100) / 100;
  return { platformCost, creatorCost: Math.round(platformCost * 1.1 * 100) / 100, lines };
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
  if (creatorOrProduct?.platform_commission_rate_percent !== undefined && creatorOrProduct?.platform_commission_rate_percent !== null && creatorOrProduct?.platform_commission_rate_percent !== "") return creatorOrProduct?.platform_commission_source || "creator_override";
  if (creatorOrProduct?.commission_rate !== undefined && creatorOrProduct?.commission_rate !== null && creatorOrProduct?.commission_rate !== "") return Math.abs(resolveCreatorCommissionRate(creatorOrProduct) - DEFAULT_PLATFORM_COMMISSION_RATE) >= 0.0001 ? "creator_override" : "default";
  return "default";
}
export function getEffectivePricingStatus(product = {}, pricing = {}) {
  if (product?.pricing_override_approved || pricing?.pricingOverrideApproved) return "override_approved";
  if (pricing?.canPublishProfitably) return "approved";
  if (product?.requires_creator_pricing_approval || product?.creator_pricing_approval_status === "pending_creator_approval") return "pending_creator_approval";
  if (Number(product?.estimated_creator_profit || pricing?.profit || 0) < 0) return "price_below_minimum";
  return product?.creator_pricing_approval_status || "not_required";
}
export function hasEffectivePricingBlocker(product = {}, pricing = {}) { return ["pending_creator_approval", "price_below_minimum", "rejected"].includes(getEffectivePricingStatus(product, pricing)); }
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
  const roundMoney = (value) => Math.round(Number(value || 0) * 100) / 100;
  const price = roundMoney(sellingPrice);
  const blankPayout = roundMoney(blankCost);
  const printPayout = roundMoney(printCost);
  const productionSubtotal = roundMoney(blankPayout + printPayout);
  const rawRate = Number(commissionRate || 0);
  const rate = Math.max(0, Math.min(rawRate > 1 ? rawRate / 100 : rawRate, 1));
  const commission = roundMoney(productionSubtotal * rate);
  const production = roundMoney(productionSubtotal + commission);
  const profit = roundMoney(price - production);
  const minimumSellingPrice = production;

  return {
    price,
    blank: blankPayout,
    blankSupplierCost: blankPayout,
    print: printPayout,
    platformPrintCost: printPayout,
    productionSubtotal,
    platformFee: commission,
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
  return templateVars.filter((item) => ids.includes(item.id)).map((item) => {
    const rawOverride = priceOverrides?.[item.id];
    const priceOverride = rawOverride === "" || rawOverride === null || rawOverride === undefined ? null : Number(rawOverride);
    return { id: item.id, template_variation_id: item.id, sku: item.sku || undefined, stock_status: "made_to_order", price_override: Number.isFinite(priceOverride) ? priceOverride : null, attribute_values: item.attributes || {}, size: getVariationSize(item), color: getVariationColour(item) };
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

export function getSelectedVariations(template, selectedIds) {
  const ids = new Set(asArray(selectedIds));
  return asArray(template?.variations).filter((variation) => ids.has(variation.id));
}
export function getEnabledTemplateVariations(template) { return asArray(template?.variations).filter((variation) => variation.enabled !== false && variation.status !== "archived"); }
export function templateHasSelectableVariations(template) { return getEnabledTemplateVariations(template).length > 0; }

export function buildStandardProductVariation(template = {}) {
  const baseCost = getCreatorBlankPrice(template);
  return { id: "standard", template_variation_id: null, label: "Standard", sku: template?.blank_sku ? `${template.blank_sku}-STANDARD` : undefined, stock_status: "made_to_order", price_override: null, attribute_values: {}, size: "One Size", color: "Default", base_cost: baseCost };
}

export function createDefaultArtworkGroup() {
  return { id: "default-all", label: "Default artwork", scope_type: "all", attribute_key: null, attribute_value: null, variation_ids: [], inherits_from: null, artworks: [], primary_mockup_image_url: "", sort_order: 0 };
}
export function createColourArtworkGroups(selectedVariations) {
  const { rows } = getVariationMatrix(selectedVariations);
  return rows.map((row, index) => ({ id: `colour-${row.colour.toLowerCase().replace(/[^a-z0-9]+/g, "-") || index}`, label: row.colour, scope_type: "attribute", attribute_key: "Colour", attribute_value: row.colour, variation_ids: row.items.map((variation) => variation.id), inherits_from: "default-all", artworks: [], primary_mockup_image_url: "", sort_order: index }));
}
export function createVariationArtworkGroups(selectedVariations) {
  return asArray(selectedVariations).map((variation, index) => ({ id: `variation-${variation.id}`, label: getVariationLabel(variation), scope_type: "variation", attribute_key: null, attribute_value: null, variation_ids: [variation.id], inherits_from: "default-all", artworks: [], primary_mockup_image_url: "", sort_order: index }));
}
export function getGroupRepresentativeVariationId(group, selectedVariations) {
  if (group?.variation_ids?.length) return group.variation_ids[0];
  return asArray(selectedVariations)[0]?.id || "";
}
export function flattenArtworkGroups(groups) {
  const out = [];
  asArray(groups).forEach((group) => {
    asArray(group.artworks).forEach((artwork) => out.push({ ...artwork, artwork_group_id: group.id, artwork_group_label: group.label }));
  });
  return out;
}
const STOREFRONT_TEMPLATE_GALLERY_ROLES = new Set([
  "catalogue_thumbnail",
  "front_mockup",
  "back_mockup",
  "side_mockup",
  "angled_mockup",
  "gallery",
]);

export function getProductBuilderStorefrontGalleryCandidates(
  template = {},
  groups = []
) {
  const candidates = [];
  const seen = new Set();

  const addCandidate = ({
    url,
    label,
    source,
    role = "",
  }) => {
    const normalizedUrl = String(url || "").trim();

    if (!normalizedUrl || seen.has(normalizedUrl)) return;

    seen.add(normalizedUrl);
    candidates.push({
      id: `storefront-${candidates.length + 1}`,
      url: normalizedUrl,
      label: label || `Storefront image ${candidates.length + 1}`,
      source: source || "Product",
      role,
    });
  };

  asArray(template?.template_gallery)
    .filter(
      (row) =>
        row
        && row.status !== "archived"
        && row.status !== "inactive"
        && STOREFRONT_TEMPLATE_GALLERY_ROLES.has(row.role || "gallery")
    )
    .sort(
      (left, right) =>
        Number(left?.sort_order || 0) - Number(right?.sort_order || 0)
    )
    .forEach((row) => {
      addCandidate({
        url: row.image_url || row.url,
        label: row.name || String(row.role || "Template gallery").replace(/_/g, " "),
        source: "Template gallery",
        role: row.role || "gallery",
      });
    });

  asArray(groups).forEach((group, groupIndex) => {
    addCandidate({
      url: group?.primary_mockup_image_url,
      label: `${group?.label || `Artwork group ${groupIndex + 1}`} primary mockup`,
      source: "Generated mockup",
      role: "generated_mockup",
    });

    asArray(group?.artworks).forEach((artwork, artworkIndex) => {
      addCandidate({
        url: artwork?.mockup_image_url,
        label:
          artwork?.area_key
          || artwork?.screen_view
          || `Generated mockup ${artworkIndex + 1}`,
        source: "Generated mockup",
        role: "generated_mockup",
      });
    });

    asArray(group?.variation_mockups).forEach((mockup, mockupIndex) => {
      addCandidate({
        url: mockup?.image_url || mockup?.mockup_image_url || mockup?.url,
        label: mockup?.variation_label
          ? `${mockup.variation_label} · ${mockup.view_key || mockup.role || "Mockup"}`
          : `Variation mockup ${mockupIndex + 1}`,
        source: "Variation mockup",
        role: mockup?.role || "variation_mockup",
      });
    });

    asArray(group?.derived_mockup_images).forEach((mockup, mockupIndex) => {
      addCandidate({
        url: mockup?.image_url || mockup?.mockup_image_url || mockup?.url,
        label:
          mockup?.name
          || mockup?.view_key
          || `Derived mockup ${mockupIndex + 1}`,
        source: "Derived mockup",
        role: mockup?.role || "derived_mockup",
      });
    });
  });

  return candidates;
}

export function getPrimaryMockupFromGroups(groups) {
  for (const group of asArray(groups)) {
    if (group.primary_mockup_image_url) return group.primary_mockup_image_url;
    const mockup = asArray(group.artworks).find((artwork) => artwork.mockup_image_url)?.mockup_image_url;
    if (mockup) return mockup;
  }
  return "";
}
