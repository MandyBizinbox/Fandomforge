from pathlib import Path


def insert_once(text, needle, insertion, label):
    if insertion.strip() in text:
        return text
    idx = text.find(needle)
    if idx < 0:
        raise RuntimeError(f"{label}: marker not found")
    return text[:idx] + insertion + text[idx:]

p = Path('frontend/src/components/product-builder/ProductArtworkStudio.jsx')
s = p.read_text()
s = insert_once(s, 'import { renderDerivedMockupCanvas } from "../../lib/derivedMockupRenderer";\n', 'import { generateVariationMockups, applyVariationMockupsToGroups } from "./variationMockupGeneration";\n', 'studio import')
s = s.replace('  getGroupRepresentativeVariationId,\n', '  getGroupRepresentativeVariationId,\n  getVariationLabel,\n', 1)
s = insert_once(s, '  const [generating, setGenerating] = useState(false);\n', '  const [generatingVariations, setGeneratingVariations] = useState(false);\n  const [variationGenerationProgress, setVariationGenerationProgress] = useState({ completed: 0, total: 0, label: "" });\n', 'studio state')
marker = '  const selectView = (screenId) => {\n'
fn = '''  const generateAllVariationMockups = async () => {\n    if (!variations.length) { toast.error("Select at least one variation first."); return; }\n    if (!groups.some((group) => asArray(group.artworks).some(slotHasArtwork))) { toast.error("Add artwork to at least one artwork group first."); return; }\n    setGeneratingVariations(true);\n    setVariationGenerationProgress({ completed: 0, total: variations.length * screens.length, label: "Starting…" });\n    try {\n      const records = await generateVariationMockups({\n        template, variations, artworkGroups: groups,\n        onProgress: ({ completed, total, variation, screen, skipped }) => setVariationGenerationProgress({ completed, total, label: `${getVariationLabel(variation)} · ${screenLabel(screen)}${skipped ? " · skipped" : ""}` }),\n      });\n      if (!records.length) throw new Error("No variation mockups could be generated. Check artwork groups and template mockup views.");\n      setGroups(applyVariationMockupsToGroups(groups, records));\n      setVariationGenerationProgress({ completed: records.length, total: records.length, label: `${records.length} mockups generated` });\n      toast.success(`Generated ${records.length} variation mockup(s)`);\n    } catch (error) { toast.error(error.message || "Could not generate variation mockups"); }\n    finally { setGeneratingVariations(false); }\n  };\n\n'''
s = insert_once(s, marker, fn, 'studio generator')
button_marker = '          <button type="button" className="btn-primary w-full mt-4" disabled={generating || !canGenerateMockup} onClick={generateMockup}'
button = '''          <button type="button" className="btn-primary w-full mt-4" disabled={generatingVariations || generating || !variations.length} onClick={generateAllVariationMockups}>\n            <RefreshCw size={14} />\n            {generatingVariations ? `Generating ${variationGenerationProgress.completed}/${variationGenerationProgress.total}…` : "Generate Mockups For All Variations"}\n          </button>\n          {(generatingVariations || variationGenerationProgress.completed > 0) && (\n            <div className="mt-2 border border-white/10 bg-black/30 p-2 text-[10px] text-zinc-400">\n              <div className="flex items-center justify-between gap-2"><span>{variationGenerationProgress.label || "Variation mockups ready"}</span><span>{variationGenerationProgress.completed}/{variationGenerationProgress.total}</span></div>\n              <div className="mt-2 h-1.5 rounded bg-white/10 overflow-hidden"><div className="h-full bg-[#34C759] transition-all" style={{ width: `${variationGenerationProgress.total ? Math.min(100, (variationGenerationProgress.completed / variationGenerationProgress.total) * 100) : 0}%` }} /></div>\n            </div>\n          )}\n\n'''
s = insert_once(s, button_marker, button, 'studio button')
p.write_text(s)

p = Path('frontend/src/components/product-builder/ProductBuilder.jsx')
s = p.read_text()
s = insert_once(s, 'import ProductArtworkStudio from "./ProductArtworkStudio";\n', 'import { asArray as builderAsArray } from "./productBuilderUtils";\n', 'builder import')
old = '''    const variations = hasTemplateVariations\n      ? buildProductVariations(\n        selectedTemplate,\n        form.selected_template_variation_ids,\n        form.variation_price_overrides\n      )\n      : [buildStandardProductVariation(selectedTemplate)];\n'''
new = '''    const baseVariations = hasTemplateVariations\n      ? buildProductVariations(selectedTemplate, form.selected_template_variation_ids, form.variation_price_overrides)\n      : [buildStandardProductVariation(selectedTemplate)];\n    const generatedVariationMockups = form.artwork_groups.flatMap((group) => builderAsArray(group?.variation_mockups).map((mockup) => ({ ...mockup, artwork_group_id: mockup.artwork_group_id || group.id, artwork_group_label: mockup.artwork_group_label || group.label })));\n    const variations = baseVariations.map((variation) => {\n      const mockups = generatedVariationMockups.filter((mockup) => mockup.variation_id === variation.template_variation_id || mockup.variation_id === variation.id);\n      return { ...variation, artwork_group_id: mockups.find((mockup) => mockup.artwork_group_id)?.artwork_group_id || null, generated_mockups: mockups, primary_mockup_image_url: mockups.find((mockup) => mockup.image_url)?.image_url || "" };\n    });\n'''
if old not in s: raise RuntimeError('builder variation marker missing')
s = s.replace(old, new, 1)
p.write_text(s)

p = Path('frontend/src/components/product-builder/productBuilderUtilsBase.js')
s = p.read_text()
needle = '    asArray(group?.derived_mockup_images).forEach((mockup, mockupIndex) => {\n'
insert = '''    asArray(group?.variation_mockups).forEach((mockup, mockupIndex) => {\n      addCandidate({ url: mockup?.image_url || mockup?.mockup_image_url || mockup?.url, label: mockup?.variation_label ? `${mockup.variation_label} · ${mockup.view_key || mockup.role || "Mockup"}` : `Variation mockup ${mockupIndex + 1}`, source: "Variation mockup", role: mockup?.role || "variation_mockup" });\n    });\n\n'''
s = insert_once(s, needle, insert, 'gallery candidates')
p.write_text(s)

p = Path('frontend/src/components/product-builder/variationMockupGeneration.js')
s = p.read_text()
s = s.replace('import { assetUrl } from "../../lib/api";', 'import { http, assetUrl } from "../../lib/api";', 1)
old = '''      const response = await fetch("/api/files/image", { method: "POST", body: form });\n      if (!response.ok) throw new Error(`Mockup upload failed for ${getVariationLabel(variation)}.`);\n      const payload = await response.json();\n      records.push(variationMockupRecord(variation, screen, payload.url, group));'''
new = '''      const response = await http.post("/files/image", form, { headers: { "Content-Type": "multipart/form-data" } });\n      records.push(variationMockupRecord(variation, screen, response.data.url, group));'''
if old in s: s = s.replace(old, new, 1)
p.write_text(s)

p = Path('backend/models.py')
s = p.read_text()
s = s.replace('class ProductArtworkSnapshot    color: Optional[str] = ""\n\n\nclass ProductArtworkSnapshot(BaseModel):', 'class ProductArtworkSnapshot(BaseModel):', 1)
if '    variation_mockups: List[Dict[str, Any]] = Field(default_factory=list)\n' not in s:
    needle = '    primary_mockup_image_url: Optional[str] = None\n    derived_mockup_images: List[Dict[str, Any]] = Field(default_factory=list)\n'
    s = s.replace(needle, '    primary_mockup_image_url: Optional[str] = None\n    variation_mockups: List[Dict[str, Any]] = Field(default_factory=list)\n    derived_mockup_images: List[Dict[str, Any]] = Field(default_factory=list)\n', 1)
p.write_text(s)
