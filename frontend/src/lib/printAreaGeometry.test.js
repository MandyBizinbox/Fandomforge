import {
  normalisePrintAreaGeometry,
  printAreaChargedAreaCm2,
} from "./printAreaGeometry";

describe("print area geometry", () => {
  test("normalises round aliases to circle", () => {
    expect(normalisePrintAreaGeometry({ shape: "round" }).geometry_type).toBe("circle");
  });

  test("uses bounding-box area by default", () => {
    expect(
      printAreaChargedAreaCm2({
        geometry_type: "circle",
        width_mm: 100,
        height_mm: 100,
      })
    ).toBeCloseTo(100, 5);
  });

  test("can price the actual circle area explicitly", () => {
    expect(
      printAreaChargedAreaCm2({
        geometry_type: "circle",
        pricing_area_mode: "shape",
        width_mm: 100,
        height_mm: 100,
      })
    ).toBeCloseTo(Math.PI * 25, 5);
  });
});
