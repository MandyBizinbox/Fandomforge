from pathlib import Path


def insert_once(text, needle, insertion, label):
    if insertion.strip() in text:
        return text
    idx = text.find(needle)
    if idx < 0:
        raise RuntimeError(f"{label}: marker not found: {needle[:120]!r}")
    return text[:idx] + insertion + text[idx:]

root = Path('.')

# Wire the new generator into the existing ProductArtworkStudio while preserving
# the current single-view mockup generator.
p = root / 'frontend/src/components/product-builder/ProductArtworkStudio.jsx'
s = p.read_text()
s = insert_once(
    s,
    'import { renderDerivedMockupCanvas } from "../../lib/derivedMockupRenderer";\n',
    'import { generateVariationMockups, applyVariationMockupsToGroups } from "./variationMockupGeneration";\n',
    'ProductArtworkStudio import',
)
s = insert_once(
    s,
    '  const [generating, setGenerating] = useState(false);\n',
    '  const [generatingVariations, setGeneratingVariations] = useState(false);\n  const [variationGenerationProgress, setVariationGenerationProgress] = useState({ completed: 0, total: 0, label: "" });\n',
    'ProductArtworkStudio generation state',
)
s = s.replace(
    '  getGroupRepresentativeVariationId,\n',
    '  getGroupRepresentativeVariationId,\n  getVariationLabel,\n',
    1,
)
marker = '  const selectView = (screenId) => {\n'
new_fn = '''  const generateAllVariationMockups = async () => {\n    if (!variations.length) {\n      toast.error("Select at least one variation first.");\n      return;\n    }\n    const groupsWithArtwork = groups.filter((group) => asArray(group.artworks).some(slotHasArtwork));\n    if (!groupsWithArtwork.length) {\n      toast.error("Add artwork to at least one artwork group first.");\n      return;\n    }\n\n    setGeneratingVariations(true);\n    setVariationGenerationProgress({ completed: 0, total: variations.length * screens.length, label: "Starting…" });\n    try {\n      const records = await generateVariationMockups({\n        template,\n        variations,\n        artworkGroups: groups,\n        onProgress: ({ completed, total, variation, screen, skipped }) => {\n          setVariationGenerationProgress({\n            completed,\n            total,\n            label: `${getVariationLabel(variation)} · ${screenLabel(screen)}${skipped ? " · skipped" : ""}`,\n          });\n        },\n      });\n\n      if (!records.length) {\n        throw new Error("No variation mockups could be generated. Check that every selected variation resolves to an artwork group and the template has mockup views.");\n      }\n\n      const nextGroups = applyVariationMockupsToGroups(groups, records);\n      setGroups(nextGroups);\n      setVariationGenerationProgress({ completed: records.length, total: records.length, label: `${records.length} mockups generated` });\n      toast.success(`Generated ${records.length} variation mockup(s)`);\n    } catch (error) {\n      toast.error(error.message || "Could not generate variation mockups");\n    } finally {\n      setGeneratingVariations(false);\n    }\n  };\n\n'''
s = insert_once(s, marker, new_fn, 'variation generator function')
button_marker = '          <button type="button" className="btn-primary w-full mt-4" disabled={generating || !canGenerateMockup} onClick={generateMockup}'
button = '''          <button\n            type="button"\n            className="btn-primary w-full mt-4"\n            disabled={generatingVariations || generating || !variations.length}\n            onClick={generateAllVariationMockups}\n          >\n            <RefreshCw size={14} />\n            {generatingVariations\n              ? `Generating ${variationGenerationProgress.completed}/${variationGenerationProgress.total}…`\n              : "Generate Mockups For All Variations"}\n          </button>\n          {(generatingVariations || variationGenerationProgress.completed > 0) && (\n            <div className="mt-2 border border-white/10 bg-black/30 p-2 text-[10px] text-zinc-400">\n              <div className="flex items-center justify-between gap-2">\n                <span>{variationGenerationProgress.label || "Variation mockups ready"}</span>\n                <span>{variationGenerationProgress.completed}/{variationGenerationProgress.total}</span>\n              </div>\n              <div className="mt-2 h-1.5 rounded bg-white/10 overflow-hidden">\n                <div className="h-full bg-[#34C759] transition-all" style={{ width: `${variationGenerationProgress.total ? Math.min(100, (variationGenerationProgress.completed / variationGenerationProgress.total) * 100) : 0}%` }} />\n              </div>\n            </div>\n          )}\n\n'''
s = insert_once(s, button_marker, button, 'variation generator button')
p.write_text(s)

# Attach generated variation mockups to the actual ProductVariation records.
p = root / 'frontend/src/components/product-builder/ProductBuilder.jsx'
s = p.read_text()
s = insert_once(
    s,
    'import ProductArtworkStudio from "./ProductArtworkStudio";\n',
    'import { asArray as builderAsArray } from "./productBuilderUtils";\n',
    'ProductBuilder variation helper import',
)
old = '''    const variations = hasTemplateVariations\n      ? buildProductVariations(\n        selectedTemplate,\n        form.selected_template_variation_ids,\n        form.variation_price_overrides\n      )\n      : [buildStandardProductVariation(selectedTemplate)];\n'''
new = '''    const baseVariations = hasTemplateVariations\n      ? buildProductVariations(\n        selectedTemplate,\n        form.selected_template_variation_ids,\n        form.variation_price_overrides\n      )\n      : [buildStandardProductVariation(selectedTemplate)];\n    const generatedVariationMockups = form.artwork_groups.flatMap((group) =>\n      builderAsArray(group?.variation_mockups)\n        .map((mockup) => ({\n          ...mockup,\n          artwork_group_id: mockup.artwork_group_id || group.id,\n          artwork_group_label: mockup.artwork_group_label || group.label,\n        }))\n    );\n    const variations = baseVariations.map((variation) => {\n      const mockups = generatedVariationMockups.filter((mockup) =>\n        mockup.variation_id === variation.template_variation_id\n        || mockup.variation_id === variation.id\n      );\n      const primary = mockups.find((mockup) => mockup.image_url)?.image_url || "";\n      const artworkGroup = mockups.find((mockup) => mockup.artwork_group_id)?.artwork_group_id || null;\n      return {\n        ...variation,\n        artwork_group_id: artworkGroup,\n        generated_mockups: mockups,\n        primary_mockup_image_url: primary,\n      };\n    });\n'''
if old not in s:
    raise RuntimeError('ProductBuilder variation construction marker not found')
s = s.replace(old, new, 1)
p.write_text(s)

# Expose variation-specific mockups to the storefront gallery picker.
p = root / 'frontend/src/components/product-builder/productBuilderUtilsBase.js'
s = p.read_text()
needle = '''    asArray(group?.derived_mockup_images).forEach((mockup, mockupIndex) => {\n'''
insert = '''    asArray(group?.variation_mockups).forEach((mockup, mockupIndex) => {\n      addCandidate({\n        url: mockup?.image_url || mockup?.mockup_image_url || mockup?.url,\n        label: mockup?.variation_label\n          ? `${mockup.variation_label} · ${mockup.view_key || mockup.role || "Mockup"}`\n          : `Variation mockup ${mockupIndex + 1}`,\n        source: "Variation mockup",\n        role: mockup?.role || "variation_mockup",\n      });\n    });\n\n'''
s = insert_once(s, needle, insert, 'storefront variation mockups')
p.write_text(s)

# Preserve generated variation gallery data when ProductVariation is parsed by Pydantic.
p = root / 'backend/models.py'
s = p.read_text()
needle = '''    color: Optional[str] = ""\n\n\nclass ProductArtworkSnapshot'''
insert = '''    color: Optional[str] = ""\n    artwork_group_id: Optional[str] = None\n    primary_mockup_image_url: Optional[str] = None\n    generated_mockups: List[Dict[str, Any]] = Field(default_factory=list)\n\n\nclass ProductArtworkSnapshot'''
s = insert_once(s, needle, insert, 'ProductVariation schema')
p.write_text(s)

print('variation mockup integration patched successfully')
''