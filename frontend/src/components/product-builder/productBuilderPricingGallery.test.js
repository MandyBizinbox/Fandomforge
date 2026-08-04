import {
  calculatePricing,
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
