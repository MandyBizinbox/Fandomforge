from pathlib import Path

p = Path('frontend/src/components/product-builder/variationMockupGeneration.js')
s = p.read_text()
s = s.replace('import { assetUrl } from "../../lib/api";', 'import { http, assetUrl } from "../../lib/api";', 1)
old = '''      const response = await fetch("/api/files/image", { method: "POST", body: form });
      if (!response.ok) throw new Error(`Mockup upload failed for ${getVariationLabel(variation)}.`);
      const payload = await response.json();
      records.push(variationMockupRecord(variation, screen, payload.url, group));'''
new = '''      const response = await http.post("/files/image", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      records.push(variationMockupRecord(variation, screen, response.data.url, group));'''
if old not in s:
    raise RuntimeError('variation mockup upload marker not found')
s = s.replace(old, new, 1)
p.write_text(s)

p = Path('backend/models.py')
s = p.read_text()
s = s.replace('class ProductArtworkSnapshot    color: Optional[str] = ""\n\n\nclass ProductArtworkSnapshot(BaseModel):', 'class ProductArtworkSnapshot(BaseModel):', 1)
needle = '''    primary_mockup_image_url: Optional[str] = None
    derived_mockup_images: List[Dict[str, Any]] = Field(default_factory=list)
    sort_order: int = 0'''
replacement = '''    primary_mockup_image_url: Optional[str] = None
    variation_mockups: List[Dict[str, Any]] = Field(default_factory=list)
    derived_mockup_images: List[Dict[str, Any]] = Field(default_factory=list)
    sort_order: int = 0'''
if needle not in s:
    raise RuntimeError('ProductArtworkGroup marker not found')
s = s.replace(needle, replacement, 1)
p.write_text(s)
