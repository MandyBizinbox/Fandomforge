import React, { useMemo, useState } from "react";
import { RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { http, assetUrl } from "../../lib/api";
import {
  resolveEffectiveProductionSetup,
  activeTemplatePrintAreas,
  activeTemplateScreens,
} from "../../lib/templateProductionResolver";
import { normalisePrintAreaGeometry, traceCanvasPrintAreaPath } from "../../lib/printAreaGeometry";
import { asArray, getAreaPreviewImage, getVariationColour, getVariationLabel } from "./productBuilderUtils";

const text = (value) => String(value ?? "").trim();
const normalise = (value) => text(value).toLowerCase().replace(/[^a-z0-9]+/g, "-");

function getAttributeEntries(variation = {}) {
  const attrs = variation?.attributes || variation?.attribute_values || {};
  return Object.entries(attrs || {}).filter(([, value]) => value !== undefined && value !== null && text(value));
}

function getColourIdentity(variation = {}) {
  const entries = getAttributeEntries(variation);
  const colourEntry = entries.find(([key]) => /colou?r/i.test(key));
  if (colourEntry) return normalise(colourEntry[1]);

  if (variation?.color || variation?.colour) return normalise(variation.color || variation.colour);

  const nonSize = entries.filter(([key]) => !/size/i.test(key));
  if (nonSize.length === 1) return normalise(nonSize[0][1]);

  return "default";
}

const colourLabel = (variation) => {
  const entries = getAttributeEntries(variation);
  const colourEntry = entries.find(([key]) => /colou?r/i.test(key));
  return text(colourEntry?.[1] || variation?.color || variation?.colour || "Default");
};

const semanticKeys = (item = {}) => [
  item.id,
  item.view_key,
  item.view,
  item.screen_view,
  item.area_key,
  item.name,
].filter(Boolean).map(normalise);

function sameSemantic(a, b) {
  const aa = semanticKeys(a);
  const bb = new Set(semanticKeys(b));
  return aa.some((key) => bb.has(key));
}

function blobFromCanvas(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.95));
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = assetUrl(src);
  });
}

async function uploadCanvas(canvas, fileName) {
  const blob = await blobFromCanvas(canvas);
  if (!blob) throw new Error("Could not create mockup image");
  const data = new FormData();
  data.append("file", new File([blob], fileName, { type: "image/png" }));
  data.append("subdir", "product-mockups");
  const response = await http.post("/files/image", data, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data.url;
}

function findArea(areas, slot) {
  const exact = asArray(areas).find((area) => text(area.id) === text(slot?.print_area_id));
  if (exact) return exact;
  const slotKeys = new Set(semanticKeys(slot));
  return asArray(areas).find((area) => semanticKeys(area).some((key) => slotKeys.has(key))) || null;
}

function getAreaBox(area, width, height) {
  return {
    x: Number(area?.x_pct ?? area?.x ?? 0) / 100 * width,
    y: Number(area?.y_pct ?? area?.y ?? 0) / 100 * height,
    width: Number(area?.width_pct ?? area?.width ?? 0) / 100 * width,
    height: Number(area?.height_pct ?? area?.height ?? 0) / 100 * height,
  };
}

function getPlacementBox(area, slot, width, height) {
  const areaBox = getAreaBox(area, width, height);
  const placement = slot?.placement || {};
  return {
    x: areaBox.x + Number(placement.x ?? 0) / 100 * areaBox.width,
    y: areaBox.y + Number(placement.y ?? 0) / 100 * areaBox.height,
    width: Number(placement.width ?? 100) / 100 * areaBox.width,
    height: Number(placement.height ?? 100) / 100 * areaBox.height,
    rotation: Number(placement.rotation || 0) * Math.PI / 180,
  };
}

function clipArea(ctx, area, width, height, draw) {
  const geometry = normalisePrintAreaGeometry(area || {});
  const box = getAreaBox(area, width, height);
  if (box.width <= 0 || box.height <= 0) return;
  ctx.save();
  if (geometry.geometry_type !== "mask") {
    traceCanvasPrintAreaPath(ctx, geometry, box.x, box.y, box.width, box.height);
    ctx.clip();
  }
  draw(box);
  ctx.restore();
}

function drawArtwork(ctx, image, area, slot, width, height) {
  const box = getPlacementBox(area, slot, width, height);
  if (box.width <= 0 || box.height <= 0) return;
  clipArea(ctx, area, width, height, () => {
    ctx.save();
    ctx.translate(box.x + box.width / 2, box.y + box.height / 2);
    ctx.rotate(box.rotation);
    ctx.drawImage(image, -box.width / 2, -box.height / 2, box.width, box.height);
    ctx.restore();
  });
}

function parseTextLayer(slot) {
  const raw = slot?.text_layer;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    } catch (_) {
      return { text: raw };
    }
  }
  return text(slot?.text_content) ? { text: slot.text_content } : null;
}

function drawText(ctx, area, slot, width, height) {
  const layer = parseTextLayer(slot);
  const content = text(layer?.text ?? layer?.content ?? layer?.value);
  if (!content) return;
  const box = getPlacementBox(area, slot, width, height);
  if (box.width <= 0 || box.height <= 0) return;
  const fontSize = Math.max(8, Number(layer?.font_size_px ?? layer?.fontSizePx ?? layer?.font_size ?? layer?.fontSize ?? Math.min(box.width, box.height) * 0.18) || 8);
  const fontFamily = text(layer?.font_family ?? layer?.fontFamily) || "Arial, sans-serif";
  const fontWeight = text(layer?.font_weight ?? layer?.fontWeight) || "700";
  const color = text(layer?.color ?? layer?.fill ?? layer?.text_color) || "#000000";
  clipArea(ctx, area, width, height, () => {
    ctx.save();
    ctx.translate(box.x + box.width / 2, box.y + box.height / 2);
    ctx.rotate(box.rotation);
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(content, 0, 0, box.width);
    ctx.restore();
  });
}

function getArtworkSlots(group) {
  return asArray(group?.artworks).filter((slot) => {
    if (!slot) return false;
    if (slot.status === "archived" || slot.archived || slot.deleted || slot.disabled === true || slot.enabled === false) return false;
    return Boolean(slot?.print_area_id || slot?.area_key || slot?.view_key || slot?.screen_view) && Boolean(slot?.original_url || slot?.text_layer || slot?.text_content);
  });
}

function getSlotArea(template, variation, slot) {
  const variationAreas = activeTemplatePrintAreas(template, variation);
  const templateAreas = asArray(template?.print_areas).filter((area) => area?.id && area?.screen_id);
  return findArea(variationAreas, slot) || findArea(templateAreas, slot) || null;
}

function getActiveArtworkViewKeys(template, group, representatives) {
  const slots = getArtworkSlots(group);
  const views = new Map();
  representatives.forEach((variation) => {
    slots.forEach((slot) => {
      const area = getSlotArea(template, variation, slot);
      if (!area || !area.screen_id) return;
      const screens = asArray(template?.mockup_screens).filter((screen) => screen?.id);
      const screen = screens.find((item) => text(item.id) === text(area.screen_id)) || screens.find((item) => sameSemantic(item, area));
      if (!screen) return;
      const viewKey = normalise(screen.view_key || screen.screen_view || screen.name || screen.id);
      if (!views.has(viewKey)) views.set(viewKey, { screen, area });
    });
  });
  return [...views.values()];
}

/**
 * Mockup targets are colour x active artwork view.
 *
 * Sizes are deliberately discarded. The artwork scope and its actual print
 * area determine the view; the representative variation supplies the base
 * image for that colour.
 */
function resolveArtworkViewTargets(template, scopedVariations, group) {
  const slots = getArtworkSlots(group);
  if (!slots.length) return [];

  const representatives = new Map();
  asArray(scopedVariations).forEach((variation) => {
    const key = getColourIdentity(variation);
    if (!representatives.has(key)) representatives.set(key, variation);
  });

  const activeViews = getActiveArtworkViewKeys(template, group, [...representatives.values()]);
  const targets = [];

  representatives.forEach((variation) => {
    const variationAreas = activeTemplatePrintAreas(template, variation);
    const variationScreens = activeTemplateScreens(template, variation);

    activeViews.forEach(({ screen: canonicalScreen, area: canonicalArea }) => {
      const actualScreen = variationScreens.find((screen) => sameSemantic(screen, canonicalScreen))
        || variationScreens.find((screen) => text(screen.id) === text(canonicalScreen.id))
        || canonicalScreen;
      const actualArea = findArea(variationAreas, canonicalArea) || canonicalArea;
      targets.push({ variation, screen: actualScreen, canonicalScreen, canonicalArea, actualArea });
    });
  });

  return targets;
}

async function generateMockup(template, variation, group, target) {
  const area = target.actualArea || getSlotArea(template, variation, target.canonicalArea) || target.canonicalArea;
  const slots = getArtworkSlots(group).filter((slot) => {
    const slotArea = getSlotArea(template, variation, slot);
    if (!slotArea) return false;
    return text(slotArea.id) === text(area.id) || text(slotArea.screen_id) === text(area.screen_id) || sameSemantic(slotArea, area);
  });
  if (!slots.length) return null;

  const setup = resolveEffectiveProductionSetup(template, variation, {
    screen: target.screen,
    area,
    defaultPrintArea: area,
  });
  const baseUrl = setup.viewImageUrl || setup.imageUrl || getAreaPreviewImage(template, area, variation.id);
  if (!baseUrl) throw new Error(`No base mockup image is available for ${getVariationLabel(variation)}`);

  const base = await loadImage(baseUrl);
  const canvas = document.createElement("canvas");
  canvas.width = base.naturalWidth || base.width || 1;
  canvas.height = base.naturalHeight || base.height || 1;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(base, 0, 0, canvas.width, canvas.height);

  for (const slot of slots) {
    const slotArea = getSlotArea(template, variation, slot) || area;
    if (slot.original_url) drawArtwork(ctx, await loadImage(slot.original_url), slotArea, slot, canvas.width, canvas.height);
    if (slot.text_layer || slot.text_content) drawText(ctx, slotArea, slot, canvas.width, canvas.height);
  }

  const viewKey = target.canonicalScreen.view_key || target.canonicalScreen.screen_view || target.canonicalScreen.name || target.canonicalScreen.id;
  const safe = `${group?.label || group?.scope_type || "scope"}-${colourLabel(variation)}-${viewKey}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const imageUrl = await uploadCanvas(canvas, `variation-mockup-${safe}.png`);

  return {
    id: `variation-mockup-${group.id}-${variation.id}-${target.canonicalScreen.id || viewKey}`,
    variation_id: variation.id,
    variation_ids: [variation.id],
    variation_label: getVariationLabel(variation),
    variation_colour: colourLabel(variation),
    scope_type: group?.scope_type || "custom",
    scope_label: group?.label || "Artwork scope",
    attribute_key: group?.attribute_key || "",
    attribute_value: group?.attribute_value || "",
    screen_id: target.canonicalScreen.id || "",
    view_key: viewKey,
    role: "variation_mockup",
    image_url: imageUrl,
    status: "approved",
    source: "system_generated",
    generated_at: new Date().toISOString(),
    artwork_group_id: group?.id || "",
  };
}

export default function VariationMockupGenerator({ template, artworkGroups, selectedVariations, onArtworkGroupsChange }) {
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [lastResult, setLastResult] = useState(null);
  const variations = asArray(selectedVariations);
  const groups = asArray(artworkGroups);

  const targets = useMemo(() => groups.map((group) => {
    const ids = group.scope_type === "all" ? variations.map((variation) => variation.id) : asArray(group.variation_ids);
    const scoped = variations.filter((variation) => ids.includes(variation.id));
    if (!scoped.length) return null;
    return { group, variations: scoped, viewTargets: resolveArtworkViewTargets(template, scoped, group) };
  }).filter(Boolean), [groups, variations, template]);

  const readyTargets = targets.filter((target) => target.viewTargets.length);
  const totalViews = readyTargets.reduce((sum, target) => sum + target.viewTargets.length, 0);
  const colourCount = readyTargets.reduce((sum, target) => sum + new Set(target.viewTargets.map((item) => getColourIdentity(item.variation))).size, 0);
  const activeViewCount = new Set(readyTargets.flatMap((target) => target.viewTargets.map((item) => normalise(item.canonicalScreen.view_key || item.canonicalScreen.screen_view || item.canonicalScreen.name || item.canonicalScreen.id)))).size;

  const generateAll = async () => {
    if (!readyTargets.length) {
      toast.error("No artwork-backed print views were found. Upload artwork and assign it to a print area first.");
      return;
    }
    setGenerating(true);
    setLastResult(null);
    setProgress({ done: 0, total: totalViews });
    try {
      const generated = [];
      let done = 0;
      for (const target of readyTargets) {
        for (const viewTarget of target.viewTargets) {
          const result = await generateMockup(template, viewTarget.variation, target.group, viewTarget);
          if (result) generated.push(result);
          done += 1;
          setProgress({ done, total: totalViews });
        }
      }
      if (!generated.length) throw new Error("No mockups could be generated from the active artwork scopes.");

      const byGroup = new Map();
      generated.forEach((row) => {
        if (!byGroup.has(row.artwork_group_id)) byGroup.set(row.artwork_group_id, []);
        byGroup.get(row.artwork_group_id).push(row);
      });
      const nextGroups = groups.map((group) => {
        const rows = byGroup.get(group.id) || [];
        if (!rows.length) return group;
        const generatedKeys = new Set(rows.map((row) => `${normalise(row.variation_colour)}::${normalise(row.view_key)}`));
        const existing = asArray(group.variation_mockups).filter((row) => !generatedKeys.has(`${normalise(row.variation_colour || row.colour || row.variation_label)}::${normalise(row.view_key)}`));
        return {
          ...group,
          variation_mockups: [...existing, ...rows],
          primary_mockup_image_url: rows[0]?.image_url || group.primary_mockup_image_url || "",
          derived_mockup_images: [
            ...asArray(group.derived_mockup_images).filter((row) => row.source !== "variation_generation"),
            ...rows.map((row) => ({ ...row, source: "variation_generation" })),
          ],
        };
      });
      onArtworkGroupsChange(nextGroups);
      const colours = new Set(generated.map((row) => normalise(row.variation_colour))).size;
      const views = new Set(generated.map((row) => row.view_key)).size;
      setLastResult({ generated: generated.length, colours, views, scopes: readyTargets.length });
      toast.success(`${generated.length} mockup(s) generated — ${colours} colour(s) × ${views} active artwork view(s)`);
    } catch (error) {
      toast.error(error.message || "Could not generate variation mockups");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <section className="border border-[#FF3B30]/40 bg-black/40 rounded-xl p-5 space-y-4" data-testid="variation-mockup-generator">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="overline mb-1">Variation Mockup Generation</div>
          <h2 className="font-display text-3xl uppercase">Generate required mockups</h2>
          <p className="text-sm text-zinc-400 mt-2 max-w-3xl">Mockups are generated from artwork scope and active artwork-backed print views. Sizes never create mockups. Shared artwork generates one mockup per selected colour and active artwork view, using that colour's own base image.</p>
        </div>
        <button type="button" className="btn-primary shrink-0" disabled={generating || !readyTargets.length} onClick={generateAll}>
          <RefreshCw size={15} className={generating ? "animate-spin" : ""} />
          {generating ? `Generating ${progress.done}/${progress.total}` : `Generate ${totalViews} Mockup(s)`}
        </button>
      </div>
      <div className="grid md:grid-cols-4 gap-3 text-xs">
        <div className="border border-white/10 bg-black/30 rounded-lg p-3"><div className="overline">Selected variations</div><div className="font-display text-2xl mt-1">{variations.length}</div></div>
        <div className="border border-white/10 bg-black/30 rounded-lg p-3"><div className="overline">Artwork scopes</div><div className="font-display text-2xl mt-1">{targets.length}</div></div>
        <div className="border border-white/10 bg-black/30 rounded-lg p-3"><div className="overline">Colours × active views</div><div className="font-display text-2xl mt-1">{colourCount} × {activeViewCount}</div></div>
        <div className="border border-white/10 bg-black/30 rounded-lg p-3"><div className="overline">Required mockups</div><div className="font-display text-2xl mt-1">{totalViews}</div></div>
      </div>
      {generating && <div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-[#FF3B30] transition-all" style={{ width: `${progress.total ? progress.done / progress.total * 100 : 0}%` }} /></div>}
      {lastResult && <div className="border border-[#34C759]/30 bg-[#0A1B10] rounded-lg p-3 flex items-center gap-2 text-sm text-[#B8F5C3]"><CheckCircle2 size={16} /> {lastResult.generated} mockups generated for {lastResult.colours} colour(s), across {lastResult.views} active artwork view(s) and {lastResult.scopes} scope(s).</div>}
      {!readyTargets.length && <div className="border border-[#FFCC00]/30 bg-[#FFCC00]/10 rounded-lg p-3 text-xs text-[#FFE08A] flex gap-2"><AlertTriangle size={15} /> No artwork-backed print view is currently available for the selected scope.</div>}
      {groups.some((group) => asArray(group.variation_mockups).length) && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {groups.flatMap((group) => asArray(group.variation_mockups)).slice(-24).map((row) => (
            <div key={row.id || `${row.image_url}-${row.variation_colour}-${row.view_key}`} className="border border-white/10 bg-black/30 rounded-lg p-2">
              <img src={assetUrl(row.image_url)} alt={`${row.variation_colour || row.variation_label || "Variation"} ${row.view_key || "mockup"}`} className="w-full aspect-square object-contain bg-black rounded" />
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 mt-2 truncate">{row.variation_colour || row.variation_label || row.scope_label}</div>
              <div className="text-[9px] text-zinc-600 mt-1 truncate">{row.view_key || "view"}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
