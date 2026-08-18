import React, { useMemo, useState } from "react";
import { RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { http, assetUrl } from "../../lib/api";
import { resolveEffectiveProductionSetup, activeTemplatePrintAreas, activeTemplateScreens } from "../../lib/templateProductionResolver";
import { normalisePrintAreaGeometry, traceCanvasPrintAreaPath } from "../../lib/printAreaGeometry";
import { asArray, getAreaPreviewImage, getVariationLabel } from "./productBuilderUtils";

const text = (value) => String(value ?? "").trim();
const normalise = (value) => text(value).toLowerCase().replace(/[^a-z0-9]+/g, "-");
const screenKey = (screen = {}) => [screen.id, screen.view_key, screen.view, screen.screen_view, screen.name].filter(Boolean).map(normalise);
const areaKey = (area = {}) => [area.id, area.area_key, area.view_key, area.screen_view, area.name].filter(Boolean).map(normalise);

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
  const response = await http.post("/files/image", data, { headers: { "Content-Type": "multipart/form-data" } });
  return response.data.url;
}

function findAreaForSlot(areas, slot) {
  const exact = asArray(areas).find((area) => text(area.id) === text(slot.print_area_id));
  if (exact) return exact;
  const wanted = areaKey(slot);
  return asArray(areas).find((area) => wanted.some((key) => areaKey(area).includes(key))) || null;
}

function slotBelongsToScreen(slot, screen, area) {
  if (text(slot.screen_id) && text(screen?.id)) return text(slot.screen_id) === text(screen.id);
  if (text(slot.print_area_id) && text(area?.id)) return text(slot.print_area_id) === text(area.id);
  return true;
}

function drawArtwork(ctx, image, area, slot, canvasWidth, canvasHeight) {
  const geometry = normalisePrintAreaGeometry(area || {});
  const areaX = (Number(area?.x_pct ?? area?.x ?? 0) / 100) * canvasWidth;
  const areaY = (Number(area?.y_pct ?? area?.y ?? 0) / 100) * canvasHeight;
  const areaW = (Number(area?.width_pct ?? area?.width ?? 0) / 100) * canvasWidth;
  const areaH = (Number(area?.height_pct ?? area?.height ?? 0) / 100) * canvasHeight;
  if (areaW <= 0 || areaH <= 0) return;
  const placement = slot?.placement || {};
  const x = areaX + (Number(placement.x ?? 0) / 100) * areaW;
  const y = areaY + (Number(placement.y ?? 0) / 100) * areaH;
  const w = (Number(placement.width ?? 100) / 100) * areaW;
  const h = (Number(placement.height ?? 100) / 100) * areaH;
  const rotation = (Number(placement.rotation || 0) * Math.PI) / 180;

  ctx.save();
  if (geometry.geometry_type !== "mask") {
    traceCanvasPrintAreaPath(ctx, geometry, areaX, areaY, areaW, areaH);
    ctx.clip();
  }
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(rotation);
  ctx.drawImage(image, -w / 2, -h / 2, w, h);
  ctx.restore();
}

async function generateScopeView(template, representative, group, screen) {
  const printAreas = activeTemplatePrintAreas(template, representative);
  const areas = printAreas.filter((area) => {
    if (text(area.screen_id) && text(screen?.id)) return text(area.screen_id) === text(screen.id);
    const screenKeys = screenKey(screen);
    return screenKeys.some((key) => areaKey(area).includes(key));
  });
  const slots = asArray(group?.artworks).filter((slot) => {
    const area = findAreaForSlot(printAreas, slot);
    return area && slotBelongsToScreen(slot, screen, area) && (slot.original_url || slot.text_layer || slot.text_content);
  });
  if (!slots.length) return null;

  const setup = resolveEffectiveProductionSetup(template, representative, { screen, area: areas[0] || printAreas[0] || {} });
  const baseUrl = setup.viewImageUrl || setup.imageUrl || getAreaPreviewImage(template, areas[0], representative.id);
  if (!baseUrl) throw new Error(`No base mockup image is available for ${getVariationLabel(representative)} / ${screen?.name || screen?.view_key || "view"}`);

  const base = await loadImage(baseUrl);
  const canvas = document.createElement("canvas");
  canvas.width = base.naturalWidth || base.width || 1;
  canvas.height = base.naturalHeight || base.height || 1;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(base, 0, 0, canvas.width, canvas.height);

  for (const slot of slots) {
    const area = findAreaForSlot(printAreas, slot);
    if (!area || !slot.original_url || slot.text_layer) continue;
    const artwork = await loadImage(slot.original_url);
    drawArtwork(ctx, artwork, area, slot, canvas.width, canvas.height);
  }

  const scopeLabel = group?.scope_type === "attribute"
    ? `${group.attribute_key}-${group.attribute_value}`
    : group?.label || "scope";
  const viewLabel = screen?.view_key || screen?.screen_view || screen?.name || "view";
  const safe = `${scopeLabel}-${viewLabel}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const imageUrl = await uploadCanvas(canvas, `variation-scope-mockup-${safe}.png`);
  const variationIds = group?.scope_type === "all"
    ? asArray(representative.__selected_variation_ids)
    : asArray(group?.variation_ids);

  return {
    id: `variation-scope-mockup-${group.id}-${screen?.id || viewLabel}`,
    variation_id: representative.id,
    variation_ids: variationIds,
    variation_label: getVariationLabel(representative),
    scope_type: group?.scope_type || "custom",
    scope_label: group?.label || "Artwork scope",
    attribute_key: group?.attribute_key || "",
    attribute_value: group?.attribute_value || "",
    screen_id: screen?.id || "",
    view_key: screen?.view_key || screen?.screen_view || screen?.name || "",
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
    return {
      group,
      representative: { ...scoped[0], __selected_variation_ids: ids },
      variations: scoped,
      screens: activeTemplateScreens(template, scoped[0]),
    };
  }).filter(Boolean), [groups, template, variations]);

  const readyTargets = useMemo(() => targets.filter((target) => asArray(target.group.artworks).some((slot) => slot.original_url || slot.text_layer || slot.text_content)), [targets]);
  const totalViews = readyTargets.reduce((sum, target) => sum + target.screens.length, 0);

  const generateAll = async () => {
    if (!readyTargets.length) {
      toast.error("Add artwork to an artwork scope before generating mockups.");
      return;
    }
    setGenerating(true);
    setLastResult(null);
    setProgress({ done: 0, total: totalViews });
    try {
      const generated = [];
      let done = 0;
      for (const target of readyTargets) {
        for (const screen of target.screens) {
          const result = await generateScopeView(template, target.representative, target.group, screen);
          if (result) generated.push(result);
          done += 1;
          setProgress({ done, total: totalViews });
        }
      }
      if (!generated.length) throw new Error("No scoped variation mockups could be generated. Check artwork, views and variation images.");

      const byGroup = new Map();
      generated.forEach((row) => {
        if (!byGroup.has(row.artwork_group_id)) byGroup.set(row.artwork_group_id, []);
        byGroup.get(row.artwork_group_id).push(row);
      });

      const nextGroups = groups.map((group) => {
        const rows = byGroup.get(group.id) || [];
        if (!rows.length) return group;
        const generatedIds = new Set(rows.map((row) => row.id));
        const existing = asArray(group.variation_mockups).filter((row) => !generatedIds.has(row.id));
        const allRows = [...existing, ...rows];
        const first = rows[0]?.image_url || group.primary_mockup_image_url || "";
        return {
          ...group,
          variation_mockups: allRows,
          primary_mockup_image_url: first,
          derived_mockup_images: [
            ...asArray(group.derived_mockup_images).filter((row) => row.source !== "variation_generation"),
            ...rows.map((row) => ({ ...row, source: "variation_generation" })),
          ],
        };
      });

      onArtworkGroupsChange(nextGroups);
      setLastResult({ generated: generated.length, scopes: readyTargets.length, uniqueImages: new Set(generated.map((row) => row.image_url)).size });
      toast.success(`${generated.length} mockups generated across ${readyTargets.length} artwork scope(s) — ${new Set(generated.map((row) => row.image_url)).size} unique image(s)`);
    } catch (error) {
      toast.error(error.message || "Could not generate scoped variation mockups");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <section className="border border-[#FF3B30]/40 bg-black/40 rounded-xl p-5 space-y-4" data-testid="variation-mockup-generator">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="overline mb-1">Scoped Variation Mockup Generation</div>
          <h2 className="font-display text-3xl uppercase">Generate by artwork scope</h2>
          <p className="text-sm text-zinc-400 mt-2 max-w-3xl">Mockups are generated once per artwork scope and product view. A Colour scope therefore produces one image per Colour × View, not one image for every Size × Colour variation.</p>
        </div>
        <button type="button" className="btn-primary shrink-0" disabled={generating || !readyTargets.length} onClick={generateAll}>
          <RefreshCw size={15} className={generating ? "animate-spin" : ""} />
          {generating ? `Generating ${progress.done}/${progress.total}` : `Generate ${readyTargets.length} Scope(s)`}
        </button>
      </div>

      <div className="grid md:grid-cols-4 gap-3 text-xs">
        <div className="border border-white/10 bg-black/30 rounded-lg p-3"><div className="overline">Selected variations</div><div className="font-display text-2xl mt-1">{variations.length}</div></div>
        <div className="border border-white/10 bg-black/30 rounded-lg p-3"><div className="overline">Artwork scopes</div><div className="font-display text-2xl mt-1">{targets.length}</div></div>
        <div className="border border-white/10 bg-black/30 rounded-lg p-3"><div className="overline">Views to generate</div><div className="font-display text-2xl mt-1">{totalViews}</div></div>
        <div className="border border-white/10 bg-black/30 rounded-lg p-3"><div className="overline">Generation model</div><div className="font-display text-lg mt-1">1 / scope / view</div></div>
      </div>

      {generating && <div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-[#FF3B30] transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>}
      {lastResult && <div className="border border-[#34C759]/30 bg-[#0A1B10] rounded-lg p-3 flex items-center gap-2 text-sm text-[#B8F5C3]"><CheckCircle2 size={16} /> {lastResult.generated} view mockups generated across {lastResult.scopes} scope(s), using {lastResult.uniqueImages} unique uploaded image(s). The same scope image is shared by its covered variations.</div>}
      {!readyTargets.length && <div className="border border-[#FFCC00]/30 bg-[#FFCC00]/10 rounded-lg p-3 text-xs text-[#FFE08A] flex gap-2"><AlertTriangle size={15} /> Add artwork to the selected artwork scope(s) before generating mockups.</div>}

      {groups.some((group) => asArray(group.variation_mockups).length) && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {groups.flatMap((group) => asArray(group.variation_mockups)).filter((row, index, rows) => rows.findIndex((item) => item.image_url === row.image_url && item.view_key === row.view_key) === index).slice(-24).map((row) => (
            <div key={row.id || `${row.image_url}-${row.view_key}`} className="border border-white/10 bg-black/30 rounded-lg p-2">
              <img src={assetUrl(row.image_url)} alt={`${row.scope_label || row.variation_label || "Scope"} ${row.view_key || "mockup"}`} className="w-full aspect-square object-contain bg-black rounded" />
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 mt-2 truncate">{row.scope_label || row.variation_label}</div>
              <div className="text-[9px] text-zinc-600 mt-1 truncate">{row.view_key || "view"}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
