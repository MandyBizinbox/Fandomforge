import {
  composeAttributeGeometryPreview,
  geometryOnlyProductionConfiguration,
} from "./attributeProductionComposition";

function screen(id, view, imageUrl) {
  return {
    id,
    name: view,
    view,
    view_key: view,
    image_url: imageUrl,
    status: "active",
  };
}

describe("attribute production composition", () => {
  test("uses current colour images with size-owned print geometry", () => {
    const imageConfiguration = {
      screens: [
        screen("white-front", "front", "/white-front-new.png"),
        screen("white-back", "back", "/white-back-new.png"),
      ],
    };
    const productionConfiguration = {
      screens: [
        screen("size-front", "front", "/stale-black-front.png"),
        screen("size-back", "back", "/stale-black-back.png"),
      ],
      print_areas: [
        {
          id: "front-area",
          screen_id: "size-front",
          view_key: "front",
          width_mm: 297,
          height_mm: 210,
        },
        {
          id: "back-area",
          screen_id: "size-back",
          view_key: "back",
          width_mm: 210,
          height_mm: 297,
        },
      ],
    };

    const composed = composeAttributeGeometryPreview(
      imageConfiguration,
      productionConfiguration
    );

    expect(composed.screens.map((row) => row.image_url)).toEqual([
      "/white-front-new.png",
      "/white-back-new.png",
    ]);
    expect(composed.print_areas[0].screen_id).toBe("white-front");
    expect(composed.print_areas[1].screen_id).toBe("white-back");
    expect(composed.print_areas[0].width_mm).toBe(297);
    expect(composed.print_areas[1].height_mm).toBe(297);
  });

  test("production profile persistence strips preview image ownership", () => {
    const stored = geometryOnlyProductionConfiguration({
      screens: [screen("front", "front", "/white-front.png")],
      print_areas: [{ id: "area", screen_id: "front", width_mm: 100 }],
    });

    expect(stored.screens[0].image_url).toBe("");
    expect(stored.print_areas[0].width_mm).toBe(100);
  });
});
