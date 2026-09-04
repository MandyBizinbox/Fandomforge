import React, { useMemo, useState } from "react";
import { RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { http, assetUrl } from "../../lib/api";
import { resolveEffectiveProductionSetup, activeTemplatePrintAreas, activeTemplateScreens } from "../../lib/templateProductionResolver";
import { normalisePrintAreaGeometry, traceCanvasPrintAreaPath } from "../../lib/printAreaGeometry";
import { asArray, getAreaPreviewImage, getVariationColour, getVariationLabel } from "./productBuilderUtils";

const text = (value) => String(value ?? "").trim();
const normalise = (value) => text(value).toLowerCase().replace(/[^a-z0-9]+/g, "-");

function getColourKey(variation = {}) {
  return normalise(getVariationColour(variation) || "default");
}

function getColourLabel(variation = {}) {
  return text(getVariationColour(variation) || "Default");
}

const screenKeys = (screen = {}) => [
  screen.id,
  screen.view_key,
  screen.view,
  screen.screen_view,
  screen.name,
].filter(Boolean).map(normalise);

const areaKeys = (area = {}) => [
  area.id,
  area.area_key,
  area.view_key,
  area.screen_view,
  area.name,
].filter(Boolean).map(normalise);

function sameSemantic(a, b) {
  const wanted = new Set(screenKeys(a));
  return screenKeys(b).some((key) => wanted.has(key));
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

function blobFromCanvas(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.95));
}

async function uploadCanvas(canvas, fileName) {
  const blob = await blobFromCanvas(canvas);
  if (!blob) throw new Error("Could not create mockup image");
  const data = new FormData();
  data.append("file", new File([blob], fileName, { type: "image/png" }));
  data.append("subdir", "product-mockups");
  const response = await http.post("/files/image", data, { headers: { "Content-Type": "multipart/form-data" } });
  return response.data.url;
}

function areaBox(area, width, height) {
  return {
    x: Number(area?.x_pct ?? area?.x ?? 0) / 100 * width,
    y: Number(area?.y_pct ?? area?.y ?? 0) / 100 * height,
    width: Number(area?.width_pct ?? area?.width ?? 0) / 100 * width,
    height: Number(area?.height_pct ?? area?.height ?? 0) / 100 * height,
  };
}

function placementBox(area, slot, width, height) {
  const a = areaBox(area, width, height);
  const p = slot?.placement || {};
  return {
    x: a.x + Number(p.x ?? 0) / 100 * a.width,
    y: a.y + Number(p.y ?? 0) / 100 * a.height,
    width: Number(p.width ?? 100) / 100 * a.width,
    height: Number(p.height ?? 100) / 100 * a.height,
    rotation: Number(p.rotation || 0) * Math.PI / 180,
  };
}

function clip(ctx, area, width, height, draw) {
  const geometry = normalisePrintAreaGeometry(area || {});
  const box = areaBox(area, width, height);
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
  const box = placementBox(area, slot, width, height);
  if (box.width <= 0 || box.height <= 0) return;
  clip(ctx, area, width, height, () => {
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
  if (!layer) return false;
  const value = text(layer.text ?? layer.content ?? layer.value);
  if (!value) return false;
  const box = placementBox(area, slot, width, height);
  if (box.width <= 0 || box.height <= 0) return false;
  clip(ctx, area, width, height, () => {
    ctx.save();
    ctx.translate(box.x + box.width / 2, box.y + box.height / 2);
    ctx.rotate(box.rotation);
    ctx.font = `${layer.font_weight || 700} ${Number(layer.font_size_px || layer.font_size || Math.min(box.width, box.height) * 0.18)}px ${layer.font_family || "Arial"}`;
    ctx.fillStyle = layer.color || layer.fill || "#000000";
    ctx.textAlign = layer.text_align || "center";
    ctx.textBaseline = "middle";
    ctx.fillText(value, 0, 0, box.width);
    ctx.restore();
  });
  return true;
}

function findArea(areas, slot) {
  const exact = asArray(areas).find((area) => text(area.id) === text(slot?.print_area_id));
  if (exact) return exact;
  const wanted = new Set(areaKeys(slot));
  return asArray(areas).find((area) => areaKeys(area).some((key) => wanted.has(key))) || null;
}

function findVariationPrintAreas(template, variation) {
  return activeTemplatePrintAreas(template, variation);
}

function findScreen(printAreas, area, template) {
  const screens = asArray(template?.mockup_screens).filter((screen) => screen?.id);
  return screens.find((screen) => text(screen.id) === text(area?.screen_id))
    || screens.find((screen) => sameSemantic(screen, area))
    || null;
}

function getArtworkSlots(group) {
  return asArray(group?.artworks).filter((slot) => {
    if (!slot) return false;
    if (slot.status === "archived" || slot.archived || slot.deleted || slot.disabled === true || slot.enabled === false) return false;
    return Boolean(slot?.original_url || slot?.text_layer || slot?.text_content)
      && Boolean(slot?.print_area_id || slot?.area_key || slot?.view_key || slot?.screen_view);
  });
}

/**
 * A mockup is required only where the artwork scope actually has an active
 * artwork layer assigned to a print area on a template view.
 *
 * The generation unit is:
 *   artwork scope × colour × active artwork view
 *
 * Size is deliberately NOT part of the generation unit. If a scope contains
 * Red XS through Red 3XL, all of those variations use one Red representative
 * base view. If five colours are selected and only Front has artwork, this
 * produces exactly five images.
 */
function buildScopeTargets(template, scopedVariations, group) {
  const slots = getArtworkSlots(group);
  if (!slots.length) return [];

  // One real template variation per colour. The representative keeps the
  // actual colour-specific base image while collapsing size-only combinations.
  const representatives = new Map();
  asArray(scopedVariations).forEach((variation) => {
    const key = getColourKey(variation);
    if (!representatives.has(key)) representatives.set(key, variation);
  });

  const targets = [];

  representatives.forEach((variation) => {
    const printAreas = findVariationPrintAreas(template, variation);
    const activeViews = new Map();

    // IMPORTANT: do not use every template screen. A screen is eligible only
    // when an actual artwork slot resolves to a print area on that screen.
    slots.forEach((slot) => {
      const area = findArea(printAreas, slot);
      if (!area || !area.screen_id) return;
      const screen = findScreen(printAreas, area, template);
      if (!screen) return;
      const viewKey = normalise(screen.view_key || screen.screen_view || screen.name || screen.id);
      if (!activeViews.has(viewKey)) activeViews.set(viewKey, { screen, area });
    });

    activeViews.forEach(({ screen, area }) => {
      targets.push({ variation, screen, area });
    });
  });

  return targets;
}

async function generateScopeView(template, variation, group, target) {
  const printAreas = findVariationPrintAreas(template, variation);
  const screen = target.screen;
  const area = findArea(printAreas, target.area) || target.area;
  if (!area || !screen) return null;

  const slots = getArtworkSlots(group).filter((slot) => {
    const slotArea = findArea(printAreas, slot);
    return slotArea
      && (text(slotArea.id) === text(area.id)
        || text(slotArea.screen_id) === text(area.screen_id));
  });
  if (!slots.length) return null;

  const setup = resolveEffectiveProductionSetup(template, variation, {
    screen,
    area,
    defaultPrintArea: area,
  });
  const baseUrl = setup.viewImageUrl
    || setup.imageUrl
    || getAreaPreviewImage(template, area, variation.id);

  if (!baseUrl) {
    throw new Error(`No base mockup image is available for ${getVariationLabel(variation)} / ${screen.name || screen.view_key || "view"}`);
  }

  const base = await loadImage(baseUrl);
  const canvas = document.createElement("canvas");
  canvas.width = base.naturalWidth || base.width || 1;
  canvas.height = base.naturalHeight || base.height || 1;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(base, 0, 0, canvas.width, canvas.height);

  for (const slot of slots) {
    const slotArea = findArea(printAreas, slot) || area;
    if (slot.original_url) drawArtwork(ctx, await loadImage(slot.original_url), slotArea, slot, canvas.width, canvas.height);
    if (slot.text_layer || slot.text_content) drawText(ctx, slotArea, slot, canvas.width, canvas.height);
  }

  const viewKey = screen.view_key || screen.screen_view || screen.name || screen.id;
  const safe = `${group.label || group.id}-${getColourLabel(variation)}-${viewKey}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  const imageUrl = await uploadCanvas(canvas, `artwork-scope-mockup-${safe}.png`);
  const scopedIds = asArray(group.variation_ids);

  return {
    id: `scope-mockup-${group.id}-${variation.id}-${screen.id || normalise(viewKey)}`,
    variation_id: variation.id,
    variation_ids: scopedIds.length ? scopedIds : [variation.id],
    variation_label: `${group.label || "Artwork scope"} — ${getColourLabel(variation)}`,
    variation_colour: getColourLabel(variation),
    scope_type: group.scope_type || "custom",
    scope_label: group.label || "Artwork scope",
    attribute_key: group.attribute_key || "",
    attribute_value: group.attribute_value || "",
    screen_id: screen.id || "",
    view_key: viewKey,
    role: "artwork_scope_mockup",
    image_url: imageUrl,
    status: "approved",
    source: "scope_generated",
    generated_at: new Date().toISOString(),
    artwork_group_id: group.id,
  };
}

export default function ScopedArtworkMockupGenerator({ template, artworkGroups, selectedVariations, onArtworkGroupsChange }) {
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [lastResult, setLastResult] = useState(null);

  const variations = asArray(selectedVariations);
  const groups = asArray(artworkGroups);

  const targets = useMemo(() => groups.map((group) => {
    const ids = group.scope_type === "all" ? variations.map((variation) => variation.id) : asArray(group.variation_ids);
    const scoped = variations.filter((variation) => ids.includes(variation.id));
    if (!scoped.length) return null;
    const viewTargets = buildScopeTargets(template, scoped, group);
    return viewTargets.length ? { group, variations: scoped, viewTargets } : null;
  }).filter(Boolean), [groups, variations, template]);

  const readyTargets = targets.filter((target) => target.viewTargets.length);
  const totalViews = readyTargets.reduce((sum, target) => sum + target.viewTargets.length, 0);
  const colourCount = new Set(readyTargets.flatMap((target) => target.viewTargets.map((item) => getColourKey(item.variation)))).size;
  const activeViewCount = new Set(readyTargets.map((target) => target.viewTargets.map((item) => normalise(item.screen.view_key || item.screen.screen_view || item.screen.name || item.screen.id))).flat()).size;

  const generateAll = async () => {
    if (!readyTargets.length) {
      toast.error("No artwork-backed template views were found. Assign the artwork to a print area first.");
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
          const row = await generateScopeView(template, viewTarget.variation, target.group, viewTarget);
          if (row) generated.push(row);
          done += 1;
          setProgress({ done, total: totalViews });
        }
      }

      if (!generated.length) {
        throw new Error("No artwork-scope mockups could be generated. Check artwork, print areas and template views.");
      }

      const byGroup = new Map();
      generated.forEach((row) => {
        if (!byGroup.has(row.artwork_group_id)) byGroup.set(row.artwork_group_id, []);
        byGroup.get(row.artwork_group_id).push(row);
      });

      const nextGroups = groups.map((group) => {
        const rows = byGroup.get(group.id) || [];
        if (!rows.length) return group;

        const generatedKeys = new Set(rows.map((row) => `${row.variation_id}::${row.screen_id}::${row.view_key}`));
        const existing = asArray(group.variation_mockups).filter((row) => {
          if (row.source !== "scope_generated") return true;
          return !generatedKeys.has(`${row.variation_id}::${row.screen_id}::${row.view_key}`);
        });

        return {
          ...group,
          variation_mockups: [...existing, ...rows],
          primary_mockup_image_url: rows[0]?.image_url || group.primary_mockup_image_url || "",
          derived_mockup_images: [
            ...asArray(group.derived_mockup_images).filter((row) => row.source !== "scope_generated"),
            ...rows,
          ],
        };
      });

      onArtworkGroupsChange(nextGroups);
      setLastResult({
        generated: generated.length,
        scopes: readyTargets.length,
        colours: colourCount,
        views: activeViewCount,
      });
      toast.success(`${generated.length} mockup(s) generated across ${readyTargets.length} artwork scope(s)`);
    } catch (error) {
      toast.error(error.message || "Could not generate artwork-scope mockups");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <section className="border border-[#FF3B30]/40 bg-black/40 rounded-xl p-5 space-y-4" data-testid="scoped-artwork-mockup-generator">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="overline mb-1">Artwork-scope mockups</div>
          <h2 className="font-display text-3xl uppercase">Generate from artwork scopes</h2>
          <p className="text-sm text-zinc-400 mt-2 max-w-3xl">
            Mockups are generated from the artwork actually assigned to a template print view. Sizes never create extra mockups. Each colour uses its own representative template base, and only views with active artwork layers are generated.
          </p>
        </div>
        <button type="button" className="btn-primary shrink-0" disabled={generating || !readyTargets.length} onClick={generateAll}>
          <RefreshCw size={15} className={generating ? "animate-spin" : ""} />
          {generating ? `Generating ${progress.done}/${progress.total}` : `Generate ${totalViews} Mockup(s)`}
        </button>
      </div>

      <div className="grid md:grid-cols-4 gap-3 text-xs">
        <Metric label="Selected variations" value={variations.length} />
        <Metric label="Artwork scopes" value={readyTargets.length} />
        <Metric label="Colours represented" value={colourCount} />
        <Metric label="Active artwork views" value={activeViewCount} />
      </div>

      {generating && (
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full bg-[#FF3B30] transition-all" style={{ width: `${progress.total ? progress.done / progress.total * 100 : 0}%` }} />
        </div>
      )}

      {lastResult && (
        <div className="border border-[#34C759]/30 bg-[#0A1B10] rounded-lg p-3 flex items-center gap-2 text-sm text-[#B8F5C3]">
          <CheckCircle2 size={16} />
          {lastResult.generated} mockups generated across {lastResult.colours} colour(s) and {lastResult.views} active artwork view(s).
        </div>
      )}

      {!readyTargets.length && (
        <div className="border border-[#FFCC00]/30 bg-[#FFCC00]/10 rounded-lg p-3 text-xs text-[#FFE08A] flex gap-2">
          <AlertTriangle size={15} /> Assign artwork to a print area before generating mockups.
        </div>
      )}

      {groups.some((group) => asArray(group.variation_mockups).length) && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {groups
            .flatMap((group) => asArray(group.variation_mockups))
            .filter((row, index, rows) => rows.findIndex((item) => (
              item.image_url === row.image_url
              && item.view_key === row.view_key
              && item.variation_id === row.variation_id
            )) === index)
            .slice(-24)
            .map((row) => (
              <div key={row.id || `${row.image_url}-${row.view_key}-${row.variation_id}`} className="border border-white/10 bg-black/30 rounded-lg p-2">
                <img src={assetUrl(row.image_url)} alt={`${row.scope_label || "Artwork scope"} ${row.variation_label || "variation"} ${row.view_key || "mockup"}`} className="w-full aspect-square object-contain bg-black rounded" />
                <div className="text-[10px] uppercase tracking-widest text-zinc-500 mt-2 truncate">{row.scope_label || "Artwork scope"}</div>
                <div className="text-[9px] text-zinc-600 mt-1 truncate">{row.variation_label || getVariationLabel(variations.find((v) => v.id === row.variation_id) || {})}</div>
                <div className="text-[9px] text-zinc-600 mt-1 truncate">{row.view_key || "view"}</div>
              </div>
            ))}
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <div className="border border-white/10 bg-black/30 rounded-lg p-3">
      <div className="overline">{label}</div>
      <div className="font-display text-2xl mt-1">{value}</div>
    </div>
  );
}
