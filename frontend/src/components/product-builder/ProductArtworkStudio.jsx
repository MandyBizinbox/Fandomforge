import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Image as ImageIcon, Move, Plus, RefreshCw, RotateCcw, Trash2, Type } from "lucide-react";
import { http, assetUrl } from "../../lib/api";
import { resolveEffectiveProductionSetup } from "../../lib/templateProductionResolver";
import "./productBuilderV2.css";
import {
  asArray,
  getGroupRepresentativeVariationId,
  getPrintOptionLabel,
  money,
  makeId,
  calculateAreaPrintCost,
} from "./productBuilderUtils";

const TEXT_RENDER_MIN = 24;
const TEXT_RENDER_MAX = 1200;
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value || 0)));
const round = (value) => Math.round(Number(value || 0) * 10) / 10;
const TEXT_FONT_OPTIONS = [
  "Roboto",
  "Montserrat",
  "Poppins",
  "Oswald",
  "Bebas Neue",
  "Anton",
  "Raleway",
  "Playfair Display",
  "Lobster",
  "Pacifico",
  "Bangers",
  "Permanent Marker",
  "Arial",
  "Impact",
  "Georgia",
  "Courier New",
];
const GOOGLE_FONT_FAMILIES = new Set([
  "Roboto",
  "Montserrat",
  "Poppins",
  "Oswald",
  "Bebas Neue",
  "Anton",
  "Raleway",
  "Playfair Display",
  "Lobster",
  "Pacifico",
  "Bangers",
  "Permanent Marker",
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
    scale: 1,
  };
}

function sanitizePlacement(placement, area) {
  const base = { ...defaultPlacement(area), ...(placement || {}) };
  return {
    ...base,
    x: round(clamp(base.x, -100, 200)),
    y: round(clamp(base.y, -100, 200)),
    width: round(clamp(base.width, 2, 250)),
    height: round(clamp(base.height, 2, 250)),
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
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png", 0.95);
  });
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
  const paddingX = Math.ceil(fontSize * 0.14);
  const paddingY = Math.ceil(fontSize * 0.16);
  const lineHeight = Math.ceil(fontSize * 1.15);
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
  const sourceW = image.naturalWidth || image.width || 1;
  const sourceH = image.naturalHeight || image.height || 1;
  const scale = Math.min(w / sourceW, h / sourceH);
  const drawW = sourceW * scale;
  const drawH = sourceH * scale;
  ctx.drawImage(image, x + (w - drawW) / 2, y + (h - drawH) / 2, drawW, drawH);
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
  const lineHeight = fontSize * 1.15;
  const totalHeight = lineHeight * safeLines.length;
  const scale = Math.min(w / maxTextWidth, h / totalHeight, 1);
  fontSize = Math.max(4, fontSize * scale);
  ctx.font = `${weight} ${fontSize}px ${fontCssFamily(family)}`;
  const finalLineHeight = fontSize * 1.15;
  const finalTotalHeight = finalLineHeight * safeLines.length;
  const startY = y + h / 2 - finalTotalHeight / 2 + finalLineHeight / 2;

  safeLines.forEach((line, index) => {
    ctx.fillText(line, x + w / 2, startY + index * finalLineHeight);
  });
}

function isNeckLabelArea(area) {
  const key = String(area?.area_key || area?.key || "").toLowerCase();
  const name = String(area?.name || area?.label || "").toLowerCase();
  const view = String(area?.screen_view || area?.view_key || "").toLowerCase();
  return key.includes("neck_label") || name.includes("neck label") || view.includes("neck_label");
}

function optionPatchForSlot(slot, area, option = {}) {
  const costing = calculateAreaPrintCost(slot, area, option || {});
  return {
    print_option_id: option?.id || "",
    rule_name: option?.rule_name || option?.print_method || "",
    print_method: option?.print_method || option?.rule_name || "",
    method_key: option?.method_key || "",
    print_size: option?.print_size || area?.standard_print_size_key || slot.standard_print_size_key || "",
    print_cost_max: costing.calculated_print_cost,
    print_width_mm: costing.print_width_mm,
    print_height_mm: costing.print_height_mm,
    area_cm2: costing.area_cm2,
    raw_print_cost: costing.raw_print_cost,
    calculated_print_cost: costing.calculated_print_cost,
    calculation_type: option?.calculation_type || "fixed",
    sheet_width_mm: option ? Number(option.sheet_width_mm || 0) : 0,
    sheet_height_mm: option ? Number(option.sheet_height_mm || 0) : 0,
    sheet_cost: option ? Number(option.sheet_cost || 0) : 0,
    cost_per_cm2: option ? Number(option.cost_per_cm2 || 0) : 0,
    minimum_print_cost: option ? Number(option.minimum_print_cost || 0) : 0,
    waste_percentage: option ? Number(option.waste_percentage || 0) : 0,
    markup_percentage: option ? Number(option.markup_percentage || 0) : 0,
    pricing_notes: option?.pricing_notes || "",
    standard_print_size_key: option?.standard_print_size_key || area?.standard_print_size_key || slot.standard_print_size_key || "",
    width_mm: option?.width_mm ?? area?.width_mm ?? slot.width_mm ?? "",
    height_mm: option?.height_mm ?? area?.height_mm ?? slot.height_mm ?? "",
    dpi: option?.dpi || area?.dpi || slot.dpi || 300,
    fit_mode: option?.fit_mode || area?.fit_mode || slot.fit_mode || "contain",
    production_notes: option?.production_notes || slot.production_notes || "",
  };
}

function slotPrintCost(slot = {}) {
  if (!slot.original_url || !slot.print_option_id) return 0;
  return Number(slot.calculated_print_cost ?? slot.print_cost_max ?? slot.raw_print_cost ?? 0) || 0;
}

function TextLayerPreview({ slot }) {
  const settings = normaliseTextSettings(slot);
  useEffect(() => {
    ensureGoogleFontLink(settings.text_font_family);
  }, [settings.text_font_family]);

  return (
    <div
      className="w-full h-full flex items-center justify-center text-center whitespace-pre leading-tight overflow-hidden pointer-events-none"
      style={{
        fontFamily: fontCssFamily(settings.text_font_family),
        fontWeight: settings.text_font_weight,
        color: settings.text_color,
        fontSize: "100%",
        lineHeight: 1.1,
      }}
    >
      {settings.text_content}
    </div>
  );
}

function ResizeHandle({ position, onMouseDown }) {
  const positionClasses = {
    nw: "-left-2 -top-2 cursor-nwse-resize",
    ne: "-right-2 -top-2 cursor-nesw-resize",
    sw: "-left-2 -bottom-2 cursor-nesw-resize",
    se: "-right-2 -bottom-2 cursor-nwse-resize",
  };
  return <button type="button" aria-label={`Resize ${position}`} className={`absolute z-30 h-4 w-4 rounded-full bg-[#34C759] border-2 border-black ${positionClasses[position]}`} onMouseDown={onMouseDown} />;
}

function NumericControl({ label, value, onChange }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input-base" type="number" step="1" value={Number(value || 0)} onChange={(event) => onChange(Number(event.target.value || 0))} />
    </div>
  );
}

export default function ProductArtworkStudio({
  template,
  printOptions,
  artworkGroups,
  onArtworkGroupsChange,
  selectedVariations,
  isAdmin = false,
}) {
  const [activeGroupId, setActiveGroupId] = useState(asArray(artworkGroups)[0]?.id || "");
  const [activeSlotId, setActiveSlotId] = useState("");
  const [activeScreenId, setActiveScreenId] = useState(asArray(template?.mockup_screens)[0]?.id || "");
  const [activePrintAreaId, setActivePrintAreaId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [dragState, setDragState] = useState(null);
  const areaRefs = useRef({});

  const groups = asArray(artworkGroups);
  const variations = asArray(selectedVariations);
  const screens = asArray(template?.mockup_screens).filter((screen) => screen?.id);
  const activeGroup = useMemo(() => groups.find((group) => group.id === activeGroupId) || groups[0] || null, [groups, activeGroupId]);
  const representativeVariationId = getGroupRepresentativeVariationId(activeGroup, variations);
  const representativeVariation = useMemo(
    () => variations.find((variation) => variation.id === representativeVariationId) || variations[0] || null,
    [representativeVariationId, variations]
  );

  const printAreas = useMemo(() => {
    return asArray(template?.print_areas)
      .filter((area) => area?.id && area?.screen_id)
      .map((area) => {
        const screen = screens.find((item) => item.id === area.screen_id) || {};
        const effective = resolveEffectiveProductionSetup(template || {}, representativeVariation || {}, {
          screen,
          defaultPrintArea: area,
        });
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
  const currentScreenSlots = slots.filter((slot) => areasForScreen.some((area) => area.id === slot.print_area_id));
  const neckLabelAreas = areasForScreen.filter(isNeckLabelArea);
  const normalPrintAreas = areasForScreen.filter((area) => !isNeckLabelArea(area));

  const activeSlot = useMemo(() => {
    if (!slots.length) return null;
    return slots.find((slot) => slot.id === activeSlotId) || currentScreenSlots[0] || null;
  }, [slots, activeSlotId, currentScreenSlots]);

  const activeArea = useMemo(() => {
    if (activeSlot) return printAreas.find((area) => area.id === activeSlot.print_area_id) || null;
    return areasForScreen.find((area) => area.id === activePrintAreaId) || areasForScreen[0] || null;
  }, [printAreas, activeSlot, areasForScreen, activePrintAreaId]);

  const activeImage = areasForScreen.find((area) => area.effective_base_image_url)?.effective_base_image_url || activeScreen?.image_url || "";
  const activePlacement = sanitizePlacement(activeSlot?.placement, activeArea);
  const currentScreenPrintCost = Math.round(currentScreenSlots.reduce((total, slot) => total + slotPrintCost(slot), 0) * 100) / 100;
  const allGroupPrintCost = Math.round(slots.reduce((total, slot) => total + slotPrintCost(slot), 0) * 100) / 100;
  const pricedLayerCount = currentScreenSlots.filter((slot) => slot.original_url && slot.print_option_id).length;
  const missingMethodCount = currentScreenSlots.filter((slot) => slot.original_url && !slot.print_option_id).length;

  const allowedOptions = useMemo(() => {
    if (!activeArea) return [];
    const templateOptionIds = asArray(template?.print_option_ids);
    const areaOptionIds = asArray(activeArea?.allowed_print_option_ids);
    const allowedIds = areaOptionIds.length ? areaOptionIds : templateOptionIds;
    if (!allowedIds.length) return [];
    return printOptions.filter((option) => allowedIds.includes(option.id) && (option.status || "active") === "active");
  }, [activeArea, template, printOptions]);

  const hasUploadedArtwork = Boolean(activeSlot?.original_url);
  const missingPrintMethod = Boolean(activeSlot && hasUploadedArtwork && !activeSlot.print_option_id);
  const canGenerateMockup = Boolean(activeImage && currentScreenSlots.some((slot) => slot.original_url && slot.print_option_id));

  useEffect(() => {
    slots.filter((slot) => slot.text_layer).forEach((slot) => ensureGoogleFontLink(slot.text_font_family || "Roboto"));
  }, [slots]);

  useEffect(() => {
    if (!activeGroupId && groups[0]?.id) setActiveGroupId(groups[0].id);
  }, [activeGroupId, groups]);

  useEffect(() => {
    if (!activeScreenId && screens[0]?.id) setActiveScreenId(screens[0].id);
  }, [activeScreenId, screens]);

  useEffect(() => {
    const selectedSlotArea = activeSlot ? printAreas.find((area) => area.id === activeSlot.print_area_id) : null;
    if (selectedSlotArea?.screen_id && selectedSlotArea.screen_id !== activeScreenId) {
      setActiveScreenId(selectedSlotArea.screen_id);
    }
  }, [activeSlot, printAreas, activeScreenId]);

  useEffect(() => {
    if (!activePrintAreaId && areasForScreen[0]?.id) setActivePrintAreaId(areasForScreen[0].id);
    if (activePrintAreaId && !areasForScreen.some((area) => area.id === activePrintAreaId)) {
      setActivePrintAreaId(areasForScreen[0]?.id || "");
    }
  }, [areasForScreen, activePrintAreaId]);

  const areaRatioFor = (areaId) => {
    const rect = areaRefs.current[areaId]?.getBoundingClientRect?.();
    return rect?.height ? rect.width / rect.height : 1;
  };

  const fitHeightForAspect = (areaId, widthPercent, aspectRatio) => {
    const ratio = areaRatioFor(areaId);
    return round(clamp((Number(widthPercent || 50) * ratio) / Number(aspectRatio || 1), 2, 120));
  };

  const setGroups = (nextGroups) => {
    const cleaned = nextGroups.map((group, index) => ({ ...group, sort_order: index }));
    onArtworkGroupsChange(cleaned);
  };

  const setGroupSlots = (groupId, nextSlots) => {
    const nextGroups = patchGroup(groups, groupId, (group) => {
      const primaryMockup = nextSlots.find((slot) => slot.mockup_image_url)?.mockup_image_url || group.primary_mockup_image_url || "";
      return {
        ...group,
        artworks: nextSlots.map((slot, index) => ({ ...slot, sort_order: index })),
        primary_mockup_image_url: primaryMockup,
      };
    });
    setGroups(nextGroups);
  };

  const patchSlot = (slotId, patch) => {
    if (!activeGroup) return;
    setGroupSlots(activeGroup.id, slots.map((slot) => (slot.id === slotId ? { ...slot, ...patch } : slot)));
  };

  const patchPlacement = (slotId, patch) => {
    const slot = slots.find((item) => item.id === slotId);
    const area = printAreas.find((item) => item.id === slot?.print_area_id);
    if (!slot || !area) return;
    const nextPlacement = sanitizePlacement({ ...(slot.placement || defaultPlacement(area)), ...patch }, area);
    const option = printOptions.find((item) => item.id === slot.print_option_id) || slot;
    const costing = calculateAreaPrintCost({ ...slot, placement: nextPlacement }, area, option || {});
    patchSlot(slot.id, {
      placement: nextPlacement,
      placement_box_width_mm: costing.placement_box_width_mm,
      placement_box_height_mm: costing.placement_box_height_mm,
      artwork_aspect_ratio: costing.artwork_aspect_ratio || slot.artwork_aspect_ratio || 0,
      print_width_mm: costing.print_width_mm,
      print_height_mm: costing.print_height_mm,
      area_cm2: costing.area_cm2,
      raw_print_cost: costing.raw_print_cost,
      calculated_print_cost: costing.calculated_print_cost,
      print_cost_max: costing.calculated_print_cost,
      pricing_source: costing.pricing_source,
    });
  };

  const createSlot = (area, patch = {}) => {
    if (!activeGroup) {
      toast.error("Create an artwork group first.");
      return null;
    }
    if (!area) {
      toast.error("Add print areas to the selected product view first.");
      return null;
    }

    const next = {
      id: makeId("art"),
      artwork_group_id: activeGroup.id,
      print_area_id: area.id,
      print_option_id: "",
      screen_id: area.screen_id || "",
      screen_view: area.screen_view || area.view_key || area.screen_label || "",
      area_key: area.area_key || area.key || "",
      standard_print_size_key: area.standard_print_size_key || "",
      width_mm: area.width_mm || "",
      height_mm: area.height_mm || "",
      dpi: area.dpi || "",
      fit_mode: area.fit_mode || "contain",
      original_url: "",
      file_name: "",
      mime_type: "",
      status: isAdmin ? "approved" : "pending_review",
      placement: defaultPlacement(area),
      lock_aspect_ratio: true,
      mockup_image_url: "",
      notes: "",
      sort_order: slots.length,
      ...patch,
    };

    const areaOptionIds = asArray(area?.allowed_print_option_ids);
    const templateOptionIds = asArray(template?.print_option_ids);
    const allowedIds = areaOptionIds.length ? areaOptionIds : templateOptionIds;
    const defaultOptions = printOptions.filter((option) => allowedIds.includes(option.id) && (option.status || "active") === "active");
    const defaultOption = defaultOptions.length === 1 ? defaultOptions[0] : null;
    const withMethod = defaultOption ? { ...next, ...optionPatchForSlot(next, area, defaultOption) } : next;
    setGroupSlots(activeGroup.id, [...slots, withMethod]);
    setActiveSlotId(withMethod.id);
    setActivePrintAreaId(area.id);
    setActiveScreenId(area.screen_id || currentScreenId);
    return withMethod;
  };

  const addSlot = (areaId) => {
    const area = areasForScreen.find((item) => item.id === areaId) || areasForScreen[0];
    createSlot(area);
  };

  const addTextLayer = () => {
    const area = activeArea || areasForScreen[0];
    const text = window.prompt("Text to add", "Custom Text") || "Custom Text";
    const asset = buildTextLayerAsset({ text_content: text });
    const width = 45;
    const height = fitHeightForAspect(area?.id, width, asset.artwork_aspect_ratio);
    createSlot(area, {
      ...asset,
      placement: { ...defaultPlacement(area), x: 10, y: 10, width, height },
    });
  };

  const updateTextLayer = (patch) => {
    if (!activeSlot?.text_layer || !activeArea) return;
    const nextSettings = normaliseTextSettings({
      text_content: activeSlot.text_content,
      text_font_family: activeSlot.text_font_family,
      text_font_weight: activeSlot.text_font_weight,
      text_font_size: activeSlot.text_font_size,
      text_color: activeSlot.text_color,
      ...patch,
    });
    const asset = buildTextLayerAsset(nextSettings);
    const placement = sanitizePlacement(activeSlot.placement, activeArea);
    const nextPlacement = activeSlot.lock_aspect_ratio === false
      ? placement
      : { ...placement, height: fitHeightForAspect(activeArea.id, placement.width, asset.artwork_aspect_ratio) };
    patchSlot(activeSlot.id, { ...asset, placement: nextPlacement });
  };

  const removeSlot = (slotId) => {
    if (!activeGroup) return;
    const next = slots.filter((slot) => slot.id !== slotId);
    setGroupSlots(activeGroup.id, next);
    const nextSlot = next.find((slot) => slot.screen_id === currentScreenId) || next[0];
    setActiveSlotId(nextSlot?.id || "");
  };

  useEffect(() => {
    if (!activeSlot || !activeArea || activeSlot.print_option_id || allowedOptions.length !== 1) return;
    const option = allowedOptions[0];
    patchSlot(activeSlot.id, optionPatchForSlot(activeSlot, activeArea, option));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlot?.id, activeArea?.id, allowedOptions.length]);

  useEffect(() => {
    if (!dragState) return undefined;
    const handleMove = (event) => {
      const slot = slots.find((item) => item.id === dragState.slotId);
      const area = printAreas.find((item) => item.id === slot?.print_area_id);
      const areaElement = areaRefs.current[area?.id];
      if (!slot || !area || !areaElement) return;
      event.preventDefault();
      const rect = areaElement.getBoundingClientRect();
      const dx = ((event.clientX - dragState.startX) / rect.width) * 100;
      const dy = ((event.clientY - dragState.startY) / rect.height) * 100;
      const start = dragState.startPlacement;
      let next = { ...start };

      if (dragState.type === "move") {
        next.x = start.x + dx;
        next.y = start.y + dy;
      }

      if (dragState.type === "resize") {
        if (dragState.handle.includes("e")) next.width = start.width + dx;
        if (dragState.handle.includes("s")) next.height = start.height + dy;
        if (dragState.handle.includes("w")) {
          next.x = start.x + dx;
          next.width = start.width - dx;
        }
        if (dragState.handle.includes("n")) {
          next.y = start.y + dy;
          next.height = start.height - dy;
        }

        if (slot.lock_aspect_ratio !== false && Number(slot.artwork_aspect_ratio || 0) > 0) {
          const areaRatio = rect.width / Math.max(1, rect.height);
          const layerRatio = Number(slot.artwork_aspect_ratio || 1);
          if (Math.abs(dx) >= Math.abs(dy)) next.height = next.width * (areaRatio / layerRatio);
          else next.width = next.height * (layerRatio / areaRatio);
        }
      }

      if (dragState.type === "rotate") {
        const cx = rect.left + ((start.x + start.width / 2) / 100) * rect.width;
        const cy = rect.top + ((start.y + start.height / 2) / 100) * rect.height;
        const angle = Math.atan2(event.clientY - cy, event.clientX - cx) * (180 / Math.PI) + 90;
        patchPlacement(slot.id, { rotation: round(angle) });
        return;
      }

      patchPlacement(slot.id, {
        x: round(clamp(next.x, -100, 200)),
        y: round(clamp(next.y, -100, 200)),
        width: round(clamp(next.width, 2, 250)),
        height: round(clamp(next.height, 2, 250)),
      });
    };

    const handleUp = () => setDragState(null);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragState, slots, printAreas]);

  const startDrag = (event, slot, type, handle = "") => {
    const area = printAreas.find((item) => item.id === slot?.print_area_id);
    if (!slot || !area) return;
    event.preventDefault();
    event.stopPropagation();
    setActiveSlotId(slot.id);
    setActivePrintAreaId(area.id);
    setDragState({
      slotId: slot.id,
      type,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      startPlacement: sanitizePlacement(slot.placement, area),
    });
  };

  const uploadArtwork = async (file) => {
    if (!file || !activeSlot || !activeArea) return;
    setUploading(true);
    const dimensions = await readImageFileDimensions(file);
    const data = new FormData();
    data.append("file", file);
    data.append("subdir", "product-artwork");

    try {
      const response = await http.post("/files/image", data);
      const nextSlot = {
        ...activeSlot,
        original_url: response.data.url,
        file_name: file.name,
        mime_type: file.type || "",
        original_width_px: dimensions.width,
        original_height_px: dimensions.height,
        artwork_aspect_ratio: dimensions.aspectRatio,
        lock_aspect_ratio: true,
      };
      const option = printOptions.find((item) => item.id === activeSlot.print_option_id) || activeSlot;
      const costing = calculateAreaPrintCost(nextSlot, activeArea, option);
      patchSlot(activeSlot.id, {
        ...nextSlot,
        placement_box_width_mm: costing.placement_box_width_mm,
        placement_box_height_mm: costing.placement_box_height_mm,
        print_width_mm: costing.print_width_mm,
        print_height_mm: costing.print_height_mm,
        area_cm2: costing.area_cm2,
        raw_print_cost: costing.raw_print_cost,
        calculated_print_cost: costing.calculated_print_cost,
        print_cost_max: costing.calculated_print_cost,
      });
      toast.success("Artwork uploaded for this layer");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Artwork upload failed");
    } finally {
      setUploading(false);
    }
  };

  const generateMockup = async () => {
    if (!activeImage || !areasForScreen.length) {
      toast.error("Select a product view with at least one print area first.");
      return;
    }

    const drawableSlots = currentScreenSlots.filter((slot) => slot.original_url && slot.print_option_id);
    if (!drawableSlots.length) {
      toast.error("Add artwork/text and select a print method first.");
      return;
    }

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
        const placement = sanitizePlacement(slot.placement, area);
        const artX = areaX + (Number(placement.x || 0) / 100) * areaW;
        const artY = areaY + (Number(placement.y || 0) / 100) * areaH;
        const artW = (Number(placement.width || 100) / 100) * areaW;
        const artH = (Number(placement.height || 100) / 100) * areaH;
        const rotation = (Number(placement.rotation || 0) * Math.PI) / 180;

        ctx.save();
        ctx.beginPath();
        ctx.rect(areaX, areaY, areaW, areaH);
        ctx.clip();
        ctx.translate(artX + artW / 2, artY + artH / 2);
        ctx.rotate(rotation);
        if (slot.text_layer) {
          await drawTextLayer(ctx, slot, -artW / 2, -artH / 2, artW, artH);
        } else {
          const artworkImage = await loadImage(slot.original_url);
          drawImageContain(ctx, artworkImage, -artW / 2, -artH / 2, artW, artH);
        }
        ctx.restore();
      }

      const blob = await blobFromCanvas(canvas);
      if (!blob) throw new Error("Could not generate mockup image");
      const fd = new FormData();
      const safeName = `${activeGroup?.label || "group"}-${screenLabel(activeScreen)}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      fd.append("file", new File([blob], `mockup-${safeName}.png`, { type: "image/png" }));
      fd.append("subdir", "product-mockups");
      const response = await http.post("/files/image", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const updatedSlots = slots.map((slot) => (slot.screen_id === currentScreenId ? { ...slot, mockup_image_url: response.data.url } : slot));
      setGroupSlots(activeGroup.id, updatedSlots);
      toast.success(`${screenLabel(activeScreen)} mockup generated`);
    } catch (error) {
      toast.error(error.message || "Could not generate mockup");
    } finally {
      setGenerating(false);
    }
  };

  const selectView = (screenId) => {
    setActiveScreenId(screenId);
    const firstArea = printAreas.find((area) => area.screen_id === screenId);
    setActivePrintAreaId(firstArea?.id || "");
    const firstSlot = slots.find((slot) => slot.screen_id === screenId || slot.print_area_id === firstArea?.id);
    setActiveSlotId(firstSlot?.id || "");
  };

  return (
    <div className="space-y-4" data-testid="product-artwork-studio">
      <header className="border border-white/10 bg-black/30 rounded-xl p-4 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div>
          <div className="overline mb-1">Artwork Studio V2</div>
          <p className="text-sm text-zinc-500 max-w-4xl">
            Build artwork per product view. Front, back, side, wrap and neck-label views remain separate, with their own print areas and mockups.
          </p>
        </div>
        <div className="grid sm:grid-cols-4 gap-2 text-xs text-zinc-400">
          <span className="border border-white/10 px-3 py-2 rounded-lg">View: {screenLabel(activeScreen)}</span>
          <span className="border border-white/10 px-3 py-2 rounded-lg">Layers: {currentScreenSlots.length}</span>
          <span className="border border-[#34C759]/30 text-[#B8F5C3] px-3 py-2 rounded-lg">View cost: {money(currentScreenPrintCost)}</span>
          <span className="border border-white/10 px-3 py-2 rounded-lg">All artwork: {money(allGroupPrintCost)}</span>
        </div>
      </header>

      <section className="border border-[#34C759]/30 bg-[#34C759]/10 rounded-xl p-4 grid md:grid-cols-4 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-[#B8F5C3] mb-1">Selected view print cost</div>
          <div className="font-display text-3xl">{money(currentScreenPrintCost)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-[#B8F5C3] mb-1">All artwork groups</div>
          <div className="font-display text-3xl">{money(allGroupPrintCost)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-[#B8F5C3] mb-1">Priced layers</div>
          <div className="font-display text-3xl">{pricedLayerCount}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-[#B8F5C3] mb-1">Missing methods</div>
          <div className={missingMethodCount ? "font-display text-3xl text-[#FF3B30]" : "font-display text-3xl"}>{missingMethodCount}</div>
        </div>
      </section>

      <div className="border border-white/10 bg-black/20 rounded-xl p-3 flex flex-wrap gap-2">
        {screens.map((screen) => {
          const active = screen.id === currentScreenId;
          const count = slots.filter((slot) => slot.screen_id === screen.id || printAreas.find((area) => area.id === slot.print_area_id)?.screen_id === screen.id).length;
          return (
            <button key={screen.id} type="button" onClick={() => selectView(screen.id)} className={active ? "studio-pill active" : "studio-pill"}>
              {screenLabel(screen)} · {count} layer(s)
            </button>
          );
        })}
        {!screens.length && <div className="text-xs text-zinc-500">No template views configured.</div>}
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-[330px_minmax(720px,1fr)_380px] gap-4">
        <aside className="border border-white/10 bg-black/20 p-4 rounded-xl space-y-4">
          <section>
            <div className="overline mb-3">Artwork Groups</div>
            <div className="space-y-2 max-h-[220px] overflow-auto pr-1">
              {groups.map((group) => {
                const ready = asArray(group.artworks).filter((slot) => slot.original_url && slot.print_option_id).length;
                const active = activeGroup?.id === group.id;
                return (
                  <button key={group.id} type="button" onClick={() => { setActiveGroupId(group.id); setActiveSlotId(asArray(group.artworks).find((slot) => slot.screen_id === currentScreenId)?.id || ""); }} className={`w-full text-left border rounded-xl p-3 ${active ? "border-[#FF3B30] bg-[#FF3B30]/10" : "border-white/10 bg-black/30 hover:border-white/30"}`}>
                    <div className="font-bold text-sm">{group.label}</div>
                    <div className="text-xs text-zinc-500 mt-1">{group.scope_type}</div>
                    <div className={`text-[10px] uppercase tracking-widest mt-2 ${ready ? "text-[#34C759]" : "text-zinc-500"}`}>{ready} ready layer(s)</div>
                  </button>
                );
              })}
              {!groups.length && <div className="text-xs text-zinc-500">Create artwork groups in the previous step.</div>}
            </div>
          </section>

          <section className="border-t border-white/10 pt-4">
            <div className="overline mb-3">Print areas in {screenLabel(activeScreen)}</div>
            <div className="space-y-2 mb-4">
              {areasForScreen.map((area) => (
                <button key={area.id} type="button" onClick={() => { setActivePrintAreaId(area.id); setActiveSlotId(slots.find((slot) => slot.print_area_id === area.id)?.id || ""); }} className={activeArea?.id === area.id ? "studio-pill active w-full justify-start" : "studio-pill w-full justify-start"}>
                  {area.name || area.area_key || "Print area"} · {area.width_mm || 0}×{area.height_mm || 0}mm
                </button>
              ))}
              {!areasForScreen.length && <div className="text-xs text-zinc-500 border border-dashed border-white/15 p-4 rounded-lg">No print areas for this view yet.</div>}
            </div>

            <div className="overline mb-3">Add Layers</div>
            <select className="input-base mb-2" value="" onChange={(event) => event.target.value && addSlot(event.target.value)} disabled={!activeGroup || !areasForScreen.length}>
              <option value="">Add image layer to print area</option>
              {normalPrintAreas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
            </select>
            <button type="button" className="btn-secondary w-full mb-3" onClick={addTextLayer} disabled={!activeGroup || !areasForScreen.length}><Type size={14} /> Add Text Layer</button>

            {neckLabelAreas.length > 0 && (
              <div className="mb-3 rounded-xl border border-[#FF7A1A]/30 bg-[#FF7A1A]/10 p-3">
                <div className="text-xs font-bold uppercase tracking-widest text-[#FFB36B]">Optional Neck Label</div>
                <div className="mt-3 space-y-2">
                  {neckLabelAreas.map((area) => (
                    <button key={area.id} type="button" onClick={() => addSlot(area.id)} disabled={!activeGroup} className="w-full text-left rounded-lg border px-3 py-2 border-white/10 bg-black/30 text-zinc-300 hover:border-[#FF7A1A]/50">
                      <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold">{area.name || "Neck Label"}</span><span className="text-[10px] uppercase tracking-widest">Add layer</span></div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="border-t border-white/10 pt-4">
            <div className="overline mb-3">Layers on this view</div>
            <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
              {currentScreenSlots.map((slot) => {
                const area = printAreas.find((item) => item.id === slot.print_area_id);
                const option = printOptions.find((item) => item.id === slot.print_option_id);
                const active = activeSlot?.id === slot.id;
                return (
                  <button key={slot.id} type="button" onClick={() => { setActiveSlotId(slot.id); setActivePrintAreaId(area?.id || ""); }} className={`w-full text-left border rounded-xl p-3 ${active ? "border-[#FF3B30] bg-[#FF3B30]/10" : "border-white/10 bg-black/30 hover:border-white/30"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-bold text-sm">{slot.text_layer ? "Text" : "Image"} · {area?.name || "Print area"}</div>
                      <span className="text-xs text-[#B8F5C3]">{money(slotPrintCost(slot))}</span>
                    </div>
                    <div className={`text-xs mt-1 ${slot.original_url && !slot.print_option_id ? "text-[#FF3B30]" : "text-zinc-500"}`}>{option ? getPrintOptionLabel(option) : slot.original_url ? "Print method missing" : "No method selected"}</div>
                    <div className={`text-[10px] uppercase tracking-widest mt-2 ${slot.original_url ? "text-[#34C759]" : "text-zinc-500"}`}>{slot.original_url ? "Artwork ready" : "Needs artwork"}</div>
                  </button>
                );
              })}
              {!currentScreenSlots.length && <div className="text-xs text-zinc-500 border border-dashed border-white/15 p-4 rounded-lg">Add image or text layers for this view.</div>}
            </div>
          </section>
        </aside>

        <main className="border border-white/10 bg-black min-h-[760px] flex items-center justify-center overflow-hidden rounded-xl p-4">
          {activeImage ? (
            <div className="relative inline-block max-w-full max-h-[860px] select-none leading-none align-middle">
              <img src={assetUrl(activeImage)} alt={screenLabel(activeScreen)} className="block h-auto w-auto max-h-[860px] max-w-full object-contain" draggable="false" />
              {areasForScreen.map((area) => {
                const areaActive = activeArea?.id === area.id;
                const areaSlots = currentScreenSlots.filter((slot) => slot.print_area_id === area.id);
                return (
                  <div
                    key={area.id}
                    ref={(element) => { if (element) areaRefs.current[area.id] = element; }}
                    className={`absolute border-2 ${areaActive ? "border-[#FF3B30] bg-[#FF3B30]/10" : "border-[#FF3B30]/50 bg-[#FF3B30]/5"} overflow-visible`}
                    style={{ left: `${areaPct(area, "x")}%`, top: `${areaPct(area, "y")}%`, width: `${areaPct(area, "width")}%`, height: `${areaPct(area, "height")}%` }}
                    onMouseDown={(event) => { event.stopPropagation(); setActivePrintAreaId(area.id); }}
                  >
                    <div className="absolute -top-8 left-0 z-30 bg-[#FF3B30] text-white text-[10px] uppercase tracking-widest px-2 py-1 whitespace-nowrap">
                      {area.name} · {area.width_mm || 0}×{area.height_mm || 0}mm
                    </div>

                    {areaSlots.map((slot) => {
                      if (!slot.original_url) return null;
                      const placement = sanitizePlacement(slot.placement, area);
                      const active = activeSlot?.id === slot.id;
                      return (
                        <div key={slot.id} className={`absolute border-2 ${active ? "border-[#34C759]" : "border-white/40"} bg-white/5 cursor-move`} style={{ left: `${placement.x}%`, top: `${placement.y}%`, width: `${placement.width}%`, height: `${placement.height}%`, transform: `rotate(${placement.rotation}deg)`, transformOrigin: "center center" }} onMouseDown={(event) => startDrag(event, slot, "move")}>
                          {slot.text_layer ? (
                            <TextLayerPreview slot={slot} />
                          ) : (
                            <img src={assetUrl(slot.original_url)} alt="Artwork layer" className="h-full w-full object-contain pointer-events-none" draggable="false" />
                          )}
                          {active && (
                            <>
                              <ResizeHandle position="nw" onMouseDown={(event) => startDrag(event, slot, "resize", "nw")} />
                              <ResizeHandle position="ne" onMouseDown={(event) => startDrag(event, slot, "resize", "ne")} />
                              <ResizeHandle position="sw" onMouseDown={(event) => startDrag(event, slot, "resize", "sw")} />
                              <ResizeHandle position="se" onMouseDown={(event) => startDrag(event, slot, "resize", "se")} />
                              <button type="button" className="absolute left-1/2 -top-12 -translate-x-1/2 h-8 w-8 rounded-full border border-[#34C759] bg-black text-[#34C759] flex items-center justify-center cursor-grab" title="Drag to rotate" onMouseDown={(event) => startDrag(event, slot, "rotate")}><RotateCcw size={14} /></button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center text-zinc-600 p-10"><ImageIcon className="mx-auto mb-4" size={56} /><div className="font-display text-3xl uppercase">No product view</div><p className="text-sm mt-2">Configure a base image/view for this template screen.</p></div>
          )}
        </main>

        <aside className="border border-white/10 bg-black/20 p-4 rounded-xl">
          {activeSlot && activeArea ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="overline mb-1">Selected Layer</div>
                  <h3 className="font-display text-2xl uppercase">{activeSlot.text_layer ? "Text" : "Image"} Layer</h3>
                  <p className="text-xs text-zinc-500 mt-1">{screenLabel(activeScreen)} · {activeArea.name} · {activeArea.width_mm || 0}mm × {activeArea.height_mm || 0}mm</p>
                </div>
                <button type="button" className="text-zinc-500 hover:text-[#FF3B30]" onClick={() => removeSlot(activeSlot.id)}><Trash2 size={16} /></button>
              </div>

              <div className="rounded-xl border border-[#34C759]/30 bg-[#34C759]/10 p-4">
                <div className="text-[10px] uppercase tracking-widest text-[#B8F5C3] mb-1">Selected layer print cost</div>
                <div className="font-display text-3xl">{activeSlot.calculated_print_cost !== undefined ? money(activeSlot.calculated_print_cost || 0) : "Pending"}</div>
                <div className="text-xs text-[#B8F5C3]/80 mt-1">{activeSlot.area_cm2 || 0}cm² · {activeSlot.print_width_mm || 0}×{activeSlot.print_height_mm || 0}mm</div>
              </div>

              {activeSlot.text_layer && (
                <div className="border border-white/10 bg-black/30 rounded-xl p-3 space-y-3">
                  <div className="font-bold text-sm">Text editor</div>
                  <label>
                    <span className="label">Text</span>
                    <textarea className="input-base min-h-[72px]" value={activeSlot.text_content || ""} onChange={(event) => updateTextLayer({ text_content: event.target.value })} />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label>
                      <span className="label">Font</span>
                      <select className="input-base" value={activeSlot.text_font_family || "Roboto"} onChange={(event) => updateTextLayer({ text_font_family: event.target.value })}>
                        {TEXT_FONT_OPTIONS.map((font) => <option key={font} value={font}>{font}</option>)}
                      </select>
                    </label>
                    <label>
                      <span className="label">Weight</span>
                      <select className="input-base" value={String(activeSlot.text_font_weight || "700")} onChange={(event) => updateTextLayer({ text_font_weight: event.target.value })}>
                        <option value="400">Regular</option>
                        <option value="600">Semi-bold</option>
                        <option value="700">Bold</option>
                        <option value="900">Heavy</option>
                      </select>
                    </label>
                    <label>
                      <span className="label">Text render size</span>
                      <input className="input-base" type="number" min={TEXT_RENDER_MIN} max={TEXT_RENDER_MAX} step="10" value={Number(activeSlot.text_font_size || 180)} onChange={(event) => updateTextLayer({ text_font_size: Number(event.target.value || 180) })} />
                    </label>
                    <label>
                      <span className="label">Colour</span>
                      <input className="input-base h-[42px]" type="color" value={activeSlot.text_color || "#111111"} onChange={(event) => updateTextLayer({ text_color: event.target.value })} />
                    </label>
                  </div>
                  <p className="text-[11px] text-zinc-500">Use the green canvas handles to resize text on the product. Render size controls sharpness/detail, not final product size.</p>
                </div>
              )}

              <div>
                <label className="label">Print method for selected layer</label>
                <select className="input-base" value={activeSlot.print_option_id || ""} onChange={(event) => {
                  const option = allowedOptions.find((item) => item.id === event.target.value);
                  patchSlot(activeSlot.id, optionPatchForSlot(activeSlot, activeArea, option || {}));
                }}>
                  <option value="">Select method</option>
                  {allowedOptions.map((option) => <option key={option.id} value={option.id}>{getPrintOptionLabel(option)} · {option.calculation_type === "area_fixed_rate" || option.calculation_type === "area_from_sheet" ? `R ${Number(option.cost_per_cm2 || 0).toFixed(4)}/cm²` : money(option.print_cost_max)}</option>)}
                </select>
                {allowedOptions.length === 1 && <div className="text-[11px] text-[#34C759] mt-2">Only one method is available, so it is auto-selected.</div>}
                {allowedOptions.length === 0 && <div className="mt-3 border border-[#FFCC00]/50 bg-[#FFCC00]/10 p-3 text-xs text-[#FFE08A] rounded-lg">No print options are allowed for this resolved area yet.</div>}
              </div>

              {!activeSlot.text_layer && (
                <div>
                  <label className="label">Upload image layer</label>
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="input-base" onChange={(event) => uploadArtwork(event.target.files?.[0] || null)} />
                  {uploading && <div className="text-xs text-zinc-500 mt-2">Uploading…</div>}
                  {activeSlot.original_url && <a href={assetUrl(activeSlot.original_url)} target="_blank" rel="noreferrer" className="block text-xs text-[#FF3B30] mt-2 truncate">{activeSlot.file_name || activeSlot.original_url}</a>}
                </div>
              )}

              {missingPrintMethod && <div className="border border-[#FF3B30]/50 bg-[#FF3B30]/10 p-3 text-xs text-[#FFB4B0] rounded-lg">This layer has artwork, but no print method yet.</div>}

              <div className="border-t border-white/10 pt-4">
                <div className="overline mb-2">Placement</div>
                <p className="text-xs text-zinc-500 mb-3 flex items-center gap-2"><Move size={13} /> Drag the layer on the preview. Aspect ratio is locked by default.</p>
                <label className="flex items-center gap-2 text-xs text-zinc-300 mb-3"><input type="checkbox" checked={activeSlot.lock_aspect_ratio !== false} onChange={(event) => patchSlot(activeSlot.id, { lock_aspect_ratio: event.target.checked })} /> Lock aspect ratio</label>
                <div className="grid grid-cols-2 gap-2">
                  <NumericControl label="X %" value={activePlacement.x} onChange={(value) => patchPlacement(activeSlot.id, { x: value })} />
                  <NumericControl label="Y %" value={activePlacement.y} onChange={(value) => patchPlacement(activeSlot.id, { y: value })} />
                  <NumericControl label="W %" value={activePlacement.width} onChange={(value) => patchPlacement(activeSlot.id, { width: value })} />
                  <NumericControl label="H %" value={activePlacement.height} onChange={(value) => patchPlacement(activeSlot.id, { height: value })} />
                  <NumericControl label="Rotation" value={activePlacement.rotation} onChange={(value) => patchPlacement(activeSlot.id, { rotation: value })} />
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <button type="button" className="btn-secondary" onClick={() => patchPlacement(activeSlot.id, { x: 0, y: 0, width: 100, height: 100, rotation: 0 })}>Fit</button>
                  <button type="button" className="btn-secondary" onClick={() => patchPlacement(activeSlot.id, { x: 25, y: 25, width: 50, height: 50, rotation: 0 })}>Center</button>
                  <button type="button" className="btn-secondary" onClick={() => patchPlacement(activeSlot.id, defaultPlacement(activeArea))}>Reset</button>
                </div>
              </div>

              <button type="button" className="btn-primary w-full" disabled={generating || !canGenerateMockup} onClick={generateMockup}><RefreshCw size={14} /> {generating ? "Generating…" : `Generate ${screenLabel(activeScreen)} Mockup`}</button>
              {!canGenerateMockup && <p className="text-xs text-zinc-500">At least one layer on this view needs artwork and a print method.</p>}

              {activeSlot.mockup_image_url && <div className="border border-white/10 p-3 bg-black/40 rounded-xl"><div className="overline mb-2">Generated Mockup</div><img src={assetUrl(activeSlot.mockup_image_url)} alt="Generated mockup" className="w-full max-h-56 object-contain bg-black" /></div>}
            </div>
          ) : (
            <div className="text-zinc-500 text-sm"><div className="overline mb-3">Inspector</div><p>Select a product view and add an image or text layer.</p>{areasForScreen.length > 0 && activeGroup && <button type="button" className="btn-primary w-full mt-4" onClick={() => addSlot(areasForScreen[0].id)}><Plus size={14} /> Add First Layer</button>}</div>
          )}
        </aside>
      </div>
    </div>
  );
}
