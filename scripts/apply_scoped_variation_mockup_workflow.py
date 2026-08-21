from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def write(path, content):
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_once(path, old, new):
    content = read(path)
    if new in content:
        return False
    if old not in content:
        raise SystemExit(f"Expected patch target not found: {path}")
    write(path, content.replace(old, new, 1))
    return True


SCOPED_STUDIO = r'''import React, { useEffect, useMemo, useState } from "react";
import ProductArtworkStudio from "./ProductArtworkStudio";
import { asArray, getVariationLabel } from "./productBuilderUtils";

function scopeLabel(group, selectedVariations) {
  if (!group) return "No artwork scope selected";
  if (group.scope_type === "all") return `All selected variations (${selectedVariations.length})`;
  if (group.scope_type === "attribute") return `${group.attribute_key || "Attribute"}: ${group.attribute_value || "Selected value"}`;
  if (group.scope_type === "variation") {
    const variation = selectedVariations.find((item) => item.id === asArray(group.variation_ids)[0]);
    return variation ? `Exact variation: ${getVariationLabel(variation)}` : "Exact variation";
  }
  return group.label || "Custom artwork scope";
}

function scopeDescription(group, selectedVariations) {
  if (!group) return "Choose an artwork scope before uploading artwork.";
  const ids = asArray(group.variation_ids);
  const count = group.scope_type === "all" ? selectedVariations.length : ids.length;
  if (group.scope_type === "attribute") {
    return `Artwork uploaded here will be used for all ${count} selected variation(s) in this ${group.attribute_key || "attribute"} scope. Sizes and other attributes do not create separate artwork uploads.`;
  }
  if (group.scope_type === "variation") return "Artwork uploaded here belongs only to this exact variation.";
  if (group.scope_type === "all") return "One artwork set is shared by every selected variation.";
  return `Artwork uploaded here applies to ${count || 1} selected variation(s) in this custom scope.`;
}

export default function ScopedProductArtworkStudio({
  template,
  printOptions,
  artworkGroups,
  onArtworkGroupsChange,
  selectedVariations,
  isAdmin = false,
}) {
  const groups = asArray(artworkGroups);
  const variations = asArray(selectedVariations);
  const [activeGroupId, setActiveGroupId] = useState(groups[0]?.id || "");

  useEffect(() => {
    if (!groups.length) {
      setActiveGroupId("");
      return;
    }
    if (!groups.some((group) => group.id === activeGroupId)) {
      setActiveGroupId(groups[0].id);
    }
  }, [groups, activeGroupId]);

  const activeGroup = useMemo(
    () => groups.find((group) => group.id === activeGroupId) || groups[0] || null,
    [groups, activeGroupId]
  );

  const scopedGroups = activeGroup ? [activeGroup] : [];
  const scopedVariations = useMemo(() => {
    if (!activeGroup) return [];
    const ids = new Set(asArray(activeGroup.variation_ids));
    if (activeGroup.scope_type === "all") return variations;
    return variations.filter((variation) => ids.has(variation.id));
  }, [activeGroup, variations]);

  const updateScopedGroups = (nextScopedGroups) => {
    const next = nextScopedGroups[0];
    if (!next) return;
    onArtworkGroupsChange(groups.map((group) => group.id === next.id ? next : group));
  };

  return (
    <div className="space-y-4">
      <section className="border border-[#FF3B30]/40 bg-black/40 rounded-xl p-4 space-y-3" data-testid="artwork-scope-context">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
          <div>
            <div className="overline mb-1">Artwork scope controls the studio</div>
            <h2 className="font-display text-2xl uppercase">Upload artwork for the selected scope</h2>
            <p className="text-sm text-zinc-400 mt-1">The studio is locked to one artwork group at a time. This prevents a Colour scope from accidentally becoming one upload per Size × Colour combination.</p>
          </div>
          <div className="min-w-[260px]">
            <label className="label">Active artwork scope</label>
            <select className="input-base" value={activeGroup?.id || ""} onChange={(event) => setActiveGroupId(event.target.value)} disabled={!groups.length}>
              {groups.map((group) => <option key={group.id} value={group.id}>{scopeLabel(group, variations)}</option>)}
            </select>
          </div>
        </div>
        {activeGroup && (
          <div className="grid md:grid-cols-2 gap-3 text-xs">
            <div className="border border-white/10 bg-black/30 rounded-lg p-3">
              <div className="overline">Current scope</div>
              <div className="font-display text-xl uppercase mt-1">{scopeLabel(activeGroup, variations)}</div>
            </div>
            <div className="border border-white/10 bg-black/30 rounded-lg p-3">
              <div className="overline">Applies to</div>
              <div className="text-zinc-300 mt-1">{scopeDescription(activeGroup, variations)}</div>
              {scopedVariations.length > 0 && <div className="text-zinc-500 mt-2">{scopedVariations.length} selected variation(s) share this artwork scope.</div>}
            </div>
          </div>
        )}
      </section>

      {activeGroup ? (
        <ProductArtworkStudio
          template={template}
          printOptions={printOptions}
          artworkGroups={scopedGroups}
          onArtworkGroupsChange={updateScopedGroups}
          selectedVariations={scopedVariations}
          isAdmin={isAdmin}
        />
      ) : (
        <div className="border border-dashed border-white/15 rounded-xl p-8 text-center text-zinc-500">Create an artwork scope first.</div>
      )}
    </div>
  );
}
'''

VARIATION_GENERATOR = r'''import React, { useMemo, useState } from "react";
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
    const ids = group.scope_type === "all"
      ? variations.map((variation) => variation.id)
      : asArray(group.variation_ids);
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
'''

write("frontend/src/components/product-builder/ScopedProductArtworkStudio.jsx", SCOPED_STUDIO)
write("frontend/src/components/product-builder/VariationMockupGenerator.jsx", VARIATION_GENERATOR)

replace_once(
    "frontend/src/components/product-builder/ProductBuilder.jsx",
    'import ProductArtworkStudio from "./ProductArtworkStudio";\n',
    'import ScopedProductArtworkStudio from "./ScopedProductArtworkStudio";\n',
)
replace_once(
    "frontend/src/components/product-builder/ProductBuilder.jsx",
    "<ProductArtworkStudio\n",
    "<ScopedProductArtworkStudio\n",
)

# Expand variation persistence so a single scope/view image can be associated with
# every covered variation without generating a separate image for every size.
replace_once(
    "frontend/src/components/product-builder/ProductBuilder.jsx",
    '''    const variationMockupMap = new Map(\n      asArray(form.artwork_groups)\n        .flatMap((group) => asArray(group.variation_mockups))\n        .filter((mockup) => mockup?.variation_id && mockup?.image_url)\n        .reduce((rows, mockup) => {\n          const current = rows.get(mockup.variation_id) || [];\n          current.push(mockup);\n          rows.set(mockup.variation_id, current);\n          return rows;\n        }, new Map())\n    );''',
    '''    const variationMockupMap = new Map();\n    asArray(form.artwork_groups)\n      .flatMap((group) => asArray(group.variation_mockups))\n      .filter((mockup) => mockup?.image_url)\n      .forEach((mockup) => {\n        const ids = asArray(mockup.variation_ids).length\n          ? asArray(mockup.variation_ids)\n          : [mockup.variation_id];\n        ids.filter(Boolean).forEach((variationId) => {\n          const current = variationMockupMap.get(variationId) || [];\n          if (!current.some((row) => row.image_url === mockup.image_url && row.view_key === mockup.view_key)) current.push(mockup);\n          variationMockupMap.set(variationId, current);\n        });\n      });''',
)

# Expose all generated scope mockups to the storefront gallery candidate picker.
replace_once(
    "frontend/src/components/product-builder/productBuilderUtilsBase.js",
    '''    addCandidate({\n      url: group?.primary_mockup_image_url,\n      label: `${group?.label || `Artwork group ${groupIndex + 1}`} primary mockup`,\n      source: "Generated mockup",\n      role: "generated_mockup",\n    });\n\n    asArray(group?.derived_mockup_images).forEach((mockup, mockupIndex) => {''',
    '''    addCandidate({\n      url: group?.primary_mockup_image_url,\n      label: `${group?.label || `Artwork group ${groupIndex + 1}`} primary mockup`,\n      source: "Generated mockup",\n      role: "generated_mockup",\n    });\n\n    asArray(group?.variation_mockups).forEach((mockup, mockupIndex) => {\n      addCandidate({\n        url: mockup?.image_url || mockup?.mockup_image_url || mockup?.url,\n        label: mockup?.scope_label\n          || mockup?.variation_label\n          || `${group?.label || `Artwork group ${groupIndex + 1}`} mockup ${mockupIndex + 1}`,\n        source: "Variation scope mockup",\n        role: mockup?.role || "variation_mockup",\n      });\n    });\n\n    asArray(group?.derived_mockup_images).forEach((mockup, mockupIndex) => {''',
)

print("Scoped variation mockup patch applied")
''