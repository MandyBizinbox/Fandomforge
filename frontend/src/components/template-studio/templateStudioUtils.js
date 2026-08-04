import {
  PRINT_AREA_GEOMETRY_TYPES,
  normalisePrintAreaGeometry,
} from "../../lib/printAreaGeometry";

const STANDARD_VIEW_OPTIONS = [
  { value: "front", label: "Front" },
  { value: "back", label: "Back" },
  { value: "side", label: "Side" },
  { value: "left_sleeve", label: "Left Sleeve" },
  { value: "right_sleeve", label: "Right Sleeve" },
  { value: "pocket", label: "Pocket" },
  { value: "neck_label", label: "Neck Label" },
  { value: "full_wrap", label: "Full Wrap" },
  { value: "mug_wrap", label: "Mug Wrap" },
  { value: "handle_side", label: "Handle Side" },
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
  { value: "custom", label: "Custom" },
  { value: "other", label: "Other / Custom" },
];

export const PRINT_AREA_OPTIONS = [
  { value: "front_full", label: "Front Full Print", defaultView: "front", defaultSize: "a4_portrait" },
  { value: "front_left_chest", label: "Front Left Chest", defaultView: "front", defaultSize: "small_square_5x5_cm" },
  { value: "front_right_chest", label: "Front Right Chest", defaultView: "front", defaultSize: "small_square_5x5_cm" },
  { value: "back_full", label: "Back Full Print", defaultView: "back", defaultSize: "a4_portrait" },
  { value: "back_upper", label: "Upper Back", defaultView: "back", defaultSize: "a4_landscape" },
  { value: "pocket", label: "Pocket", defaultView: "pocket", defaultSize: "pocket_7_5x7_5_cm" },
  { value: "neck_label", label: "Neck Label", defaultView: "neck_label", defaultSize: "neck_label_9x5_landscape" },
  { value: "left_sleeve", label: "Left Sleeve", defaultView: "left_sleeve", defaultSize: "sleeve_15x5_landscape" },
  { value: "right_sleeve", label: "Right Sleeve", defaultView: "right_sleeve", defaultSize: "sleeve_15x5_landscape" },
  { value: "side", label: "Side Print", defaultView: "side", defaultSize: "a4_portrait" },
  { value: "full_wrap", label: "Full Wrap", defaultView: "full_wrap", defaultSize: "custom" },
  { value: "mug_wrap", label: "Mug Wrap", defaultView: "mug_wrap", defaultSize: "custom" },
  { value: "custom", label: "Custom", defaultView: "front", defaultSize: "custom" },
];

export const STANDARD_PRINT_SIZE_PRESETS = [
  { value: "custom", label: "Custom size", width_mm: 0, height_mm: 0 },
  { value: "a4_portrait", label: "A4 Portrait — 21×29.7cm", width_mm: 210, height_mm: 297 },
  { value: "a4_landscape", label: "A4 Landscape — 29.7×21cm", width_mm: 297, height_mm: 210 },
  { value: "a3_portrait", label: "A3 Portrait — 29.7×42cm", width_mm: 297, height_mm: 420 },
  { value: "a3_landscape", label: "A3 Landscape — 42×29.7cm", width_mm: 420, height_mm: 297 },
  { value: "small_square_5x5_cm", label: "Small Square — 5×5cm", width_mm: 50, height_mm: 50 },
  { value: "pocket_7_5x7_5_cm", label: "Pocket — 7.5×7.5cm", width_mm: 75, height_mm: 75 },
  { value: "neck_label_wide_9x2_cm", label: "Neck Label Wide — 9×2cm", width_mm: 90, height_mm: 20 },
  { value: "neck_label_9x5_landscape", label: "Neck Label — 9×5cm landscape", width_mm: 90, height_mm: 50 },
  { value: "sleeve_15x5_landscape", label: "Sleeve — 15×5cm landscape", width_mm: 150, height_mm: 50 },
  { value: "sleeve_long_10x30_cm", label: "Sleeve Long — 10×30cm", width_mm: 100, height_mm: 300 },
  { value: "sleeve_large_20x30_cm", label: "Sleeve Large — 20×30cm", width_mm: 200, height_mm: 300 },
];

export const PRINT_AREA_GEOMETRY_OPTIONS = PRINT_AREA_GEOMETRY_TYPES;

export function getViewOption(value) {
  return VIEW_OPTIONS.find((option) => option.value === value) || VIEW_OPTIONS[0];
}

export function getPrintAreaOption(value) {
  return PRINT_AREA_OPTIONS.find((option) => option.value === value) || PRINT_AREA_OPTIONS[0];
}

const PRINT_SIZE_ALIASES = {
  A4: "a4_portrait",
  "A4 - P": "a4_portrait",
  "A4-P": "a4_portrait",
  a4: "a4_portrait",
  a4_p: "a4_portrait",
  pocket: "pocket_7_5x7_5_cm",
  pocket_10x10: "small_square_5x5_cm",
  "15x5_landscape": "sleeve_15x5_landscape",
  "15x5_portrait": "sleeve_15x5_landscape",
  neck_label_5x9_landscape: "neck_label_9x5_landscape",
  neck_label_5x9_portrait: "neck_label_9x5_landscape",
};

export function normalisePrintSizeKey(value) {
  const raw = String(value || "custom").trim();
  const key = raw.toLowerCase().replace(/×/g, "x").replace(/\s+/g, "_").replace(/-/g, "_");
  return PRINT_SIZE_ALIASES[raw] || PRINT_SIZE_ALIASES[key] || key || "custom";
}

export function getPrintSizePreset(value) {
  const key = normalisePrintSizeKey(value);
  return STANDARD_PRINT_SIZE_PRESETS.find((option) => option.value === key) || STANDARD_PRINT_SIZE_PRESETS[0];
}

export function printPixels(mm, dpi = 300) {
  return Math.round((Number(mm || 0) / 25.4) * Number(dpi || 300));
}

export function printSizeLabel(widthMm, heightMm, dpi = 300) {
  const width = Number(widthMm || 0);
  const height = Number(heightMm || 0);
  if (!width || !height) return "Custom size";
  return `${width}×${height}mm · ${printPixels(width, dpi)}×${printPixels(height, dpi)}px @ ${dpi} DPI`;
}

export const VIEW_OPTIONS = STANDARD_VIEW_OPTIONS;

export const blankTemplate = {
  name: "",
  slug: "",
  product_type_id: "",
  category: "",
  category_id: "",
  description: "",
  brand: "",
  blank_sku: "",
  supplier_name: "",
  supplier_url: "",
  supplier_notes: "",
  size_chart: {
    enabled: false,
    title: "Size Guide",
    unit: "cm",
    columns: ["Size", "Chest", "Length"],
    rows: [],
    notes: "",
  },
  base_price: 0,
  base_blank_cost: 0,
  platform_blank_cost: 0,
  creator_blank_price: 0,
  platform_blank_profit: 0,
  platform_blank_margin_percent: 0,
  creator_visible: true,
  admin_visible: true,
  mockup_url: "",
  product_image_url: "",
  mockup_images: [],
  mockup_screens: [],
  available_sizes: [],
  available_colors: [],
  attribute_ids: [],
  selected_attribute_values: {},
  variation_inheritance: {
    mode: "shared",
    image_attribute: "",
    production_attribute: "",
  },
  attribute_image_profiles: {},
  attribute_production_profiles: {},
  variations: [],
  print_option_ids: [],
  print_options: [],
  print_areas: [],
  artwork_modes: [],
  status: "draft",
};

export function newId(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

export function money(value) {
  return `R ${Number(value || 0).toFixed(2)}`;
}

export function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function getAttributeLabel(attribute) {
  return attribute?.name || attribute?.slug || "Attribute";
}

export function findAttributeByKind(attributes, kind) {
  const lowerKind = kind.toLowerCase();
  return safeArray(attributes).find((attribute) => {
    const name = String(attribute.name || "").toLowerCase();
    const slug = String(attribute.slug || "").toLowerCase();
    return name.includes(lowerKind) || slug.includes(lowerKind);
  });
}

export function getVariationKey(variation) {
  const attrs = variation?.attributes || {};
  return Object.keys(attrs)
    .sort()
    .map((key) => `${key}:${attrs[key]}`)
    .join("|");
}

export function getVariationLabel(variation) {
  const attrs = variation?.attributes || {};
  const values = Object.values(attrs).filter(Boolean);
  return values.length ? values.join(" / ") : variation?.sku || "Variation";
}

export function buildVariationCombinations(
  selectedAttributes,
  existingVariations = [],
  baseCost = 0,
  selectedAttributeValues = {}
) {
  const activeAttributes = safeArray(selectedAttributes)
    .map((attribute) => {
      const key = attribute.id || attribute.name || attribute.slug;
      const hasExplicitValues = Object.prototype.hasOwnProperty.call(selectedAttributeValues || {}, key);
      const allowedValues = hasExplicitValues
        ? safeArray(selectedAttributeValues[key])
        : safeArray(attribute.values);

      return {
        ...attribute,
        values: allowedValues.filter((value) => String(value || "").trim()),
      };
    })
    .filter((attribute) => safeArray(attribute.values).length > 0);

  if (!activeAttributes.length) return safeArray(existingVariations);

  const existingByKey = new Map(
    safeArray(existingVariations).map((variation) => [getVariationKey(variation), variation])
  );

  const walk = (index, attrs) => {
    if (index >= activeAttributes.length) {
      const key = Object.keys(attrs)
        .sort()
        .map((attrKey) => `${attrKey}:${attrs[attrKey]}`)
        .join("|");

      const existing = existingByKey.get(key);

      return [
        existing || {
          id: newId("var"),
          sku: "",
          attributes: attrs,
          cost: Number(baseCost || 0),
          base_blank_cost: Number(baseCost || 0),
          supplier_sku: "",
          image_url: "",
          mockup_screen_overrides: {},
          print_area_overrides: {},
          enabled: true,
          sort_order: 0,
          status: "active",
        },
      ];
    }

    const attribute = activeAttributes[index];
    const name = attribute.name || attribute.slug;

    return safeArray(attribute.values).flatMap((value) =>
      walk(index + 1, { ...attrs, [name]: value })
    );
  };

  return walk(0, {}).flat().map((variation, index) => ({
    ...variation,
    print_area_overrides: variation.print_area_overrides || {},
    sort_order: index,
  }));
}

export function clampPercent(value, min = 0, max = 100) {
  const number = Number(value);
  const lower = Number.isFinite(Number(min)) ? Number(min) : 0;
  const upper = Number.isFinite(Number(max)) ? Number(max) : 100;

  if (!Number.isFinite(number)) return lower;

  return Math.min(upper, Math.max(lower, number));
}

export function normalizeArea(area = {}) {
  const geometry = normalisePrintAreaGeometry(area);
  const width = clampPercent(geometry.width ?? geometry.width_pct ?? 30, 0, 100);
  const height = clampPercent(geometry.height ?? geometry.height_pct ?? 30, 0, 100);
  const x = clampPercent(geometry.x ?? geometry.x_pct ?? 30, 0, Math.max(0, 100 - width));
  const y = clampPercent(geometry.y ?? geometry.y_pct ?? 25, 0, Math.max(0, 100 - height));

  const viewKey = geometry.view_key || geometry.screen_view || geometry.view || "";
  const areaKey = geometry.area_key || geometry.print_area_key || viewKey || "custom";
  const printSizeKey = geometry.standard_print_size_key || geometry.print_size || "custom";

  return {
    ...geometry,
    id: geometry.id || newId("area"),
    name: geometry.name || geometry.label || "Print Area",
    x,
    y,
    width,
    height,
    x_pct: x,
    y_pct: y,
    width_pct: width,
    height_pct: height,
    screen_id: geometry.screen_id || geometry.mockup_screen_id || "",
    screen_view: geometry.screen_view || viewKey,
    view_key: viewKey,
    area_key: areaKey,
    print_size: printSizeKey,
    standard_print_size_key: printSizeKey,
    width_mm: geometry.width_mm ?? geometry.print_width_mm ?? null,
    height_mm: geometry.height_mm ?? geometry.print_height_mm ?? null,
    dpi: Number(geometry.dpi || 300),
    fit_mode: geometry.fit_mode || "contain",
    required: Boolean(geometry.required),
    allowed_print_option_ids: safeArray(geometry.allowed_print_option_ids ?? geometry.print_option_ids ?? []),
  };
}
