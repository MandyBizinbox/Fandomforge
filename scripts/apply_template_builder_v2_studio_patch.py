#!/usr/bin/env python3
"""Integrate visibility, ordered workflow and semantic gallery into Template Studio."""
from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "frontend" / "src" / "components" / "template-studio" / "ProductTemplateStudioPage.jsx"


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"ABORT: expected one {label} block, found {count}.")
    return source.replace(old, new, 1)


def main() -> None:
    source = TARGET.read_text(encoding="utf-8")

    if 'import TemplateGalleryManager from "./TemplateGalleryManager";' in source:
        print("Template Studio V2 integration already applied.")
        return

    source = replace_once(
        source,
        'import PrintAreaInspector from "./PrintAreaInspector";\n',
        'import PrintAreaInspector from "./PrintAreaInspector";\nimport TemplateGalleryManager from "./TemplateGalleryManager";\n',
        "gallery import",
    )

    source = replace_once(
        source,
        '''        mockup_screens: safeArray(template.mockup_screens),\n        print_areas: safeArray(template.print_areas),\n''',
        '''        mockup_screens: safeArray(template.mockup_screens),\n        print_areas: safeArray(template.print_areas),\n        template_gallery: safeArray(template.template_gallery),\n        artwork_modes: safeArray(template.artwork_modes),\n        creator_visible: template.creator_visible !== false,\n        admin_visible: template.admin_visible !== false,\n''',
        "save payload",
    )

    source = replace_once(
        source,
        '''      updateTemplate({ product_image_url: response.data.url, mockup_url: response.data.url });\n      toast.success("Primary image uploaded");\n''',
        '''      const primaryGalleryImage = {\n        id: newId("gallery"),\n        name: file.name.replace(/\\.[^.]+$/, ""),\n        image_url: response.data.url,\n        role: "catalogue_thumbnail",\n        view_key: "front",\n        source_print_area_id: "",\n        derived_from_artwork_mode: "",\n        crop: {},\n        sort_order: 0,\n        is_primary: true,\n        status: "active",\n      };\n      const gallery = safeArray(template.template_gallery)\n        .filter((row) => row.role !== "catalogue_thumbnail")\n        .map((row) => ({ ...row, is_primary: false }));\n      updateTemplate({\n        product_image_url: response.data.url,\n        mockup_url: response.data.url,\n        template_gallery: [primaryGalleryImage, ...gallery],\n      });\n      toast.success("Primary image uploaded");\n''',
        "primary upload",
    )

    source = replace_once(
        source,
        '''        {[\n          ["setup", "Setup"],\n          ["views", "Base Views"],\n          ["print-rules", "Print Rules"],\n          ["print-areas", "Print Areas"],\n          ["variations", "Variations"],\n          ["size-guide", "Size Guide"],\n        ].map(([tab, label]) => (\n''',
        '''        {[\n          ["setup", "1. Product"],\n          ["variations", "2. Variations"],\n          ["views", "3. Editor Views"],\n          ["print-areas", "4. Print Areas"],\n          ["print-rules", "5. Print Rules"],\n          ["gallery", "6. Gallery & Mockups"],\n          ["size-guide", "7. Size Guide"],\n        ].map(([tab, label]) => (\n''',
        "ordered tabs",
    )

    source = replace_once(
        source,
        '''                <div className="grid md:grid-cols-5 gap-3">\n                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">\n                    <span className="block text-[#FF7A1A] font-bold mb-1">1. Blueprint</span>\n                    Choose the production skeleton.\n                  </div>\n                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">\n                    <span className="block text-[#FF7A1A] font-bold mb-1">2. Supplier blank</span>\n                    Add supplier, brand and blank SKU.\n                  </div>\n                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">\n                    <span className="block text-[#FF7A1A] font-bold mb-1">3. Save</span>\n                    Save the supplier template.\n                  </div>\n                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">\n                    <span className="block text-[#FF7A1A] font-bold mb-1">4. Variations</span>\n                    Configure colours, sizes, costs and SKUs.\n                  </div>\n                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">\n                    <span className="block text-[#FF7A1A] font-bold mb-1">5. Overrides</span>\n                    Upload colour-specific image overrides.\n                  </div>\n                </div>\n''',
        '''                <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">\n                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">\n                    <span className="block text-[#FF7A1A] font-bold mb-1">1. Product type</span>\n                    Choose the reusable production blueprint.\n                  </div>\n                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">\n                    <span className="block text-[#FF7A1A] font-bold mb-1">2. Template</span>\n                    Add the supplier blank, costs and catalogue details.\n                  </div>\n                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">\n                    <span className="block text-[#FF7A1A] font-bold mb-1">3. Variations</span>\n                    Generate or select colours, sizes, shapes and SKUs.\n                  </div>\n                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">\n                    <span className="block text-[#FF7A1A] font-bold mb-1">4. Editor views</span>\n                    Upload the base image used to place artwork.\n                  </div>\n                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">\n                    <span className="block text-[#FF7A1A] font-bold mb-1">5. Print areas</span>\n                    Set defaults, then override only differing variations.\n                  </div>\n                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">\n                    <span className="block text-[#FF7A1A] font-bold mb-1">6. Print rules</span>\n                    Assign supported manufacturing and pricing rules.\n                  </div>\n                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">\n                    <span className="block text-[#FF7A1A] font-bold mb-1">7. Gallery</span>\n                    Add catalogue, front, back, angled and wrap images.\n                  </div>\n                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">\n                    <span className="block text-[#FF7A1A] font-bold mb-1">8. Publish</span>\n                    Review visibility and activate the completed template.\n                  </div>\n                </div>\n''',
        "setup checklist",
    )

    source = replace_once(
        source,
        '''          <div className="studio-panel">\n            <div className="overline mb-2">Primary Image</div>\n            <div className="aspect-square bg-black border border-white/15 flex items-center justify-center overflow-hidden mb-4">\n              {template.product_image_url || template.mockup_url ? <img src={assetUrl(template.product_image_url || template.mockup_url)} alt="Primary" className="w-full h-full object-contain" /> : <span className="text-zinc-600 text-sm">No primary image</span>}\n            </div>\n            <label className="studio-file-button w-full justify-center">Upload Primary Image<input type="file" className="hidden" accept="image/*" onChange={(e) => uploadProductImage(e.target.files?.[0])} /></label>\n          </div>\n''',
        '''          <div className="space-y-5">\n            <div className="studio-panel">\n              <div className="overline mb-2">Primary Image</div>\n              <div className="aspect-square bg-black border border-white/15 flex items-center justify-center overflow-hidden mb-4">\n                {template.product_image_url || template.mockup_url ? <img src={assetUrl(template.product_image_url || template.mockup_url)} alt="Primary" className="w-full h-full object-contain" /> : <span className="text-zinc-600 text-sm">No primary image</span>}\n              </div>\n              <label className="studio-file-button w-full justify-center">Upload Primary Image<input type="file" className="hidden" accept="image/*" onChange={(e) => uploadProductImage(e.target.files?.[0])} /></label>\n              <p className="text-xs text-zinc-500 mt-3">This also becomes the catalogue-thumbnail role in Gallery & Mockups.</p>\n            </div>\n\n            <div className="studio-panel">\n              <div className="overline mb-2">Catalogue visibility</div>\n              <div className="space-y-3">\n                <label className="flex items-start gap-3 text-sm">\n                  <input\n                    type="checkbox"\n                    className="mt-1"\n                    checked={template.creator_visible !== false}\n                    onChange={(event) => updateTemplate({ creator_visible: event.target.checked })}\n                  />\n                  <span>\n                    <strong className="block">Visible to creators</strong>\n                    <span className="text-xs text-zinc-500">Required for Create Printable Product.</span>\n                  </span>\n                </label>\n                <label className="flex items-start gap-3 text-sm">\n                  <input\n                    type="checkbox"\n                    className="mt-1"\n                    checked={template.admin_visible !== false}\n                    onChange={(event) => updateTemplate({ admin_visible: event.target.checked })}\n                  />\n                  <span>\n                    <strong className="block">Visible in admin catalogue</strong>\n                    <span className="text-xs text-zinc-500">Keep enabled unless deliberately archived from normal admin use.</span>\n                  </span>\n                </label>\n              </div>\n\n              {template.status === "active" && template.creator_visible === false && (\n                <div className="mt-4 rounded-lg border border-[#FFB020]/40 bg-[#FFB020]/10 p-3 text-xs text-[#FFD27A]">\n                  This template is Active but hidden from creators. It will not appear in Create Printable Product.\n                </div>\n              )}\n            </div>\n          </div>\n''',
        "visibility panel",
    )

    source = replace_once(
        source,
        '''      {activeTab === "print-rules" && (\n        <PrintRulesPanel\n          printOptions={printOptions}\n          selectedRules={selectedTemplatePrintRules()}\n          selectedRuleIds={selectedTemplatePrintRuleIds()}\n          onToggleRule={toggleTemplatePrintRule}\n        />\n      )}\n\n      {activeTab === "print-areas" && (\n''',
        '''      {activeTab === "print-rules" && (\n        <PrintRulesPanel\n          printOptions={printOptions}\n          selectedRules={selectedTemplatePrintRules()}\n          selectedRuleIds={selectedTemplatePrintRuleIds()}\n          onToggleRule={toggleTemplatePrintRule}\n        />\n      )}\n\n      {activeTab === "gallery" && (\n        <TemplateGalleryManager\n          gallery={safeArray(template.template_gallery)}\n          artworkModes={safeArray(template.artwork_modes)}\n          printAreas={safeArray(template.print_areas)}\n          onGalleryChange={(template_gallery) => {\n            const primary = safeArray(template_gallery).find((row) => row.is_primary)\n              || safeArray(template_gallery).find((row) => row.role === "catalogue_thumbnail");\n            updateTemplate({\n              template_gallery,\n              product_image_url: primary?.image_url || template.product_image_url || "",\n              mockup_url: primary?.image_url || template.mockup_url || "",\n              mockup_images: safeArray(template_gallery).map((row) => row.image_url).filter(Boolean),\n            });\n          }}\n          onArtworkModesChange={(artwork_modes) => updateTemplate({ artwork_modes })}\n        />\n      )}\n\n      {activeTab === "print-areas" && (\n''',
        "gallery tab panel",
    )

    TARGET.write_text(source, encoding="utf-8")
    print("Applied Template Studio V2 integration patch.")


if __name__ == "__main__":
    main()
