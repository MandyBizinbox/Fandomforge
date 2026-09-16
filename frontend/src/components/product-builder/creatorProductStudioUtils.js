export function studioArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.results)) return value.results;
  return [];
}

export function normaliseStudioValue(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function studioVariationId(variation = {}) {
  return String(variation.template_variation_id || variation.id || variation.sku || "");
}

export function studioVariationAttributes(variation = {}) {
  return variation.attributes || variation.attribute_values || variation.options || {};
}

export function collectStudioAttributeOptions(variations = []) {
  const map = new Map();
  studioArray(variations).forEach((variation) => {
    Object.entries(studioVariationAttributes(variation)).forEach(([key, value]) => {
      if (value === undefined || value === null || String(value).trim() === "") return;
      if (!map.has(key)) map.set(key, new Set());
      map.get(key).add(String(value));
    });
  });

  const priority = ["Colour", "Color", "Size", "Material"];
  return [...map.entries()]
    .map(([key, values]) => ({
      key,
      label: key,
      values: [...values].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })),
    }))
    .sort((a, b) => {
      const ai = priority.findIndex((item) => normaliseStudioValue(item) === normaliseStudioValue(a.key));
      const bi = priority.findIndex((item) => normaliseStudioValue(item) === normaliseStudioValue(b.key));
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.key.localeCompare(b.key, undefined, { sensitivity: "base" });
    });
}

function valueForAttribute(variation, key) {
  const attrs = studioVariationAttributes(variation);
  const actualKey = Object.keys(attrs).find((name) => normaliseStudioValue(name) === normaliseStudioValue(key));
  return actualKey ? String(attrs[actualKey]) : "";
}

export function seedStudioSelections(variations = [], selectedIds = []) {
  const selected = new Set(studioArray(selectedIds).map(String));
  const selectedVariations = studioArray(variations).filter((variation) => selected.has(studioVariationId(variation)));
  return Object.fromEntries(
    collectStudioAttributeOptions(variations).map((attribute) => [
      attribute.key,
      attribute.values.filter((value) => selectedVariations.some(
        (variation) => normaliseStudioValue(valueForAttribute(variation, attribute.key)) === normaliseStudioValue(value)
      )),
    ])
  );
}

export function deriveStudioVariationIds(variations = [], selectedValues = {}) {
  const attributes = Object.keys(selectedValues || {});
  if (!attributes.length || attributes.some((key) => !studioArray(selectedValues[key]).length)) return [];

  return studioArray(variations)
    .filter((variation) => attributes.every((key) => {
      const selected = studioArray(selectedValues[key]).map(normaliseStudioValue);
      return selected.includes(normaliseStudioValue(valueForAttribute(variation, key)));
    }))
    .map(studioVariationId)
    .filter(Boolean);
}

export function inferStudioPricingAttribute(variations = []) {
  const rows = studioArray(variations);
  if (!rows.length) return "";
  const keys = Object.keys(studioVariationAttributes(rows[0]));
  if (!keys.length) return "";

  const scored = keys.map((key) => {
    const values = new Set(rows.map((row) => valueForAttribute(row, key)).filter(Boolean));
    const name = normaliseStudioValue(key);
    const sizeBonus = /(size|sizes|apparel-size|clothing-size)/.test(name) ? 100 : 0;
    const colourPenalty = /(color|colour|shade|finish)/.test(name) ? -20 : 0;
    return { key, score: sizeBonus + colourPenalty + Math.min(values.size, 50) };
  });

  return scored.sort((a, b) => b.score - a.score)[0]?.key || keys[0];
}

function stringifyTemplateField(value) {
  if (Array.isArray(value)) {
    return value.map((item) => typeof item === "string" ? item : `${item.label || item.name || "Spec"}: ${item.value ?? ""}`).join("\n");
  }
  if (value && typeof value === "object") {
    return Object.entries(value).map(([key, item]) => `${key}: ${typeof item === "object" ? JSON.stringify(item) : item}`).join("\n");
  }
  return String(value || "").trim();
}

function looksLikeSpecificationText(value) {
  return /(^|\n)\s*(key features|features|attributes|specifications?)\b|(^|\n)\s*(material|capacity|fabric(?: weight)?|gsm|size|dimensions?)\s*:/i.test(String(value || "").trim());
}

function storefrontDetailValue(template, keys) {
  return keys
    .map((key) => stringifyTemplateField(template?.[key]))
    .find(Boolean) || "";
}

function appendStorefrontDetailSections(base, template) {
  const sections = [
    {
      title: "Material & composition",
      value: storefrontDetailValue(template, ["material_composition", "materials"]),
    },
    {
      title: "Care instructions",
      value: storefrontDetailValue(template, ["care_instructions", "care"]),
    },
    {
      title: "Fit & sizing",
      value: storefrontDetailValue(template, ["fit_notes", "sizing_notes", "fit_and_sizing"]),
    },
  ].filter((section) => section.value);

  if (!sections.length) return String(base || "").trim();

  const parts = [];
  const baseText = String(base || "").trim();
  if (baseText) parts.push(baseText);
  sections.forEach((section) => {
    parts.push(`**${section.title}**\n${section.value}`);
  });
  return parts.join("\n\n");
}

export function creatorTemplateSpecs(template = {}) {
  const explicit = template.specs
    ?? template.specifications
    ?? template.product_specs
    ?? template.features
    ?? template.specification_text
    ?? "";
  const explicitText = stringifyTemplateField(explicit);

  let baseSpecs = explicitText;
  if (!baseSpecs) {
    const description = String(template.description || "").trim();
    baseSpecs = looksLikeSpecificationText(description) ? description : "";
  }

  return appendStorefrontDetailSections(baseSpecs, template);
}

export function creatorTemplateDescription(template = {}) {
  const explicit = [
    template.creator_default_description,
    template.storefront_description,
    template.marketing_description,
    template.short_description,
  ].map((value) => String(value || "").trim()).find(Boolean);
  if (explicit) return explicit;

  const description = String(template.description || "").trim();
  if (!description || looksLikeSpecificationText(description)) return "";
  return description;
}

export function buildCreatorProductDraftFromTemplate(template = {}) {
  return {
    template_id: template.id || "",
    title: template.creator_default_title || template.name || template.title || "",
    description: creatorTemplateDescription(template),
    specs: creatorTemplateSpecs(template),
    category: template.category || "",
    brand: template.brand || "",
  };
}

export function creatorStudioBackPath(templateId = "") {
  return templateId
    ? `/creator?section=catalogue&template=${encodeURIComponent(templateId)}`
    : "/creator?section=catalogue";
}
