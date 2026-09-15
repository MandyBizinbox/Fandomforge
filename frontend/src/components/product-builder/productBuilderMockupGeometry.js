import { resolveArtworkPhysicalDimensions } from "./productBuilderUtils";

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Convert a saved Product Builder artwork placement into render-space pixels.
 *
 * Position remains percentage-based because x/y describe the visual placement
 * inside the template print-area overlay. Dimensions are different: when the
 * artwork is aspect locked, placement.height is only a preview-box percentage
 * and must not become an independent render scale. The canonical physical
 * resolver owns locked width/height semantics; one pixels-per-mm scale then
 * preserves that resolved aspect in the composed mockup.
 */
export function resolveArtworkMockupBox(slot = {}, area = {}, renderArea = {}) {
  const placement = slot?.placement || {};
  const renderWidth = Math.max(0, finiteNumber(renderArea.width));
  const renderHeight = Math.max(0, finiteNumber(renderArea.height));
  const physical = resolveArtworkPhysicalDimensions(slot, area);

  const x = finiteNumber(placement.x, 0) / 100 * renderWidth;
  const y = finiteNumber(placement.y, 0) / 100 * renderHeight;
  let width = physical.placementWidthPct / 100 * renderWidth;
  let height = physical.placementHeightPct / 100 * renderHeight;

  if (physical.aspectLocked && physical.aspectRatio > 0 && width > 0) {
    if (
      physical.areaWidthMm > 0
      && physical.artworkWidthMm > 0
      && physical.artworkHeightMm > 0
      && renderWidth > 0
    ) {
      const pixelsPerMm = renderWidth / physical.areaWidthMm;
      width = physical.artworkWidthMm * pixelsPerMm;
      height = physical.artworkHeightMm * pixelsPerMm;
    } else {
      // Legacy templates without physical print-area dimensions still preserve
      // the intrinsic artwork aspect instead of trusting preview-box height.
      height = width / physical.aspectRatio;
      if (renderHeight > 0 && height > renderHeight) {
        const scale = renderHeight / height;
        width *= scale;
        height = renderHeight;
      }
    }
  }

  return {
    ...physical,
    x,
    y,
    width,
    height,
    rotation: finiteNumber(placement.rotation, 0),
  };
}
