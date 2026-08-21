import {
  PRODUCTION_CONFIG_KEY,
  applyProductionConfigurationToVariations,
  attributeProfileKey,
  compileVariableTemplateProduction,
  getVariationProductionConfiguration,
  initialiseAttributeProductionProfiles,
  productionConfigurationComplete,
  resolveVariationProductionConfiguration,
  setVariationProductionConfiguration,
} from "./variationProductionConfig";

function productionConfig({ shape = "circle", width = 100, viewImage = "/image.png" } = {}) {
  return {
    screens: [
      {
        id: "screen-front",
        name: "Front",
        view: "front",
        view_key: "front",
        image_url: viewImage,
        status: "active",
      },
    ],
    print_areas: [
      {
        id: "area-front",
        name: "Front print",
        screen_id: "screen-front",
        view_key: "front",
        screen_view: "front",
        area_key: "front",
        geometry_type: shape,
        x: 10,
        y: 10,
        width: 80,
        height: 80,
        x_pct: 10,
        y_pct: 10,
        width_pct: 80,
        height_pct: 80,
        width_mm: width,
        height_mm: width,
        allowed_print_option_ids: ["sublimation-flat"],
        status: "active",
      },
    ],
    print_option_ids: ["sublimation-flat"],
    print_options: [{ id: "sublimation-flat", print_method: "Sublimation" }],
  };
}

describe("variation production configuration", () => {
  test("copies a complete independent configuration into every variation", () => {
    const variations = [
      { id: "circle", attributes: { Shape: "Circle" }, print_area_overrides: {} },
      { id: "square", attributes: { Shape: "Square" }, print_area_overrides: {} },
    ];

    const copied = applyProductionConfigurationToVariations(variations, productionConfig());

    expect(copied).toHaveLength(2);
    expect(copied[0].print_area_overrides[PRODUCTION_CONFIG_KEY]).toBeTruthy();
    expect(copied[1].print_area_overrides[PRODUCTION_CONFIG_KEY]).toBeTruthy();
    expect(productionConfigurationComplete(getVariationProductionConfiguration(copied[0], {}))).toBe(true);
    expect(productionConfigurationComplete(getVariationProductionConfiguration(copied[1], {}))).toBe(true);

    copied[0].print_area_overrides[PRODUCTION_CONFIG_KEY].print_areas[0].width_mm = 77;
    expect(copied[1].print_area_overrides[PRODUCTION_CONFIG_KEY].print_areas[0].width_mm).toBe(100);
  });

  test("compiles runtime anchors while keeping each variation configuration complete", () => {
    const circle = setVariationProductionConfiguration(
      { id: "circle", attributes: { Shape: "Circle" }, enabled: true },
      productionConfig({ shape: "circle", width: 100, viewImage: "/circle.png" })
    );
    const square = setVariationProductionConfiguration(
      { id: "square", attributes: { Shape: "Square" }, enabled: true },
      productionConfig({ shape: "rectangle", width: 95, viewImage: "/square.png" })
    );

    const compiled = compileVariableTemplateProduction(
      { product_image_url: "/fallback.png", variations: [circle, square] },
      [circle, square]
    );

    expect(compiled.mockup_screens).toHaveLength(1);
    expect(compiled.print_areas).toHaveLength(1);
    expect(compiled.variations).toHaveLength(2);

    const anchorAreaId = compiled.print_areas[0].id;
    const anchorScreenId = compiled.mockup_screens[0].id;
    const compiledCircle = compiled.variations.find((variation) => variation.id === "circle");
    const compiledSquare = compiled.variations.find((variation) => variation.id === "square");
    const circleConfig = getVariationProductionConfiguration(compiledCircle, compiled);
    const squareConfig = getVariationProductionConfiguration(compiledSquare, compiled);

    expect(compiledCircle.mockup_screen_overrides[anchorScreenId]).toBe("/circle.png");
    expect(compiledSquare.mockup_screen_overrides[anchorScreenId]).toBe("/square.png");
    expect(compiledCircle.print_area_overrides[anchorAreaId].geometry_type).toBe("circle");
    expect(compiledSquare.print_area_overrides[anchorAreaId].geometry_type).toBe("rectangle");

    expect(circleConfig.screens[0].id).toBe(anchorScreenId);
    expect(squareConfig.screens[0].id).toBe(anchorScreenId);
    expect(circleConfig.print_areas[0].id).toBe(anchorAreaId);
    expect(squareConfig.print_areas[0].id).toBe(anchorAreaId);
    expect(circleConfig.print_areas[0].screen_id).toBe(anchorScreenId);
    expect(squareConfig.print_areas[0].screen_id).toBe(anchorScreenId);
    expect(circleConfig.print_areas[0].geometry_type).toBe("circle");
    expect(squareConfig.print_areas[0].geometry_type).toBe("rectangle");
    expect(productionConfigurationComplete(circleConfig)).toBe(true);
    expect(productionConfigurationComplete(squareConfig)).toBe(true);
  });

  test("preserves different area counts with hidden compatibility placeholders only outside the owned config", () => {
    const oneArea = productionConfig();
    const twoAreas = productionConfig({ shape: "rectangle", viewImage: "/two.png" });
    twoAreas.print_areas.push({
      ...twoAreas.print_areas[0],
      id: "area-back",
      name: "Back print",
      area_key: "back",
      view_key: "back",
      screen_view: "back",
    });

    const first = setVariationProductionConfiguration({ id: "one", enabled: true }, oneArea);
    const second = setVariationProductionConfiguration({ id: "two", enabled: true }, twoAreas);
    const compiled = compileVariableTemplateProduction({ variations: [first, second] }, [first, second]);

    expect(compiled.print_areas).toHaveLength(2);
    const firstCompiled = compiled.variations.find((variation) => variation.id === "one");
    const placeholder = Object.values(firstCompiled.print_area_overrides)
      .find((area) => area && area.disabled === true);
    const firstConfig = getVariationProductionConfiguration(firstCompiled, compiled);

    expect(placeholder).toBeTruthy();
    expect(placeholder.status).toBe("archived");
    expect(firstConfig.print_areas).toHaveLength(1);
    expect(firstConfig.print_areas.every((area) => area.disabled !== true)).toBe(true);
  });

  test("resolves images by Colour and print geometry by Size", () => {
    const smallWhite = setVariationProductionConfiguration(
      {
        id: "small-white",
        attributes: { Size: "Small", Colour: "White" },
        enabled: true,
      },
      productionConfig({
        width: 100,
        viewImage: "/source-white-small.png",
      })
    );

    const smallBlack = setVariationProductionConfiguration(
      {
        id: "small-black",
        attributes: { Size: "Small", Colour: "Black" },
        enabled: true,
      },
      productionConfig({
        width: 100,
        viewImage: "/source-black-small.png",
      })
    );

    const mediumWhite = setVariationProductionConfiguration(
      {
        id: "medium-white",
        attributes: { Size: "Medium", Colour: "White" },
        enabled: true,
      },
      productionConfig({
        width: 120,
        viewImage: "/source-white-medium.png",
      })
    );

    const mediumBlack = setVariationProductionConfiguration(
      {
        id: "medium-black",
        attributes: { Size: "Medium", Colour: "Black" },
        enabled: true,
      },
      productionConfig({
        width: 120,
        viewImage: "/source-black-medium.png",
      })
    );

    const variations = [
      smallWhite,
      smallBlack,
      mediumWhite,
      mediumBlack,
    ];

    let template = {
      variations,
    };

    template = {
      ...template,
      ...initialiseAttributeProductionProfiles(
        template,
        variations,
        "Colour",
        "Size"
      ),
    };

    template.attribute_image_profiles[
      attributeProfileKey("White")
    ].configuration.screens[0].image_url = "/white-shared.png";

    template.attribute_image_profiles[
      attributeProfileKey("Black")
    ].configuration.screens[0].image_url = "/black-shared.png";

    template.attribute_production_profiles[
      attributeProfileKey("Small")
    ].configuration.print_areas[0].width_mm = 95;

    template.attribute_production_profiles[
      attributeProfileKey("Medium")
    ].configuration.print_areas[0].width_mm = 125;

    const resolvedSmallWhite = (
      resolveVariationProductionConfiguration(
        smallWhite,
        template
      )
    );

    const resolvedSmallBlack = (
      resolveVariationProductionConfiguration(
        smallBlack,
        template
      )
    );

    const resolvedMediumWhite = (
      resolveVariationProductionConfiguration(
        mediumWhite,
        template
      )
    );

    expect(
      resolvedSmallWhite.screens[0].image_url
    ).toBe("/white-shared.png");

    expect(
      resolvedMediumWhite.screens[0].image_url
    ).toBe("/white-shared.png");

    expect(
      resolvedSmallBlack.screens[0].image_url
    ).toBe("/black-shared.png");

    expect(
      resolvedSmallWhite.print_areas[0].width_mm
    ).toBe(95);

    expect(
      resolvedSmallBlack.print_areas[0].width_mm
    ).toBe(95);

    expect(
      resolvedMediumWhite.print_areas[0].width_mm
    ).toBe(125);

    expect(
      resolvedSmallWhite.print_areas[0].screen_id
    ).toBe(resolvedSmallWhite.screens[0].id);

    const compiled = compileVariableTemplateProduction(
      template,
      variations
    );

    const compiledSmallWhite = compiled.variations.find(
      (variation) => variation.id === "small-white"
    );

    const compiledConfiguration = (
      getVariationProductionConfiguration(
        compiledSmallWhite,
        compiled
      )
    );

    expect(
      compiledConfiguration.screens[0].image_url
    ).toBe("/white-shared.png");

    expect(
      compiledConfiguration.print_areas[0].width_mm
    ).toBe(95);

    expect(
      productionConfigurationComplete(compiledConfiguration)
    ).toBe(true);
  });


});
