import React, { useMemo, useState } from "react";
import { RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { http, assetUrl } from "../../lib/api";
import { resolveEffectiveProductionSetup, activeTemplatePrintAreas, activeTemplateScreens } from "../../lib/templateProductionResolver";
import { normalisePrintAreaGeometry, traceCanvasPrintAreaPath } from "../../lib/printAreaGeometry";
import { asArray, getAreaPreviewImage, getVariationLabel } from "./productBuilderUtils";

const text = (value) => String(value ?? "").trim();
const normalise = (value) => text(value).toLowerCase().replace(/[^a-z0-9]+/g, "-");
const screenKeys = (screen = {}) => [screen.id, screen.view_key, screen.view, screen.screen_view, screen.name].filter(Boolean).map(normalise);
const areaKeys = (area = {}) => [area.id, area.area_key, area.view_key, area.screen_view, area.name].filter(Boolean).map(normalise);

function loadImage(src) { return new Promise((resolve, reject) => { const image = new Image(); image.crossOrigin = "anonymous"; image.onload = () => resolve(image); image.onerror = reject; image.src = assetUrl(src); }); }
function blobFromCanvas(canvas) { return new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.95)); }
async function uploadCanvas(canvas, fileName) { const blob = await blobFromCanvas(canvas); if (!blob) throw new Error("Could not create mockup image"); const data = new FormData(); data.append("file", new File([blob], fileName, { type: "image/png" })); data.append("subdir", "product-mockups"); const response = await http.post("/files/image", data, { headers: { "Content-Type": "multipart/form-data" } }); return response.data.url; }
function areaBox(area, width, height) { return { x: Number(area?.x_pct ?? area?.x ?? 0) / 100 * width, y: Number(area?.y_pct ?? area?.y ?? 0) / 100 * height, width: Number(area?.width_pct ?? area?.width ?? 0) / 100 * width, height: Number(area?.height_pct ?? area?.height ?? 0) / 100 * height }; }
function placementBox(area, slot, width, height) { const a = areaBox(area, width, height); const p = slot?.placement || {}; return { x: a.x + Number(p.x ?? 0) / 100 * a.width, y: a.y + Number(p.y ?? 0) / 100 * a.height, width: Number(p.width ?? 100) / 100 * a.width, height: Number(p.height ?? 100) / 100 * a.height, rotation: Number(p.rotation || 0) * Math.PI / 180 }; }
function clip(ctx, area, width, height, draw) { const g = normalisePrintAreaGeometry(area || {}); const box = areaBox(area, width, height); if (box.width <= 0 || box.height <= 0) return; ctx.save(); if (g.geometry_type !== "mask") { traceCanvasPrintAreaPath(ctx, g, box.x, box.y, box.width, box.height); ctx.clip(); } draw(box); ctx.restore(); }
function drawArtwork(ctx, image, area, slot, width, height) { const box = placementBox(area, slot, width, height); if (box.width <= 0 || box.height <= 0) return; clip(ctx, area, width, height, () => { ctx.save(); ctx.translate(box.x + box.width / 2, box.y + box.height / 2); ctx.rotate(box.rotation); ctx.drawImage(image, -box.width / 2, -box.height / 2, box.width, box.height); ctx.restore(); }); }
function parseTextLayer(slot) { const raw = slot?.text_layer; if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw; if (typeof raw === "string") { try { const parsed = JSON.parse(raw); if (parsed && typeof parsed === "object") return parsed; } catch (_) { return { text: raw }; } } return text(slot?.text_content) ? { text: slot.text_content } : null; }
function drawText(ctx, area, slot, width, height) { const layer = parseTextLayer(slot); if (!layer) return false; const value = text(layer.text ?? layer.content ?? layer.value); if (!value) return false; const box = placementBox(area, slot, width, height); if (box.width <= 0 || box.height <= 0) return false; clip(ctx, area, width, height, () => { ctx.save(); ctx.translate(box.x + box.width / 2, box.y + box.height / 2); ctx.rotate(box.rotation); ctx.font = `${layer.font_weight || 700} ${Number(layer.font_size_px || layer.font_size || Math.min(box.width, box.height) * 0.18)}px ${layer.font_family || "Arial"}`; ctx.fillStyle = layer.color || layer.fill || "#000000"; ctx.textAlign = layer.text_align || "center"; ctx.textBaseline = "middle"; ctx.fillText(value, 0, 0, box.width); ctx.restore(); }); return true; }
function findArea(areas, slot) { const exact = asArray(areas).find((area) => text(area.id) === text(slot.print_area_id)); if (exact) return exact; const wanted = areaKeys(slot); return asArray(areas).find((area) => wanted.some((key) => areaKeys(area).includes(key))) || null; }

async function generateScopeView(template, representativeVariation, group, screen) {
  const printAreas = activeTemplatePrintAreas(template, representativeVariation);
  const screenAreas = printAreas.filter((area) => {
    if (text(area.screen_id) && text(screen?.id)) return text(area.screen_id) === text(screen.id);
    return screenKeys(screen).some((key) => areaKeys(area).includes(key));
  });
  const slots = asArray(group.artworks).filter((slot) => { const area = findArea(printAreas, slot); return area && (slot.original_url || slot.text_layer || slot.text_content); });
  if (!slots.length) return null;
  const setup = resolveEffectiveProductionSetup(template, representativeVariation, { screen, area: screenAreas[0] || printAreas[0] || {} });
  const baseUrl = setup.viewImageUrl || setup.imageUrl || getAreaPreviewImage(template, screenAreas[0], representativeVariation.id);
  if (!baseUrl) throw new Error(`No base mockup image is available for ${getVariationLabel(representativeVariation)} / ${screen?.name || screen?.view_key || "view"}`);
  const base = await loadImage(baseUrl);
  const canvas = document.createElement("canvas"); canvas.width = base.naturalWidth || base.width || 1; canvas.height = base.naturalHeight || base.height || 1;
  const ctx = canvas.getContext("2d"); ctx.drawImage(base, 0, 0, canvas.width, canvas.height);
  for (const slot of slots) { const area = findArea(printAreas, slot); if (!area) continue; if (slot.original_url) drawArtwork(ctx, await loadImage(slot.original_url), area, slot, canvas.width, canvas.height); if (slot.text_layer || slot.text_content) drawText(ctx, area, slot, canvas.width, canvas.height); }
  const safe = `${group.label || group.id}-${screen?.view_key || screen?.screen_view || screen?.name || "view"}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const imageUrl = await uploadCanvas(canvas, `artwork-scope-mockup-${safe}.png`);
  const scopedIds = asArray(group.variation_ids);
  return { id: `scope-mockup-${group.id}-${screen?.id || safe}`, variation_id: representativeVariation.id, variation_ids: scopedIds.length ? scopedIds : [representativeVariation.id], variation_label: `${group.label || "Artwork scope"} (${scopedIds.length || 1} variations)`, scope_type: group.scope_type || "custom", scope_label: group.label || "Artwork scope", attribute_key: group.attribute_key || "", attribute_value: group.attribute_value || "", screen_id: screen?.id || "", view_key: screen?.view_key || screen?.screen_view || screen?.name || "", role: "artwork_scope_mockup", image_url: imageUrl, status: "approved", source: "scope_generated", generated_at: new Date().toISOString(), artwork_group_id: group.id };
}

export default function ScopedArtworkMockupGenerator({ template, artworkGroups, selectedVariations, onArtworkGroupsChange }) {
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [lastResult, setLastResult] = useState(null);
  const variations = asArray(selectedVariations); const groups = asArray(artworkGroups);
  const targets = useMemo(() => groups.map((group) => { const ids = group.scope_type === "all" ? variations.map((v) => v.id) : asArray(group.variation_ids); const scoped = variations.filter((v) => ids.includes(v.id)); return scoped.length ? { group, variations: scoped } : null; }).filter(Boolean), [groups, variations]);
  const readyTargets = useMemo(() => targets.filter((target) => asArray(target.group.artworks).some((slot) => slot.original_url || slot.text_layer || slot.text_content)), [targets]);
  const totalViews = readyTargets.reduce((sum, target) => sum + activeTemplateScreens(template, target.variations[0]).length, 0);

  const generateAll = async () => {
    if (!readyTargets.length) { toast.error("Add artwork to an artwork scope before generating mockups."); return; }
    setGenerating(true); setLastResult(null); setProgress({ done: 0, total: totalViews });
    try {
      const generated = []; let done = 0;
      for (const target of readyTargets) {
        const representative = target.variations[0];
        for (const screen of activeTemplateScreens(template, representative)) { const row = await generateScopeView(template, representative, target.group, screen); if (row) generated.push(row); done += 1; setProgress({ done, total: totalViews }); }
      }
      if (!generated.length) throw new Error("No artwork-scope mockups could be generated. Check artwork, production views and template setup.");
      const byGroup = new Map(); generated.forEach((row) => { if (!byGroup.has(row.artwork_group_id)) byGroup.set(row.artwork_group_id, []); byGroup.get(row.artwork_group_id).push(row); });
      const nextGroups = groups.map((group) => { const rows = byGroup.get(group.id) || []; if (!rows.length) return group; const keys = new Set(rows.map((row) => `${row.screen_id}::${row.view_key}`)); const existing = asArray(group.variation_mockups).filter((row) => !keys.has(`${row.screen_id}::${row.view_key}`)); const allRows = [...existing, ...rows]; return { ...group, variation_mockups: allRows, primary_mockup_image_url: rows[0]?.image_url || group.primary_mockup_image_url || "", derived_mockup_images: [...asArray(group.derived_mockup_images).filter((row) => row.source !== "scope_generated"), ...rows] }; });
      onArtworkGroupsChange(nextGroups); setLastResult({ generated: generated.length, scopes: readyTargets.length, uniqueImages: new Set(generated.map((row) => row.image_url)).size }); toast.success(`${generated.length} mockup(s) generated for ${readyTargets.length} artwork scope(s)`);
    } catch (error) { toast.error(error.message || "Could not generate artwork-scope mockups"); }
    finally { setGenerating(false); }
  };

  return <section className="border border-[#FF3B30]/40 bg-black/40 rounded-xl p-5 space-y-4" data-testid="scoped-artwork-mockup-generator"><div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"><div><div className="overline mb-1">Artwork-scope mockups</div><h2 className="font-display text-3xl uppercase">Generate once per artwork scope</h2><p className="text-sm text-zinc-400 mt-2 max-w-3xl">A scope covering Red XS/S/M/L gets one Red mockup per template view. The sizes remain linked to that artwork scope but do not create four duplicate images.</p></div><button type="button" className="btn-primary shrink-0" disabled={generating || !readyTargets.length} onClick={generateAll}><RefreshCw size={15} className={generating ? "animate-spin" : ""} />{generating ? `Generating ${progress.done}/${progress.total}` : `Generate ${totalViews} Mockup(s)`}</button></div><div className="grid md:grid-cols-4 gap-3 text-xs"><Metric label="Selected variations" value={variations.length} /><Metric label="Artwork scopes" value={targets.length} /><Metric label="Mockup views" value={totalViews} /><Metric label="Generation" value="1 / scope / view" /></div>{generating && <div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-[#FF3B30] transition-all" style={{ width: `${progress.total ? progress.done / progress.total * 100 : 0}%` }} /></div>}{lastResult && <div className="border border-[#34C759]/30 bg-[#0A1B10] rounded-lg p-3 flex items-center gap-2 text-sm text-[#B8F5C3]"><CheckCircle2 size={16} /> {lastResult.generated} mockups generated for {lastResult.scopes} artwork scope(s), using {lastResult.uniqueImages} unique uploaded image(s).</div>}{!readyTargets.length && <div className="border border-[#FFCC00]/30 bg-[#FFCC00]/10 rounded-lg p-3 text-xs text-[#FFE08A] flex gap-2"><AlertTriangle size={15} /> Add artwork to a scope before generating.</div>}{groups.some((group) => asArray(group.variation_mockups).length) && <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">{groups.flatMap((group) => asArray(group.variation_mockups)).filter((row, index, rows) => rows.findIndex((item) => item.image_url === row.image_url && item.view_key === row.view_key) === index).slice(-24).map((row) => <div key={row.id || `${row.image_url}-${row.view_key}`} className="border border-white/10 bg-black/30 rounded-lg p-2"><img src={assetUrl(row.image_url)} alt={`${row.scope_label || "Artwork scope"} ${row.view_key || "mockup"}`} className="w-full aspect-square object-contain bg-black rounded" /><div className="text-[10px] uppercase tracking-widest text-zinc-500 mt-2 truncate">{row.scope_label || "Artwork scope"}</div><div className="text-[9px] text-zinc-600 mt-1 truncate">{row.view_key || "view"}</div></div>)}</div>}</section>;
}

function Metric({ label, value }) { return <div className="border border-white/10 bg-black/30 rounded-lg p-3"><div className="overline">{label}</div><div className="font-display text-2xl mt-1">{value}</div></div>; }
