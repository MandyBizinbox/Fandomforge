#!/usr/bin/env python3
"""Apply shaped print-area preview and generated-mockup clipping."""
from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "frontend" / "src" / "components" / "product-builder" / "ProductArtworkStudio.jsx"


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"ABORT: expected one {label} block, found {count}.")
    return source.replace(old, new, 1)


def main() -> None:
    source = TARGET.read_text(encoding="utf-8")

    if "renderSlotIntoPrintAreaLayer" in source:
        print("Creator Artwork geometry integration already applied.")
        return

    source = replace_once(
        source,
        'import { resolveEffectiveProductionSetup } from "../../lib/templateProductionResolver";\n',
        'import { resolveEffectiveProductionSetup } from "../../lib/templateProductionResolver";\nimport { geometryClipStyle, normalisePrintAreaGeometry, traceCanvasPrintAreaPath } from "../../lib/printAreaGeometry";\n',
        "geometry import",
    )

    source = replace_once(
        source,
        '''\nexport default function ProductArtworkStudio({ template, printOptions, artworkGroups, onArtworkGroupsChange, selectedVariations, isAdmin = false }) {\n''',
        '''\nasync function renderSlotIntoPrintAreaLayer(slot, area, targetWidth, targetHeight) {\n  const width = Math.max(1, Math.round(Number(targetWidth || 0)));\n  const height = Math.max(1, Math.round(Number(targetHeight || 0)));\n  const layer = document.createElement("canvas");\n  layer.width = width;\n  layer.height = height;\n  const context = layer.getContext("2d");\n  const geometry = normalisePrintAreaGeometry(area);\n  const placement = sanitizePlacement(slot.placement, area);\n  const artX = (Number(placement.x || 0) / 100) * width;\n  const artY = (Number(placement.y || 0) / 100) * height;\n  const artW = (Number(placement.width || 100) / 100) * width;\n  const artH = (Number(placement.height || 100) / 100) * height;\n  const rotation = (Number(placement.rotation || 0) * Math.PI) / 180;\n\n  context.save();\n  if (geometry.geometry_type !== "mask") {\n    traceCanvasPrintAreaPath(context, geometry, 0, 0, width, height);\n    context.clip();\n  }\n  context.translate(artX + artW / 2, artY + artH / 2);\n  context.rotate(rotation);\n  if (slot.text_layer) {\n    await drawTextLayer(context, slot, -artW / 2, -artH / 2, artW, artH);\n  } else {\n    const artworkImage = await loadImage(slot.original_url);\n    drawImageContain(context, artworkImage, -artW / 2, -artH / 2, artW, artH);\n  }\n  context.restore();\n\n  if (geometry.geometry_type === "mask" && geometry.mask_url) {\n    const maskImage = await loadImage(geometry.mask_url);\n    context.save();\n    context.globalCompositeOperation = "destination-in";\n    context.drawImage(maskImage, 0, 0, width, height);\n    context.restore();\n  }\n\n  return layer;\n}\n\nexport default function ProductArtworkStudio({ template, printOptions, artworkGroups, onArtworkGroupsChange, selectedVariations, isAdmin = false }) {\n''',
        "render helper insertion",
    )

    source = replace_once(
        source,
        '''        const placement = sanitizePlacement(slot.placement, area);\n        const artX = areaX + (Number(placement.x || 0) / 100) * areaW;\n        const artY = areaY + (Number(placement.y || 0) / 100) * areaH;\n        const artW = (Number(placement.width || 100) / 100) * areaW;\n        const artH = (Number(placement.height || 100) / 100) * areaH;\n        const rotation = (Number(placement.rotation || 0) * Math.PI) / 180;\n        ctx.save();\n        ctx.beginPath();\n        ctx.rect(areaX, areaY, areaW, areaH);\n        ctx.clip();\n        ctx.translate(artX + artW / 2, artY + artH / 2);\n        ctx.rotate(rotation);\n        if (slot.text_layer) await drawTextLayer(ctx, slot, -artW / 2, -artH / 2, artW, artH);\n        else {\n          const artworkImage = await loadImage(slot.original_url);\n          drawImageContain(ctx, artworkImage, -artW / 2, -artH / 2, artW, artH);\n        }\n        ctx.restore();\n''',
        '''        const clippedLayer = await renderSlotIntoPrintAreaLayer(slot, area, areaW, areaH);\n        ctx.drawImage(clippedLayer, areaX, areaY, areaW, areaH);\n''',
        "generated mockup clipping",
    )

    source = replace_once(
        source,
        '''className={`absolute border-2 ${areaActive ? "border-[#FF3B30] bg-[#FF3B30]/10" : "border-[#FF3B30]/50 bg-[#FF3B30]/5"} overflow-visible`}''',
        '''className="absolute overflow-visible"''',
        "rectangular area class",
    )

    source = replace_once(
        source,
        '''onMouseDown={(event) => { event.stopPropagation(); setActivePrintAreaId(area.id); }}>\n                    <div className="absolute -top-8 left-0 z-30 bg-[#FF3B30] text-white text-[10px] uppercase tracking-widest px-2 py-1 whitespace-nowrap">{area.name} · {area.width_mm || 0}×{area.height_mm || 0}mm</div>\n''',
        '''onMouseDown={(event) => { event.stopPropagation(); setActivePrintAreaId(area.id); }}>\n                    <div\n                      className={`absolute inset-0 pointer-events-none border-2 ${areaActive ? "border-[#FF3B30] bg-[#FF3B30]/10" : "border-[#FF3B30]/50 bg-[#FF3B30]/5"}`}\n                      style={{\n                        ...geometryClipStyle(area),\n                        transform: `rotate(${Number(area.rotation_deg || 0)}deg)`,\n                        transformOrigin: "center",\n                      }}\n                    />\n                    <div className="absolute -top-8 left-0 z-30 bg-[#FF3B30] text-white text-[10px] uppercase tracking-widest px-2 py-1 whitespace-nowrap">{area.name} · {area.geometry_type || "rectangle"} · {area.width_mm || 0}×{area.height_mm || 0}mm</div>\n''',
        "shape-aware area overlay",
    )

    TARGET.write_text(source, encoding="utf-8")
    print("Applied Creator Artwork geometry integration.")


if __name__ == "__main__":
    main()
