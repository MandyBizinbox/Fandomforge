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

function selectedPrintOptionIds(printAreas = []) {
  return Array.from(
    new Set(
      safeArray(printAreas).flatMap(
        (area) => safeArray(area.allowed_print_option_ids)
      )
    )
  );
}

/**
 * Combine image-owned screens with production-owned print geometry.
 *
 * The image profile is authoritative for the complete view list. The selected
 * Size profile contributes geometry and rules only for view slots that still
 * exist in that image profile. Deleted image views must not be recreated as
 * empty structural screens.
 *
 * Area screen IDs are remapped by semantic view slot, not copied database ID.
 * Orphan areas and their manufacturing-rule references are removed from the
 * composed configuration.
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
    productionSlots
      .filter(({ screen }) => screen?.id)
      .map(({ screen, slotKey }) => [screen.id, slotKey])
  );

  const printAreas = safeArray(productionConfiguration.print_areas)
    .map((area) => {
      const slotKey = (
        productionSlotById.get(area.screen_id)
        || `${normaliseKey(area.view_key || area.screen_view || "front")}::0`
      );
      const targetScreen = imageBySlot.get(slotKey);

      if (!targetScreen) return null;

      return {
        ...clone(area),
        screen_id: targetScreen.id || "",
      };
    })
    .filter(Boolean);

  const printOptionIds = selectedPrintOptionIds(printAreas);
  const allowedOptionIds = new Set(printOptionIds);
  const printOptions = safeArray(productionConfiguration.print_options)
    .filter((option) => allowedOptionIds.has(option?.id))
    .map(clone);

  return {
    ...clone(productionConfiguration),
    screens: imageScreens,
    print_areas: printAreas,
    print_option_ids: printOptionIds,
    print_options: printOptions,
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
