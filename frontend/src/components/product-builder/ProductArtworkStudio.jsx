import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Image as ImageIcon, Move, RefreshCw, RotateCcw, Trash2, Type } from "lucide-react";
import { http, assetUrl } from "../../lib/api";
import { resolveEffectiveProductionSetup } from "../../lib/templateProductionResolver";
import { geometryClipStyle, normalisePrintAreaGeometry, traceCanvasPrintAreaPath } from "../../lib/printAreaGeometry";
import { generateVariationMockups, applyVariationMockupsToGroups } from "./variationMockupGeneration";
import { renderDerivedMockupCanvas } from "../../lib/derivedMockupRenderer";
import "./productBuilderV2.css";
import {
  asArray,
  calculateAreaPrintCost,
  getAggregatedPrintCostLines,
  getGroupRepresentativeVariationId,
  getVariationLabel,
  makeId,
  money,
  normalizeProductionMethodKey,
} from "./productBuilderUtils";

const TEXT_RENDER_MIN = 24;
const TEXT_RENDER_MAX = 1200;
const ALPHA_TRIM_THRESHOLD = 24;
const METHOD_ORDER = ["dtf", "htv", "sublimation", "uv_dtf", "adhesive_vinyl"];
const METHOD_LABELS = {
  dtf: "DTF",
  htv: "HTV",
  sublimation: "Sublimation",
  uv_dtf: "UV DTF",
  adhesive_vinyl: "Adhesive Vinyl",
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value || 0)));
const round = (value) => Math.round(Number(value || 0) * 10) / 10;
const roundMoney = (value) => Math.round(Number(value || 0) * 100) / 100;
const compact = (value) => String(value || "").trim();

const TEXT_FONT_OPTIONS = [
  "Roboto", "Montserrat", "Poppins", "Oswald", "Bebas Neue", "Anton", "Raleway",
  "Playfair Display", "Lobster", "Pacifico", "Bangers", "Permanent Marker",
  "Arial", "Impact", "Georgia", "Courier New",
];
const GOOGLE_FONT_FAMILIES = new Set([
  "Roboto", "Montserrat", "Poppins", "Oswald", "Bebas Neue", "Anton", "Raleway",
  "Playfair Display", "Lobster", "Pacifico", "Bangers", "Permanent Marker",
]);

function areaPct(area, key) {
  if (!area) return 0;
  const pct = area[`${key}_pct`];
  const direct = area[key];
  if (pct !== undefined && pct !== null && pct !== "") return Number(pct || 0);
  if (direct !== undefined && direct !== null && direct !== "") return Number(direct || 0);
  return 0;
}

function screenLabel(screen = {}) {
  return screen.name || screen.label || screen.view_key || screen.screen_view || "View";
}

function defaultPlacement(area) {
  return {
    screen_id: area?.screen_id || "",
    print_area_id: area?.id || "",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
  };
}

function sanitizePlacement(placement, area) {
  const base = { ...defaultPlacement(area), ...(placement || {}) };
  const width = round(clamp(base.width, 2, 100));
  const height = round(clamp(base.height, 2, 100));
  return {
    ...base,
    x: round(clamp(base.x, 0, Math.max(0, 100 - width))),
    y: round(clamp(base.y, 0, Math.max(0, 100 - height))),
    width,
    height,
    rotation: round(base.rotation || 0),
  };
}

function patchGroup(groups, groupId, updater) {
  return groups.map((group) => {
    if (group.id !== groupId) return group;
    return typeof updater === "function" ? updater(group) : { ...group, ...updater };
  });
}

function fontCssFamily(fontFamily) {
  return GOOGLE_FONT_FAMILIES.has(fontFamily)
    ? `"${fontFamily}", Arial, sans-serif`
    : `${fontFamily || "Arial"}, Arial, sans-serif`;
}

function googleFontHref(fontFamily) {
  const family = String(fontFamily || "").trim().replace(/\s+/g, "+");
  return `https://fonts.googleapis.com/css2?family=${family}:wght@400;600;700;900&display=swap`;
}

function ensureGoogleFontLink(fontFamily) {
  if (typeof document === "undefined" || !GOOGLE_FONT_FAMILIES.has(fontFamily)) return;
  const id = `ff-google-font-${String(fontFamily).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = googleFontHref(fontFamily);
  document.head.appendChild(link);
}

async function ensureFontReady(fontFamily, weight = "700", size = 120) {
  if (typeof document === "undefined" || !document.fonts) return;
  ensureGoogleFontLink(fontFamily);
  try {
    await document.fonts.load(`${weight} ${size}px "${fontFamily}"`);
    await document.fonts.ready;
  } catch (error) {
    // Browser falls back to system fonts if Google Fonts cannot load.
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = assetUrl(src);
  });
}

function blobFromCanvas(canvas) {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png", 0.95));
}

function readImageFileDimensions(file) {
  return new Promise((resolve) => {
    if (!file || !file.type?.startsWith("image/")) {
      resolve({ width: 0, height: 0, aspectRatio: 0 });
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || img.width || 0;
      const height = img.naturalHeight || img.height || 0;
      URL.revokeObjectURL(url);
      resolve({ width, height, aspectRatio: width && height ? width / height : 0 });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 0, height: 0, aspectRatio: 0 });
    };
    img.src = url;
  });
}

function trimTransparentImageFile(file) {
  return new Promise((resolve) => {
    const fallback = async () => {
      const dimensions = await readImageFileDimensions(file);
      resolve({ file, ...dimensions, trimmed: false });
    };
    if (!file || !["image/png", "image/webp", "image/svg+xml"].includes(String(file.type || "").toLowerCase())) {
      fallback();
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      try {
        const width = img.naturalWidth || img.width || 0;
        const height = img.naturalHeight || img.height || 0;
        if (!width || !height) {
          URL.revokeObjectURL(url);
          fallback();
          return;
        }

        const source = document.createElement("canvas");
        source.width = width;
        source.height = height;
        const sourceContext = source.getContext("2d", { willReadFrequently: true });
        sourceContext.drawImage(img, 0, 0);
        const pixels = sourceContext.getImageData(0, 0, width, height).data;
        let left = width;
        let top = height;
        let right = -1;
        let bottom = -1;

        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            if (pixels[(y * width + x) * 4 + 3] <= ALPHA_TRIM_THRESHOLD) continue;
            if (x < left) left = x;
            if (x > right) right = x;
            if (y < top) top = y;
            if (y > bottom) bottom = y;
          }
        }

        if (right < left || bottom < top || (left === 0 && top === 0 && right === width - 1 && bottom === height - 1)) {
          URL.revokeObjectURL(url);
          resolve({ file, width, height, aspectRatio: width / height, trimmed: false });
          return;
        }

        const cropWidth = right - left + 1;
        const cropHeight = bottom - top + 1;
        const cropped = document.createElement("canvas");
        cropped.width = cropWidth;
        cropped.height = cropHeight;
        cropped.getContext("2d").drawImage(source, left, top, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
        const blob = await blobFromCanvas(cropped);
        URL.revokeObjectURL(url);
        if (!blob) {
          fallback();
          return;
        }
        const baseName = String(file.name || "artwork").replace(/\.[^.]+$/, "");
        const trimmedFile = new File([blob], `${baseName}-trimmed.png`, { type: "image/png", lastModified: file.lastModified || Date.now() });
        resolve({ file: trimmedFile, width: cropWidth, height: cropHeight, aspectRatio: cropWidth / cropHeight, trimmed: true });
      } catch (error) {
        URL.revokeObjectURL(url);
        fallback();
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      fallback();
    };
    img.src = url;
  });
}

function escapeSvg(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normaliseTextSettings(settings = {}) {
  return {
    text_content: String(settings.text_content || settings.text || "Custom Text").slice(0, 240),
    text_font_family: settings.text_font_family || "Roboto",
    text_font_weight: String(settings.text_font_weight || "700"),
    text_font_size: clamp(settings.text_font_size || 180, TEXT_RENDER_MIN, TEXT_RENDER_MAX),
    text_color: settings.text_color || "#111111",
  };
}

function estimateTextWidth(line, fontSize, fontFamily) {
  const family = String(fontFamily || "").toLowerCase();
  const factor = family.includes("courier") ? 0.62 : family.includes("impact") || family.includes("anton") ? 0.58 : family.includes("pacifico") || family.includes("lobster") ? 0.52 : 0.56;
  return Math.max(1, String(line || "").length * fontSize * factor);
}

function buildTextLayerAsset(settings = {}) {
  const next = normaliseTextSettings(settings);
  ensureGoogleFontLink(next.text_font_family);
  const lines = next.text_content.split(/\r?\n/).filter((line) => line.trim() !== "");
  const safeLines = lines.length ? lines : ["Custom Text"];
  const fontSize = clamp(next.text_font_size, TEXT_RENDER_MIN, TEXT_RENDER_MAX);
  const paddingX = Math.ceil(fontSize * 0.24);
  const paddingY = Math.ceil(fontSize * 0.28);
  const lineHeight = Math.ceil(fontSize * 1.28);
  const width = Math.ceil(Math.max(...safeLines.map((line) => estimateTextWidth(line, fontSize, next.text_font_family))) + paddingX * 2);
  const height = Math.ceil(safeLines.length * lineHeight + paddingY * 2);
  const tspans = safeLines.map((line, index) => (
    `<tspan x="${paddingX}" y="${paddingY + fontSize + index * lineHeight}">${escapeSvg(line)}</tspan>`
  )).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="transparent"/><text font-family="${escapeSvg(next.text_font_family)}" font-size="${fontSize}" font-weight="${escapeSvg(next.text_font_weight)}" fill="${escapeSvg(next.text_color)}">${tspans}</text></svg>`;
  return {
    original_url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    file_name: `${next.text_content.slice(0, 24).replace(/[^a-z0-9]+/gi, "-") || "text"}.svg`,
    mime_type: "image/svg+xml",
    text_layer: true,
    ...next,
    text_font_size: fontSize,
    original_width_px: width,
    original_height_px: height,
    artwork_aspect_ratio: width && height ? width / height : 1,
    lock_aspect_ratio: true,
  };
}

function drawImageContain(ctx, image, x, y, w, h) {
  // The saved placement box is the artwork geometry. Drawing the stored,
  // already-trimmed asset directly into it keeps editor and mockup identical.
  ctx.drawImage(image, x, y, w, h);
}

async function drawTextLayer(ctx, slot, x, y, w, h) {
  const settings = normaliseTextSettings(slot);
  const lines = settings.text_content.split(/\r?\n/).filter((line) => line.trim() !== "");
  const safeLines = lines.length ? lines : ["Custom Text"];
  const family = settings.text_font_family;
  const weight = settings.text_font_weight;
  await ensureFontReady(family, weight, settings.text_font_size);
  let fontSize = clamp(settings.text_font_size, TEXT_RENDER_MIN, TEXT_RENDER_MAX);
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillStyle = settings.text_color;
  ctx.font = `${weight} ${fontSize}px ${fontCssFamily(family)}`;
  const maxTextWidth = Math.max(...safeLines.map((line) => ctx.measureText(line).width), 1);
  const lineHeight = fontSize * 1.28;
  const totalHeight = lineHeight * safeLines.length;
  const scale = Math.min((w * 0.92) / maxTextWidth, (h * 0.86) / totalHeight, 1);
  fontSize = Math.max(4, fontSize * scale);
  ctx.font = `${weight} ${fontSize}px ${fontCssFamily(family)}`;
  const finalLineHeight = fontSize * 1.28;
  const finalTotalHeight = finalLineHeight * safeLines.length;
  const startY = y + h / 2 - finalTotalHeight / 2 + finalLineHeight / 2;
  safeLines.forEach((line, index) => ctx.fillText(line, x + w / 2, startY + index * finalLineHeight));
}

function isNeckLabelArea(area) {
  const key = String(area?.area_key || area?.key || "").toLowerCase();
  const name = String(area?.name || area?.label || "").toLowerCase();
  const view = String(area?.screen_view || area?.view_key || "").toLowerCase();
  return key.includes("neck_label") || name.includes("neck label") || view.includes("neck_label");
}

function slotHasArtwork(slot = {}) {
  return Boolean(slot.original_url || slot.text_layer || slot.text_content);
}

function normaliseColour(colour) {
  if (!colour && colour !== 0) return null;
  if (typeof colour === "string") {
    const value = colour.trim();
    if (!value) return null;
    return { id: value, label: value, value, hex: value.startsWith("#") ? value : "" };
  }
  const value = compact(colour.value || colour.hex || colour.code || colour.slug || colour.name || colour.label);
  if (!value) return null;
  return {
    ...colour,
    id: compact(colour.id || colour.slug || value),
    label: compact(colour.label || colour.name || value),
    value,
    hex: compact(colour.hex || (value.startsWith("#") ? value : "")),
  };
}

function colourKey(value) {
  if (!value && value !== 0) return "";
  if (typeof value === "object") return colourKey(value.value || value.hex || value.name || value.label || value.id);
  return String(value || "").trim().toLowerCase();
}

function colourInList(value, colours) {
  const key = colourKey(value);
  if (!key) return false;
  return asArray(colours).some((colour) => {
    const normalised = normaliseColour(colour);
    return [normalised?.id, normalised?.value, normalised?.label, normalised?.hex].some((candidate) => colourKey(candidate) === key);
  });
}

function methodLabel(methodKey, fallback = "Manufacturing") {
  const canonical = normalizeProductionMethodKey(methodKey);
  return METHOD_LABELS[canonical] || compact(fallback) || canonical.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) || "Manufacturing";
}

function profileLabel(profile = {}) {
  return compact(profile.display_label || profile.profile_name || profile.rule_name || profile.name || profile.print_method || profile.method_name || "Manufacturing Profile");
}

function collectIdentityValues(record = {}) {
  return [
    record.id,
    record.profile_id,
    record.production_profile_id,
    record.manufacturing_profile_id,
    record.print_option_id,
    record.legacy_print_option_id,
    record.legacy_source_identifier,
    record.source_identifier,
    record.source_id,
    record.legacy_id,
  ].map((value) => compact(value)).filter(Boolean);
}

function profileIdentityValues(profile = {}) {
  return new Set([
    profile.id,
    profile.profile_id,
    profile.manufacturing_profile_id,
    profile.production_profile_id,
    profile.print_option_id,
    profile.legacy_print_option_id,
    profile.legacy_source_identifier,
    profile.source_identifier,
    profile.source_print_option_id,
    profile.source_print_option_slug,
    ...asArray(profile.identity_values),
  ].map((value) => compact(value)).filter(Boolean));
}

function profileExactMatchValues(profile = {}) {
  return new Set([
    ...profileIdentityValues(profile),
    profile.profile_name,
    profile.rule_name,
    profile.display_label,
    profile.display_name,
    profile.profile_label,
    profile.print_size,
    profile.profile_print_size,
  ].map((value) => compact(value).toLowerCase()).filter(Boolean));
}

function profileMethodValues(profile = {}) {
  return new Set([
    profile.method_key,
    profile.production_method_key,
    profile.manufacturing_method_id,
    profile.method_name,
    profile.method,
    profile.production_method_display_name,
  ].map((value) => normalizeProductionMethodKey(value)).filter(Boolean));
}

function normaliseManufacturingProfile(raw = {}) {
  const methodKey = normalizeProductionMethodKey(raw.method_key || raw.production_method_key || raw.method || raw.method_name || raw.print_method || raw.rule_method || "");
  const methodName = compact(raw.method_name || raw.print_method || raw.method || methodLabel(methodKey));
  const id = compact(raw.id || raw.profile_id || raw.manufacturing_profile_id || raw.production_profile_id || raw.print_option_id || raw.legacy_print_option_id || raw.name);
  const colours = asArray(raw.approved_stocked_colours || raw.stocked_colours || raw.approved_colours || raw.colours || raw.colors).map(normaliseColour).filter(Boolean);
  const rawColourMode = compact(raw.colour_mode || raw.color_mode || raw.print_colour_mode || raw.colour_restriction || raw.color_restriction).toLowerCase();
  const inferredColourMode = ["dtf", "sublimation", "uv_dtf"].includes(methodKey) ? "rgb" : ["htv", "adhesive_vinyl"].includes(methodKey) ? "stocked" : "rgb";
  const profileName = compact(raw.profile_name || raw.rule_name || raw.name || raw.print_size || raw.print_method || methodName);
  const displayLabel = compact(raw.display_label || raw.label || profileName || methodName);
  return {
    ...raw,
    id,
    profile_id: compact(raw.profile_id || id),
    manufacturing_profile_id: compact(raw.manufacturing_profile_id || raw.production_profile_id || id),
    method_key: methodKey,
    method_name: methodName,
    profile_name: profileName,
    rule_name: compact(raw.rule_name || profileName),
    display_label: displayLabel,
    calculation_type: compact(raw.calculation_type || "fixed").toLowerCase(),
    print_cost_max: Number(raw.print_cost_max ?? raw.creator_print_price ?? raw.platform_print_cost ?? 0),
    platform_print_cost: Number(raw.platform_print_cost ?? raw.print_cost_max ?? 0),
    cost_per_cm2: Number(raw.cost_per_cm2 ?? 0),
    minimum_print_cost: Number(raw.minimum_print_cost ?? 0),
    sheet_width_mm: Number(raw.sheet_width_mm ?? 0),
    sheet_height_mm: Number(raw.sheet_height_mm ?? 0),
    sheet_cost: Number(raw.sheet_cost ?? 0),
    waste_percentage: Number(raw.waste_percentage ?? 0),
    markup_percentage: Number(raw.markup_percentage ?? 0),
    creator_print_price: Number(raw.creator_print_price ?? raw.print_cost_max ?? raw.platform_print_cost ?? 0),
    platform_print_markup_type: compact(raw.platform_print_markup_type || ""),
    platform_print_markup_value: Number(raw.platform_print_markup_value ?? 0),
    colour_mode: rawColourMode || inferredColourMode,
    approved_stocked_colours: colours,
    source_type: compact(raw.source_type || raw.profile_source_type || "manufacturing_profile"),
    legacy_source_identifier: compact(raw.legacy_source_identifier || raw.legacy_print_option_id || raw.print_option_id || raw.source_identifier || raw.source_id || ""),
    legacy_print_option_id: compact(raw.legacy_print_option_id || raw.print_option_id || ""),
    active: raw.active !== false && !["inactive", "archived", "disabled"].includes(String(raw.status || "active").toLowerCase()),
    identity_values: collectIdentityValues(raw),
  };
}

function profileFromLegacyPrintOption(option = {}) {
  return normaliseManufacturingProfile({
    ...option,
    id: option.id,
    profile_id: option.id,
    manufacturing_profile_id: option.id,
    profile_name: option.rule_name || option.name || option.print_method,
    display_label: option.display_label || option.name || [option.print_method || option.method, option.print_size].filter(Boolean).join(" · "),
    method_name: option.print_method || option.method,
    source_type: "legacy_print_option",
    legacy_source_identifier: option.id,
    legacy_print_option_id: option.id,
  });
}

function supportsStockedColours(profile = {}) {
  const methodKey = normalizeProductionMethodKey(profile.method_key || profile.method_name || profile.print_method);
  const mode = String(profile.colour_mode || profile.color_mode || "").toLowerCase();
  if (["dtf", "sublimation", "uv_dtf"].includes(methodKey)) return false;
  if (["rgb", "full_colour", "full_color", "cmyk"].includes(mode)) return false;
  if (["stocked", "stock", "spot", "single_colour", "single_color", "vinyl_colour", "vinyl_color"].includes(mode)) return true;
  return ["htv", "adhesive_vinyl"].includes(methodKey);
}

function profileMatchesAllowedIds(profile, allowedIds, { methodFallback = true } = {}) {
  const allowed = asArray(allowedIds).map((value) => compact(value)).filter(Boolean);
  if (!allowed.length) return true;
  const exactValues = profileExactMatchValues(profile);
  if (allowed.some((id) => exactValues.has(id.toLowerCase()))) return true;
  if (!methodFallback) return false;
  const methodValues = profileMethodValues(profile);
  return allowed.some((id) => methodValues.has(normalizeProductionMethodKey(id)));
}

function resolveProfileForSlot(slot = {}, profiles = [], legacyPrintOptions = []) {
  const profileCandidates = [
    slot.manufacturing_profile_id,
    slot.production_profile_id,
    slot.profile_id,
    slot.print_option_id,
    slot.legacy_print_option_id,
    slot.legacy_source_identifier,
  ].map((value) => compact(value)).filter(Boolean);
  const profile = asArray(profiles).find((item) => {
    const values = profileIdentityValues(item);
    return profileCandidates.some((candidate) => values.has(candidate));
  });
  if (profile) return profile;
  const legacy = asArray(legacyPrintOptions).find((option) => profileCandidates.includes(compact(option.id)));
  return legacy ? profileFromLegacyPrintOption(legacy) : null;
}

function calculateArtworkPrintSize(area, placement) {
  const areaWidthMm = Number(area?.width_mm || 0);
  const areaHeightMm = Number(area?.height_mm || 0);
  const widthPct = Number(placement?.width ?? placement?.width_pct ?? 100);
  const heightPct = Number(placement?.height ?? placement?.height_pct ?? 100);
  if (!areaWidthMm || !areaHeightMm || !widthPct || !heightPct) {
    return { valid: false, widthPct, heightPct, areaWidthMm, areaHeightMm };
  }
  const widthMm = areaWidthMm * (widthPct / 100);
  const heightMm = areaHeightMm * (heightPct / 100);
  const areaCm2 = (widthMm / 10) * (heightMm / 10);
  if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm) || !Number.isFinite(areaCm2) || areaCm2 <= 0) {
    return { valid: false, widthPct, heightPct, areaWidthMm, areaHeightMm };
  }
  return {
    valid: true,
    widthMm: round(widthMm),
    heightMm: round(heightMm),
    widthCm: Math.round((widthMm / 10) * 10) / 10,
    heightCm: Math.round((heightMm / 10) * 10) / 10,
    areaCm2: Math.round(areaCm2 * 10) / 10,
    areaWidthMm,
    areaHeightMm,
    areaWidthCm: Math.round((areaWidthMm / 10) * 10) / 10,
    areaHeightCm: Math.round((areaHeightMm / 10) * 10) / 10,
    widthPct: round(widthPct),
    heightPct: round(heightPct),
  };
}

function profilePatchForSlot(slot, area, profile, { preserveSelectedColour = true } = {}) {
  const stocked = supportsStockedColours(profile);
  const colours = asArray(profile.approved_stocked_colours).map(normaliseColour).filter(Boolean);
  const existingColour = slot.selected_stocked_colour || slot.stocked_colour || "";
  const selectedColour = stocked
    ? preserveSelectedColour && colourInList(existingColour, colours)
      ? existingColour
      : colours[0]?.value || ""
    : "";
  const option = { ...profile };
  const costing = calculateAreaPrintCost({ ...slot, ...profile, placement: sanitizePlacement(slot.placement, area) }, area, option);
  return {
    print_option_id: profile.id,
    production_profile_id: profile.manufacturing_profile_id || profile.id,
    manufacturing_profile_id: profile.manufacturing_profile_id || profile.id,
    manufacturing_profile_source_type: profile.source_type,
    manufacturing_profile_display_label: profile.display_label,
    manufacturing_profile_name: profile.profile_name,
    profile_name: profile.profile_name,
    method_key: profile.method_key,
    method_name: profile.method_name,
    print_method: profile.method_name,
    rule_name: profile.rule_name || profile.profile_name,
    print_size: profile.print_size || area?.standard_print_size_key || slot.standard_print_size_key || "",
    source_type: profile.source_type,
    legacy_source_identifier: profile.legacy_source_identifier,
    legacy_print_option_id: profile.legacy_print_option_id,
    active: profile.active,
    calculation_type: profile.calculation_type || "fixed",
    print_cost_max: costing.calculated_print_cost,
    platform_print_cost: profile.platform_print_cost,
    creator_print_price: profile.creator_print_price,
    cost_per_cm2: Number(profile.cost_per_cm2 || 0),
    minimum_print_cost: Number(profile.minimum_print_cost || 0),
    sheet_width_mm: Number(profile.sheet_width_mm || 0),
    sheet_height_mm: Number(profile.sheet_height_mm || 0),
    sheet_cost: Number(profile.sheet_cost || 0),
    waste_percentage: Number(profile.waste_percentage || 0),
    markup_percentage: Number(profile.markup_percentage || 0),
    platform_print_markup_type: profile.platform_print_markup_type || "",
    platform_print_markup_value: Number(profile.platform_print_markup_value || 0),
    colour_mode: profile.colour_mode || "rgb",
    approved_stocked_colours: colours,
    stocked_colour_required: stocked,
    selected_stocked_colour: selectedColour,
    stocked_colour: selectedColour,
    standard_print_size_key: profile.standard_print_size_key || area?.standard_print_size_key || slot.standard_print_size_key || "",
    width_mm: area?.width_mm ?? slot.width_mm ?? "",
    height_mm: area?.height_mm ?? slot.height_mm ?? "",
    dpi: profile.dpi || area?.dpi || slot.dpi || 300,
    fit_mode: profile.fit_mode || area?.fit_mode || slot.fit_mode || "contain",
    production_notes: profile.production_notes || slot.production_notes || "",
    pricing_notes: profile.pricing_notes || "",
    placement_box_width_mm: costing.placement_box_width_mm,
    placement_box_height_mm: costing.placement_box_height_mm,
    artwork_aspect_ratio: costing.artwork_aspect_ratio || slot.artwork_aspect_ratio || 0,
    print_area_width_mm: costing.print_area_width_mm,
    print_area_height_mm: costing.print_area_height_mm,
    artwork_width_mm: costing.artwork_width_mm,
    artwork_height_mm: costing.artwork_height_mm,
    print_width_mm: costing.print_width_mm,
    print_height_mm: costing.print_height_mm,
    area_cm2: costing.area_cm2,
    raw_print_cost: costing.raw_print_cost,
    calculated_print_cost: costing.calculated_print_cost,
    base_production_cost: costing.base_production_cost,
    waste_amount: costing.waste_amount,
    markup_amount: costing.markup_amount,
    calculated_profile_cost: costing.calculated_profile_cost,
    minimum_print_cost_applied: costing.minimum_print_cost_applied,
    final_artwork_production_cost: costing.final_artwork_production_cost,
    pricing_source: costing.pricing_source,
    calculation_source: costing.calculation_source,
    costing_warnings: costing.warnings || [],
  };
}

function TextLayerPreview({ slot }) {
  const settings = normaliseTextSettings(slot);
  useEffect(() => ensureGoogleFontLink(settings.text_font_family), [settings.text_font_family]);
  return (
    <div
      className="w-full h-full flex items-center justify-center text-center whitespace-pre pointer-events-none overflow-visible"
      style={{ fontFamily: fontCssFamily(settings.text_font_family), fontWeight: settings.text_font_weight, color: settings.text_color, fontSize: "100%", lineHeight: 1.2 }}
    >
      {settings.text_content}
    </div>
  );
}

function ResizeHandle({ position, onStart }) {
  const positionClasses = { nw: "-left-2 -top-2 cursor-nwse-resize", ne: "-right-2 -top-2 cursor-nesw-resize", sw: "-left-2 -bottom-2 cursor-nesw-resize", se: "-right-2 -bottom-2 cursor-nwse-resize" };
  return (
    <button
      type="button"
      aria-label={`Resize ${position}`}
      className={`absolute z-30 h-4 w-4 rounded-full bg-[#34C759] border-2 border-black ${positionClasses[position]}`}
      onPointerDown={onStart}
      onMouseDown={onStart}
    />
  );
}

function NumericControl({ label, value, onChange }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input-base" type="number" step="1" value={Number(value || 0)} onChange={(event) => onChange(Number(event.target.value || 0))} />
    </div>
  );
}

function ArtworkPrintSizeBlock({ area, placement }) {
  const size = calculateArtworkPrintSize(area, placement);
  return (
    <div className="border border-[#34C759]/30 bg-[#0A1B10] rounded-xl p-3">
      <div className="overline mb-2">Artwork Print Size</div>
      {size.valid ? (
        <div className="space-y-1 text-xs text-zinc-300">
          <div className="font-display text-3xl text-white">{size.widthCm.toFixed(1)} × {size.heightCm.toFixed(1)} cm</div>
          <div>{size.widthMm.toFixed(0)} × {size.heightMm.toFixed(0)} mm</div>
          <div>{size.areaCm2.toFixed(1)} cm²</div>
          <div className="text-zinc-500 pt-2">Print area: {size.areaWidthCm.toFixed(1)} × {size.areaHeightCm.toFixed(1)} cm</div>
          <div className="text-zinc-500">Layer: {size.widthPct.toFixed(1)}% × {size.heightPct.toFixed(1)}%</div>
        </div>
      ) : (
        <div className="text-xs text-zinc-500">Set print-area dimensions and layer size to calculate physical artwork dimensions safely.</div>
      )}
    </div>
  );
}

function ColourRestrictionBlock({ profile, slot, onChange }) {
  if (!profile) return null;
  const stocked = supportsStockedColours(profile);
  const colours = asArray(profile.approved_stocked_colours).map(normaliseColour).filter(Boolean);
  if (!stocked) {
    return (
      <div className="border border-white/10 bg-black/30 rounded-xl p-3 text-xs text-zinc-400">
        <div className="overline mb-2">Colour Mode</div>
        {methodLabel(profile.method_key)} supports RGB / full-colour artwork for this layer.
      </div>
    );
  }
  const valid = colourInList(slot.selected_stocked_colour || slot.stocked_colour, colours);
  return (
    <div className="border border-[#FFCC00]/40 bg-[#FFCC00]/10 rounded-xl p-3 space-y-2">
      <div className="overline mb-2 text-[#FFE08A]">Stocked Colour Required</div>
      <select className="input-base" value={slot.selected_stocked_colour || slot.stocked_colour || ""} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select stocked colour</option>
        {colours.map((colour) => <option key={colour.id || colour.value} value={colour.value}>{colour.label}</option>)}
      </select>
      {!colours.length && <p className="text-xs text-[#FFE08A]">This profile is restricted to stocked colours, but no approved colours were returned for it.</p>}
      {colours.length > 0 && !valid && <p className="text-xs text-[#FFE08A]">Choose an approved stocked colour before saving this layer.</p>}
    </div>
  );
}

async function renderSlotIntoPrintAreaLayer(slot, area, targetWidth, targetHeight) {
  const width = Math.max(1, Math.round(Number(targetWidth || 0)));
  const height = Math.max(1, Math.round(Number(targetHeight || 0)));
  const layer = document.createElement("canvas");
  layer.width = width;
  layer.height = height;
  const context = layer.getContext("2d");
  const geometry = normalisePrintAreaGeometry(area);
  const placement = sanitizePlacement(slot.placement, area);
  const artX = (Number(placement.x || 0) / 100) * width;
  const artY = (Number(placement.y || 0) / 100) * height;
  const artW = (Number(placement.width || 100) / 100) * width;
  const artH = (Number(placement.height || 100) / 100) * height;
  const rotation = (Number(placement.rotation || 0) * Math.PI) / 180;

  context.save();
  if (geometry.geometry_type !== "mask") {
    traceCanvasPrintAreaPath(context, geometry, 0, 0, width, height);
    context.clip();
  }
  context.translate(artX + artW / 2, artY + artH / 2);
  context.rotate(rotation);
  if (slot.text_layer) {
    await drawTextLayer(context, slot, -artW / 2, -artH / 2, artW, artH);
  } else {
    const artworkImage = await loadImage(slot.original_url);
    drawImageContain(context, artworkImage, -artW / 2, -artH / 2, artW, artH);
  }
  context.restore();

  if (geometry.geometry_type === "mask" && geometry.mask_url) {
    const maskImage = await loadImage(geometry.mask_url);
    context.save();
    context.globalCompositeOperation = "destination-in";
    context.drawImage(maskImage, 0, 0, width, height);
    context.restore();
  }

  return layer;
}

async function composePrintAreaArtworkCanvas(slots, area, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(Number(width || 0)));
  canvas.height = Math.max(1, Math.round(Number(height || 0)));
  const context = canvas.getContext("2d");

  for (const slot of asArray(slots)) {
    if (!slotHasArtwork(slot)) continue;
    const layer = await renderSlotIntoPrintAreaLayer(
      slot,
      area,
      canvas.width,
      canvas.height
    );
    context.drawImage(layer, 0, 0, canvas.width, canvas.height);
  }

  return canvas;
}

async function uploadGeneratedCanvas(canvas, fileName) {
  const blob = await blobFromCanvas(canvas);
  if (!blob) throw new Error("Could not generate mockup image");
  const formData = new FormData();
  formData.append(
    "file",
    new File([blob], fileName, { type: "image/png" })
  );
  formData.append("subdir", "product-mockups");
  const response = await http.post("/files/image", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data.url;
}

export default function ProductArtworkStudio({ template, printOptions, artworkGroups, onArtworkGroupsChange, selectedVariations, isAdmin = false }) {
  const [activeGroupId, setActiveGroupId] = useState(asArray(artworkGroups)[0]?.id || "");
  const [activeSlotId, setActiveSlotId] = useState("");
  const [activeScreenId, setActiveScreenId] = useState(asArray(template?.mockup_screens)[0]?.id || "");
  const [activePrintAreaId, setActivePrintAreaId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [generatingVariations, setGeneratingVariations] = useState(false);
  const [variationGenerationProgress, setVariationGenerationProgress] = useState({ completed: 0, total: 0, label: "" });
  const [generating, setGenerating] = useState(false);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [manufacturingProfiles, setManufacturingProfiles] = useState([]);
  const [previewPlacements, setPreviewPlacements] = useState({});
  const fileInputRef = useRef(null);
  const pendingUploadAreaRef = useRef(null);
  const pendingReplaceSlotIdRef = useRef("");
  const areaRefs = useRef({});
  const dragRef = useRef(null);
  const dragLatestRef = useRef(null);
  const dragCleanupRef = useRef(null);

  const groups = asArray(artworkGroups);
  const variations = asArray(selectedVariations);
  const screens = asArray(template?.mockup_screens).filter((screen) => screen?.id);
  const activeGroup = useMemo(() => groups.find((group) => group.id === activeGroupId) || groups[0] || null, [groups, activeGroupId]);
  const representativeVariationId = getGroupRepresentativeVariationId(activeGroup, variations);
  const representativeVariation = useMemo(() => variations.find((variation) => variation.id === representativeVariationId) || variations[0] || null, [representativeVariationId, variations]);

  const printAreas = useMemo(() => {
    return asArray(template?.print_areas).filter((area) => area?.id && area?.screen_id).map((area) => {
      const screen = screens.find((item) => item.id === area.screen_id) || {};
      const effective = resolveEffectiveProductionSetup(template || {}, representativeVariation || {}, { screen, defaultPrintArea: area });
      const override = effective.printAreaOverride || {};
      return {
        ...area,
        ...override,
        id: area.id,
        sourceMap: effective.sourceMap,
        effective_base_image_url: effective.canvasImageUrl || screen.image_url || area.image_url || "",
        screen_label: screenLabel(screen),
        x_pct: override.x_pct ?? area.x_pct ?? area.x ?? 0,
        y_pct: override.y_pct ?? area.y_pct ?? area.y ?? 0,
        width_pct: override.width_pct ?? area.width_pct ?? area.width ?? 0,
        height_pct: override.height_pct ?? area.height_pct ?? area.height ?? 0,
        x: override.x_pct ?? area.x_pct ?? area.x ?? 0,
        y: override.y_pct ?? area.y_pct ?? area.y ?? 0,
        width: override.width_pct ?? area.width_pct ?? area.width ?? 0,
        height: override.height_pct ?? area.height_pct ?? area.height ?? 0,
        width_mm: override.width_mm ?? area.width_mm ?? "",
        height_mm: override.height_mm ?? area.height_mm ?? "",
        standard_print_size_key: override.standard_print_size_key ?? area.standard_print_size_key ?? "",
      };
    });
  }, [template, representativeVariation, screens]);

  const slots = asArray(activeGroup?.artworks);
  const activeScreen = screens.find((screen) => screen.id === activeScreenId) || screens[0] || null;
  const currentScreenId = activeScreen?.id || "";
  const areasForScreen = printAreas.filter((area) => area.screen_id === currentScreenId);
  const normalPrintAreas = areasForScreen.filter((area) => !isNeckLabelArea(area));
  const currentScreenSlots = slots.filter((slot) => areasForScreen.some((area) => area.id === slot.print_area_id));
  const activeSlot = useMemo(() => slots.find((slot) => slot.id === activeSlotId) || currentScreenSlots[0] || null, [slots, activeSlotId, currentScreenSlots]);
  const activeArea = useMemo(() => {
    if (activeSlot) return printAreas.find((area) => area.id === activeSlot.print_area_id) || null;
    return areasForScreen.find((area) => area.id === activePrintAreaId) || areasForScreen[0] || null;
  }, [activeSlot, printAreas, areasForScreen, activePrintAreaId]);

  const legacyProfileFallbacks = useMemo(() => asArray(printOptions).map(profileFromLegacyPrintOption).filter((profile) => profile.id), [printOptions]);
  const profileCatalog = useMemo(() => {
    const merged = [];
    const primary = asArray(manufacturingProfiles).filter((profile) => profile?.id && profile.active !== false);
    [...primary, ...legacyProfileFallbacks].forEach((profile) => {
      if (!profile?.id || profile.active === false) return;
      const identities = profileIdentityValues(profile);
      const methodKey = normalizeProductionMethodKey(profile.method_key || profile.method_name || profile.print_method);
      const nameKey = compact(profile.profile_name || profile.rule_name || profile.display_label).toLowerCase();
      const existingIndex = merged.findIndex((existing) => {
        const existingIdentities = profileIdentityValues(existing);
        const identityMatch = [...identities].some((value) => existingIdentities.has(value));
        const existingMethodKey = normalizeProductionMethodKey(existing.method_key || existing.method_name || existing.print_method);
        const existingNameKey = compact(existing.profile_name || existing.rule_name || existing.display_label).toLowerCase();
        return identityMatch || Boolean(methodKey && nameKey && methodKey === existingMethodKey && nameKey === existingNameKey);
      });
      if (existingIndex === -1) {
        merged.push(profile);
        return;
      }
      const existing = merged[existingIndex];
      merged[existingIndex] = {
        ...profile,
        ...existing,
        identity_values: [...new Set([...profileIdentityValues(profile), ...profileIdentityValues(existing)])],
      };
    });
    return merged;
  }, [manufacturingProfiles, legacyProfileFallbacks]);

  const allowedProfilesForArea = (area) => {
    if (!area) return [];
    const templateOptionIds = asArray(template?.print_option_ids);
    const areaOptionIds = [
      ...asArray(area?.allowed_print_option_ids),
      ...asArray(area?.print_option_ids),
      ...asArray(area?.compatible_method_ids),
      ...asArray(area?.compatible_methods),
    ];
    const allowedIds = [...new Set(areaOptionIds.length ? areaOptionIds : templateOptionIds)];
    const activeProfiles = profileCatalog.filter((profile) => profile.active !== false);
    if (!allowedIds.length) return activeProfiles;
    const exactProfiles = activeProfiles.filter((profile) => profileMatchesAllowedIds(profile, allowedIds, { methodFallback: false }));
    if (exactProfiles.length) return exactProfiles;
    return activeProfiles.filter((profile) => profileMatchesAllowedIds(profile, allowedIds, { methodFallback: true }));
  };

  const allowedProfiles = useMemo(() => allowedProfilesForArea(activeArea), [activeArea, profileCatalog, template]);
  const selectedProfile = useMemo(() => {
    const candidate = resolveProfileForSlot(activeSlot || {}, profileCatalog, printOptions);
    if (!candidate) return null;
    const candidateIds = profileIdentityValues(candidate);
    return allowedProfiles.find((profile) => [...profileIdentityValues(profile)].some((value) => candidateIds.has(value))) || null;
  }, [activeSlot, allowedProfiles, profileCatalog, printOptions]);
  const activeImage = areasForScreen.find((area) => area.effective_base_image_url)?.effective_base_image_url || activeScreen?.image_url || "";
  const activePlacement = sanitizePlacement(previewPlacements[activeSlot?.id] || activeSlot?.placement, activeArea);
  const templateForCosting = useMemo(() => ({ ...(template || {}), print_areas: printAreas }), [template, printAreas]);
  const currentScreenCostLines = useMemo(() => getAggregatedPrintCostLines([{ ...(activeGroup || {}), artworks: currentScreenSlots }], profileCatalog, templateForCosting), [activeGroup, currentScreenSlots, profileCatalog, templateForCosting]);
  const allCostLines = useMemo(() => getAggregatedPrintCostLines(activeGroup ? [activeGroup] : [], profileCatalog, templateForCosting), [activeGroup, profileCatalog, templateForCosting]);
  const allGroupPrintCost = Math.round(
    allCostLines.reduce(
      (total, line) => total + Number(line.cost || 0),
      0
    ) * 100
  ) / 100;

  const selectedCostLine = useMemo(
    () => (
      allCostLines.find(
        (line) => asArray(line.slot_ids).includes(activeSlot?.id)
      ) || null
    ),
    [activeSlot?.id, allCostLines]
  );

  const selectedLayerCosting = useMemo(() => {
    if (!activeSlot || !activeArea) return null;
    const profile = selectedProfile || activeSlot;
    return calculateAreaPrintCost(activeSlot, activeArea, profile);
  }, [activeSlot, activeArea, selectedProfile]);

  const selectedLayerCost = Number(
    selectedCostLine?.cost
    ?? selectedLayerCosting?.calculated_print_cost
    ?? activeSlot?.calculated_print_cost
    ?? activeSlot?.print_cost_max
    ?? 0
  );

  const selectedLayerAreaCm2 = Number(
    selectedLayerCosting?.area_cm2 || activeSlot?.area_cm2 || 0
  );

  const selectedJobAreaCm2 = Number(
    selectedCostLine?.combined_area_cm2
    || selectedCostLine?.costing?.area_cm2
    || selectedLayerAreaCm2
  );
  const missingMethodCount = currentScreenSlots.filter((slot) => slotHasArtwork(slot) && !slot.print_option_id).length;
  const canGenerateMockup = Boolean(activeImage && currentScreenSlots.some((slot) => slotHasArtwork(slot) && slot.print_option_id));
  const groupedProfiles = useMemo(() => {
    const map = new Map();
    allowedProfiles.forEach((profile) => {
      const methodKey = normalizeProductionMethodKey(profile.method_key || profile.method_name || profile.print_method);
      const key = methodKey || "other";
      if (!map.has(key)) map.set(key, { key, label: methodLabel(key, profile.method_name), profiles: [] });
      map.get(key).profiles.push(profile);
    });
    return [...map.values()].sort((a, b) => {
      const ai = METHOD_ORDER.indexOf(a.key);
      const bi = METHOD_ORDER.indexOf(b.key);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.label.localeCompare(b.label);
    }).map((group) => ({ ...group, profiles: group.profiles.sort((a, b) => profileLabel(a).localeCompare(profileLabel(b))) }));
  }, [allowedProfiles]);

  useEffect(() => {
    let mounted = true;
    setProfilesLoading(true);
    http.get("/production-rules/print-option-profiles?active=true")
      .then((response) => {
        if (!mounted) return;
        const rows = asArray(response.data).map(normaliseManufacturingProfile).filter((profile) => profile.id && profile.active !== false);
        setManufacturingProfiles(rows);
      })
      .catch(() => {
        if (mounted) setManufacturingProfiles([]);
      })
      .finally(() => {
        if (mounted) setProfilesLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  useEffect(() => { slots.filter((slot) => slot.text_layer).forEach((slot) => ensureGoogleFontLink(slot.text_font_family || "Roboto")); }, [slots]);
  useEffect(() => { if (!activeGroupId && groups[0]?.id) setActiveGroupId(groups[0].id); }, [activeGroupId, groups]);
  useEffect(() => { if (!activeScreenId && screens[0]?.id) setActiveScreenId(screens[0].id); }, [activeScreenId, screens]);
  useEffect(() => {
    if (!activePrintAreaId && areasForScreen[0]?.id) setActivePrintAreaId(areasForScreen[0].id);
    if (activePrintAreaId && !areasForScreen.some((area) => area.id === activePrintAreaId)) setActivePrintAreaId(areasForScreen[0]?.id || "");
  }, [areasForScreen, activePrintAreaId]);

  const setGroups = (nextGroups) => onArtworkGroupsChange(nextGroups.map((group, index) => ({ ...group, sort_order: index })));
  const setGroupSlots = (groupId, nextSlots) => {
    const nextGroups = patchGroup(groups, groupId, (group) => {
      const primaryMockup = nextSlots.find((slot) => slot.mockup_image_url)?.mockup_image_url || group.primary_mockup_image_url || "";
      return { ...group, artworks: nextSlots.map((slot, index) => ({ ...slot, sort_order: index })), primary_mockup_image_url: primaryMockup };
    });
    setGroups(nextGroups);
  };
  const patchSlot = (slotId, patch) => {
    if (!activeGroup) return;
    setGroupSlots(activeGroup.id, slots.map((slot) => (slot.id === slotId ? { ...slot, ...patch } : slot)));
  };

  useEffect(() => {
    if (!activeGroup || !profileCatalog.length || !slots.length) return;
    let changed = false;
    const nextSlots = slots.map((slot) => {
      const area = printAreas.find((item) => item.id === slot.print_area_id);
      if (!area) return slot;
      const allowed = allowedProfilesForArea(area);
      const resolvedProfile = resolveProfileForSlot(slot, profileCatalog, printOptions);
      const resolvedIds = profileIdentityValues(resolvedProfile || {});
      const compatibleProfile = resolvedProfile
        ? allowed.find((profile) => [...profileIdentityValues(profile)].some((value) => resolvedIds.has(value)))
        : null;
      const profile = compatibleProfile || (allowed.length === 1 ? allowed[0] : null);
      if (!profile) {
        const hadInvalidProfile = Boolean(slot.print_option_id || slot.manufacturing_profile_id || slot.production_profile_id);
        if (!hadInvalidProfile) return slot;
        changed = true;
        return {
          ...slot,
          print_option_id: "",
          manufacturing_profile_id: "",
          production_profile_id: "",
          manufacturing_profile_display_label: "",
          manufacturing_profile_name: "",
          calculated_print_cost: 0,
          print_cost_max: 0,
        };
      }
      const patch = profilePatchForSlot(slot, area, profile, { preserveSelectedColour: true });
      const nextProfileId = patch.manufacturing_profile_id || patch.print_option_id;
      const currentProfileId = slot.manufacturing_profile_id || slot.production_profile_id || slot.print_option_id;
      const nextCost = roundMoney(patch.calculated_print_cost);
      const currentCost = roundMoney(slot.calculated_print_cost ?? slot.print_cost_max ?? 0);
      const nextArea = roundMoney(patch.area_cm2);
      const currentArea = roundMoney(slot.area_cm2 || 0);
      if (compact(nextProfileId) !== compact(currentProfileId) || nextCost !== currentCost || nextArea !== currentArea || !slot.manufacturing_profile_display_label) {
        changed = true;
        return { ...slot, ...patch };
      }
      return slot;
    });
    if (changed) setGroupSlots(activeGroup.id, nextSlots);
  }, [profileCatalog, activeGroup?.id, slots, printAreas, printOptions]);

  const areaRatioFor = (areaId) => {
    const rect = areaRefs.current[areaId]?.getBoundingClientRect?.();
    return rect?.height ? rect.width / rect.height : 1;
  };
  const fitHeightForAspect = (areaId, widthPercent, aspectRatio) => round(clamp((Number(widthPercent || 50) * areaRatioFor(areaId)) / Number(aspectRatio || 1), 2, 100));

  const centeredPlacement = (area, width, height, rotation = 0, centerX = 50, centerY = 50) => sanitizePlacement({
    ...defaultPlacement(area),
    x: Number(centerX || 50) - Number(width || 0) / 2,
    y: Number(centerY || 50) - Number(height || 0) / 2,
    width,
    height,
    rotation,
  }, area);

  const fittedPlacementForAspect = (area, aspectRatio, preferredWidth = 70, previousPlacement = null) => {
    const safeAspect = Math.max(0.0001, Number(aspectRatio || 1));
    let width = clamp(preferredWidth, 2, 100);
    let height = (width * areaRatioFor(area?.id)) / safeAspect;
    if (height > 100) {
      width *= 100 / height;
      height = 100;
    }
    const previous = previousPlacement ? sanitizePlacement(previousPlacement, area) : null;
    const centerX = previous ? previous.x + previous.width / 2 : 50;
    const centerY = previous ? previous.y + previous.height / 2 : 50;
    return centeredPlacement(area, round(width), round(height), previous?.rotation || 0, centerX, centerY);
  };

  const patchPlacement = (slotId, patch) => {
    const slot = slots.find((item) => item.id === slotId);
    const area = printAreas.find((item) => item.id === slot?.print_area_id);
    if (!slot || !area) return;
    const nextPlacement = sanitizePlacement({ ...(slot.placement || defaultPlacement(area)), ...patch }, area);
    const profile = resolveProfileForSlot(slot, profileCatalog, printOptions) || slot;
    const costing = calculateAreaPrintCost({ ...slot, placement: nextPlacement }, area, profile || {});
    patchSlot(slot.id, {
      placement: nextPlacement,
      placement_box_width_mm: costing.placement_box_width_mm,
      placement_box_height_mm: costing.placement_box_height_mm,
      artwork_aspect_ratio: costing.artwork_aspect_ratio || slot.artwork_aspect_ratio || 0,
      print_area_width_mm: costing.print_area_width_mm,
      print_area_height_mm: costing.print_area_height_mm,
      artwork_width_mm: costing.artwork_width_mm,
      artwork_height_mm: costing.artwork_height_mm,
      print_width_mm: costing.print_width_mm,
      print_height_mm: costing.print_height_mm,
      area_cm2: costing.area_cm2,
      raw_print_cost: costing.raw_print_cost,
      calculated_print_cost: costing.calculated_print_cost,
      print_cost_max: costing.calculated_print_cost,
      minimum_print_cost_applied: costing.minimum_print_cost_applied,
      final_artwork_production_cost: costing.final_artwork_production_cost,
      pricing_source: costing.pricing_source,
    });
  };

  const setLayerManufacturingProfile = (slotId, profileId) => {
    const slot = slots.find((item) => item.id === slotId);
    const area = printAreas.find((item) => item.id === slot?.print_area_id);
    const profile = profileCatalog.find((item) => item.id === profileId);
    if (!slot || !area) return;
    if (!profile) {
      patchSlot(slot.id, { print_option_id: "", manufacturing_profile_id: "", production_profile_id: "", calculated_print_cost: 0, print_cost_max: 0, selected_stocked_colour: "", stocked_colour_required: false, approved_stocked_colours: [] });
      return;
    }
    patchSlot(slot.id, profilePatchForSlot(slot, area, profile, { preserveSelectedColour: false }));
  };

  const setLayerStockedColour = (slotId, colourValue) => {
    const slot = slots.find((item) => item.id === slotId);
    if (!slot) return;
    const colour = normaliseColour(colourValue);
    patchSlot(slot.id, {
      selected_stocked_colour: colourValue,
      stocked_colour: colourValue,
      ...(slot.text_layer && colour?.hex ? { text_color: colour.hex } : {}),
    });
  };

  const createLayer = (area, patch = {}) => {
    if (!activeGroup) { toast.error("Create an artwork group first."); return null; }
    if (!area) { toast.error("Add print areas to the selected product view first."); return null; }
    const base = { id: makeId("art"), artwork_group_id: activeGroup.id, print_area_id: area.id, print_option_id: "", screen_id: area.screen_id || "", screen_view: area.screen_view || area.view_key || area.screen_label || "", area_key: area.area_key || area.key || "", standard_print_size_key: area.standard_print_size_key || "", width_mm: area.width_mm || "", height_mm: area.height_mm || "", dpi: area.dpi || "", fit_mode: area.fit_mode || "contain", original_url: "", file_name: "", mime_type: "", status: isAdmin ? "approved" : "pending_review", placement: defaultPlacement(area), lock_aspect_ratio: true, mockup_image_url: "", notes: "", sort_order: slots.length, ...patch };
    const defaults = allowedProfilesForArea(area);
    const defaultProfile = defaults.length === 1 ? defaults[0] : null;
    const withProfile = defaultProfile ? { ...base, ...profilePatchForSlot(base, area, defaultProfile, { preserveSelectedColour: false }) } : base;
    setGroupSlots(activeGroup.id, [...slots, withProfile]);
    setActiveSlotId(withProfile.id);
    setActivePrintAreaId(area.id);
    setActiveScreenId(area.screen_id || currentScreenId);
    return withProfile;
  };

  const addTextLayer = () => {
    const area = activeArea || normalPrintAreas[0] || areasForScreen[0];
    const asset = buildTextLayerAsset({ text_content: "Custom Text" });
    const placement = fittedPlacementForAspect(area, asset.artwork_aspect_ratio, 45);
    createLayer(area, { ...asset, placement });
  };

  const uploadFileToImageLayer = async (file) => {
    const replaceSlotId = pendingReplaceSlotIdRef.current;
    const replaceSlot = slots.find((slot) => slot.id === replaceSlotId) || null;
    const replaceArea = printAreas.find((area) => area.id === replaceSlot?.print_area_id) || null;
    const area = replaceArea || pendingUploadAreaRef.current || activeArea || normalPrintAreas[0] || areasForScreen[0];
    pendingReplaceSlotIdRef.current = "";
    pendingUploadAreaRef.current = null;
    if (!file || !area) return;
    setUploading(true);
    try {
      const prepared = await trimTransparentImageFile(file);
      const data = new FormData();
      data.append("file", prepared.file);
      data.append("subdir", "product-artwork");
      const response = await http.post("/files/image", data);
      const placement = fittedPlacementForAspect(
        area,
        prepared.aspectRatio || 1,
        replaceSlot?.placement?.width || 70,
        replaceSlot?.placement || null
      );
      const patch = {
        original_url: response.data.url,
        file_name: file.name,
        mime_type: prepared.file.type || file.type || "",
        original_width_px: prepared.width,
        original_height_px: prepared.height,
        artwork_aspect_ratio: prepared.aspectRatio || 1,
        transparent_bounds_trimmed: prepared.trimmed,
        lock_aspect_ratio: true,
        text_layer: false,
        text_content: "",
        mockup_image_url: "",
        placement,
      };
      if (replaceSlot) {
        patchSlot(replaceSlot.id, patch);
        setActiveSlotId(replaceSlot.id);
        setActivePrintAreaId(area.id);
        setActiveScreenId(area.screen_id || currentScreenId);
        toast.success("Image layer replaced");
      } else {
        createLayer(area, patch);
        toast.success("Image layer uploaded");
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Image upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const updateTextLayer = (patch) => {
    if (!activeSlot?.text_layer || !activeArea) return;
    const nextSettings = normaliseTextSettings({ text_content: activeSlot.text_content, text_font_family: activeSlot.text_font_family, text_font_weight: activeSlot.text_font_weight, text_font_size: activeSlot.text_font_size, text_color: activeSlot.text_color, ...patch });
    const asset = buildTextLayerAsset(nextSettings);
    const placement = sanitizePlacement(activeSlot.placement, activeArea);
    const nextPlacement = activeSlot.lock_aspect_ratio === false ? placement : { ...placement, height: fitHeightForAspect(activeArea.id, placement.width, asset.artwork_aspect_ratio) };
    patchSlot(activeSlot.id, { ...asset, placement: nextPlacement });
    window.requestAnimationFrame(() => patchPlacement(activeSlot.id, nextPlacement));
  };

  const removeSlot = useCallback((slotId) => {
    if (!activeGroup) return;
    const next = slots.filter((slot) => slot.id !== slotId);
    setGroupSlots(activeGroup.id, next);
    const nextSlot = next.find((slot) => slot.screen_id === currentScreenId) || next[0];
    setActiveSlotId(nextSlot?.id || "");
    toast.success("Layer deleted");
  }, [activeGroup, slots, currentScreenId, setGroupSlots]);

  useEffect(() => {
    const handleDeleteKey = (event) => {
      if (!["Delete", "Backspace"].includes(event.key) || !activeSlot?.id) return;
      const target = event.target;
      const tagName = String(target?.tagName || "").toLowerCase();
      if (target?.isContentEditable || ["input", "textarea", "select"].includes(tagName)) return;
      event.preventDefault();
      removeSlot(activeSlot.id);
    };
    window.addEventListener("keydown", handleDeleteKey);
    return () => window.removeEventListener("keydown", handleDeleteKey);
  }, [activeSlot?.id, removeSlot]);

  const startDrag = (event, slot, type, handle = "") => {
    if (dragRef.current) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (
      event.button !== undefined
      && event.button !== null
      && event.button !== 0
    ) {
      return;
    }

    const area = printAreas.find(
      (item) => item.id === slot?.print_area_id
    );
    const areaElement = areaRefs.current[area?.id];

    if (!slot || !area || !areaElement) return;

    event.preventDefault();
    event.stopPropagation();

    setActiveSlotId(slot.id);
    setActivePrintAreaId(area.id);

    const eventFamily = String(event.type || "").startsWith("pointer")
      ? "pointer"
      : "mouse";

    const moveEventName = eventFamily === "pointer"
      ? "pointermove"
      : "mousemove";

    const upEventName = eventFamily === "pointer"
      ? "pointerup"
      : "mouseup";

    const cancelEventName = eventFamily === "pointer"
      ? "pointercancel"
      : null;

    const startPlacement = sanitizePlacement(
      previewPlacements[slot.id] || slot.placement,
      area
    );

    const drag = {
      slotId: slot.id,
      slot,
      type,
      handle,
      startX: Number(event.clientX || 0),
      startY: Number(event.clientY || 0),
      startPlacement,
      area,
      areaElement,
      moveEventName,
      upEventName,
      cancelEventName,
    };

    dragRef.current = drag;
    dragLatestRef.current = startPlacement;

    function cleanupListeners() {
      window.removeEventListener(moveEventName, handleMove);
      window.removeEventListener(upEventName, handleUp);

      if (cancelEventName) {
        window.removeEventListener(cancelEventName, handleUp);
      }

      if (dragCleanupRef.current === cleanupListeners) {
        dragCleanupRef.current = null;
      }
    }

    function handleMove(moveEvent) {
      const activeDrag = dragRef.current;

      if (!activeDrag || activeDrag.slotId !== slot.id) return;

      moveEvent.preventDefault();

      const rect = activeDrag.areaElement.getBoundingClientRect();

      if (!rect.width || !rect.height) return;

      const dx = (
        (Number(moveEvent.clientX || 0) - activeDrag.startX)
        / rect.width
      ) * 100;

      const dy = (
        (Number(moveEvent.clientY || 0) - activeDrag.startY)
        / rect.height
      ) * 100;

      const start = activeDrag.startPlacement;
      let next = { ...start };

      if (activeDrag.type === "move") {
        next.x = start.x + dx;
        next.y = start.y + dy;
      }

      if (activeDrag.type === "resize") {
        if (activeDrag.handle.includes("e")) {
          next.width = start.width + dx;
        }

        if (activeDrag.handle.includes("s")) {
          next.height = start.height + dy;
        }

        if (activeDrag.handle.includes("w")) {
          next.x = start.x + dx;
          next.width = start.width - dx;
        }

        if (activeDrag.handle.includes("n")) {
          next.y = start.y + dy;
          next.height = start.height - dy;
        }

        if (
          activeDrag.slot.lock_aspect_ratio !== false
          && Number(activeDrag.slot.artwork_aspect_ratio || 0) > 0
        ) {
          const areaRatio = rect.width / Math.max(1, rect.height);
          const layerRatio = Number(
            activeDrag.slot.artwork_aspect_ratio || 1
          );

          if (Math.abs(dx) >= Math.abs(dy)) {
            next.height = next.width * (areaRatio / layerRatio);
          } else {
            next.width = next.height * (layerRatio / areaRatio);
          }

          if (activeDrag.handle.includes("w")) {
            next.x = start.x + (start.width - next.width);
          }

          if (activeDrag.handle.includes("n")) {
            next.y = start.y + (start.height - next.height);
          }
        }
      }

      if (activeDrag.type === "rotate") {
        const centerX = rect.left
          + ((start.x + start.width / 2) / 100) * rect.width;

        const centerY = rect.top
          + ((start.y + start.height / 2) / 100) * rect.height;

        next.rotation = (
          Math.atan2(
            Number(moveEvent.clientY || 0) - centerY,
            Number(moveEvent.clientX || 0) - centerX
          )
          * (180 / Math.PI)
        ) + 90;
      }

      const cleaned = sanitizePlacement(next, activeDrag.area);

      dragLatestRef.current = cleaned;

      setPreviewPlacements((current) => ({
        ...current,
        [activeDrag.slotId]: cleaned,
      }));
    }

    function handleUp(upEvent) {
      upEvent?.preventDefault?.();

      const activeDrag = dragRef.current;
      const finalPlacement = dragLatestRef.current;

      cleanupListeners();

      dragRef.current = null;
      dragLatestRef.current = null;

      if (activeDrag?.slotId && finalPlacement) {
        patchPlacement(activeDrag.slotId, finalPlacement);
      }

      window.requestAnimationFrame(() => {
        setPreviewPlacements((current) => {
          if (!activeDrag?.slotId || !current[activeDrag.slotId]) {
            return current;
          }

          const next = { ...current };
          delete next[activeDrag.slotId];
          return next;
        });
      });
    }

    dragCleanupRef.current?.();
    dragCleanupRef.current = cleanupListeners;

    window.addEventListener(
      moveEventName,
      handleMove,
      { passive: false }
    );

    window.addEventListener(
      upEventName,
      handleUp,
      { passive: false }
    );

    if (cancelEventName) {
      window.addEventListener(
        cancelEventName,
        handleUp,
        { passive: false }
      );
    }
  };

  useEffect(() => () => {
    dragCleanupRef.current?.();
    dragCleanupRef.current = null;
    dragRef.current = null;
    dragLatestRef.current = null;
  }, []);

  const generateMockup = async () => {
    const drawableSlots = currentScreenSlots.filter((slot) => slotHasArtwork(slot) && slot.print_option_id);
    if (!activeImage || !areasForScreen.length) { toast.error("Select a product view with at least one print area first."); return; }
    if (!drawableSlots.length) { toast.error("Add image/text and select a manufacturing profile first."); return; }
    setGenerating(true);
    try {
      const baseImage = await loadImage(activeImage);
      const canvas = document.createElement("canvas");
      canvas.width = baseImage.naturalWidth || baseImage.width;
      canvas.height = baseImage.naturalHeight || baseImage.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height);
      for (const slot of drawableSlots) {
        const area = printAreas.find((item) => item.id === slot.print_area_id);
        if (!area) continue;
        const areaX = (areaPct(area, "x") / 100) * canvas.width;
        const areaY = (areaPct(area, "y") / 100) * canvas.height;
        const areaW = (areaPct(area, "width") / 100) * canvas.width;
        const areaH = (areaPct(area, "height") / 100) * canvas.height;
        const clippedLayer = await renderSlotIntoPrintAreaLayer(slot, area, areaW, areaH);
        ctx.drawImage(clippedLayer, areaX, areaY, areaW, areaH);
      }
      const safeName = `${activeGroup?.label || "group"}-${screenLabel(activeScreen)}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const primaryMockupUrl = await uploadGeneratedCanvas(
        canvas,
        `mockup-${safeName}.png`
      );

      const updatedSlots = slots.map((slot) => (
        slot.screen_id === currentScreenId
          ? { ...slot, mockup_image_url: primaryMockupUrl }
          : slot
      ));
      const derivedMockupImages = [];
      const fullWrapArea = areasForScreen.find((area) => {
        const key = compact(
          area.area_key
          || area.view_key
          || area.screen_view
          || area.name
        ).toLowerCase();
        return key.includes("wrap");
      });
      const derivedGalleryRows = asArray(template?.template_gallery).filter(
        (row) =>
          row?.image_url
          && row.status !== "archived"
          && row.derived_from_artwork_mode === "full_wrap"
          && [
            "front_mockup",
            "back_mockup",
            "side_mockup",
            "angled_mockup",
          ].includes(row.role)
          && (!row.source_print_area_id || row.source_print_area_id === fullWrapArea?.id)
      );

      if (fullWrapArea && derivedGalleryRows.length) {
        const wrapSlots = drawableSlots.filter(
          (slot) => slot.print_area_id === fullWrapArea.id
        );
        const physicalRatio =
          Number(fullWrapArea.width_mm || 0) > 0
          && Number(fullWrapArea.height_mm || 0) > 0
            ? Number(fullWrapArea.width_mm) / Number(fullWrapArea.height_mm)
            : Math.max(0.1, areaPct(fullWrapArea, "width") / Math.max(1, areaPct(fullWrapArea, "height")));
        const sourceWidth = 1800;
        const sourceHeight = Math.max(1, Math.round(sourceWidth / physicalRatio));
        const wrapArtworkCanvas = await composePrintAreaArtworkCanvas(
          wrapSlots,
          fullWrapArea,
          sourceWidth,
          sourceHeight
        );

        for (const galleryRow of derivedGalleryRows) {
          const derivedCanvas = await renderDerivedMockupCanvas({
            baseImageUrl: galleryRow.image_url,
            sourceArtworkCanvas: wrapArtworkCanvas,
            crop: galleryRow.crop || {},
            role: galleryRow.role,
          });
          const derivedName = `${safeName}-${galleryRow.role || galleryRow.view_key || "derived"}`
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-");
          const imageUrl = await uploadGeneratedCanvas(
            derivedCanvas,
            `mockup-${derivedName}.png`
          );
          derivedMockupImages.push({
            id: makeId("derived-mockup"),
            gallery_image_id: galleryRow.id,
            role: galleryRow.role,
            view_key: galleryRow.view_key || galleryRow.role,
            image_url: imageUrl,
            source_print_area_id: fullWrapArea.id,
            artwork_mode: "full_wrap",
          });
        }
      }

      const nextGroups = patchGroup(groups, activeGroup.id, (group) => ({
        ...group,
        artworks: updatedSlots.map((slot, index) => ({
          ...slot,
          sort_order: index,
        })),
        primary_mockup_image_url: primaryMockupUrl,
        derived_mockup_images: derivedMockupImages,
      }));
      setGroups(nextGroups);
      toast.success(
        derivedMockupImages.length
          ? `${screenLabel(activeScreen)} mockup and ${derivedMockupImages.length} derived view(s) generated`
          : `${screenLabel(activeScreen)} mockup generated`
      );
    } catch (error) {
      toast.error(error.message || "Could not generate mockup");
    } finally {
      setGenerating(false);
    }
  };

  const generateAllVariationMockups = async () => {
    if (!variations.length) {
      toast.error("Select at least one variation first.");
      return;
    }
    const groupsWithArtwork = groups.filter((group) => asArray(group.artworks).some(slotHasArtwork));
    if (!groupsWithArtwork.length) {
      toast.error("Add artwork to at least one artwork group first.");
      return;
    }

    setGeneratingVariations(true);
    setVariationGenerationProgress({ completed: 0, total: variations.length * screens.length, label: "Starting…" });
    try {
      const records = await generateVariationMockups({
        template,
        variations,
        artworkGroups: groups,
        onProgress: ({ completed, total, variation, screen, skipped }) => {
          setVariationGenerationProgress({
            completed,
            total,
            label: `${getVariationLabel(variation)} · ${screenLabel(screen)}${skipped ? " · skipped" : ""}`,
          });
        },
      });

      if (!records.length) {
        throw new Error("No variation mockups could be generated. Check that every selected variation resolves to an artwork group and the template has mockup views.");
      }

      const nextGroups = applyVariationMockupsToGroups(groups, records);
      setGroups(nextGroups);
      setVariationGenerationProgress({ completed: records.length, total: records.length, label: `${records.length} mockups generated` });
      toast.success(`Generated ${records.length} variation mockup(s)`);
    } catch (error) {
      toast.error(error.message || "Could not generate variation mockups");
    } finally {
      setGeneratingVariations(false);
    }
  };

  const generateAllVariationMockups = async () => {
    if (!variations.length) { toast.error("Select at least one variation first."); return; }
    if (!groups.some((group) => asArray(group.artworks).some(slotHasArtwork))) { toast.error("Add artwork to at least one artwork group first."); return; }
    setGeneratingVariations(true);
    setVariationGenerationProgress({ completed: 0, total: variations.length * screens.length, label: "Starting…" });
    try {
      const records = await generateVariationMockups({
        template, variations, artworkGroups: groups,
        onProgress: ({ completed, total, variation, screen, skipped }) => setVariationGenerationProgress({ completed, total, label: `${getVariationLabel(variation)} · ${screenLabel(screen)}${skipped ? " · skipped" : ""}` }),
      });
      if (!records.length) throw new Error("No variation mockups could be generated. Check artwork groups and template mockup views.");
      setGroups(applyVariationMockupsToGroups(groups, records));
      setVariationGenerationProgress({ completed: records.length, total: records.length, label: `${records.length} mockups generated` });
      toast.success(`Generated ${records.length} variation mockup(s)`);
    } catch (error) { toast.error(error.message || "Could not generate variation mockups"); }
    finally { setGeneratingVariations(false); }
  };

  const selectView = (screenId) => {
    setActiveScreenId(screenId);
    const firstArea = printAreas.find((area) => area.screen_id === screenId);
    setActivePrintAreaId(firstArea?.id || "");
    const firstSlot = slots.find((slot) => slot.screen_id === screenId || slot.print_area_id === firstArea?.id);
    setActiveSlotId(firstSlot?.id || "");
  };

  return (
    <div className="space-y-4 studio-v21" data-testid="product-artwork-studio">
      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(event) => uploadFileToImageLayer(event.target.files?.[0] || null)} />

      <section className="grid xl:grid-cols-[minmax(260px,1fr)_minmax(360px,1.8fr)_140px_250px] gap-3">
        <div className="border border-[#34C759]/40 bg-black/40 p-3">
          <div className="text-center font-bold uppercase mb-2">Select product print view</div>
          <div className="grid grid-cols-2 gap-2">
            {screens.map((screen) => {
              const active = screen.id === currentScreenId;
              const count = slots.filter((slot) => slot.screen_id === screen.id || printAreas.find((area) => area.id === slot.print_area_id)?.screen_id === screen.id).length;
              return <button key={screen.id} type="button" onClick={() => selectView(screen.id)} className={`border px-2 py-2 text-[10px] uppercase tracking-widest ${active ? "border-[#FF3B30] bg-[#FF3B30]/20" : "border-white/15 bg-black/40 hover:border-white/40"}`}>{screenLabel(screen)} · {count} layer(s)</button>;
            })}
          </div>
        </div>

        <div className="border border-[#34C759]/40 bg-[#0A1B10] p-3">
          <div className="text-center font-bold uppercase mb-2">Selected layer</div>
          <div>
            <label>
              <span className="label">Print method</span>
              <select className="input-base" value={selectedProfile?.id || activeSlot?.print_option_id || ""} disabled={!activeSlot || profilesLoading} onChange={(event) => activeSlot && setLayerManufacturingProfile(activeSlot.id, event.target.value)}>
                <option value="">{profilesLoading ? "Loading print methods…" : "Select print method"}</option>
                {groupedProfiles.map((group) => (
                  <optgroup key={group.key} label={group.label}>
                    {group.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profileLabel(profile)}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
          </div>
          {selectedProfile && <div className="text-[11px] text-[#B8F5C3] mt-2">Selected: {methodLabel(selectedProfile.method_key)} / {profileLabel(selectedProfile)}</div>}
        </div>

        <div className="grid gap-2">
          <button type="button" className="btn-secondary justify-start text-sm" disabled={!activeGroup || !areasForScreen.length || uploading} onClick={() => { pendingReplaceSlotIdRef.current = ""; pendingUploadAreaRef.current = activeArea || normalPrintAreas[0] || areasForScreen[0]; fileInputRef.current?.click(); }}><ImageIcon size={18} /> {uploading ? "Uploading" : "Add Image"}</button>
          <button type="button" className="btn-secondary justify-start text-sm" disabled={!activeGroup || !areasForScreen.length} onClick={addTextLayer}><Type size={18} /> Add Text</button>
        </div>

        <div className="border border-[#34C759]/40 bg-[#0A1B10] p-3 grid grid-cols-2 gap-3">
          <div className="border-r border-white/40 pr-3">
            <div className="text-[10px] uppercase tracking-widest">Selected print job cost</div>
            <div className="font-display text-4xl mt-2">{money(selectedLayerCost)}</div>
            {selectedCostLine?.combined ? (
              <div className="text-[10px] text-[#B8F5C3] mt-1">
                {selectedCostLine.layer_count}{" "}
                {methodLabel(selectedCostLine.method_key)} layers combined
                {" · "}{round(selectedJobAreaCm2)} cm²
              </div>
            ) : (
              <div className="text-[10px] text-zinc-500 mt-1">{round(selectedLayerAreaCm2)} cm²</div>
            )}
            {selectedCostLine?.costing?.minimum_print_cost_applied && (
              <div className="text-[10px] text-[#FFE08A] mt-1">Job minimum applied once</div>
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest">Total artwork cost</div>
            <div className="font-display text-4xl mt-2">{money(allGroupPrintCost)}</div>
            <div className="text-[10px] text-zinc-500 mt-1">
              Screen: {money(currentScreenCostLines.reduce((total, line) => total + Number(line.cost || 0), 0))}
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 2xl:grid-cols-[220px_minmax(720px,1fr)_320px] gap-4">
        <aside className="border border-[#34C759]/40 bg-black/30 p-3 min-h-[680px] flex flex-col">
          <div className="text-center font-bold uppercase mb-3">Layers</div>
          <div className="space-y-3 flex-1 overflow-auto pr-1">
            {areasForScreen.map((area) => {
              const areaSlots = currentScreenSlots.filter((slot) => slot.print_area_id === area.id);
              return (
                <div key={area.id}>
                  <div className="text-[10px] uppercase tracking-widest text-zinc-400 mb-2">{area.name || "Print area"}</div>
                  <div className="space-y-2">
                    {areaSlots.map((slot) => {
                      const active = activeSlot?.id === slot.id;
                      const profile = resolveProfileForSlot(slot, profileCatalog, printOptions);
                      const costLine = allCostLines.find(
                        (line) => asArray(line.slot_ids).includes(slot.id)
                      );
                      const layerCosting = calculateAreaPrintCost(
                        slot,
                        area,
                        profile || slot
                      );
                      return (
                        <button key={slot.id} type="button" onClick={() => { setActiveSlotId(slot.id); setActivePrintAreaId(area.id); }} className={`w-full text-left border px-2 py-2 ${active ? "border-[#FF3B30] bg-[#FF3B30]/15" : "border-white/30 bg-black/40 hover:border-white/60"}`}>
                          <div className="font-bold text-xs uppercase">{slot.text_layer ? "Text Layer" : "Image Layer"}</div>
                          <div className="text-[10px] text-zinc-500 mt-1 truncate">{profile ? `${methodLabel(profile.method_key)} · ${profileLabel(profile)}` : "No manufacturing profile"}</div>
                          <div className="text-[10px] text-zinc-500 mt-1">
                            {round(layerCosting.area_cm2 || 0)} cm²
                          </div>
                          {costLine && (
                            <div className="text-[10px] text-[#34C759] mt-1">
                              {costLine.combined
                                ? `${costLine.layer_count}-layer job · ${money(costLine.cost)}`
                                : money(costLine.cost)}
                            </div>
                          )}
                        </button>
                      );
                    })}
                    {!areaSlots.length && <div className="border border-dashed border-white/10 p-2 text-[10px] text-zinc-600">No layers</div>}
                  </div>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            className="btn-primary w-full mt-4"
            disabled={generatingVariations || generating || !variations.length}
            onClick={generateAllVariationMockups}
          >
            <RefreshCw size={14} />
            {generatingVariations
              ? `Generating ${variationGenerationProgress.completed}/${variationGenerationProgress.total}…`
              : "Generate Mockups For All Variations"}
          </button>
          {(generatingVariations || variationGenerationProgress.completed > 0) && (
            <div className="mt-2 border border-white/10 bg-black/30 p-2 text-[10px] text-zinc-400">
              <div className="flex items-center justify-between gap-2">
                <span>{variationGenerationProgress.label || "Variation mockups ready"}</span>
                <span>{variationGenerationProgress.completed}/{variationGenerationProgress.total}</span>
              </div>
              <div className="mt-2 h-1.5 rounded bg-white/10 overflow-hidden">
                <div className="h-full bg-[#34C759] transition-all" style={{ width: `${variationGenerationProgress.total ? Math.min(100, (variationGenerationProgress.completed / variationGenerationProgress.total) * 100) : 0}%` }} />
              </div>
            </div>
          )}

          <button type="button" className="btn-primary w-full mt-4" disabled={generatingVariations || generating || !variations.length} onClick={generateAllVariationMockups}>
            <RefreshCw size={14} />
            {generatingVariations ? `Generating ${variationGenerationProgress.completed}/${variationGenerationProgress.total}…` : "Generate Mockups For All Variations"}
          </button>
          {(generatingVariations || variationGenerationProgress.completed > 0) && (
            <div className="mt-2 border border-white/10 bg-black/30 p-2 text-[10px] text-zinc-400">
              <div className="flex items-center justify-between gap-2"><span>{variationGenerationProgress.label || "Variation mockups ready"}</span><span>{variationGenerationProgress.completed}/{variationGenerationProgress.total}</span></div>
              <div className="mt-2 h-1.5 rounded bg-white/10 overflow-hidden"><div className="h-full bg-[#34C759] transition-all" style={{ width: `${variationGenerationProgress.total ? Math.min(100, (variationGenerationProgress.completed / variationGenerationProgress.total) * 100) : 0}%` }} /></div>
            </div>
          )}

          <button type="button" className="btn-primary w-full mt-4" disabled={generating || !canGenerateMockup} onClick={generateMockup}><RefreshCw size={14} /> {generating ? "Generating…" : `Generate ${screenLabel(activeScreen)} Mockup`}</button>
          {activeSlot?.mockup_image_url && <div className="mt-3 border border-white/10 p-2"><div className="overline mb-2">Generated mockup</div><img src={assetUrl(activeSlot.mockup_image_url)} alt="Generated mockup" className="w-full max-h-40 object-contain" /></div>}
          {asArray(activeGroup?.derived_mockup_images).length > 0 && (
            <div className="mt-3 border border-white/10 p-2">
              <div className="overline mb-2">Derived sellable views</div>
              <div className="grid grid-cols-2 gap-2">
                {asArray(activeGroup.derived_mockup_images).map((mockup) => (
                  <div key={mockup.id || mockup.image_url} className="border border-white/10 bg-black/30 p-1">
                    <img src={assetUrl(mockup.image_url)} alt={mockup.view_key || mockup.role || "Derived mockup"} className="w-full aspect-square object-contain" />
                    <div className="text-[9px] uppercase tracking-widest text-zinc-500 mt-1 truncate">{mockup.view_key || mockup.role}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        <main className="border border-white/10 bg-black min-h-[680px] flex items-center justify-center overflow-hidden rounded-xl p-4">
          {activeImage ? (
            <div className="relative inline-block max-w-full max-h-[820px] select-none leading-none align-middle">
              <img src={assetUrl(activeImage)} alt={screenLabel(activeScreen)} className="block h-auto w-auto max-h-[820px] max-w-full object-contain" draggable="false" />
              {areasForScreen.map((area) => {
                const areaSlots = currentScreenSlots.filter((slot) => slot.print_area_id === area.id);
                const areaActive = activeArea?.id === area.id;
                return (
                  <div key={area.id} ref={(element) => { if (element) areaRefs.current[area.id] = element; }} className="absolute overflow-visible" style={{ left: `${areaPct(area, "x")}%`, top: `${areaPct(area, "y")}%`, width: `${areaPct(area, "width")}%`, height: `${areaPct(area, "height")}%` }} onMouseDown={(event) => { event.stopPropagation(); setActivePrintAreaId(area.id); }}>
                    <div
                      className={`absolute inset-0 pointer-events-none border-2 ${areaActive ? "border-[#FF3B30] bg-[#FF3B30]/10" : "border-[#FF3B30]/50 bg-[#FF3B30]/5"}`}
                      style={{
                        ...geometryClipStyle(area),
                        transform: `rotate(${Number(area.rotation_deg || 0)}deg)`,
                        transformOrigin: "center",
                      }}
                    />
                    <div className="absolute -top-8 left-0 z-30 bg-[#FF3B30] text-white text-[10px] uppercase tracking-widest px-2 py-1 whitespace-nowrap">{area.name} · {area.geometry_type || "rectangle"} · {area.width_mm || 0}×{area.height_mm || 0}mm</div>
                    {areaSlots.map((slot) => {
                      if (!slotHasArtwork(slot)) return null;
                      const placement = sanitizePlacement(previewPlacements[slot.id] || slot.placement, area);
                      const active = activeSlot?.id === slot.id;
                      return (
                        <div key={slot.id} data-artwork-layer-id={slot.id} className={`absolute border-2 ${active ? "border-[#34C759]" : "border-white/40"} bg-white/5 cursor-move`} style={{ left: `${placement.x}%`, top: `${placement.y}%`, width: `${placement.width}%`, height: `${placement.height}%`, transform: `rotate(${placement.rotation}deg)`, transformOrigin: "center center", touchAction: "none", willChange: "left, top, width, height, transform" }} onPointerDown={(event) => startDrag(event, slot, "move")} onMouseDown={(event) => startDrag(event, slot, "move")}>
                          {slot.text_layer ? <TextLayerPreview slot={slot} /> : <img src={assetUrl(slot.original_url)} alt="Artwork layer" className="h-full w-full object-fill pointer-events-none" draggable="false" />}
                          {active && <><ResizeHandle position="nw" onStart={(event) => startDrag(event, slot, "resize", "nw")} /><ResizeHandle position="ne" onStart={(event) => startDrag(event, slot, "resize", "ne")} /><ResizeHandle position="sw" onStart={(event) => startDrag(event, slot, "resize", "sw")} /><ResizeHandle position="se" onStart={(event) => startDrag(event, slot, "resize", "se")} /><button type="button" className="absolute left-1/2 -top-12 -translate-x-1/2 h-8 w-8 rounded-full border border-[#34C759] bg-black text-[#34C759] flex items-center justify-center cursor-grab" title="Drag to rotate" onPointerDown={(event) => startDrag(event, slot, "rotate")} onMouseDown={(event) => startDrag(event, slot, "rotate")}><RotateCcw size={14} /></button></>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ) : <div className="text-center text-zinc-600"><ImageIcon className="mx-auto mb-4" size={56} /><div className="font-display text-3xl uppercase">No product view</div></div>}
        </main>

        <aside className="border border-white/10 bg-black/20 p-3 rounded-xl min-h-[680px] overflow-auto">
          {activeSlot && activeArea ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3"><div><div className="overline mb-1">Inspector</div><h3 className="font-display text-2xl uppercase">{activeSlot.text_layer ? "Text" : "Image"} Layer</h3><p className="text-xs text-zinc-500 mt-1">{activeArea.name} · {activeArea.width_mm || 0}×{activeArea.height_mm || 0}mm</p></div><button type="button" className="btn-secondary border-[#FF3B30] text-[#FF8A84] whitespace-nowrap" onClick={() => removeSlot(activeSlot.id)} title="Delete selected layer"><Trash2 size={16} /> Delete Layer</button></div>
              {activeSlot.text_layer && <div className="border border-white/10 bg-black/30 rounded-xl p-3 space-y-3"><div className="font-bold text-sm">Text editor</div><label><span className="label">Text</span><textarea className="input-base min-h-[72px]" value={activeSlot.text_content || ""} onChange={(event) => updateTextLayer({ text_content: event.target.value })} /></label><div className="grid grid-cols-2 gap-2"><label><span className="label">Font</span><select className="input-base" value={activeSlot.text_font_family || "Roboto"} onChange={(event) => updateTextLayer({ text_font_family: event.target.value })}>{TEXT_FONT_OPTIONS.map((font) => <option key={font} value={font}>{font}</option>)}</select></label><label><span className="label">Weight</span><select className="input-base" value={String(activeSlot.text_font_weight || "700")} onChange={(event) => updateTextLayer({ text_font_weight: event.target.value })}><option value="400">Regular</option><option value="600">Semi-bold</option><option value="700">Bold</option><option value="900">Heavy</option></select></label><label><span className="label">Text render size</span><input className="input-base" type="text" inputMode="numeric" value={Number(activeSlot.text_font_size || 180)} onChange={(event) => updateTextLayer({ text_font_size: event.target.value })} onBlur={(event) => updateTextLayer({ text_font_size: clamp(event.target.value, TEXT_RENDER_MIN, TEXT_RENDER_MAX) })} /></label><label><span className="label">Colour</span><input className="input-base h-[42px]" type="color" value={activeSlot.text_color || "#111111"} onChange={(event) => updateTextLayer({ text_color: event.target.value })} /></label></div><p className="text-[11px] text-zinc-500">Use handles to resize text. Render size controls sharpness, not final product size.</p></div>}
              {!activeSlot.text_layer && <button type="button" className="btn-secondary w-full" onClick={() => { pendingReplaceSlotIdRef.current = activeSlot.id; pendingUploadAreaRef.current = activeArea; fileInputRef.current?.click(); }}><ImageIcon size={14} /> Replace image</button>}
              <ArtworkPrintSizeBlock area={activeArea} placement={activePlacement} />
              <ColourRestrictionBlock profile={selectedProfile} slot={activeSlot} onChange={(value) => setLayerStockedColour(activeSlot.id, value)} />
              <div className="border border-white/10 bg-black/30 rounded-xl p-3 text-xs text-zinc-400">
                <div className="overline mb-2">Costing</div>
                <div className="grid grid-cols-2 gap-y-1">
                  <span>Profile</span><span className="text-right text-zinc-200">{selectedProfile ? profileLabel(selectedProfile) : "None"}</span>
                  <span>Calculation</span><span className="text-right text-zinc-200">{activeSlot.calculation_type || selectedProfile?.calculation_type || "—"}</span>
                  <span>Minimum</span><span className="text-right text-zinc-200">{money(activeSlot.minimum_print_cost || selectedProfile?.minimum_print_cost || 0)}</span>
                  <span>{selectedCostLine?.combined ? "Combined job cost" : "Layer cost"}</span>
                  <span className="text-right text-[#34C759]">{money(selectedLayerCost)}</span>
                </div>
                {selectedCostLine?.combined && (
                  <p className="text-[#B8F5C3] mt-2">
                    This layer contributes {round(selectedLayerAreaCm2)} cm² to a{" "}
                    {selectedCostLine.layer_count}-layer {methodLabel(selectedCostLine.method_key)}{" "}
                    print job totalling {round(selectedJobAreaCm2)} cm².
                  </p>
                )}
                {selectedCostLine?.costing?.minimum_print_cost_applied && (
                  <p className="text-[#FFE08A] mt-2">
                    The minimum print cost is applied once to the combined print job.
                  </p>
                )}
              </div>
              <div className="border-t border-white/10 pt-4"><div className="overline mb-2">Placement</div><p className="text-xs text-zinc-500 mb-3 flex items-center gap-2"><Move size={13} /> Drag the layer on the preview.</p><label className="flex items-center gap-2 text-xs text-zinc-300 mb-3"><input type="checkbox" checked={activeSlot.lock_aspect_ratio !== false} onChange={(event) => patchSlot(activeSlot.id, { lock_aspect_ratio: event.target.checked })} /> Lock aspect ratio</label><div className="grid grid-cols-2 gap-2"><NumericControl label="X %" value={activePlacement.x} onChange={(value) => patchPlacement(activeSlot.id, { x: value })} /><NumericControl label="Y %" value={activePlacement.y} onChange={(value) => patchPlacement(activeSlot.id, { y: value })} /><NumericControl label="W %" value={activePlacement.width} onChange={(value) => patchPlacement(activeSlot.id, { width: value })} /><NumericControl label="H %" value={activePlacement.height} onChange={(value) => patchPlacement(activeSlot.id, { height: value })} /><NumericControl label="Rotation" value={activePlacement.rotation} onChange={(value) => patchPlacement(activeSlot.id, { rotation: value })} /></div><div className="grid grid-cols-3 gap-2 mt-3"><button type="button" className="btn-secondary" onClick={() => patchPlacement(activeSlot.id, { x: 0, y: 0, width: 100, height: 100, rotation: 0 })}>Fit</button><button type="button" className="btn-secondary" onClick={() => patchPlacement(activeSlot.id, { x: 25, y: 25, width: 50, height: 50, rotation: 0 })}>Center</button><button type="button" className="btn-secondary" onClick={() => patchPlacement(activeSlot.id, defaultPlacement(activeArea))}>Reset</button></div></div>
              {missingMethodCount > 0 && <div className="border border-[#FF3B30]/50 bg-[#FF3B30]/10 p-3 text-xs text-[#FFB4B0] rounded-lg">{missingMethodCount} layer(s) need manufacturing profiles.</div>}
            </div>
          ) : <div className="text-zinc-500 text-sm"><div className="overline mb-3">Inspector</div><p>Add an image or text layer to begin.</p></div>}
        </aside>
      </div>
    </div>
  );
}
