#!/usr/bin/env python3
"""Generate front/back/angled product mockups from one full-wrap artwork source."""
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
    if "composePrintAreaArtworkCanvas" in source:
        print("Full-wrap derived mockup generation already applied.")
        return

    source = replace_once(
        source,
        'import { geometryClipStyle, normalisePrintAreaGeometry, traceCanvasPrintAreaPath } from "../../lib/printAreaGeometry";\n',
        'import { geometryClipStyle, normalisePrintAreaGeometry, traceCanvasPrintAreaPath } from "../../lib/printAreaGeometry";\nimport { renderDerivedMockupCanvas } from "../../lib/derivedMockupRenderer";\n',
        "derived renderer import",
    )

    source = replace_once(
        source,
        '''\nexport default function ProductArtworkStudio({ template, printOptions, artworkGroups, onArtworkGroupsChange, selectedVariations, isAdmin = false }) {\n''',
        '''\nasync function composePrintAreaArtworkCanvas(slots, area, width, height) {\n  const canvas = document.createElement("canvas");\n  canvas.width = Math.max(1, Math.round(Number(width || 0)));\n  canvas.height = Math.max(1, Math.round(Number(height || 0)));\n  const context = canvas.getContext("2d");\n\n  for (const slot of asArray(slots)) {\n    if (!slotHasArtwork(slot)) continue;\n    const layer = await renderSlotIntoPrintAreaLayer(\n      slot,\n      area,\n      canvas.width,\n      canvas.height\n    );\n    context.drawImage(layer, 0, 0, canvas.width, canvas.height);\n  }\n\n  return canvas;\n}\n\nasync function uploadGeneratedCanvas(canvas, fileName) {\n  const blob = await blobFromCanvas(canvas);\n  if (!blob) throw new Error("Could not generate mockup image");\n  const formData = new FormData();\n  formData.append(\n    "file",\n    new File([blob], fileName, { type: "image/png" })\n  );\n  formData.append("subdir", "product-mockups");\n  const response = await http.post("/files/image", formData, {\n    headers: { "Content-Type": "multipart/form-data" },\n  });\n  return response.data.url;\n}\n\nexport default function ProductArtworkStudio({ template, printOptions, artworkGroups, onArtworkGroupsChange, selectedVariations, isAdmin = false }) {\n''',
        "full-wrap helper insertion",
    )

    source = replace_once(
        source,
        '''      const blob = await blobFromCanvas(canvas);\n      if (!blob) throw new Error("Could not generate mockup image");\n      const fd = new FormData();\n      const safeName = `${activeGroup?.label || "group"}-${screenLabel(activeScreen)}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");\n      fd.append("file", new File([blob], `mockup-${safeName}.png`, { type: "image/png" }));\n      fd.append("subdir", "product-mockups");\n      const response = await http.post("/files/image", fd, { headers: { "Content-Type": "multipart/form-data" } });\n      setGroupSlots(activeGroup.id, slots.map((slot) => (slot.screen_id === currentScreenId ? { ...slot, mockup_image_url: response.data.url } : slot)));\n      toast.success(`${screenLabel(activeScreen)} mockup generated`);\n''',
        '''      const safeName = `${activeGroup?.label || "group"}-${screenLabel(activeScreen)}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");\n      const primaryMockupUrl = await uploadGeneratedCanvas(\n        canvas,\n        `mockup-${safeName}.png`\n      );\n\n      const updatedSlots = slots.map((slot) => (\n        slot.screen_id === currentScreenId\n          ? { ...slot, mockup_image_url: primaryMockupUrl }\n          : slot\n      ));\n      const derivedMockupImages = [];\n      const fullWrapArea = areasForScreen.find((area) => {\n        const key = compact(\n          area.area_key\n          || area.view_key\n          || area.screen_view\n          || area.name\n        ).toLowerCase();\n        return key.includes("wrap");\n      });\n      const derivedGalleryRows = asArray(template?.template_gallery).filter(\n        (row) =>\n          row?.image_url\n          && row.status !== "archived"\n          && row.derived_from_artwork_mode === "full_wrap"\n          && [\n            "front_mockup",\n            "back_mockup",\n            "side_mockup",\n            "angled_mockup",\n          ].includes(row.role)\n          && (!row.source_print_area_id || row.source_print_area_id === fullWrapArea?.id)\n      );\n\n      if (fullWrapArea && derivedGalleryRows.length) {\n        const wrapSlots = drawableSlots.filter(\n          (slot) => slot.print_area_id === fullWrapArea.id\n        );\n        const physicalRatio =\n          Number(fullWrapArea.width_mm || 0) > 0\n          && Number(fullWrapArea.height_mm || 0) > 0\n            ? Number(fullWrapArea.width_mm) / Number(fullWrapArea.height_mm)\n            : Math.max(0.1, areaPct(fullWrapArea, "width") / Math.max(1, areaPct(fullWrapArea, "height")));\n        const sourceWidth = 1800;\n        const sourceHeight = Math.max(1, Math.round(sourceWidth / physicalRatio));\n        const wrapArtworkCanvas = await composePrintAreaArtworkCanvas(\n          wrapSlots,\n          fullWrapArea,\n          sourceWidth,\n          sourceHeight\n        );\n\n        for (const galleryRow of derivedGalleryRows) {\n          const derivedCanvas = await renderDerivedMockupCanvas({\n            baseImageUrl: galleryRow.image_url,\n            sourceArtworkCanvas: wrapArtworkCanvas,\n            crop: galleryRow.crop || {},\n            role: galleryRow.role,\n          });\n          const derivedName = `${safeName}-${galleryRow.role || galleryRow.view_key || "derived"}`\n            .toLowerCase()\n            .replace(/[^a-z0-9]+/g, "-");\n          const imageUrl = await uploadGeneratedCanvas(\n            derivedCanvas,\n            `mockup-${derivedName}.png`\n          );\n          derivedMockupImages.push({\n            id: makeId("derived-mockup"),\n            gallery_image_id: galleryRow.id,\n            role: galleryRow.role,\n            view_key: galleryRow.view_key || galleryRow.role,\n            image_url: imageUrl,\n            source_print_area_id: fullWrapArea.id,\n            artwork_mode: "full_wrap",\n          });\n        }\n      }\n\n      const nextGroups = patchGroup(groups, activeGroup.id, (group) => ({\n        ...group,\n        artworks: updatedSlots.map((slot, index) => ({\n          ...slot,\n          sort_order: index,\n        })),\n        primary_mockup_image_url: primaryMockupUrl,\n        derived_mockup_images: derivedMockupImages,\n      }));\n      setGroups(nextGroups);\n      toast.success(\n        derivedMockupImages.length\n          ? `${screenLabel(activeScreen)} mockup and ${derivedMockupImages.length} derived view(s) generated`\n          : `${screenLabel(activeScreen)} mockup generated`\n      );\n''',
        "full-wrap generation block",
    )

    source = replace_once(
        source,
        '''          {activeSlot?.mockup_image_url && <div className="mt-3 border border-white/10 p-2"><div className="overline mb-2">Generated mockup</div><img src={assetUrl(activeSlot.mockup_image_url)} alt="Generated mockup" className="w-full max-h-40 object-contain" /></div>}\n''',
        '''          {activeSlot?.mockup_image_url && <div className="mt-3 border border-white/10 p-2"><div className="overline mb-2">Generated mockup</div><img src={assetUrl(activeSlot.mockup_image_url)} alt="Generated mockup" className="w-full max-h-40 object-contain" /></div>}\n          {asArray(activeGroup?.derived_mockup_images).length > 0 && (\n            <div className="mt-3 border border-white/10 p-2">\n              <div className="overline mb-2">Derived sellable views</div>\n              <div className="grid grid-cols-2 gap-2">\n                {asArray(activeGroup.derived_mockup_images).map((mockup) => (\n                  <div key={mockup.id || mockup.image_url} className="border border-white/10 bg-black/30 p-1">\n                    <img src={assetUrl(mockup.image_url)} alt={mockup.view_key || mockup.role || "Derived mockup"} className="w-full aspect-square object-contain" />\n                    <div className="text-[9px] uppercase tracking-widest text-zinc-500 mt-1 truncate">{mockup.view_key || mockup.role}</div>\n                  </div>\n                ))}\n              </div>\n            </div>\n          )}\n''',
        "derived mockup display",
    )

    TARGET.write_text(source, encoding="utf-8")
    print("Applied full-wrap derived mockup generation.")


if __name__ == "__main__":
    main()
