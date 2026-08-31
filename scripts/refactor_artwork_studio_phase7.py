from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
studio_path = ROOT / "frontend/src/components/product-builder/ProductArtworkStudio.jsx"
route_path = ROOT / "frontend/src/routes/AdminDashboardRoute.jsx"
runtime_path = ROOT / "frontend/src/components/product-builder/productBuilderTextColourRuntime.js"

studio = studio_path.read_text()

old = '''  const allowedProfilesForArea = (area) => {
    if (!area) return [];
    const templateOptionIds = asArray(template?.print_option_ids);
    const areaOptionIds = [
      ...asArray(area?.allowed_print_option_ids),
      ...asArray(area?.print_option_ids),
      ...asArray(area?.compatible_method_ids),
      ...asArray(area?.compatible_methods),
    ];
    const allowedIds = [...new Set(areaOptionIds.length ? areaOptionIds : templateOptionIds)];
    const activeProfiles = profileCatalog.filter((profile) => profile.active !== false);
    if (!allowedIds.length) return activeProfiles;
    const exactProfiles = activeProfiles.filter((profile) => profileMatchesAllowedIds(profile, allowedIds, { methodFallback: false }));
    if (exactProfiles.length) return exactProfiles;
    return activeProfiles.filter((profile) => profileMatchesAllowedIds(profile, allowedIds, { methodFallback: true }));
  };

  const allowedProfiles = useMemo(() => allowedProfilesForArea(activeArea), [activeArea, profileCatalog, template]);'''
new = '''  const allowedProfilesForArea = useCallback((area) => {
    if (!area) return [];
    const templateOptionIds = asArray(template?.print_option_ids);
    const areaOptionIds = [
      ...asArray(area?.allowed_print_option_ids),
      ...asArray(area?.print_option_ids),
      ...asArray(area?.compatible_method_ids),
      ...asArray(area?.compatible_methods),
    ];
    const allowedIds = [...new Set(areaOptionIds.length ? areaOptionIds : templateOptionIds)];
    const activeProfiles = profileCatalog.filter((profile) => profile.active !== false);
    if (!allowedIds.length) return activeProfiles;
    const exactProfiles = activeProfiles.filter((profile) => profileMatchesAllowedIds(profile, allowedIds, { methodFallback: false }));
    if (exactProfiles.length) return exactProfiles;
    return activeProfiles.filter((profile) => profileMatchesAllowedIds(profile, allowedIds, { methodFallback: true }));
  }, [profileCatalog, template]);

  const allowedProfiles = useMemo(() => allowedProfilesForArea(activeArea), [activeArea, allowedProfilesForArea]);'''
if old not in studio:
    raise SystemExit("allowedProfilesForArea block not found")
studio = studio.replace(old, new, 1)

old = '''  const setGroups = (nextGroups) => onArtworkGroupsChange(nextGroups.map((group, index) => ({ ...group, sort_order: index })));
  const setGroupSlots = (groupId, nextSlots) => {
    const nextGroups = patchGroup(groups, groupId, (group) => {
      const primaryMockup = nextSlots.find((slot) => slot.mockup_image_url)?.mockup_image_url || group.primary_mockup_image_url || "";
      return { ...group, artworks: nextSlots.map((slot, index) => ({ ...slot, sort_order: index })), primary_mockup_image_url: primaryMockup };
    });
    setGroups(nextGroups);
  };
  const patchSlot = (slotId, patch) => {
    if (!activeGroup) return;
    setGroupSlots(activeGroup.id, slots.map((slot) => (slot.id === slotId ? { ...slot, ...patch } : slot)));
  };'''
new = '''  const setGroups = useCallback((nextGroups) => {
    onArtworkGroupsChange(nextGroups.map((group, index) => ({ ...group, sort_order: index })));
  }, [onArtworkGroupsChange]);
  const setGroupSlots = useCallback((groupId, nextSlots) => {
    const nextGroups = patchGroup(groups, groupId, (group) => {
      const primaryMockup = nextSlots.find((slot) => slot.mockup_image_url)?.mockup_image_url || group.primary_mockup_image_url || "";
      return { ...group, artworks: nextSlots.map((slot, index) => ({ ...slot, sort_order: index })), primary_mockup_image_url: primaryMockup };
    });
    setGroups(nextGroups);
  }, [groups, setGroups]);
  const patchSlot = useCallback((slotId, patch) => {
    if (!activeGroup) return;
    setGroupSlots(activeGroup.id, slots.map((slot) => (slot.id === slotId ? { ...slot, ...patch } : slot)));
  }, [activeGroup, slots, setGroupSlots]);'''
if old not in studio:
    raise SystemExit("group setter block not found")
studio = studio.replace(old, new, 1)

old = '''  }, [profileCatalog, activeGroup?.id, slots, printAreas, printOptions]);'''
new = '''  }, [profileCatalog, activeGroup, slots, printAreas, printOptions, allowedProfilesForArea, setGroupSlots]);'''
if old not in studio:
    raise SystemExit("profile hydration effect dependency block not found")
studio = studio.replace(old, new, 1)

old = '''  const updateTextLayer = (patch) => {
    if (!activeSlot?.text_layer || !activeArea) return;
    const nextSettings = normaliseTextSettings({ text_content: activeSlot.text_content, text_font_family: activeSlot.text_font_family, text_font_weight: activeSlot.text_font_weight, text_font_size: activeSlot.text_font_size, text_color: activeSlot.text_color, ...patch });
    const asset = buildTextLayerAsset(nextSettings);
    const placement = sanitizePlacement(activeSlot.placement, activeArea);
    const nextPlacement = activeSlot.lock_aspect_ratio === false ? placement : { ...placement, height: fitHeightForAspect(activeArea.id, placement.width, asset.artwork_aspect_ratio) };
    patchSlot(activeSlot.id, { ...asset, placement: nextPlacement });
    window.requestAnimationFrame(() => patchPlacement(activeSlot.id, nextPlacement));
  };'''
new = '''  const updateTextLayer = (patch) => {
    if (!activeSlot?.text_layer || !activeArea) return;
    const nextSettings = normaliseTextSettings({ text_content: activeSlot.text_content, text_font_family: activeSlot.text_font_family, text_font_weight: activeSlot.text_font_weight, text_font_size: activeSlot.text_font_size, text_color: activeSlot.text_color, ...patch });
    const asset = buildTextLayerAsset(nextSettings);
    const placement = sanitizePlacement(activeSlot.placement, activeArea);
    const nextPlacement = activeSlot.lock_aspect_ratio === false
      ? placement
      : { ...placement, height: fitHeightForAspect(activeArea.id, placement.width, asset.artwork_aspect_ratio) };
    const nextSlot = { ...activeSlot, ...asset, placement: nextPlacement };
    const profile = resolveProfileForSlot(nextSlot, profileCatalog, printOptions) || nextSlot;
    const costing = calculateAreaPrintCost(nextSlot, activeArea, profile);
    patchSlot(activeSlot.id, {
      ...asset,
      placement: nextPlacement,
      placement_box_width_mm: costing.placement_box_width_mm,
      placement_box_height_mm: costing.placement_box_height_mm,
      artwork_aspect_ratio: costing.artwork_aspect_ratio || asset.artwork_aspect_ratio || activeSlot.artwork_aspect_ratio || 0,
      print_area_width_mm: costing.print_area_width_mm,
      print_area_height_mm: costing.print_area_height_mm,
      artwork_width_mm: costing.artwork_width_mm,
      artwork_height_mm: costing.artwork_height_mm,
      print_width_mm: costing.print_width_mm,
      print_height_mm: costing.print_height_mm,
      area_cm2: costing.area_cm2,
      raw_print_cost: costing.raw_print_cost,
      calculated_print_cost: costing.calculated_print_cost,
      print_cost_max: costing.calculated_print_cost,
      minimum_print_cost_applied: costing.minimum_print_cost_applied,
      final_artwork_production_cost: costing.final_artwork_production_cost,
      pricing_source: costing.pricing_source,
    });
  };'''
if old not in studio:
    raise SystemExit("updateTextLayer block not found")
studio = studio.replace(old, new, 1)

colour_pattern = re.compile(
    r'<label><span className="label">Colour</span><input className="input-base h-\[42px\]" type="color" value=\{activeSlot\.text_color \|\| "#111111"\} onChange=\{\(event\) => updateTextLayer\(\{ text_color: event\.target\.value \}\)\} /></label>'
)
colour_replacement = '''{supportsStockedColours(selectedProfile || {}) ? (
                  <div><span className="label">Colour</span><div className="input-base h-[42px] flex items-center text-xs text-zinc-500">Use the approved stocked colour below</div></div>
                ) : (
                  <label><span className="label">Colour</span><input className="input-base h-[42px]" type="color" value={activeSlot.text_color || "#111111"} onChange={(event) => updateTextLayer({ text_color: event.target.value })} /></label>
                )}'''
studio, count = colour_pattern.subn(colour_replacement, studio, count=1)
if count != 1:
    raise SystemExit("text colour picker block not found")

studio_path.write_text(studio)

route = route_path.read_text()
old_import = 'import "../components/product-builder/productBuilderTextColourRuntime";\n'
if old_import not in route:
    raise SystemExit("text colour runtime import not found")
route_path.write_text(route.replace(old_import, "", 1))

if runtime_path.exists():
    runtime_path.unlink()

print("Applied Artwork Studio native text-control refactor")
