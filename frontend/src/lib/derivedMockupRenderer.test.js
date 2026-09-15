import { normaliseDerivedMockupProjection } from "./derivedMockupRenderer";
import { resolveArtworkMockupBox } from "../components/product-builder/productBuilderMockupGeometry";

describe("derived mockup projection", () => {
  test("uses distinct front and back source defaults", () => {
    const front = normaliseDerivedMockupProjection({}, "front_mockup");
    const back = normaliseDerivedMockupProjection({}, "back_mockup");

    expect(front.source_x_pct).toBe(0);
    expect(front.source_width_pct).toBe(50);
    expect(back.source_x_pct).toBe(50);
    expect(back.source_width_pct).toBe(50);
  });

  test("clamps unsafe projection values", () => {
    const projection = normaliseDerivedMockupProjection({
      source_x_pct: -20,
      source_width_pct: 180,
      target_x_pct: 140,
      target_width_pct: 0,
      opacity: 2,
      curve_strength: -1,
    });

    expect(projection.source_x_pct).toBe(0);
    expect(projection.source_width_pct).toBe(100);
    expect(projection.target_x_pct).toBe(100);
    expect(projection.target_width_pct).toBe(1);
    expect(projection.opacity).toBe(1);
    expect(projection.curve_strength).toBe(0);
  });
});

describe("Product Builder mockup artwork geometry parity", () => {
  const printArea = { width_mm: 330, height_mm: 320 };
  const renderArea = { width: 660, height: 500 };

  test("Case A: square locked artwork remains 1:1 even when preview height differs", () => {
    const box = resolveArtworkMockupBox({
      original_width_px: 1000,
      original_height_px: 1000,
      lock_aspect_ratio: true,
      placement: { x: 10, y: 12, width: 40, height: 73, rotation: 15 },
    }, printArea, renderArea);

    expect(box.width).toBeCloseTo(264, 5);
    expect(box.height).toBeCloseTo(264, 5);
    expect(box.width / box.height).toBeCloseTo(1, 6);
    expect(box.x).toBeCloseTo(66, 5);
    expect(box.y).toBeCloseTo(60, 5);
    expect(box.rotation).toBe(15);
  });

  test("Case B: near-square locked artwork preserves the live 0.970 aspect and physical footprint", () => {
    const widthPct = (103 / 330) * 100;
    const box = resolveArtworkMockupBox({
      original_width_px: 970,
      original_height_px: 1000,
      lock_aspect_ratio: true,
      placement: { x: 5, y: 7, width: widthPct, height: 80, rotation: 0 },
    }, printArea, renderArea);

    expect(box.artworkWidthMm).toBeCloseTo(103, 5);
    expect(box.artworkHeightMm).toBeCloseTo(103 / 0.97, 5);
    expect(box.width / box.height).toBeCloseTo(0.97, 6);
  });

  test("Case C: rectangular locked artwork remains 2:1", () => {
    const box = resolveArtworkMockupBox({
      original_width_px: 2000,
      original_height_px: 1000,
      lock_aspect_ratio: true,
      placement: { x: 0, y: 0, width: 50, height: 95, rotation: -8 },
    }, printArea, renderArea);

    expect(box.width).toBeCloseTo(330, 5);
    expect(box.height).toBeCloseTo(165, 5);
    expect(box.width / box.height).toBeCloseTo(2, 6);
    expect(box.rotation).toBe(-8);
  });

  test("Case D: unlocked artwork keeps independent width and height stretching", () => {
    const box = resolveArtworkMockupBox({
      original_width_px: 2000,
      original_height_px: 1000,
      lock_aspect_ratio: false,
      placement: { x: 10, y: 20, width: 25, height: 75, rotation: 3 },
    }, printArea, { width: 600, height: 400 });

    expect(box.aspectLocked).toBe(false);
    expect(box.width).toBeCloseTo(150, 5);
    expect(box.height).toBeCloseTo(300, 5);
    expect(box.width / box.height).toBeCloseTo(0.5, 6);
    expect(box.x).toBeCloseTo(60, 5);
    expect(box.y).toBeCloseTo(80, 5);
    expect(box.rotation).toBe(3);
  });

  test("Case E: live 0.773 studio artwork remains undistorted when render-area aspect differs", () => {
    const box = resolveArtworkMockupBox({
      original_width_px: 773,
      original_height_px: 1000,
      lock_aspect_ratio: true,
      placement: { x: 28, y: 19, width: 36.5, height: 32.2, rotation: 0 },
    }, { width_mm: 330, height_mm: 320 }, { width: 254, height: 500 });

    expect(box.artworkWidthMm).toBeCloseTo(120.45, 2);
    expect(box.artworkHeightMm).toBeCloseTo(120.45 / 0.773, 2);
    expect(box.width).toBeCloseTo(92.71, 2);
    expect(box.width / box.height).toBeCloseTo(0.773, 6);

    // The old studio compositor would independently use 32.2% of
    // the 500px render height (~161px), shrinking the aspect to
    // roughly 0.576. Locked geometry must ignore that preview-only
    // height scale and derive render height from intrinsic aspect.
    expect(box.height).toBeCloseTo(box.width / 0.773, 5);
  });
});
