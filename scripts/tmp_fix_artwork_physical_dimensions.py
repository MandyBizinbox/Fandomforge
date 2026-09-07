from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
UTILS = ROOT / "frontend/src/components/product-builder/productBuilderUtils.js"
STUDIO = ROOT / "frontend/src/components/product-builder/ProductArtworkStudio.jsx"
TEST = ROOT / "frontend/src/components/product-builder/outsourcedProductionPricing.test.js"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


utils = UTILS.read_text()
helper_marker = "export function calculateAreaPrintCost(slot = {}, area = {}, option = {}) {"
helper = '''export function resolveArtworkPhysicalDimensions(slot = {}, area = {}, option = {}) {
  const placement = slot.placement || {};
  const areaWidthMm = safeNumber(
    area.width_mm
    || slot.print_area_width_mm
    || slot.width_mm
    || option.width_mm
    || 0
  );
  const areaHeightMm = safeNumber(
    area.height_mm
    || slot.print_area_height_mm
    || slot.height_mm
    || option.height_mm
    || 0
  );
  const placementWidthPct = safeNumber(
    placement.width ?? placement.width_pct ?? 100,
    100
  );
  const placementHeightPct = safeNumber(
    placement.height ?? placement.height_pct ?? 100,
    100
  );
  const placementBoxWidthMm = areaWidthMm * (placementWidthPct / 100);
  const placementBoxHeightMm = areaHeightMm * (placementHeightPct / 100);

  const artworkWidthPx = safeNumber(
    slot.original_width_px
    || slot.artwork_width_px
    || 0
  );
  const artworkHeightPx = safeNumber(
    slot.original_height_px
    || slot.artwork_height_px
    || 0
  );
  const aspectRatio = artworkWidthPx > 0 && artworkHeightPx > 0
    ? artworkWidthPx / artworkHeightPx
    : safeNumber(slot.artwork_aspect_ratio || 0);
  const aspectLocked = slot.lock_aspect_ratio !== false && aspectRatio > 0;

  // Placement width is the canonical scale for aspect-locked artwork. The
  // studio derives placement height from the on-screen print-area rectangle
  // solely so the preview preserves the source image's visual aspect ratio.
  // That preview height percentage is therefore not a physical-height scale.
  let artworkWidthMm = placementBoxWidthMm;
  let artworkHeightMm = placementBoxHeightMm;
  if (aspectLocked) {
    artworkWidthMm = placementBoxWidthMm;
    artworkHeightMm = artworkWidthMm / aspectRatio;

    // A locked artwork can never physically exceed the print area's height.
    // Reduce both dimensions together instead of stretching the source.
    if (areaHeightMm > 0 && artworkHeightMm > areaHeightMm) {
      artworkHeightMm = areaHeightMm;
      artworkWidthMm = artworkHeightMm * aspectRatio;
    }
  }

  return {
    areaWidthMm,
    areaHeightMm,
    placementWidthPct,
    placementHeightPct,
    placementBoxWidthMm,
    placementBoxHeightMm,
    artworkWidthMm,
    artworkHeightMm,
    aspectRatio,
    aspectLocked,
  };
}

'''
utils = replace_once(utils, helper_marker, helper + helper_marker, "insert physical-dimension helper")
old_dimension_block = '''  const placement = slot.placement || {};
  const areaWidthMm = safeNumber(
    area.width_mm
    || slot.print_area_width_mm
    || slot.width_mm
    || option.width_mm
    || 0
  );
  const areaHeightMm = safeNumber(
    area.height_mm
    || slot.print_area_height_mm
    || slot.height_mm
    || option.height_mm
    || 0
  );
  const placementWidthPct = safeNumber(
    placement.width ?? placement.width_pct ?? 100,
    100
  );
  const placementHeightPct = safeNumber(
    placement.height ?? placement.height_pct ?? 100,
    100
  );
  const printWidthMm = areaWidthMm * (placementWidthPct / 100);
  const printHeightMm = areaHeightMm * (placementHeightPct / 100);
  const placementAreaCm2 = Math.max(
    0,
    (printWidthMm / 10) * (printHeightMm / 10)
  );
  const explicitCombinedAreaCm2 = safeNumber(slot.combined_area_cm2 || 0);
  const actualAreaCm2 = explicitCombinedAreaCm2 > 0
    ? explicitCombinedAreaCm2
    : placementAreaCm2;

  const artworkWidthPx = safeNumber(
    slot.original_width_px
    || slot.artwork_width_px
    || 0
  );
  const artworkHeightPx = safeNumber(
    slot.original_height_px
    || slot.artwork_height_px
    || 0
  );
  const aspectRatio = artworkWidthPx > 0 && artworkHeightPx > 0
    ? artworkWidthPx / artworkHeightPx
    : safeNumber(slot.artwork_aspect_ratio || 0);
'''
new_dimension_block = '''  const physicalDimensions = resolveArtworkPhysicalDimensions(slot, area, option);
  const {
    areaWidthMm,
    areaHeightMm,
    placementBoxWidthMm,
    placementBoxHeightMm,
    artworkWidthMm: printWidthMm,
    artworkHeightMm: printHeightMm,
    aspectRatio,
  } = physicalDimensions;
  const placementAreaCm2 = Math.max(
    0,
    (printWidthMm / 10) * (printHeightMm / 10)
  );
  const explicitCombinedAreaCm2 = safeNumber(slot.combined_area_cm2 || 0);
  const actualAreaCm2 = explicitCombinedAreaCm2 > 0
    ? explicitCombinedAreaCm2
    : placementAreaCm2;
'''
utils = replace_once(utils, old_dimension_block, new_dimension_block, "replace print dimension calculation")
utils = replace_once(
    utils,
    "    placement_box_width_mm: roundMm(printWidthMm),\n    placement_box_height_mm: roundMm(printHeightMm),",
    "    placement_box_width_mm: roundMm(placementBoxWidthMm),\n    placement_box_height_mm: roundMm(placementBoxHeightMm),",
    "preserve visual placement-box metadata",
)
UTILS.write_text(utils)

studio = STUDIO.read_text()
studio = replace_once(
    studio,
    '  normalizeProductionMethodKey,\n} from "./productBuilderUtils";',
    '  normalizeProductionMethodKey,\n  resolveArtworkPhysicalDimensions,\n} from "./productBuilderUtils";',
    "import physical dimension helper",
)
pattern = re.compile(r'function calculateArtworkPrintSize\(area, placement\) \{.*?\n\}\n\nfunction profilePatchForSlot', re.S)
match = pattern.search(studio)
if not match:
    raise SystemExit("calculateArtworkPrintSize: function block not found")
new_size_function = '''function calculateArtworkPrintSize(area, placement, slot = {}) {
  const physical = resolveArtworkPhysicalDimensions({ ...slot, placement }, area);
  const areaWidthMm = physical.areaWidthMm;
  const areaHeightMm = physical.areaHeightMm;
  const widthPct = physical.placementWidthPct;
  const heightPct = physical.placementHeightPct;
  const widthMm = physical.artworkWidthMm;
  const heightMm = physical.artworkHeightMm;
  if (!areaWidthMm || !areaHeightMm || !widthMm || !heightMm) {
    return { valid: false, widthPct, heightPct, areaWidthMm, areaHeightMm };
  }
  const areaCm2 = (widthMm / 10) * (heightMm / 10);
  if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm) || !Number.isFinite(areaCm2) || areaCm2 <= 0) {
    return { valid: false, widthPct, heightPct, areaWidthMm, areaHeightMm };
  }
  return {
    valid: true,
    widthMm: round(widthMm),
    heightMm: round(heightMm),
    widthCm: Math.round((widthMm / 10) * 10) / 10,
    heightCm: Math.round((heightMm / 10) * 10) / 10,
    areaCm2: Math.round(areaCm2 * 10) / 10,
    areaWidthMm,
    areaHeightMm,
    areaWidthCm: Math.round((areaWidthMm / 10) * 10) / 10,
    areaHeightCm: Math.round((areaHeightMm / 10) * 10) / 10,
    widthPct: round(widthPct),
    heightPct: round(heightPct),
    aspectRatio: physical.aspectRatio,
    aspectLocked: physical.aspectLocked,
  };
}

function profilePatchForSlot'''
studio = studio[:match.start()] + new_size_function + studio[match.end():]
studio = replace_once(
    studio,
    "function ArtworkPrintSizeBlock({ area, placement }) {\n  const size = calculateArtworkPrintSize(area, placement);",
    "function ArtworkPrintSizeBlock({ area, placement, slot }) {\n  const size = calculateArtworkPrintSize(area, placement, slot);",
    "pass artwork metadata into size block",
)
studio = replace_once(
    studio,
    '          <div className="text-zinc-500">Layer: {size.widthPct.toFixed(1)}% × {size.heightPct.toFixed(1)}%</div>',
    '          <div className="text-zinc-500">{size.aspectLocked ? `Scale: ${size.widthPct.toFixed(1)}% of print-area width · Aspect ${size.aspectRatio.toFixed(3)}:1` : `Layer: ${size.widthPct.toFixed(1)}% × ${size.heightPct.toFixed(1)}%`}</div>',
    "explain aspect-locked scale",
)
studio = replace_once(
    studio,
    "<ArtworkPrintSizeBlock area={activeArea} placement={activePlacement} />",
    "<ArtworkPrintSizeBlock area={activeArea} placement={activePlacement} slot={activeSlot} />",
    "supply active slot to size block",
)
STUDIO.write_text(studio)

test = TEST.read_text()
anchor = '''  test("uses the 100 cm² minimum rather than a monetary minimum", () => {
'''
regression = '''  test("keeps aspect-locked square artwork physically square when preview geometry is non-square", () => {
    const result = calculateAreaPrintCost(
      {
        ...layer("square-artwork"),
        original_width_px: 1000,
        original_height_px: 1000,
        artwork_aspect_ratio: 1,
        lock_aspect_ratio: true,
        placement: {
          x: 10,
          y: 10,
          width: 72.9,
          height: 49.5,
        },
      },
      {
        id: "front-shirt-area",
        screen_id: "front-screen",
        width_mm: 330,
        height_mm: 320,
      },
      standardDtf
    );

    expect(result.placement_box_width_mm).toBe(240.6);
    expect(result.placement_box_height_mm).toBe(158.4);
    expect(result.artwork_width_mm).toBe(240.6);
    expect(result.artwork_height_mm).toBe(240.6);
    expect(result.print_width_mm).toBe(240.6);
    expect(result.print_height_mm).toBe(240.6);
    expect(result.area_cm2).toBe(578.74);
  });

'''
test = replace_once(test, anchor, regression + anchor, "add square artwork regression")
TEST.write_text(test)

print("Artwork physical dimension fix applied")
