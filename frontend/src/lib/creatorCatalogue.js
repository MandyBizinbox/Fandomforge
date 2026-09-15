import {
  activeTemplateGallery,
  activeTemplateScreens,
  templateImage,
  templateReadiness,
} from "./templateReadiness";

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.results)) return value.results;
  return [];
}

export function normaliseCatalogueKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function firstTruthy(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "") || "";
}

function uniq(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function variationAttributes(variation = {}) {
  return variation.attributes || variation.attribute_values || variation.options || {};
}

function variationAttributeValue(variation = {}, aliases = []) {
  const attrs = variationAttributes(variation);
  const directEntries = Object.entries(attrs);
  for (const alias of aliases) {
    const direct = attrs[alias];
    if (direct !== undefined && direct !== null && String(direct).trim()) return String(direct).trim();
    const found = directEntries.find(([key]) => normaliseCatalogueKey(key) === normaliseCatalogueKey(alias));
    if (found && found[1] !== undefined && found[1] !== null && String(found[1]).trim()) return String(found[1]).trim();
  }
  for (const alias of aliases) {
    const foundKey = Object.keys(variation).find((key) => normaliseCatalogueKey(key) === normaliseCatalogueKey(alias));
    if (foundKey && variation[foundKey] !== undefined && variation[foundKey] !== null && String(variation[foundKey]).trim()) {
      return String(variation[foundKey]).trim();
    }
  }
  return "";
}

function productTypeKeys(type = {}) {
  return uniq([type.id, type._id, type.slug, type.key, type.name, type.label]);
}

function templateTypeKeys(template = {}) {
  return uniq([
    template.product_type_id,
    template.product_type_slug,
    template.product_type_key,
    template.product_type,
    template.category_id,
    template.category_slug,
    template.category,
  ]);
}

export function creatorCatalogueProductTypeLabel(template = {}, productTypes = []) {
  const templateKeys = new Set(templateTypeKeys(template).map(normaliseCatalogueKey));
  const match = asArray(productTypes).find((type) =>
    productTypeKeys(type).some((key) => templateKeys.has(normaliseCatalogueKey(key)))
  );

  return firstTruthy(
    match?.name,
    match?.label,
    match?.title,
    template.product_type_name,
    template.product_type,
    template.category,
    "Other"
  );
}

export function creatorCatalogueTemplates(templates = [], printOptions = []) {
  return asArray(templates)
    .filter((template) => template && template.creator_visible !== false)
    .filter((template) => normaliseCatalogueKey(template.status) === "active")
    .filter((template) => templateReadiness(template, printOptions).isLaunchReady)
    .sort((a, b) => String(a.name || a.title || "").localeCompare(String(b.name || b.title || "")));
}

export function creatorCatalogueCategories(templates = [], productTypes = []) {
  const labels = uniq(asArray(templates).map((template) => creatorCatalogueProductTypeLabel(template, productTypes)));
  return labels.sort((a, b) => a.localeCompare(b));
}

export function creatorCatalogueMatches(template = {}, query = "", category = "all", productTypes = []) {
  const label = creatorCatalogueProductTypeLabel(template, productTypes);
  const categoryMatch = category === "all" || normaliseCatalogueKey(label) === normaliseCatalogueKey(category);
  if (!categoryMatch) return false;

  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return true;

  const haystack = [
    template.name,
    template.title,
    template.brand,
    template.description,
    template.category,
    template.product_type_name,
    label,
  ].map((value) => String(value || "").toLowerCase()).join(" ");

  return haystack.includes(needle);
}

export function creatorCatalogueGallery(template = {}) {
  const rows = [];
  const add = (url, label, role = "") => {
    if (!url || rows.some((row) => row.url === url)) return;
    rows.push({ url, label: label || "Product image", role });
  };

  activeTemplateGallery(template)
    .slice()
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
    .forEach((row) => add(row.image_url, row.label || row.name || row.role, row.role));

  activeTemplateScreens(template).forEach((screen) =>
    add(screen.image_url, screen.label || screen.name || screen.view_name || "Product view", "screen")
  );

  asArray(template.variations).forEach((variation) =>
    add(
      variation.image_url || variation.product_image_url || variation.mockup_image_url,
      variation.label || variation.name || "Variation",
      "variation"
    )
  );

  add(templateImage(template), template.name || template.title || "Product image", "primary");
  add(template.product_image_url, template.name || template.title || "Product image", "product");
  add(template.mockup_url, template.name || template.title || "Product mockup", "mockup");
  asArray(template.mockup_images).forEach((url, index) => add(url, `Product image ${index + 1}`, "mockup"));

  return rows;
}

function methodLabel(option = {}) {
  return firstTruthy(
    option.creator_label,
    option.display_name,
    option.name,
    option.label,
    option.method_name,
    option.print_method,
    option.production_method_key,
    option.method_key,
    option.method,
    "Print method"
  );
}

export function creatorCataloguePrintMethods(template = {}, printOptions = []) {
  const ready = templateReadiness(template, printOptions);
  return uniq(asArray(ready.activeMethods).map(methodLabel));
}

function validHex(value) {
  const text = String(value || "").trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(text) ? text : "";
}

export function creatorCatalogueColours(template = {}) {
  const rows = [];
  asArray(template.variations)
    .filter((variation) => variation && variation.enabled !== false && variation.status !== "archived")
    .forEach((variation) => {
      const name = variationAttributeValue(variation, ["Colour", "Color", "colour", "color"]) || variation.colour || variation.color || "";
      if (!name) return;
      const hex = validHex(firstTruthy(
        variation.colour_hex,
        variation.color_hex,
        variation.swatch_hex,
        variation.hex,
        variation.colour_code,
        variation.color_code,
      ));
      if (!rows.some((row) => normaliseCatalogueKey(row.name) === normaliseCatalogueKey(name))) {
        rows.push({ name, hex });
      }
    });
  return rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

const SIZE_ORDER = [
  "xxs", "xs", "s", "small", "m", "medium", "l", "large", "xl", "xxl", "2xl", "xxxl", "3xl", "4xl", "5xl", "6xl", "7xl", "8xl",
];

function sizeRank(value) {
  const key = String(value || "").trim().toLowerCase();
  const index = SIZE_ORDER.indexOf(key);
  if (index !== -1) return index;
  const kidsMatch = key.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})/);
  if (kidsMatch) return 100 + Number(kidsMatch[1]);
  return 1000;
}

export function creatorCatalogueSizes(template = {}) {
  const values = [];
  asArray(template.variations)
    .filter((variation) => variation && variation.enabled !== false && variation.status !== "archived")
    .forEach((variation) => {
      const value = variationAttributeValue(variation, ["Size", "size"]);
      if (value && !values.includes(value)) values.push(value);
    });

  return values.sort((a, b) => {
    const rankDelta = sizeRank(a) - sizeRank(b);
    if (rankDelta !== 0) return rankDelta;
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  });
}

export function creatorCataloguePrintAreas(template = {}) {
  return uniq(asArray(template.print_areas)
    .filter((area) => area && area.status !== "archived" && !area.archived && !area.deleted)
    .map((area) => firstTruthy(area.creator_label, area.label, area.name, area.view_name, area.position, area.id)));
}

export function creatorCatalogueSpecs(template = {}) {
  const source = firstTruthy(
    template.specs,
    template.specifications,
    template.product_specs,
    template.features,
    template.specification_text,
  );

  if (!source) return [];
  if (Array.isArray(source)) {
    return source.map((item) => {
      if (typeof item === "string") return item;
      if (!item || typeof item !== "object") return "";
      const label = firstTruthy(item.label, item.name, item.title);
      const value = firstTruthy(item.value, item.description, item.text);
      return label && value ? `${label}: ${value}` : label || value;
    }).filter(Boolean);
  }
  if (typeof source === "object") {
    return Object.entries(source).map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`);
  }

  return String(source)
    .split(/\r?\n|•|\u2022/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function creatorCatalogueCard(template = {}, printOptions = [], productTypes = []) {
  const ready = templateReadiness(template, printOptions);
  const colours = creatorCatalogueColours(template);
  const sizes = creatorCatalogueSizes(template);
  const printMethods = creatorCataloguePrintMethods(template, printOptions);

  return {
    id: template.id,
    name: firstTruthy(template.name, template.title, "Product"),
    brand: firstTruthy(template.brand, template.supplier_brand, ""),
    category: creatorCatalogueProductTypeLabel(template, productTypes),
    description: firstTruthy(template.short_description, template.description, ""),
    image: templateImage(template),
    blankCost: ready.blankCost,
    colours,
    sizes,
    printMethods,
  };
}
