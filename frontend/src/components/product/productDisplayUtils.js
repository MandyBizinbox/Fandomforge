import { assetUrl } from "../../lib/api";

export function normalizeAttrKey(key = "") {
  return String(key || "").trim().toLowerCase();
}

export function isColourKey(key = "") {
  const normalized = normalizeAttrKey(key);
  return normalized === "colour" || normalized === "color" || normalized.includes("colour") || normalized.includes("color");
}

export function isSizeKey(key = "") {
  const normalized = normalizeAttrKey(key);
  return normalized === "size" || normalized.includes("size");
}

export function getVariationAttributes(variation = {}) {
  const values = { ...(variation.attribute_values || {}) };

  if (variation.size && !Object.keys(values).some(isSizeKey)) values.Size = variation.size;
  if (variation.color && !Object.keys(values).some(isColourKey)) values.Colour = variation.color;

  return values;
}

export function getVariationLabel(variation = {}) {
  const attrs = getVariationAttributes(variation);
  const values = Object.entries(attrs)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")
    .map(([key, value]) => `${key}: ${value}`);

  if (values.length > 0) return values.join(" / ");

  return [variation.size, variation.color].filter(Boolean).join(" / ") || variation.sku || "Default";
}

export function getVariationColour(variation = {}) {
  const attrs = getVariationAttributes(variation);
  const entry = Object.entries(attrs).find(([key]) => isColourKey(key));
  return entry?.[1] || variation.color || "";
}

export function getVariationSize(variation = {}) {
  const attrs = getVariationAttributes(variation);
  const entry = Object.entries(attrs).find(([key]) => isSizeKey(key));
  return entry?.[1] || variation.size || "";
}

export function getEffectiveSellingPrice(product = {}, variation = null) {
  const variationPrice = variation?.effective_selling_price;
  if (variationPrice !== undefined && variationPrice !== null && variationPrice !== "") return Number(variationPrice || 0);
  const productPrice = product?.effective_selling_price;
  if (productPrice !== undefined && productPrice !== null && productPrice !== "") return Number(productPrice || 0);
  if (variation?.price_override !== undefined && variation?.price_override !== null && variation?.price_override !== "") return Number(variation.price_override || 0);
  return Number(product?.selling_price || 0);
}

export function uniqueValues(values = []) {
  return Array.from(new Set(values.filter((value) => value !== undefined && value !== null && String(value).trim() !== "")));
}

export function getProductAttributeNames(product = {}) {
  const names = [];
  (product.variations || []).forEach((variation) => {
    Object.keys(getVariationAttributes(variation)).forEach((key) => {
      if (!names.includes(key)) names.push(key);
    });
  });

  return names.sort((a, b) => {
    if (isColourKey(a)) return -1;
    if (isColourKey(b)) return 1;
    if (isSizeKey(a) && !isColourKey(b)) return -1;
    if (isSizeKey(b) && !isColourKey(a)) return 1;
    return a.localeCompare(b);
  });
}

export function getAttributeOptions(product = {}, attrName = "") {
  return uniqueValues((product.variations || []).map((variation) => getVariationAttributes(variation)[attrName]));
}

export function variationMatchesSelected(variation = {}, selected = {}) {
  const attrs = getVariationAttributes(variation);
  return Object.entries(selected).every(([key, value]) => !value || attrs[key] === value);
}

export function findSelectedVariation(product = {}, selected = {}) {
  const variations = product.variations || [];
  if (variations.length === 0) return null;
  const selectedKeys = Object.keys(selected).filter((key) => selected[key]);
  if (selectedKeys.length === 0) return variations[0];
  return variations.find((variation) => variationMatchesSelected(variation, selected)) || null;
}

export function buildInitialSelection(product = {}) {
  const firstVariation = (product.variations || [])[0];
  if (!firstVariation) return {};
  return { ...getVariationAttributes(firstVariation) };
}

function getGroupMockups(group = {}) {
  const images = [];
  if (group.primary_mockup_image_url) images.push(group.primary_mockup_image_url);
  (group.artworks || []).forEach((artwork) => {
    if (artwork.mockup_image_url) images.push(artwork.mockup_image_url);
  });
  return uniqueValues(images);
}

function getVariationMockups(group = {}, variation = null) {
  if (!variation) return [];

  return uniqueValues(
    (group.variation_mockups || [])
      .filter((row) => {
        if (!row || row.status === "rejected" || row.status === "archived") return false;
        if (String(row.variation_id || "") === String(variation.id || "")) return true;
        return Array.isArray(row.variation_ids) && row.variation_ids.some((id) => String(id) === String(variation.id || ""));
      })
      .sort((a, b) => {
        const aOrder = Number(a.sort_order ?? 0);
        const bOrder = Number(b.sort_order ?? 0);
        return aOrder - bOrder;
      })
      .map((row) => row.image_url)
  );
}

export function resolveArtworkGroup(product = {}, variation = null) {
  const groups = product.artwork_groups || [];
  if (!variation || groups.length === 0) return null;

  const attrs = getVariationAttributes(variation);

  const exactVariation = groups.find((group) => {
    if (!Array.isArray(group.variation_ids)) return false;
    return group.variation_ids.includes(variation.id) && ["variation", "custom"].includes(group.scope_type);
  });
  if (exactVariation) return exactVariation;

  const customVariation = groups.find((group) => Array.isArray(group.variation_ids) && group.variation_ids.includes(variation.id));
  if (customVariation) return customVariation;

  const attributeMatch = groups.find((group) => {
    if (group.scope_type !== "attribute") return false;
    if (!group.attribute_key || group.attribute_value === undefined || group.attribute_value === null) return false;
    const actualKey = Object.keys(attrs).find((key) => normalizeAttrKey(key) === normalizeAttrKey(group.attribute_key));
    return actualKey && String(attrs[actualKey]) === String(group.attribute_value);
  });
  if (attributeMatch) return attributeMatch;

  const colourValue = getVariationColour(variation);
  if (colourValue) {
    const colourMatch = groups.find((group) => (
      group.scope_type === "attribute"
      && isColourKey(group.attribute_key)
      && String(group.attribute_value) === String(colourValue)
    ));
    if (colourMatch) return colourMatch;
  }

  return groups.find((group) => group.scope_type === "all") || groups[0] || null;
}

export function getFallbackProductImages(product = {}) {
  return uniqueValues([
    product.primary_mockup_image_url,
    product.mockup_image_url,
    ...(product.mockup_images || []),
    product.product_image_url,
    product.mockup_url,
  ]);
}

export function getProductGalleryImages(product = {}, variation = null) {
  const group = resolveArtworkGroup(product, variation);
  const variationMockups = group ? getVariationMockups(group, variation) : [];
  const groupImages = group ? getGroupMockups(group) : [];
  const fallbackImages = getFallbackProductImages(product);

  // Variation-specific generated mockups must win. A product-level primary image
  // must never hide a mockup generated for the exact selected variation.
  if (variationMockups.length) {
    return uniqueValues([...variationMockups, ...groupImages, ...fallbackImages]);
  }

  return uniqueValues([...groupImages, ...fallbackImages]);
}

export function getProductPrimaryImage(product = {}, variation = null) {
  return getProductGalleryImages(product, variation)[0] || "";
}

export function getProductPrimaryImageUrl(product = {}, variation = null) {
  const image = getProductPrimaryImage(product, variation);
  return image ? assetUrl(image) : "";
}

export function getCartImage(item = {}) {
  return item.customization?.preview_image || item.mockup_url || item.primary_mockup_image_url || (item.mockup_images || [])[0] || "";
}

export function getCartVariationLabel(item = {}) {
  if (item.variation_label) return item.variation_label;
  const attrs = item.attribute_values || {};
  const label = Object.entries(attrs).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`).join(" / ");
  if (label) return label;
  return [item.size, item.color].filter(Boolean).join(" / ") || "Default";
}
