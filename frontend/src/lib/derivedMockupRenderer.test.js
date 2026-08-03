import { normaliseDerivedMockupProjection } from "./derivedMockupRenderer";

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
