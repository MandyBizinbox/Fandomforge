import { assetUrl } from "../../lib/api";
import { resolveEffectiveProductionSetup } from "../../lib/templateProductionResolver";
import { normalisePrintAreaGeometry, traceCanvasPrintAreaPath } from "../../lib/printAreaGeometry";
import { asArray, getVariationLabel } from "./productBuilderUtils";

function clamp(value, min, max) { return Math.min(max, Math.max(min, Number(value || 0))); }

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load image: ${src}`));
    image.src = assetUrl(src);
  });
}

function blobFromCanvas(canvas) {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png", 0.95));
}

function normalisePlacement(placement = {}) {
  const width = clamp(placement.width ?? placement.width_pct ?? 100, 2, 100);
  const height = clamp(placement.height ?? placement.height_pct ?? 100, 2, 100);
  return {
    x: clamp(placement.x ?? placement.x_pct ?? 0, 0, Math.max(0, 100 - width)),
    y: clamp(placement.y ?? placement.y_pct ?? 0, 0, Math.max(0, 100 - height)),
    width,
    height,
    rotation: Number(placement.rotation || 0),
  };
}

function hasArtwork(slot) {
  return Boolean(slot?.original_url || slot?.text_layer || slot?.text_content);
}

function normaliseText(slot) {
  return {
    text: String(slot?.text_content || "Custom Text"),
    font: slot?.text_font_family || "Arial",
    weight: slot?.text_font_weight || "700",
    size: Number(slot?.text_font_size || 180),
    colour: slot?.text_color || "#111111",
  };
}

async function drawSlot(context, slot, area, width, height) {
  const placement = normalisePlacement(slot?.placement);
  const x = (placement.x / 100) * width;
  const y = (placement.y / 100) * height;
  const w = (placement.width / 100) * width;
  const h = (placement.height / 100) * height;
  const geometry = normalisePrintAreaGeometry(area || {});

  context.save();
  if (geometry.geometry_type !== "mask") {
    traceCanvasPrintAreaPath(context, geometry, 0, 0, width, height);
    context.clip();
  }
  context.translate(x + w / 2, y + h / 2);
  context.rotate((placement.rotation * Math.PI) / 180);

  if (slot.text_layer || slot.text_content) {
    const settings = normaliseText(slot);
    const lines = settings.text.split(/\r?\n/).filter(Boolean);
    const safeLines = lines.length ? lines : ["Custom Text"];
    let fontSize = settings.size;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = settings.colour;
    context.font = `${settings.weight} ${fontSize}px ${settings.font}`;
    const maxWidth = Math.max(...safeLines.map((line) => context.measureText(line).width), 1);
    const lineHeight = fontSize * 1.28;
    const scale = Math.min((w * 0.92) / maxWidth, (h * 0.86) / (lineHeight * safeLines.length), 1);
    fontSize = Math.max(4, fontSize * scale);
    context.font = `${settings.weight} ${fontSize}px ${settings.font}`;
    const finalLineHeight = fontSize * 1.28;
    const total = finalLineHeight * safeLines.length;
    const startY = -total / 2 + finalLineHeight / 2;
    safeLines.forEach((line, index) => context.fillText(line, 0, startY + index * finalLineHeight));
  } else if (slot.original_url) {
    const image = await loadImage(slot.original_url);
    context.drawImage(image, -w / 2, -h / 2, w, h);
  }
  context.restore();

  if (geometry.geometry_type === "mask" && geometry.mask_url) {
    const maskImage = await loadImage(geometry.mask_url);
    context.save();
    context.globalCompositeOperation = "destination-in";
    context.drawImage(maskImage, 0, 0, width, height);
    context.restore();
  }
}

function groupSpecificity(group) {
  if (!group) return -1;
  if (group.scope_type === "variation") return 4;
  if (group.scope_type === "custom") return 3;
  if (group.scope_type === "attribute") return 2;
  if (group.scope_type === "all") return 1;
  return 0;
}

function groupAppliesToVariation(group, variation, selectedIds) {
  if (!group || !variation) return false;
  const ids = asArray(group.variation_ids);
  if (group.scope_type === "all") return selectedIds.has(variation.id) || !selectedIds.size;
  return ids.includes(variation.id);
}

function resolveArtworkGroup(groups, variation, selectedIds) {
  return asArray(groups)
    .filter((group) => groupAppliesToVariation(group, variation, selectedIds))
    .sort((a, b) => groupSpecificity(b) - groupSpecificity(a) || Number(a.sort_order || 0) - Number(b.sort_order || 0))[0] || null;
}

function resolvedAreas(template, variation, screen) {
  return asArray(template?.print_areas)
    .filter((area) => area?.id && area?.screen_id === screen?.id)
    .map((area) => {
      const effective = resolveEffectiveProductionSetup(template || {}, variation || {}, { screen, defaultPrintArea: area });
      const override = effective?.printAreaOverride || {};
      return {
        ...area,
        ...override,
        id: area.id,
        screen_id: area.screen_id,
        x: override.x_pct ?? area.x_pct ?? area.x ?? 0,
        y: override.y_pct ?? area.y_pct ?? area.y ?? 0,
        width: override.width_pct ?? area.width_pct ?? area.width ?? 0,
        height: override.height_pct ?? area.height_pct ?? area.height ?? 0,
      };
    });
}

function resolveVariationBaseImage(template, variation, screen, screenAreas) {
  for (const area of screenAreas) {
    const effective = resolveEffectiveProductionSetup(template || {}, variation || {}, { screen, defaultPrintArea: area });
    const url = effective?.canvasImageUrl || effective?.printAreaOverride?.image_url || screen?.image_url || area?.image_url || "";
    if (url) return url;
  }
  return screen?.image_url || "";
}

function variationMockupRecord(variation, screen, url, artworkGroup) {
  return {
    id: `variation-mockup-${variation.id}-${screen.id}`,
    variation_id: variation.id,
    variation_label: getVariationLabel(variation),
    screen_id: screen.id,
    view_key: screen.view_key || screen.view || screen.name || "view",
    role: screen.role || screen.view || "mockup",
    image_url: url,
    artwork_group_id: artworkGroup?.id || null,
    artwork_group_label: artworkGroup?.label || "",
    generated_at: new Date().toISOString(),
    source: "product_builder",
    status: "approved",
  };
}

export async function generateVariationMockups({ template, variations, artworkGroups, onProgress }) {
  const selected = asArray(variations);
  const selectedIds = new Set(selected.map((variation) => variation.id));
  const screens = asArray(template?.mockup_screens).filter((screen) => screen?.id && screen?.image_url && screen.status !== "archived");
  if (!selected.length) throw new Error("Select at least one variation before generating mockups.");
  if (!screens.length) throw new Error("The selected template has no mockup views with images.");

  const records = [];
  let completed = 0;
  const total = selected.length * screens.length;

  for (const variation of selected) {
    const group = resolveArtworkGroup(artworkGroups, variation, selectedIds);
    if (!group) continue;
    const drawableSlots = asArray(group.artworks).filter(hasArtwork);
    if (!drawableSlots.length) continue;

    for (const screen of screens) {
      const areas = resolvedAreas(template, variation, screen);
      const baseImage = resolveVariationBaseImage(template, variation, screen, areas);
      if (!baseImage) {
        completed += 1;
        onProgress?.({ completed, total, variation, screen, skipped: true });
        continue;
      }

      const image = await loadImage(baseImage);
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      for (const area of areas) {
        const slots = drawableSlots.filter((slot) => slot.print_area_id === area.id);
        if (!slots.length) continue;
        const areaX = (Number(area.x || 0) / 100) * canvas.width;
        const areaY = (Number(area.y || 0) / 100) * canvas.height;
        const areaW = (Number(area.width || 0) / 100) * canvas.width;
        const areaH = (Number(area.height || 0) / 100) * canvas.height;
        if (areaW <= 0 || areaH <= 0) continue;
        const layerCanvas = document.createElement("canvas");
        layerCanvas.width = Math.max(1, Math.round(areaW));
        layerCanvas.height = Math.max(1, Math.round(areaH));
        const layerContext = layerCanvas.getContext("2d");
        for (const slot of slots) await drawSlot(layerContext, slot, area, layerCanvas.width, layerCanvas.height);
        context.drawImage(layerCanvas, areaX, areaY, areaW, areaH);
      }

      const blob = await blobFromCanvas(canvas);
      if (!blob) throw new Error(`Could not encode ${getVariationLabel(variation)} ${screen.name || "view"} mockup.`);
      const form = new FormData();
      form.append("file", new File([blob], `mockup-${variation.id}-${screen.id}.png`, { type: "image/png" }));
      form.append("subdir", "product-mockups");
      const response = await fetch("/api/files/image", { method: "POST", body: form });
      if (!response.ok) throw new Error(`Mockup upload failed for ${getVariationLabel(variation)}.`);
      const payload = await response.json();
      records.push(variationMockupRecord(variation, screen, payload.url, group));
      completed += 1;
      onProgress?.({ completed, total, variation, screen, record: records[records.length - 1] });
    }
  }

  return records;
}

export function applyVariationMockupsToGroups(groups, records) {
  const rows = asArray(records);
  return asArray(groups).map((group) => {
    const existing = asArray(group.variation_mockups).filter((item) => !rows.some((record) => record.variation_id === item.variation_id && record.screen_id === item.screen_id));
    const additions = rows.filter((record) => record.artwork_group_id === group.id);
    const next = [...existing, ...additions];
    const primary = next.find((item) => item.image_url)?.image_url || group.primary_mockup_image_url || "";
    return { ...group, variation_mockups: next, primary_mockup_image_url: primary };
  });
}
