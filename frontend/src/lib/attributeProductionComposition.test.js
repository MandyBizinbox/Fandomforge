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

  test("deleted image views do not persist as empty geometry screens", () => {
    const imageConfiguration = {
      screens: [
        screen("current-front", "front", "/front.png"),
        screen("current-back", "back", "/back.png"),
      ],
    };
    const productionConfiguration = {
      screens: [
        screen("size-front", "front", ""),
        screen("size-back", "back", ""),
        screen("size-front-b-a4-p", "front-b-a4-p", ""),
        screen("size-pocket", "pocket-front-bk-pocket", ""),
        screen("size-front-copy", "front", ""),
      ],
      print_areas: [
        {
          id: "front-area",
          screen_id: "size-front",
          view_key: "front",
          allowed_print_option_ids: ["dtf"],
        },
        {
          id: "back-area",
          screen_id: "size-back",
          view_key: "back",
          allowed_print_option_ids: ["dtf"],
        },
        {
          id: "stale-a4-area",
          screen_id: "size-front-b-a4-p",
          view_key: "front-b-a4-p",
          allowed_print_option_ids: ["htv"],
        },
        {
          id: "stale-pocket-area",
          screen_id: "size-pocket",
          view_key: "pocket-front-bk-pocket",
          allowed_print_option_ids: ["htv"],
        },
        {
          id: "stale-front-copy-area",
          screen_id: "size-front-copy",
          view_key: "front",
          allowed_print_option_ids: ["sublimation"],
        },
      ],
      print_option_ids: ["dtf", "htv", "sublimation"],
      print_options: [
        { id: "dtf", name: "DTF" },
        { id: "htv", name: "HTV" },
        { id: "sublimation", name: "Sublimation" },
      ],
    };

    const composed = composeAttributeGeometryPreview(
      imageConfiguration,
      productionConfiguration
    );

    expect(composed.screens.map((row) => row.id)).toEqual([
      "current-front",
      "current-back",
    ]);
    expect(composed.print_areas.map((row) => row.id)).toEqual([
      "front-area",
      "back-area",
    ]);
    expect(composed.print_areas.map((row) => row.screen_id)).toEqual([
      "current-front",
      "current-back",
    ]);
    expect(composed.print_option_ids).toEqual(["dtf"]);
    expect(composed.print_options).toEqual([{ id: "dtf", name: "DTF" }]);
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
