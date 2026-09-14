import {
  creatorCatalogueCard,
  creatorCatalogueCategories,
  creatorCatalogueColours,
  creatorCatalogueGallery,
  creatorCatalogueMatches,
  creatorCataloguePrintAreas,
  creatorCatalogueProductTypeLabel,
  creatorCatalogueSizes,
  creatorCatalogueSpecs,
  creatorCatalogueTemplates,
} from "./creatorCatalogue";

jest.mock("./templateReadiness", () => ({
  templateReadiness: jest.fn((template) => ({
    isLaunchReady: Boolean(template.launch_ready),
    blankCost: Number(template.blank_cost || 0),
    activeMethods: template.active_methods || [],
  })),
  templateImage: jest.fn((template) => template.primary_image || template.product_image_url || ""),
  activeTemplateGallery: jest.fn((template) => template.template_gallery || []),
  activeTemplateScreens: jest.fn((template) => template.mockup_screens || []),
}));

const productTypes = [
  { id: "type-shirt", name: "T-Shirts", slug: "t-shirts" },
  { id: "type-mug", name: "Drinkware", slug: "drinkware" },
];

const shirt = {
  id: "shirt-1",
  name: "Classic Creator Tee",
  brand: "Forge Basics",
  product_type_id: "type-shirt",
  launch_ready: true,
  blank_cost: 89.5,
  primary_image: "/uploads/tee-front.png",
  active_methods: [{ display_name: "DTF" }, { method_name: "HTV" }],
  variations: [
    { attributes: { Colour: "Black", Size: "S" }, colour_hex: "#111111", image_url: "/uploads/tee-black.png" },
    { attributes: { Colour: "Black", Size: "M" }, colour_hex: "#111111" },
    { attributes: { Colour: "White", Size: "M" }, colour_hex: "#ffffff" },
  ],
  print_areas: [
    { id: "front", label: "Front", width_mm: 300, height_mm: 400 },
    { id: "back", label: "Back", width_mm: 320, height_mm: 420 },
  ],
  specs: ["165gsm combed cotton", { label: "Fit", value: "Unisex" }],
  template_gallery: [
    { image_url: "/uploads/tee-front.png", role: "catalogue_thumbnail", sort_order: 1 },
    { image_url: "/uploads/tee-back.png", role: "back_mockup", sort_order: 2 },
  ],
  mockup_screens: [{ image_url: "/uploads/tee-back.png", name: "Back" }],
};

describe("creator catalogue helpers", () => {
  test("only exposes creator-visible launch-ready templates", () => {
    const templates = creatorCatalogueTemplates([
      shirt,
      { ...shirt, id: "draft", launch_ready: false },
      { ...shirt, id: "hidden", creator_visible: false },
    ]);

    expect(templates.map((template) => template.id)).toEqual(["shirt-1"]);
  });

  test("resolves creator-facing product type labels and categories", () => {
    expect(creatorCatalogueProductTypeLabel(shirt, productTypes)).toBe("T-Shirts");
    expect(creatorCatalogueCategories([shirt], productTypes)).toEqual(["T-Shirts"]);
  });

  test("searches product name, brand and category without exposing admin state", () => {
    expect(creatorCatalogueMatches(shirt, "creator", "all", productTypes)).toBe(true);
    expect(creatorCatalogueMatches(shirt, "forge basics", "all", productTypes)).toBe(true);
    expect(creatorCatalogueMatches(shirt, "", "T-Shirts", productTypes)).toBe(true);
    expect(creatorCatalogueMatches(shirt, "", "Drinkware", productTypes)).toBe(false);
  });

  test("builds a clean product card from template data", () => {
    const card = creatorCatalogueCard(shirt, [], productTypes);
    expect(card).toMatchObject({
      id: "shirt-1",
      name: "Classic Creator Tee",
      brand: "Forge Basics",
      category: "T-Shirts",
      image: "/uploads/tee-front.png",
      blankCost: 89.5,
    });
    expect(card.printMethods).toEqual(["DTF", "HTV"]);
  });

  test("deduplicates gallery images and extracts variants and print areas", () => {
    expect(creatorCatalogueGallery(shirt).map((row) => row.url)).toEqual([
      "/uploads/tee-front.png",
      "/uploads/tee-back.png",
      "/uploads/tee-black.png",
    ]);
    expect(creatorCatalogueColours(shirt).map((row) => row.name)).toEqual(["Black", "White"]);
    expect(creatorCatalogueSizes(shirt)).toEqual(["M", "S"]);
    expect(creatorCataloguePrintAreas(shirt)).toEqual(["Front", "Back"]);
  });

  test("normalises template specifications for product preview", () => {
    expect(creatorCatalogueSpecs(shirt)).toEqual([
      "165gsm combed cotton",
      "Fit: Unisex",
    ]);
  });
});
