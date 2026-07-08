export const ACTIVE_V1_METHODS = [
  "Sublimation",
  "DTF Transfers",
  "HTV",
  "UV DTF",
  "Adhesive Vinyl",
];

const ACTIVE_METHOD_KEYS = new Set([
  "sublimation",
  "dtf",
  "dtf transfer",
  "dtf transfers",
  "dtf_transfer",
  "dtf_transfers",
  "heat transfer vinyl",
  "htv",
  "uv dtf",
  "uv_dtf",
  "uv-dtf",
  "adhesive vinyl",
  "adhesive_vinyl",
  "adhesive-vinyl",
  "vinyl sticker",
  "vinyl stickers",
  "sticker",
  "stickers",
]);

const INACTIVE_METHOD_KEYS = new Set([
  "laser",
  "laser engraving",
  "screen printing",
  "screen print",
  "screen_print",
  "embroidery",
]);

const COST_KEYS = [
  "creator_print_price",
  "print_cost_max",
  "platform_print_cost",
  "print_price",
  "price",
  "cost",
  "calculated_print_cost",
  "raw_print_cost",
  "minimum_print_cost",
];

export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function normaliseKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function isFilled(value) {
  return value !== undefined && value !== null && value !== "";
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function firstPositive(...values) {
  for (const value of values) {
    const number = positiveNumber(value);
    if (number > 0) return number;
  }
  return 0;
}

function methodCandidates(option = {}) {
  return [
    option.method_key,
    option.print_method,
    option.method,
    option.production_method,
    option.rule_name,
    option.name,
    option.slug,
    option.id,
  ].filter(isFilled);
}

export function methodKey(option = {}) {
  const keys = methodCandidates(option).map(normaliseKey).filter(Boolean);
  return keys.find((key) => ACTIVE_METHOD_KEYS.has(key)) || keys.find((key) => [...ACTIVE_METHOD_KEYS].some((active) => key.includes(active))) || keys[0] || "";
}

export function methodRawLabel(option = {}) {
  return option.print_method || option.method || option.method_key || option.rule_name || option.name || option.id || "Print method";
}

export function methodLabel(option = {}) {
  const key = methodKey(option);

  if (key.includes("sublimation")) return "Sublimation";
  if (key.includes("uv") && key.includes("dtf")) return "UV DTF";
  if (key.includes("dtf")) return "DTF Transfers";
  if (key.includes("htv") || key.includes("heat transfer")) return "HTV";
  if (key.includes("adhesive") || key.includes("sticker") || key.includes("vinyl")) return "Adhesive Vinyl";

  return methodRawLabel(option);
}

export function isActiveV1PrintOption(option = {}) {
  if (!option || option.status === "inactive" || option.status === "archived") return false;

  const keys = methodCandidates(option).map(normaliseKey).filter(Boolean);
  if (!keys.length) return false;

  if (keys.some((key) => [...INACTIVE_METHOD_KEYS].some((inactive) => key.includes(inactive)))) return false;

  return keys.some((key) => ACTIVE_METHOD_KEYS.has(key) || [...ACTIVE_METHOD_KEYS].some((active) => key.includes(active)));
}

function mergeOption(globalOption = {}, localOption = {}, id = "") {
  const merged = { ...globalOption, ...localOption };
  if (id || localOption.id || globalOption.id) merged.id = id || localOption.id || globalOption.id;

  COST_KEYS.forEach((key) => {
    if (positiveNumber(localOption[key]) <= 0 && positiveNumber(globalOption[key]) > 0) {
      merged[key] = globalOption[key];
    }
  });

  [
    "calculation_type",
    "sheet_width_mm",
    "sheet_height_mm",
    "sheet_cost",
    "cost_per_cm2",
    "minimum_print_cost",
    "waste_percentage",
    "markup_percentage",
    "standard_print_size_key",
    "width_mm",
    "height_mm",
    "dpi",
    "fit_mode",
    "print_positions",
    "method_key",
    "print_method",
    "print_size",
    "rule_name",
  ].forEach((key) => {
    if (!isFilled(localOption[key]) && isFilled(globalOption[key])) {
      merged[key] = globalOption[key];
    }
  });

  return merged;
}

export function templatePrintOptions(template = {}, globalPrintOptions = []) {
  const localOptions = safeArray(template.print_options);
  const globalById = new Map();

  safeArray(globalPrintOptions).forEach((option) => {
    if (option?.id) globalById.set(String(option.id), option);
  });

  const localById = new Map();
  localOptions.forEach((option) => {
    if (option?.id) localById.set(String(option.id), option);
  });

  const ids = new Set([
    ...safeArray(template.print_option_ids).map(String),
    ...localOptions.map((option) => option?.id).filter(Boolean).map(String),
    ...safeArray(template.print_areas).flatMap((area) => safeArray(area.allowed_print_option_ids)).filter(Boolean).map(String),
  ]);

  if (!ids.size) {
    return localOptions.filter((option) => option?.id || option?.method || option?.print_method || option?.method_key || option?.rule_name);
  }

  return Array.from(ids)
    .map((id) => mergeOption(globalById.get(id) || {}, localById.get(id) || {}, id))
    .filter((option) => option?.id || option?.method || option?.print_method || option?.method_key || option?.rule_name);
}

function optionArea(template = {}, option = {}) {
  const areas = safeArray(template.print_areas);
  const optionId = option?.id ? String(option.id) : "";
  const optionAreaId = option?.print_area_id ? String(option.print_area_id) : "";
  const optionSizeKey = option?.standard_print_size_key || option?.print_size || "";

  return (
    areas.find((area) => optionAreaId && String(area.id) === optionAreaId) ||
    areas.find((area) => optionId && safeArray(area.allowed_print_option_ids).map(String).includes(optionId)) ||
    areas.find((area) => optionSizeKey && (area.standard_print_size_key === optionSizeKey || area.print_size === optionSizeKey)) ||
    {}
  );
}

function optionDimensions(option = {}, area = {}) {
  const widthMm = firstPositive(
    option.width_mm,
    option.print_width_mm,
    option.print_area_width_mm,
    option.charged_width_mm,
    area.width_mm,
    area.print_width_mm,
    area.print_area_width_mm,
    area.charged_width_mm
  );
  const heightMm = firstPositive(
    option.height_mm,
    option.print_height_mm,
    option.print_area_height_mm,
    option.charged_height_mm,
    area.height_mm,
    area.print_height_mm,
    area.print_area_height_mm,
    area.charged_height_mm
  );

  return { widthMm, heightMm };
}

function applyWasteAndMarkup(cost, option = {}) {
  let resolved = Number(cost || 0);
  const wastePercentage = positiveNumber(option.waste_percentage);
  const markupPercentage = positiveNumber(option.markup_percentage);

  if (wastePercentage > 0) resolved *= 1 + wastePercentage / 100;
  if (markupPercentage > 0) resolved *= 1 + markupPercentage / 100;

  return resolved;
}

export function optionPrice(option = {}, area = {}) {
  const explicit = firstPositive(
    option.creator_print_price,
    option.print_cost_max,
    option.platform_print_cost,
    option.print_price,
    option.price,
    option.cost,
    option.calculated_print_cost,
    option.raw_print_cost
  );

  if (explicit > 0) return explicit;

  const type = normaliseKey(option.calculation_type || "fixed");
  const minimum = positiveNumber(option.minimum_print_cost);
  const { widthMm, heightMm } = optionDimensions(option, area);
  const areaCm2 = firstPositive(option.area_cm2, option.print_area_cm2, option.charged_area_cm2, widthMm && heightMm ? (widthMm * heightMm) / 100 : 0);
  const areaMm2 = widthMm && heightMm ? widthMm * heightMm : 0;

  let calculated = 0;

  if (type.includes("area fixed") || type.includes("area fixed rate") || type.includes("area_fixed")) {
    calculated = areaCm2 * positiveNumber(option.cost_per_cm2);
  } else if (type.includes("area from sheet") || type.includes("area_from_sheet") || type === "sheet") {
    const sheetWidth = positiveNumber(option.sheet_width_mm);
    const sheetHeight = positiveNumber(option.sheet_height_mm);
    const sheetArea = sheetWidth * sheetHeight;
    const sheetCost = positiveNumber(option.sheet_cost);

    if (sheetCost > 0 && sheetArea > 0 && areaMm2 > 0) {
      calculated = (areaMm2 / sheetArea) * sheetCost;
    } else if (sheetCost > 0 && type === "sheet") {
      calculated = sheetCost;
    }
  } else if (type === "fixed") {
    calculated = minimum;
  }

  calculated = applyWasteAndMarkup(calculated, option);
  return Math.max(calculated, minimum, 0);
}

function optionSizeText(option = {}) {
  return String(option.standard_print_size_key || option.print_size || option.size_band || option.name || option.rule_name || "");
}

export function sizeBand(option = {}) {
  const text = normaliseKey(optionSizeText(option));
  const width = Number(option.width_mm || 0);
  const height = Number(option.height_mm || 0);
  const longest = Math.max(width, height);

  if (text.includes("full") || text.includes("wrap") || text.includes("front full") || text.includes("back full") || longest >= 280) {
    return "Full front/back where applicable";
  }
  if (text.includes("large") || text.includes("a4") || longest >= 200) return "Large print";
  if (text.includes("medium") || text.includes("a5") || longest >= 120) return "Medium print";
  return "Small print";
}

export function pricingBands(template = {}, globalPrintOptions = []) {
  const options = templatePrintOptions(template, globalPrintOptions).filter(isActiveV1PrintOption);
  const byBand = new Map();

  options.forEach((option) => {
    const area = optionArea(template, option);
    const cost = optionPrice(option, area);
    if (cost <= 0) return;

    const band = sizeBand(option);
    const existing = byBand.get(band);
    if (!existing || cost < existing.estimated_print_cost) {
      byBand.set(band, {
        size_band: band,
        method: methodLabel(option),
        estimated_print_cost: cost,
      });
    }
  });

  return Array.from(byBand.values()).sort((a, b) => {
    const order = ["Small print", "Medium print", "Large print", "Full front/back where applicable"];
    return order.indexOf(a.size_band) - order.indexOf(b.size_band);
  });
}

export function templatePricingInfo(template = {}, globalPrintOptions = []) {
  const allOptions = templatePrintOptions(template, globalPrintOptions);
  const activeOptions = allOptions.filter(isActiveV1PrintOption);
  const pricedOptions = activeOptions.filter((option) => optionPrice(option, optionArea(template, option)) > 0);
  const bands = pricingBands(template, globalPrintOptions);

  return {
    allOptions,
    activeOptions,
    pricedOptions,
    bands,
    hasActiveMethods: activeOptions.length > 0,
    hasPricing: pricedOptions.length > 0 || bands.length > 0,
  };
}
