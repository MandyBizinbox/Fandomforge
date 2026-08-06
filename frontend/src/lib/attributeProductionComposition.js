import { safeArray } from "../components/template-studio/templateStudioUtils";

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function compact(value) {
  return String(value || "").trim();
}

function normaliseKey(value) {
  return compact(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function screenIdentity(screen = {}) {
  return normaliseKey(
    screen.view_key
    || screen.view
    || screen.screen_view
    || screen.name
    || screen.id
    || "front"
  );
}

function screenSlots(screens = []) {
  const counts = new Map();
  return safeArray(screens).map((screen) => {
    const base = screenIdentity(screen) || "front";
    const occurrence = counts.get(base) || 0;
    counts.set(base, occurrence + 1);
    return {
      screen,
      slotKey: `${base}::${occurrence}`,
    };
  });
}

/**
 * Combine image-owned screens with production-owned print geometry.
 *
 * The returned screens always come from the current image profile. Print areas,
 * dimensions and print rules always come from the selected production profile.
 * Area screen IDs are remapped by semantic view slot, not by copied database ID.
 */
export function composeAttributeGeometryPreview(
  imageConfiguration = {},
  productionConfiguration = {}
) {
  const imageScreens = safeArray(imageConfiguration.screens).map(clone);
  const productionScreens = safeArray(productionConfiguration.screens);
  const productionSlots = screenSlots(productionScreens);
  const imageSlots = screenSlots(imageScreens);

  const imageBySlot = new Map(
    imageSlots.map(({ screen, slotKey }) => [slotKey, screen])
  );
  const productionSlotById = new Map(
    productionSlots.map(({ screen, slotKey }) => [screen.id, slotKey])
  );

  productionSlots.forEach(({ screen, slotKey }) => {
    if (imageBySlot.has(slotKey)) return;
    const structuralScreen = {
      ...clone(screen),
      id: `attribute-preview-${normaliseKey(slotKey)}`,
      image_url: "",
      status: "active",
    };
    imageScreens.push(structuralScreen);
    imageBySlot.set(slotKey, structuralScreen);
  });

  const firstScreen = imageScreens[0] || null;
  const printAreas = safeArray(productionConfiguration.print_areas).map((area) => {
    const slotKey = (
      productionSlotById.get(area.screen_id)
      || `${normaliseKey(area.view_key || area.screen_view || "front")}::0`
    );
    const targetScreen = imageBySlot.get(slotKey) || firstScreen;
    return {
      ...clone(area),
      screen_id: targetScreen?.id || area.screen_id || "",
    };
  });

  return {
    ...clone(productionConfiguration),
    screens: imageScreens,
    print_areas: printAreas,
  };
}

/**
 * Production profiles own view slots and geometry, never colour-specific image
 * pixels. Strip preview URLs before persisting a Size-owned profile.
 */
export function geometryOnlyProductionConfiguration(configuration = {}) {
  return {
    ...clone(configuration),
    screens: safeArray(configuration.screens).map((screen) => ({
      ...clone(screen),
      image_url: "",
    })),
  };
}
