import React, { useMemo, useState } from "react";
import { RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { http, assetUrl } from "../../lib/api";
import { resolveEffectiveProductionSetup, activeTemplatePrintAreas, activeTemplateScreens } from "../../lib/templateProductionResolver";
import { normalisePrintAreaGeometry, traceCanvasPrintAreaPath } from "../../lib/printAreaGeometry";
import { asArray, getAreaPreviewImage, getVariationLabel, getVariationAttributes } from "./productBuilderUtils";

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

function findGroup(groups, variation) {
  const id = variation?.id;
  const matching = asArray(groups).filter((group) => asArray(group.variation_ids).includes(id));
  return matching.find((group) => group.scope_type === "variation")
    || matching.find((group) => group.scope_type === "custom")
    || matching.find((group) => group.scope_type === "attribute")
    || asArray(groups).find((group) => group.scope_type === "all")
    || matching[0]
    || null;
}

function findScreenForArea(screens, area) {
  const wanted = areaKey(area);
  return asArray(screens).find((screen) => {
    const keys = screenKey(screen);
    return wanted.some((key) => keys.includes(key)) || text(area?.screen_id) === text(screen?.id);
  }) || asArray(screens)[0] || null;
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

async function generateVariationView(template, variation, group, screen) {
  const printAreas = activeTemplatePrintAreas(template, variation);
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

  const setup = resolveEffectiveProductionSetup(template, variation, { screen, area: areas[0] || printAreas[0] || {} });
  const baseUrl = setup.viewImageUrl || setup.imageUrl || getAreaPreviewImage(template, areas[0], variation.id);
  if (!baseUrl) throw new Error(`No base mockup image is available for ${getVariationLabel(variation)} / ${screen?.name || screen?.view_key || "view"}`);

  const base = await loadImage(baseUrl);
  const canvas = document.createElement("canvas");
  canvas.width = base.naturalWidth || base.width || 1;
  canvas.height = base.naturalHeight || base.height || 1;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(base, 0, 0, canvas.width, canvas.height);

  for (const slot of slots) {
    const area = findAreaForSlot(printAreas, slot);
    if (!area) continue;
    const artworkUrl = slot.original_url;
    if (!artworkUrl || slot.text_layer) continue;
    const artwork = await loadImage(artworkUrl);
    drawArtwork(ctx, artwork, area, slot, canvas.width, canvas.height);
  }

  const variationLabel = getVariationLabel(variation) || variation.id || "variation";
  const viewLabel = screen?.view_key || screen?.screen_view || screen?.name || "view";
  const safe = `${variationLabel}-${viewLabel}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const imageUrl = await uploadCanvas(canvas, `variation-mockup-${safe}.png`);
  return {
    id: `variation-mockup-${variation.id}-${screen?.id || viewLabel}`,
    variation_id: variation.id,
    variation_label: variationLabel,
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
  const ready = useMemo(() => variations.filter((variation) => {
    const group = findGroup(groups, variation);
    return asArray(group?.artworks).some((slot) => slot.original_url || slot.text_layer || slot.text_content);
  }), [groups, variations]);

  const generateAll = async () => {
    if (!ready.length) {
      toast.error("Add artwork to the selected variation artwork scope first.");
      return;
    }
    setGenerating(true);
    setLastResult(null);
    const total = ready.reduce((sum, variation) => sum + activeTemplateScreens(template, variation).length, 0);
    setProgress({ done: 0, total });
    try {
      const generated = [];
      let done = 0;
      for (const variation of ready) {
        const group = findGroup(groups, variation);
        if (!group) continue;
        const screens = activeTemplateScreens(template, variation);
        for (const screen of screens) {
          const result = await generateVariationView(template, variation, group, screen);
          if (result) generated.push(result);
          done += 1;
          setProgress({ done, total });
        }
      }
      if (!generated.length) throw new Error("No variation mockups could be generated. Check artwork, views and variation images.");

      const generatedByGroup = new Map();
      generated.forEach((item) => {
        if (!generatedByGroup.has(item.artwork_group_id)) generatedByGroup.set(item.artwork_group_id, []);
        generatedByGroup.get(item.artwork_group_id).push(item);
      });

      const nextGroups = groups.map((group) => {
        const rows = generatedByGroup.get(group.id) || [];
        if (!rows.length) return group;
        const existing = asArray(group.variation_mockups).filter((item) => !generated.some((row) => row.id === item.id));
        const allRows = [...existing, ...rows];
        const first = rows[0]?.image_url || group.primary_mockup_image_url || "";
        const derived = asArray(group.derived_mockup_images).filter((item) => item.source !== "variation_generation");
        return {
          ...group,
          variation_mockups: allRows,
          primary_mockup_image_url: first,
          derived_mockup_images: [
            ...derived,
            ...rows.map((row) => ({ ...row, source: "variation_generation" })),
          ],
          artworks: asArray(group.artworks).map((slot, index) => ({
            ...slot,
            sort_order: index,
            ...(index === 0 && !slot.mockup_image_url ? { mockup_image_url: first } : {}),
          })),
        };
      });

      onArtworkGroupsChange(nextGroups);
      setLastResult({ generated: generated.length, variations: new Set(generated.map((row) => row.variation_id)).size });
      toast.success(`${generated.length} variation mockups generated across ${new Set(generated.map((row) => row.variation_id)).size} variation(s)`);
    } catch (error) {
      toast.error(error.message || "Could not generate variation mockups");
    } finally {
      setGenerating(false);
    }
  };

  const totalViews = variations.reduce((sum, variation) => sum + activeTemplateScreens(template, variation).length, 0);
  const missing = Math.max(0, totalViews - progress.done);

  return (
    <section className="border border-[#FF3B30]/40 bg-black/40 rounded-xl p-5 space-y-4" data-testid="variation-mockup-generator">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="overline mb-1">Variation Mockup Generation</div>
          <h2 className="font-display text-3xl uppercase">Generate every variation</h2>
          <p className="text-sm text-zinc-400 mt-2 max-w-3xl">
            The selected artwork scope is resolved for each exact variation. Same artwork is reused automatically; per-attribute and per-variation artwork uses the matching group. Each variation is rendered against its own configured product views.
          </p>
        </div>
        <button type="button" className="btn-primary shrink-0" disabled={generating || !ready.length} onClick={generateAll}>
          <RefreshCw size={15} className={generating ? "animate-spin" : ""} />
          {generating ? `Generating ${progress.done}/${progress.total}` : `Generate ${variations.length} Variation Mockups`}
        </button>
      </div>

      <div className="grid md:grid-cols-3 gap-3 text-xs">
        <div className="border border-white/10 bg-black/30 rounded-lg p-3"><div className="overline">Selected variations</div><div className="font-display text-2xl mt-1">{variations.length}</div></div>
        <div className="border border-white/10 bg-black/30 rounded-lg p-3"><div className="overline">Artwork-ready</div><div className="font-display text-2xl mt-1">{ready.length}</div></div>
        <div className="border border-white/10 bg-black/30 rounded-lg p-3"><div className="overline">Configured views</div><div className="font-display text-2xl mt-1">{totalViews}</div></div>
      </div>

      {generating && <div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-[#FF3B30] transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>}

      {lastResult && (
        <div className="border border-[#34C759]/30 bg-[#0A1B10] rounded-lg p-3 flex items-center gap-2 text-sm text-[#B8F5C3]"><CheckCircle2 size={16} /> {lastResult.generated} mockups generated for {lastResult.variations} variation(s). They are stored as system-generated variation gallery candidates.</div>
      )}

      {!ready.length && <div className="border border-[#FFCC00]/30 bg-[#FFCC00]/10 rounded-lg p-3 text-xs text-[#FFE08A] flex gap-2"><AlertTriangle size={15} /> Add artwork to the selected artwork group(s) before generating variation mockups.</div>}

      {ready.length > 0 && ready.length < variations.length && <div className="text-xs text-[#FFE08A]">{variations.length - ready.length} selected variation(s) do not currently resolve to an artwork group containing artwork and will be skipped.</div>}

      {groups.some((group) => asArray(group.variation_mockups).length) && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {groups.flatMap((group) => asArray(group.variation_mockups)).slice(-12).map((row) => (
            <div key={row.id || row.image_url} className="border border-white/10 bg-black/30 rounded-lg p-2">
              <img src={assetUrl(row.image_url)} alt={`${row.variation_label || "Variation"} ${row.view_key || "mockup"}`} className="w-full aspect-square object-contain bg-black rounded" />
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 mt-2 truncate">{row.variation_label}</div>
              <div className="text-[9px] text-zinc-600 mt-1 truncate">{row.view_key || "view"}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
