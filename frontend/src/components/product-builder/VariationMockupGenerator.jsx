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

function getAreaBox(area, canvasWidth, canvasHeight) {
  return {
    x: (Number(area?.x_pct ?? area?.x ?? 0) / 100) * canvasWidth,
    y: (Number(area?.y_pct ?? area?.y ?? 0) / 100) * canvasHeight,
    width: (Number(area?.width_pct ?? area?.width ?? 0) / 100) * canvasWidth,
    height: (Number(area?.height_pct ?? area?.height ?? 0) / 100) * canvasHeight,
  };
}

function getPlacementBox(area, slot, canvasWidth, canvasHeight) {
  const areaBox = getAreaBox(area, canvasWidth, canvasHeight);
  const placement = slot?.placement || {};
  return {
    areaBox,
    x: areaBox.x + (Number(placement.x ?? 0) / 100) * areaBox.width,
    y: areaBox.y + (Number(placement.y ?? 0) / 100) * areaBox.height,
    width: (Number(placement.width ?? 100) / 100) * areaBox.width,
    height: (Number(placement.height ?? 100) / 100) * areaBox.height,
    rotation: (Number(placement.rotation || 0) * Math.PI) / 180,
  };
}

function withPrintAreaClip(ctx, area, canvasWidth, canvasHeight, draw) {
  const geometry = normalisePrintAreaGeometry(area || {});
  const { x, y, width, height } = getAreaBox(area, canvasWidth, canvasHeight);
  if (width <= 0 || height <= 0) return;

  ctx.save();
  if (geometry.geometry_type !== "mask") {
    traceCanvasPrintAreaPath(ctx, geometry, x, y, width, height);
    ctx.clip();
  }
  draw({ x, y, width, height });
  ctx.restore();
}

function drawArtwork(ctx, image, area, slot, canvasWidth, canvasHeight) {
  const box = getPlacementBox(area, slot, canvasWidth, canvasHeight);
  if (box.width <= 0 || box.height <= 0) return;

  withPrintAreaClip(ctx, area, canvasWidth, canvasHeight, () => {
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
  if (text(slot?.text_content)) return { text: slot.text_content };
  return null;
}

function wrapCanvasText(ctx, value, maxWidth) {
  const words = text(value).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let line = words[0];

  words.slice(1).forEach((word) => {
    const candidate = `${line} ${word}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  });

  lines.push(line);
  return lines;
}

function drawTextArtwork(ctx, area, slot, canvasWidth, canvasHeight) {
  const layer = parseTextLayer(slot);
  if (!layer) return false;

  const content = text(layer.text ?? layer.content ?? layer.value ?? slot?.text_content);
  if (!content) return false;

  const box = getPlacementBox(area, slot, canvasWidth, canvasHeight);
  if (box.width <= 0 || box.height <= 0) return false;

  const fontFamily = text(layer.font_family ?? layer.fontFamily) || "Arial, sans-serif";
  const fontWeight = text(layer.font_weight ?? layer.fontWeight) || "700";
  const fontStyle = text(layer.font_style ?? layer.fontStyle) || "normal";
  const fontSize = Math.max(
    8,
    Number(
      layer.font_size_px ??
      layer.fontSizePx ??
      layer.font_size ??
      layer.fontSize ??
      Math.min(box.width, box.height) * 0.18
    ) || 8
  );
  const lineHeight = Math.max(1, Number(layer.line_height ?? layer.lineHeight ?? 1.15) || 1.15);
  const color = text(layer.color ?? layer.fill ?? layer.text_color) || "#000000";
  const align = text(layer.text_align ?? layer.textAlign ?? layer.align) || "center";
  const verticalAlign = text(layer.vertical_align ?? layer.verticalAlign) || "middle";
  const opacity = Math.max(0, Math.min(1, Number(layer.opacity ?? 1)));
  const strokeColor = text(layer.stroke_color ?? layer.strokeColor);
  const strokeWidth = Math.max(0, Number(layer.stroke_width ?? layer.strokeWidth ?? 0) || 0);
  const shadowColor = text(layer.shadow_color ?? layer.shadowColor);
  const shadowBlur = Math.max(0, Number(layer.shadow_blur ?? layer.shadowBlur ?? 0) || 0);
  const shadowX = Number(layer.shadow_x ?? layer.shadowX ?? 0) || 0;
  const shadowY = Number(layer.shadow_y ?? layer.shadowY ?? 0) || 0;
  const backgroundColor = text(layer.background_color ?? layer.backgroundColor);
  const padding = Math.max(0, Number(layer.padding ?? 0) || 0);

  withPrintAreaClip(ctx, area, canvasWidth, canvasHeight, () => {
    ctx.save();
    ctx.translate(box.x + box.width / 2, box.y + box.height / 2);
    ctx.rotate(box.rotation);
    ctx.globalAlpha = opacity;

    if (backgroundColor) {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(-box.width / 2, -box.height / 2, box.width, box.height);
    }

    ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.textAlign = ["left", "center", "right"].includes(align) ? align : "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = color;
    ctx.shadowColor = shadowColor || "transparent";
    ctx.shadowBlur = shadowBlur;
    ctx.shadowOffsetX = shadowX;
    ctx.shadowOffsetY = shadowY;

    const maxTextWidth = Math.max(1, box.width - padding * 2);
    const lines = wrapCanvasText(ctx, content, maxTextWidth);
    const totalHeight = lines.length * fontSize * lineHeight;
    const startY = verticalAlign === "top"
      ? -box.height / 2 + padding
      : verticalAlign === "bottom"
        ? box.height / 2 - padding - totalHeight
        : -totalHeight / 2;
    const x = ctx.textAlign === "left" ? -box.width / 2 + padding : ctx.textAlign === "right" ? box.width / 2 - padding : 0;

    lines.forEach((line, index) => {
      const y = startY + index * fontSize * lineHeight;
      if (strokeColor && strokeWidth > 0) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth;
        ctx.strokeText(line, x, y);
      }
      ctx.fillText(line, x, y);
    });

    ctx.restore();
  });

  return true;
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

    if (slot.original_url) {
      const artwork = await loadImage(slot.original_url);
      drawArtwork(ctx, artwork, area, slot, canvas.width, canvas.height);
    }

    if (slot.text_layer || slot.text_content) {
      drawTextArtwork(ctx, area, slot, canvas.width, canvas.height);
    }
  }

  const scopeLabel = group?.scope_type === "attribute"
    ? `${group.attribute_key}-${group.attribute_value}`
    : group?.label || "scope";
  const variationLabel = getVariationLabel(variation);
  const viewLabel = screen?.view_key || screen?.screen_view || screen?.name || "view";
  const safe = `${scopeLabel}-${variationLabel}-${viewLabel}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const imageUrl = await uploadCanvas(canvas, `variation-mockup-${safe}.png`);

  return {
    id: `variation-mockup-${group.id}-${variation.id}-${screen?.id || viewLabel}`,
    variation_id: variation.id,
    variation_ids: [variation.id],
    variation_label: variationLabel,
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
      variations: scoped,
    };
  }).filter(Boolean), [groups, variations]);

  const readyTargets = useMemo(
    () => targets.filter((target) => asArray(target.group.artworks).some((slot) => slot.original_url || slot.text_layer || slot.text_content)),
    [targets]
  );

  const totalViews = readyTargets.reduce(
    (sum, target) => sum + target.variations.reduce((variationSum, variation) => variationSum + activeTemplateScreens(template, variation).length, 0),
    0
  );

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
        for (const variation of target.variations) {
          const screens = activeTemplateScreens(template, variation);
          for (const screen of screens) {
            const result = await generateVariationView(template, variation, target.group, screen);
            if (result) generated.push(result);
            done += 1;
            setProgress({ done, total: totalViews });
          }
        }
      }

      if (!generated.length) throw new Error("No variation mockups could be generated. Check artwork, views and variation images.");

      const byGroup = new Map();
      generated.forEach((row) => {
        if (!byGroup.has(row.artwork_group_id)) byGroup.set(row.artwork_group_id, []);
        byGroup.get(row.artwork_group_id).push(row);
      });

      const nextGroups = groups.map((group) => {
        const rows = byGroup.get(group.id) || [];
        if (!rows.length) return group;

        const generatedKeys = new Set(rows.map((row) => `${row.variation_id}::${row.view_key}`));
        const existing = asArray(group.variation_mockups).filter((row) => {
          const key = `${row.variation_id || ""}::${row.view_key || ""}`;
          return !generatedKeys.has(key);
        });
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
      setLastResult({
        generated: generated.length,
        variations: new Set(generated.map((row) => row.variation_id)).size,
        scopes: readyTargets.length,
        uniqueImages: new Set(generated.map((row) => row.image_url)).size,
      });
      toast.success(`${generated.length} variation mockups generated for ${new Set(generated.map((row) => row.variation_id)).size} variation(s) across ${readyTargets.length} artwork scope(s)`);
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
          <h2 className="font-display text-3xl uppercase">Generate every selected variation</h2>
          <p className="text-sm text-zinc-400 mt-2 max-w-3xl">Artwork scope controls which artwork is reused. Mockup generation is always variation-specific, so every selected variation gets its own mockup against that variation's actual base view.</p>
        </div>
        <button type="button" className="btn-primary shrink-0" disabled={generating || !readyTargets.length} onClick={generateAll}>
          <RefreshCw size={15} className={generating ? "animate-spin" : ""} />
          {generating ? `Generating ${progress.done}/${progress.total}` : `Generate ${totalViews} Mockup(s)`}
        </button>
      </div>

      <div className="grid md:grid-cols-4 gap-3 text-xs">
        <div className="border border-white/10 bg-black/30 rounded-lg p-3"><div className="overline">Selected variations</div><div className="font-display text-2xl mt-1">{variations.length}</div></div>
        <div className="border border-white/10 bg-black/30 rounded-lg p-3"><div className="overline">Artwork scopes</div><div className="font-display text-2xl mt-1">{targets.length}</div></div>
        <div className="border border-white/10 bg-black/30 rounded-lg p-3"><div className="overline">Variation views</div><div className="font-display text-2xl mt-1">{totalViews}</div></div>
        <div className="border border-white/10 bg-black/30 rounded-lg p-3"><div className="overline">Generation model</div><div className="font-display text-lg mt-1">1 / variation / view</div></div>
      </div>

      {generating && <div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-[#FF3B30] transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>}
      {lastResult && <div className="border border-[#34C759]/30 bg-[#0A1B10] rounded-lg p-3 flex items-center gap-2 text-sm text-[#B8F5C3]"><CheckCircle2 size={16} /> {lastResult.generated} variation mockups generated for {lastResult.variations} variation(s) across {lastResult.scopes} artwork scope(s), using {lastResult.uniqueImages} unique uploaded image(s).</div>}
      {!readyTargets.length && <div className="border border-[#FFCC00]/30 bg-[#FFCC00]/10 rounded-lg p-3 text-xs text-[#FFE08A] flex gap-2"><AlertTriangle size={15} /> Add artwork to the selected artwork scope(s) before generating mockups.</div>}

      {groups.some((group) => asArray(group.variation_mockups).length) && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {groups.flatMap((group) => asArray(group.variation_mockups)).filter((row, index, rows) => rows.findIndex((item) => item.image_url === row.image_url && item.view_key === row.view_key && item.variation_id === row.variation_id) === index).slice(-24).map((row) => (
            <div key={row.id || `${row.image_url}-${row.variation_id}-${row.view_key}`} className="border border-white/10 bg-black/30 rounded-lg p-2">
              <img src={assetUrl(row.image_url)} alt={`${row.variation_label || row.scope_label || "Variation"} ${row.view_key || "mockup"}`} className="w-full aspect-square object-contain bg-black rounded" />
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 mt-2 truncate">{row.variation_label || row.scope_label}</div>
              <div className="text-[9px] text-zinc-600 mt-1 truncate">{row.view_key || "view"}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
