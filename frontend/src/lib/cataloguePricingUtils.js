import {
  activeTemplateVariations,
  resolveEffectiveProductionSetup,
  templatePrintAreaCoverage,
} from "./templateProductionResolver";
import {
  normalisePrintAreaGeometry,
  printAreaChargedAreaCm2,
} from "./printAreaGeometry";

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
  "min_print_cost",
  "minimum_cost",
  "minimum_price",
  "min_cost",
];

const RATE_KEYS = [
  "cost_per_cm2",
  "cost_per_cm",
  "rate_per_cm2",
  "price_per_cm2",
  "print_cost_per_cm2",
  "platform_cost_per_cm2",
  "creator_cost_per_cm2",
  "area_cost_per_cm2",
  "area_rate_per_cm2",
  "material_cost_per_cm2",
  "cost_per_square_cm",
  "price_per_square_cm",
  "per_cm2",
  "cm2_rate",
];

const AREA_KEYS = [
  "area_cm2",
  "print_area_cm2",
  "charged_area_cm2",
  "dynamic_area_cm2",
  "default_area_cm2",
  "area_square_cm",
  "print_area_square_cm",
];

const WIDTH_KEYS = [
  "width_mm",
  "print_width_mm",
  "print_area_width_mm",
  "charged_width_mm",
  "printable_width_mm",
  "max_width_mm",
  "default_width_mm",
  "artwork_width_mm",
  "placement_box_width_mm",
];

const HEIGHT_KEYS = [
  "height_mm",
  "print_height_mm",
  "print_area_height_mm",
  "charged_height_mm",
  "printable_height_mm",
  "max_height_mm",
  "default_height_mm",
  "artwork_height_mm",
  "placement_box_height_mm",
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

function parseNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const cleaned = value
      .replace(/R/gi, "")
      .replace(/%/g, "")
      .replace(/\s+/g, "")
      .replace(/,/g, ".");
    const number = Number(cleaned);
    return Number.isFinite(number) ? number : 0;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function positiveNumber(value) {
  const number = parseNumber(value);
  return number > 0 ? number : 0;
}

function firstPositive(...values) {
  for (const value of values) {
    const number = positiveNumber(value);
    if (number > 0) return number;
  }
  return 0;
}

function firstPositiveByKeys(source = {}, keys = []) {
  for (const key of keys) {
    const value = positiveNumber(source?.[key]);
    if (value > 0) return value;
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
  return (
    keys.find((key) => ACTIVE_METHOD_KEYS.has(key))
    || keys.find((key) =>
      [...ACTIVE_METHOD_KEYS].some((active) => key.includes(active))
    )
    || keys[0]
    || ""
  );
}

export function methodRawLabel(option = {}) {
  return (
    option.print_method
    || option.method
    || option.method_key
    || option.rule_name
    || option.name
    || option.id
    || "Print method"
  );
}

export function methodLabel(option = {}) {
  const key = methodKey(option);

  if (key.includes("sublimation")) return "Sublimation";
  if (key.includes("uv") && key.includes("dtf")) return "UV DTF";
  if (key.includes("dtf")) return "DTF Transfers";
  if (key.includes("htv") || key.includes("heat transfer")) return "HTV";
  if (
    key.includes("adhesive")
    || key.includes("sticker")
    || key.includes("vinyl")
  ) return "Adhesive Vinyl";

  return methodRawLabel(option);
}

export function isActiveV1PrintOption(option = {}) {
  if (
    !option
    || option.status === "inactive"
    || option.status === "archived"
  ) return false;

  const keys = methodCandidates(option).map(normaliseKey).filter(Boolean);
  if (!keys.length) return false;

  if (
    keys.some((key) =>
      [...INACTIVE_METHOD_KEYS].some((inactive) => key.includes(inactive))
    )
  ) return false;

  return keys.some(
    (key) =>
      ACTIVE_METHOD_KEYS.has(key)
      || [...ACTIVE_METHOD_KEYS].some((active) => key.includes(active))
  );
}

function copyPositiveNumericFallback(
  merged,
  globalOption,
  localOption,
  keys
) {
  keys.forEach((key) => {
    if (
      positiveNumber(localOption?.[key]) <= 0
      && positiveNumber(globalOption?.[key]) > 0
    ) {
      merged[key] = globalOption[key];
    }
  });
}

function mergeOption(globalOption = {}, localOption = {}, id = "") {
  const merged = { ...globalOption, ...localOption };
  if (id || localOption.id || globalOption.id) {
    merged.id = id || localOption.id || globalOption.id;
  }

  copyPositiveNumericFallback(merged, globalOption, localOption, COST_KEYS);
  copyPositiveNumericFallback(merged, globalOption, localOption, RATE_KEYS);
  copyPositiveNumericFallback(merged, globalOption, localOption, AREA_KEYS);
  copyPositiveNumericFallback(merged, globalOption, localOption, WIDTH_KEYS);
  copyPositiveNumericFallback(merged, globalOption, localOption, HEIGHT_KEYS);
  copyPositiveNumericFallback(merged, globalOption, localOption, [
    "sheet_width_mm",
    "sheet_height_mm",
    "sheet_cost",
    "waste_percentage",
    "markup_percentage",
  ]);

  [
    "calculation_type",
    "standard_print_size_key",
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
    ...localOptions
      .map((option) => option?.id)
      .filter(Boolean)
      .map(String),
    ...safeArray(template.print_areas)
      .flatMap((area) => safeArray(area.allowed_print_option_ids))
      .filter(Boolean)
      .map(String),
  ]);

  if (!ids.size) {
    return localOptions.filter(
      (option) =>
        option?.id
        || option?.method
        || option?.print_method
        || option?.method_key
        || option?.rule_name
    );
  }

  return Array.from(ids)
    .map((id) =>
      mergeOption(
        globalById.get(id) || {},
        localById.get(id) || {},
        id
      )
    )
    .filter(
      (option) =>
        option?.id
        || option?.method
        || option?.print_method
        || option?.method_key
        || option?.rule_name
    );
}

function optionArea(template = {}, option = {}) {
  const areas = safeArray(template.print_areas).filter(
    (area) =>
      area
      && area.status !== "archived"
      && !area.archived
      && !area.deleted
  );
  const optionId = option?.id ? String(option.id) : "";
  const optionAreaId = option?.print_area_id
    ? String(option.print_area_id)
    : "";
  const optionSizeKey =
    option?.standard_print_size_key || option?.print_size || "";

  return normalisePrintAreaGeometry(
    areas.find(
      (area) => optionAreaId && String(area.id) === optionAreaId
    )
    || areas.find(
      (area) =>
        optionId
        && safeArray(area.allowed_print_option_ids)
          .map(String)
          .includes(optionId)
    )
    || areas.find(
      (area) =>
        optionSizeKey
        && (
          area.standard_print_size_key === optionSizeKey
          || area.print_size === optionSizeKey
        )
    )
    || areas.find(
      (area) =>
        area.area_key === "full_wrap"
        || area.area_key === "full_surface"
        || area.view_key === "mug_wrap"
        || area.view_key === "full_wrap"
    )
    || areas[0]
    || {}
  );
}

function optionDimensions(option = {}, area = {}) {
  const widthMm = firstPositive(
    firstPositiveByKeys(option, WIDTH_KEYS),
    firstPositiveByKeys(area, WIDTH_KEYS)
  );
  const heightMm = firstPositive(
    firstPositiveByKeys(option, HEIGHT_KEYS),
    firstPositiveByKeys(area, HEIGHT_KEYS)
  );

  return { widthMm, heightMm };
}

function applyWasteAndMarkup(cost, option = {}) {
  let resolved = Number(cost || 0);
  const wastePercentage = firstPositive(
    option.waste_percentage,
    option.waste_percent
  );
  const markupPercentage = firstPositive(
    option.markup_percentage,
    option.markup_percent
  );

  if (wastePercentage > 0) {
    resolved *= 1 + wastePercentage / 100;
  }
  if (markupPercentage > 0) {
    resolved *= 1 + markupPercentage / 100;
  }

  return resolved;
}

function optionTypeText(option = {}) {
  return normaliseKey(
    [
      option.calculation_type,
      option.pricing_model,
      option.costing_model,
      option.standard_print_size_key,
      option.print_size,
      option.size_band,
      option.rule_name,
    ]
      .filter(isFilled)
      .join(" ")
  );
}

function isDynamicAreaType(option = {}) {
  const type = optionTypeText(option);
  return (
    type.includes("area fixed")
    || type.includes("area fixed rate")
    || type.includes("area_fixed")
    || type.includes("dynamic area")
    || type.includes("dynamic_area")
    || type.includes("dynamic area cm2")
    || type.includes("dynamic_area_cm2")
    || type.includes("cm2")
    || type.includes("cm²")
    || type.includes("per cm")
  );
}

function isAreaFromSheetType(option = {}) {
  const type = optionTypeText(option);
  return (
    type.includes("area from sheet")
    || type.includes("area_from_sheet")
  );
}

function isFullSheetType(option = {}) {
  const type = optionTypeText(option);
  return (
    type === "sheet"
    || type.includes("full sheet")
    || type.includes("full_sheet")
  );
}

export function optionPrice(option = {}, area = {}) {
  const dynamicArea = isDynamicAreaType(option);
  const fromSheet = isAreaFromSheetType(option);
  const fullSheet = isFullSheetType(option);

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

  if (explicit > 0 && !dynamicArea && !fromSheet && !fullSheet) {
    return explicit;
  }

  const minimum = firstPositiveByKeys(option, [
    "minimum_print_cost",
    "min_print_cost",
    "minimum_cost",
    "minimum_price",
    "min_cost",
  ]);
  const ratePerCm2 = firstPositiveByKeys(option, RATE_KEYS);
  const { widthMm, heightMm } = optionDimensions(option, area);
  const effectiveArea = normalisePrintAreaGeometry({
    ...area,
    width_mm: widthMm || area.width_mm,
    height_mm: heightMm || area.height_mm,
  });
  const areaCm2 = firstPositive(
    firstPositiveByKeys(option, AREA_KEYS),
    printAreaChargedAreaCm2(effectiveArea)
  );
  const areaMm2 = widthMm && heightMm
    ? widthMm * heightMm
    : areaCm2 * 100;

  let calculated = 0;

  if (dynamicArea) {
    calculated = areaCm2 > 0 && ratePerCm2 > 0
      ? areaCm2 * ratePerCm2
      : 0;
  } else if (fromSheet || fullSheet) {
    const sheetWidth = firstPositive(
      option.sheet_width_mm,
      option.sheetWidthMm,
      option.sheet_width
    );
    const sheetHeight = firstPositive(
      option.sheet_height_mm,
      option.sheetHeightMm,
      option.sheet_height
    );
    const sheetArea = sheetWidth * sheetHeight;
    const sheetCost = firstPositive(
      option.sheet_cost,
      option.sheetCost,
      option.full_sheet_cost
    );

    if (
      fromSheet
      && sheetCost > 0
      && sheetArea > 0
      && areaMm2 > 0
    ) {
      calculated = (areaMm2 / sheetArea) * sheetCost;
    } else if (fullSheet && sheetCost > 0) {
      calculated = sheetCost;
    }
  } else if (explicit > 0) {
    calculated = explicit;
  }

  calculated = applyWasteAndMarkup(calculated, option);
  return Math.max(calculated, minimum, 0);
}

function optionSizeText(option = {}) {
  return String(
    option.standard_print_size_key
    || option.print_size
    || option.size_band
    || option.name
    || option.rule_name
    || ""
  );
}

export function sizeBand(option = {}) {
  const text = normaliseKey(optionSizeText(option));
  const width = positiveNumber(
    option.width_mm
    || option.widthMm
    || option.print_width_mm
    || option.print_area_width_mm
    || option.max_width_mm
  );
  const height = positiveNumber(
    option.height_mm
    || option.heightMm
    || option.print_height_mm
    || option.print_area_height_mm
    || option.max_height_mm
  );
  const longest = Math.max(width, height);

  if (
    text.includes("full")
    || text.includes("wrap")
    || text.includes("front full")
    || text.includes("back full")
    || longest >= 280
  ) return "Full front/back where applicable";

  if (text.includes("large") || text.includes("a4") || longest >= 200) {
    return "Large print";
  }
  if (text.includes("medium") || text.includes("a5") || longest >= 120) {
    return "Medium print";
  }
  return "Small print";
}

export function effectiveOptionPricingRows(template = {}, option = {}) {
  const defaultArea = optionArea(template, option);
  const variations = activeTemplateVariations(template);
  const rows = variations.length ? variations : [{}];

  return rows.map((variation) => {
    const setup = resolveEffectiveProductionSetup(
      template,
      variation,
      {
        area: defaultArea,
        defaultPrintArea: defaultArea,
      }
    );
    const area = setup.printAreaOverride;
    const cost = optionPrice(option, area);

    return {
      variation,
      variation_id: variation.id || null,
      area,
      cost,
      source: setup.sourceMap.printArea,
    };
  });
}

export function pricingBands(template = {}, globalPrintOptions = []) {
  const options = templatePrintOptions(
    template,
    globalPrintOptions
  ).filter(isActiveV1PrintOption);
  const byBand = new Map();

  options.forEach((option) => {
    effectiveOptionPricingRows(template, option).forEach((row) => {
      if (row.cost <= 0) return;

      const dimensions = optionDimensions(option, row.area);
      const band = sizeBand({ ...option, ...dimensions });
      const existing = byBand.get(band);

      if (!existing || row.cost < existing.estimated_print_cost) {
        byBand.set(band, {
          size_band: band,
          method: methodLabel(option),
          estimated_print_cost: row.cost,
          variation_id: row.variation_id,
          pricing_source: row.source,
        });
      }
    });
  });

  return Array.from(byBand.values()).sort((a, b) => {
    const order = [
      "Small print",
      "Medium print",
      "Large print",
      "Full front/back where applicable",
    ];
    return order.indexOf(a.size_band) - order.indexOf(b.size_band);
  });
}

export function templatePricingInfo(template = {}, globalPrintOptions = []) {
  const allOptions = templatePrintOptions(template, globalPrintOptions);
  const activeOptions = allOptions.filter(isActiveV1PrintOption);
  const pricingRows = activeOptions.flatMap((option) =>
    effectiveOptionPricingRows(template, option).map((row) => ({
      ...row,
      option,
    }))
  );
  const pricedOptionIds = new Set(
    pricingRows
      .filter((row) => row.cost > 0)
      .map((row) => row.option.id || methodKey(row.option))
  );
  const pricedOptions = activeOptions.filter((option) =>
    pricedOptionIds.has(option.id || methodKey(option))
  );
  const bands = pricingBands(template, globalPrintOptions);
  const printAreaCoverage = templatePrintAreaCoverage(template);

  return {
    allOptions,
    activeOptions,
    pricedOptions,
    pricingRows,
    bands,
    printAreaCoverage,
    hasActiveMethods: activeOptions.length > 0,
    hasPricing: pricedOptions.length > 0 || bands.length > 0,
  };
}
