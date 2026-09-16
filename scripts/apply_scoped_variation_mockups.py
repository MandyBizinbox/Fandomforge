from pathlib import Path
import runpy

ROOT = Path(__file__).resolve().parents[1]
PATCHER = ROOT / "scripts" / "apply_scoped_variation_mockup_workflow.py"

# Apply the main implementation first. It is intentionally idempotent.
runpy.run_path(str(PATCHER), run_name="__scoped_variation_patch__")

path = ROOT / "frontend/src/components/product-builder/ProductBuilder.jsx"
content = path.read_text(encoding="utf-8")
old = '''function getGeneratedMockups(groups) {\n  return flattenArtworkGroups(groups).map((slot) => slot.mockup_image_url).filter(Boolean);\n}'''
new = '''function getGeneratedMockups(groups) {\n  const slotMockups = flattenArtworkGroups(groups).map((slot) => slot.mockup_image_url).filter(Boolean);\n  const scopedMockups = asArray(groups)\n    .flatMap((group) => asArray(group.variation_mockups))\n    .map((mockup) => mockup?.image_url || mockup?.mockup_image_url || mockup?.url)\n    .filter(Boolean);\n  return [...new Set([...slotMockups, ...scopedMockups])];\n}'''
if new not in content:
    if old not in content:
        raise SystemExit("Expected getGeneratedMockups block not found")
    path.write_text(content.replace(old, new, 1), encoding="utf-8")

print("Scoped variation mockup implementation finalized")
