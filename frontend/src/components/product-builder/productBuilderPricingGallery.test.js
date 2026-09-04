import {
  calculatePricing,
  getAggregatedPrintCostLines,
  getProductBuilderStorefrontGalleryCandidates,
} from "./productBuilderUtils";
import {
  getProductGalleryImages,
} from "../product/productDisplayUtils";


describe("production-cost platform fee pricing", () => {
  test("charges 15 percent on blank plus printing", () => {
    const pricing = calculatePricing({
      sellingPrice: 50,
      blankCost: 22,
      printCost: 10,
      commissionRate: 0.15,
    });

    expect(pricing.productionSubtotal).toBe(32);
    expect(pricing.commission).toBe(4.8);
    expect(pricing.production).toBe(36.8);
    expect(pricing.minimumSellingPrice).toBe(36.8);
    expect(pricing.profit).toBe(13.2);
  });

  test("platform fee remains fixed when retail price changes", () => {
    const lowRetail = calculatePricing({
      sellingPrice: 40,
      blankCost: 22,
      printCost: 10,
      commissionRate: 0.15,
    });
    const highRetail = calculatePricing({
      sellingPrice: 100,
      blankCost: 22,
      printCost: 10,
      commissionRate: 0.15,
    });

    expect(lowRetail.commission).toBe(4.8);
    expect(highRetail.commission).toBe(4.8);
    expect(highRetail.profit - lowRetail.profit).toBe(60);
  });
});


describe("creator storefront gallery selection", () => {
  test("combines storefront template images and generated mockups", () => {
    const candidates = getProductBuilderStorefrontGalleryCandidates(
      {
        template_gallery: [
          {
            image_url: "/template-front.png",
            name: "Template front",
            role: "front_mockup",
            status: "active",
          },
          {
            image_url: "/editor.png",
            name: "Editor",
            role: "editor_background",
            status: "active",
          },
        ],
      },
      [
        {
          label: "Default artwork",
          primary_mockup_image_url: "/generated.png",
          artworks: [
            { mockup_image_url: "/generated.png" },
          ],
          derived_mockup_images: [
            {
              image_url: "/angled.png",
              name: "Angled",
              role: "angled_mockup",
            },
          ],
        },
      ]
    );

    expect(candidates.map((row) => row.url)).toEqual([
      "/template-front.png",
      "/generated.png",
      "/angled.png",
    ]);
  });

  test("public gallery respects explicit creator selection", () => {
    const images = getProductGalleryImages({
      primary_mockup_image_url: "/selected-b.png",
      mockup_images: [
        "/selected-a.png",
        "/selected-b.png",
      ],
      artwork_groups: [
        {
          scope_type: "all",
          primary_mockup_image_url: "/not-selected.png",
          artworks: [],
        },
      ],
    });

    expect(images).toEqual([
      "/selected-b.png",
      "/selected-a.png",
    ]);
    expect(images).not.toContain("/not-selected.png");
  });
});

describe("combined same-method print-job pricing", () => {
  const area = {
    id: "front-area",
    screen_id: "front-screen",
    width_mm: 500,
    height_mm: 700,
  };

  const dtf = {
    id: "dtf-transfer",
    method_key: "dtf",
    calculation_type: "area_fixed_rate",
    cost_per_cm2: 0.06,
    minimum_print_cost: 50,
  };

  const layer = (id, patch = {}) => ({
    id,
    artwork_group_id: "default-all",
    screen_id: "front-screen",
    print_area_id: "front-area",
    print_option_id: "dtf-transfer",
    original_url: `/${id}.png`,
    placement: {
      x: 10,
      y: 10,
      width: 50,
      height: 50,
      rotation: 0,
    },
    ...patch,
  });

  test("sums overlapping layer areas instead of charging a bounding box", () => {
    const lines = getAggregatedPrintCostLines(
      [{ id: "default-all", artworks: [layer("first"), layer("second")] }],
      [dtf],
      { print_areas: [area] }
    );

    expect(lines).toHaveLength(1);
    expect(lines[0].combined).toBe(true);
    expect(lines[0].layer_count).toBe(2);
    expect(lines[0].combined_area_cm2).toBe(1750);
    expect(lines[0].cost).toBe(105);
  });

  test("applies the print minimum once to the combined job", () => {
    const smallLayer = (id) => layer(id, {
      placement: { x: 10, y: 10, width: 10, height: 10, rotation: 0 },
    });

    const lines = getAggregatedPrintCostLines(
      [{ id: "default-all", artworks: [smallLayer("first-small"), smallLayer("second-small")] }],
      [dtf],
      { print_areas: [area] }
    );

    expect(lines).toHaveLength(1);
    expect(lines[0].combined_area_cm2).toBe(70);
    expect(lines[0].cost).toBe(50);
    expect(lines[0].costing.minimum_print_cost_applied).toBe(true);
  });

  test("keeps different profiles as separate production jobs", () => {
    const premium = { ...dtf, id: "dtf-premium", cost_per_cm2: 0.08 };
    const lines = getAggregatedPrintCostLines(
      [{
        id: "default-all",
        artworks: [
          layer("standard"),
          layer("premium", { print_option_id: "dtf-premium" }),
        ],
      }],
      [dtf, premium],
      { print_areas: [area] }
    );

    expect(lines).toHaveLength(2);
    expect(lines.every((line) => line.combined === false)).toBe(true);
  });
});
