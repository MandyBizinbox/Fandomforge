export * from "./productBuilderUtilsBase";

import {
  asArray,
  flattenArtworkGroups,
  normalizeProductionMethodKey,
} from "./productBuilderUtilsBase";

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundMoney(value) {
  return Math.round(safeNumber(value) * 100) / 100;
}

function roundMm(value) {
  return Math.round(safeNumber(value) * 10) / 10;
}

function roundArea(value) {
  return Math.round(safeNumber(value) * 100) / 100;
}

function hasArtworkPayload(slot) {
  return Boolean(slot?.original_url || slot?.text_layer || slot?.text_content);
}

function profileIdentity(row = {}) {
  return String(
    row.manufacturing_profile_id
    || row.production_profile_id
    || row.profile_id
    || row.id
    || row.print_option_id
    || row.legacy_print_option_id
    || ""
  );
}

function optionForSlot(slot = {}, printOptions = []) {
  const candidates = new Set([
    slot.manufacturing_profile_id,
    slot.production_profile_id,
    slot.print_option_id,
  ].filter(Boolean).map(String));

  const option = asArray(printOptions).find((item) => {
    const ids = [
      item?.id,
      item?.profile_id,
      item?.manufacturing_profile_id,
      item?.legacy_print_option_id,
      item?.source_print_option_id,
    ].filter(Boolean).map(String);
    return ids.some((id) => candidates.has(id));
  });

  return option ? { ...slot, ...option } : slot;
}

function areaForSlot(slot = {}, template = {}) {
  return asArray(template?.print_areas).find((item) => item.id === slot.print_area_id) || {};
}

function methodForSlot(slot = {}, option = {}) {
  return normalizeProductionMethodKey(
    option.method_key
    || option.production_method_key
    || slot.method_key
    || option.print_method
    || option.method_name
    || option.method
    || slot.print_method
    || slot.rule_name
  );
}

export function isCombinablePrintMethod(methodKey, option = {}) {
  if (
    option.combine_same_method_layers === false
    || option.combine_layers === false
    || option.additive_layer_pricing === true
  ) return false;

  const policy = String(
    option.same_method_layer_policy
    || option.layer_pricing_mode
    || ""
  ).toLowerCase();

  if (["separate", "additive", "per_layer"].includes(policy)) return false;
  if (["combined", "bounding_area", "per_area", "summed_area"].includes(policy)) return true;
  return ["dtf", "sublimation", "uv_dtf"].includes(normalizeProductionMethodKey(methodKey));
}

export function calculateAreaPrintCost(slot = {}, area = {}, option = {}) {
  const calculationType = String(
    option.calculation_type
    || slot.calculation_type
    || "fixed"
  ).toLowerCase();
  const warnings = [];
  const placement = slot.placement || {};
  const areaWidthMm = safeNumber(
    area.width_mm
    || slot.print_area_width_mm
    || slot.width_mm
    || option.width_mm
    || 0
  );
  const areaHeightMm = safeNumber(
    area.height_mm
    || slot.print_area_height_mm
    || slot.height_mm
    || option.height_mm
    || 0
  );
  const placementWidthPct = safeNumber(
    placement.width ?? placement.width_pct ?? 100,
    100
  );
  const placementHeightPct = safeNumber(
    placement.height ?? placement.height_pct ?? 100,
    100
  );
  const printWidthMm = areaWidthMm * (placementWidthPct / 100);
  const printHeightMm = areaHeightMm * (placementHeightPct / 100);
  const placementAreaCm2 = Math.max(
    0,
    (printWidthMm / 10) * (printHeightMm / 10)
  );
  const explicitCombinedAreaCm2 = safeNumber(slot.combined_area_cm2 || 0);
  const actualAreaCm2 = explicitCombinedAreaCm2 > 0
    ? explicitCombinedAreaCm2
    : placementAreaCm2;

  const artworkWidthPx = safeNumber(
    slot.original_width_px
    || slot.artwork_width_px
    || 0
  );
  const artworkHeightPx = safeNumber(
    slot.original_height_px
    || slot.artwork_height_px
    || 0
  );
  const aspectRatio = artworkWidthPx > 0 && artworkHeightPx > 0
    ? artworkWidthPx / artworkHeightPx
    : safeNumber(slot.artwork_aspect_ratio || 0);

  const minimumAreaCm2 = Math.max(
    0,
    safeNumber(option.minimum_area_cm2 ?? slot.minimum_area_cm2 ?? 0)
  );
  const applicationCost = Math.max(
    0,
    safeNumber(option.application_cost ?? slot.application_cost ?? 0)
  );
  const minimumPrintCost = Math.max(
    0,
    safeNumber(option.minimum_print_cost ?? slot.minimum_print_cost ?? 0)
  );
  const wastePct = Math.max(
    0,
    safeNumber(option.waste_percentage ?? slot.waste_percentage ?? 0)
  );
  const markupPct = Math.max(
    0,
    safeNumber(option.markup_percentage ?? slot.markup_percentage ?? 0)
  );

  let costPerCm2 = safeNumber(option.cost_per_cm2 ?? slot.cost_per_cm2 ?? 0);
  const sheetWidthMm = safeNumber(option.sheet_width_mm ?? slot.sheet_width_mm ?? 0);
  const sheetHeightMm = safeNumber(option.sheet_height_mm ?? slot.sheet_height_mm ?? 0);
  const sheetCost = safeNumber(option.sheet_cost ?? slot.sheet_cost ?? 0);
  const sheetAreaCm2 = (sheetWidthMm / 10) * (sheetHeightMm / 10);
  const areaTypes = ["area_fixed_rate", "area", "cm2", "sheet", "area_from_sheet"];
  const isAreaPricing = areaTypes.includes(calculationType);
  const chargeableAreaCm2 = isAreaPricing && minimumAreaCm2 > 0
    ? Math.max(actualAreaCm2, minimumAreaCm2)
    : actualAreaCm2;

  let materialCost = 0;
  let calculationSource = calculationType;

  if (["fixed", "manual", "flat_rate", "flat"].includes(calculationType)) {
    materialCost = safeNumber(
      option.creator_print_price
      ?? option.platform_print_cost
      ?? option.print_cost_max
      ?? slot.creator_print_price
      ?? slot.platform_print_cost
      ?? slot.print_cost_max
      ?? slot.calculated_print_cost
      ?? 0
    );
  } else if (["full_sheet", "sheet_full"].includes(calculationType)) {
    materialCost = sheetCost || safeNumber(option.print_cost_max ?? slot.print_cost_max ?? 0);
  } else if (["sheet", "area_from_sheet"].includes(calculationType)) {
    if (!costPerCm2 && sheetAreaCm2 > 0 && sheetCost > 0) {
      costPerCm2 = sheetCost / sheetAreaCm2;
      calculationSource = "sheet_area_rate";
    }
    materialCost = chargeableAreaCm2 * costPerCm2;
  } else if (["area_fixed_rate", "area", "cm2"].includes(calculationType)) {
    materialCost = chargeableAreaCm2 * costPerCm2;
  } else {
    warnings.push(`Unknown calculation type: ${calculationType}`);
    materialCost = safeNumber(
      option.print_cost_max
      ?? slot.print_cost_max
      ?? slot.calculated_print_cost
      ?? 0
    );
    calculationSource = "fallback_fixed";
  }

  if (areaWidthMm <= 0 || areaHeightMm <= 0) {
    warnings.push("Missing print-area physical dimensions");
  }
  if (
    actualAreaCm2 <= 0
    && !["fixed", "manual", "flat_rate", "flat", "full_sheet", "sheet_full"].includes(calculationType)
  ) warnings.push("Artwork area is zero");

  const wasteAmount = materialCost * (wastePct / 100);
  const productionSubtotalBeforeMarkup = materialCost + wasteAmount + applicationCost;
  const markupAmount = productionSubtotalBeforeMarkup * (markupPct / 100);
  const calculatedProfileCost = productionSubtotalBeforeMarkup + markupAmount;
  const minimumPrintCostApplied = minimumPrintCost > 0
    && calculatedProfileCost < minimumPrintCost;
  const finalCost = Math.max(calculatedProfileCost, minimumPrintCost);
  const minimumAreaApplied = isAreaPricing
    && minimumAreaCm2 > 0
    && actualAreaCm2 < minimumAreaCm2;

  return {
    calculation_type: calculationType,
    placement_box_width_mm: roundMm(printWidthMm),
    placement_box_height_mm: roundMm(printHeightMm),
    artwork_aspect_ratio: Math.round(aspectRatio * 10000) / 10000,
    print_area_width_mm: roundMm(areaWidthMm),
    print_area_height_mm: roundMm(areaHeightMm),
    artwork_width_mm: roundMm(printWidthMm),
    artwork_height_mm: roundMm(printHeightMm),
    charged_width_mm: roundMm(printWidthMm),
    charged_height_mm: roundMm(printHeightMm),
    pricing_source: isAreaPricing ? "outsourced_area_rate" : calculationSource,
    calculation_source: calculationSource,
    print_width_mm: roundMm(printWidthMm),
    print_height_mm: roundMm(printHeightMm),
    area_cm2: roundArea(actualAreaCm2),
    actual_area_cm2: roundArea(actualAreaCm2),
    charged_area_cm2: roundArea(chargeableAreaCm2),
    chargeable_area_cm2: roundArea(chargeableAreaCm2),
    combined_area_cm2: explicitCombinedAreaCm2 > 0
      ? roundArea(explicitCombinedAreaCm2)
      : null,
    combined_layer_count: Number(slot.combined_layer_count || 1),
    minimum_area_cm2: roundArea(minimumAreaCm2),
    minimum_area_applied: minimumAreaApplied,
    cost_per_cm2: costPerCm2,
    material_cost: roundMoney(materialCost),
    base_production_cost: roundMoney(materialCost),
    waste_amount: roundMoney(wasteAmount),
    application_cost: roundMoney(applicationCost),
    production_subtotal_before_markup: roundMoney(productionSubtotalBeforeMarkup),
    markup_amount: roundMoney(markupAmount),
    calculated_profile_cost: roundMoney(calculatedProfileCost),
    minimum_print_cost: roundMoney(minimumPrintCost),
    minimum_print_cost_applied: minimumPrintCostApplied,
    final_artwork_production_cost: roundMoney(finalCost),
    raw_print_cost: roundMoney(calculatedProfileCost),
    calculated_print_cost: roundMoney(finalCost),
    warnings,
  };
}

function combinedSlotFromGroup(groupSlots, area, option) {
  const first = groupSlots[0] || {};
  const layerCostings = groupSlots.map((slot) => (
    calculateAreaPrintCost(slot, area, {
      ...option,
      minimum_area_cm2: 0,
      application_cost: 0,
      markup_percentage: 0,
      minimum_print_cost: 0,
    })
  ));
  const combinedAreaCm2 = layerCostings.reduce(
    (total, costing) => total + Number(costing.area_cm2 || 0),
    0
  );

  return {
    ...first,
    combined_layer_count: groupSlots.length,
    combined_area_cm2: roundArea(combinedAreaCm2),
    combined_layer_areas: layerCostings.map((costing, index) => ({
      slot_id: groupSlots[index]?.id,
      area_cm2: Number(costing.area_cm2 || 0),
    })),
  };
}

export function getAggregatedPrintCostLines(groups, printOptions = [], template = {}) {
  const slots = flattenArtworkGroups(groups).filter(
    (slot) => slot.print_option_id && hasArtworkPayload(slot)
  );
  const additive = [];
  const combinable = new Map();

  slots.forEach((slot) => {
    const option = optionForSlot(slot, printOptions);
    const method = methodForSlot(slot, option);
    if (!method || !isCombinablePrintMethod(method, option)) {
      additive.push([slot]);
      return;
    }
    const key = [
      slot.artwork_group_id || "group",
      slot.screen_id || "screen",
      slot.print_area_id || "area",
      method,
      profileIdentity(option) || profileIdentity(slot) || "option",
    ].join("|");
    if (!combinable.has(key)) combinable.set(key, []);
    combinable.get(key).push(slot);
  });

  const lines = [];
  additive.forEach((items) => {
    const slot = items[0];
    const option = optionForSlot(slot, printOptions);
    const area = areaForSlot(slot, template);
    const result = calculateAreaPrintCost(slot, area, option);
    lines.push({
      slot_ids: [slot.id],
      method_key: methodForSlot(slot, option),
      profile_id: profileIdentity(option) || profileIdentity(slot),
      print_area_id: slot.print_area_id,
      screen_id: slot.screen_id,
      combined: false,
      layer_count: 1,
      combined_area_cm2: Number(result.area_cm2 || 0),
      chargeable_area_cm2: Number(result.chargeable_area_cm2 || 0),
      cost: Number(result.calculated_print_cost || 0),
      costing: result,
    });
  });

  combinable.forEach((items) => {
    const first = items[0] || {};
    const option = optionForSlot(first, printOptions);
    const area = areaForSlot(first, template);
    const slot = combinedSlotFromGroup(items, area, option);
    const result = calculateAreaPrintCost(slot, area, option);

    lines.push({
      slot_ids: items.map((item) => item.id),
      method_key: methodForSlot(slot, option),
      profile_id: profileIdentity(option) || profileIdentity(slot),
      print_area_id: slot.print_area_id,
      screen_id: slot.screen_id,
      combined: items.length > 1,
      layer_count: items.length,
      combined_area_cm2: Number(result.area_cm2 || 0),
      chargeable_area_cm2: Number(result.chargeable_area_cm2 || 0),
      minimum_area_cm2: Number(result.minimum_area_cm2 || 0),
      minimum_area_applied: Boolean(result.minimum_area_applied),
      application_cost: Number(result.application_cost || 0),
      layer_areas: slot.combined_layer_areas || [],
      cost: Number(result.calculated_print_cost || 0),
      costing: result,
    });
  });

  return lines;
}

export function getUniquePrintCostFromGroups(groups, printOptions, template = {}) {
  const total = getAggregatedPrintCostLines(groups, printOptions, template)
    .reduce((sum, line) => sum + Number(line.cost || 0), 0);
  return roundMoney(total);
}

export function getPrintCostForArtworkSlot(slot = {}, printOptions = [], template = {}) {
  if (!slot.print_option_id || !hasArtworkPayload(slot)) return 0;
  const option = optionForSlot(slot, printOptions);
  const area = areaForSlot(slot, template);
  const result = calculateAreaPrintCost(slot, area, option);
  return Number(result.calculated_print_cost || 0);
}

export function estimateProductionOperationCostFromGroups(
  groups,
  printOptions = [],
  productionOperations = [],
  template = {}
) {
  const lines = [];
  const chargedPerJob = new Set();
  let platformCost = 0;

  getAggregatedPrintCostLines(groups, printOptions, template).forEach((printLine) => {
    asArray(productionOperations).forEach((operation) => {
      if (operation.active === false) return;
      const appliesToRaw = Array.isArray(operation.applies_to_method)
        ? operation.applies_to_method
        : [operation.applies_to_method].filter(Boolean);
      const appliesTo = appliesToRaw.map(normalizeProductionMethodKey);
      if (!appliesTo.includes(printLine.method_key)) return;

      const operationType = String(operation.operation_type || "");
      if (
        Number(printLine.costing?.application_cost || 0) > 0
        && ["heat_press", "application"].includes(operationType)
      ) return;

      const costBasis = operation.cost_basis || "per_operation";
      const operationId = operation.id || operation.slug || operation.name || costBasis;
      const unitCost = Number(operation.cost || 0);
      const defaultQuantity = Number(operation.default_quantity || 1);
      const estimatedTime = Number(operation.estimated_time || 0);
      let quantity = defaultQuantity;

      if (costBasis === "per_job") {
        const perJobKey = `${printLine.method_key}:${operationId}`;
        if (chargedPerJob.has(perJobKey)) return;
        chargedPerJob.add(perJobKey);
      }
      if (costBasis === "per_minute") quantity = estimatedTime * defaultQuantity;
      if (costBasis === "per_cm2") {
        quantity = Number(
          printLine.costing?.chargeable_area_cm2
          || printLine.costing?.area_cm2
          || 0
        ) * defaultQuantity;
      }

      const lineCost = roundMoney(unitCost * quantity);
      platformCost += lineCost;
      lines.push({
        operation_id: operationId,
        operation_name: operation.name || operationId,
        operation_type: operationType,
        cost_basis: costBasis,
        method_key: printLine.method_key,
        print_area_id: costBasis === "per_job" ? null : printLine.print_area_id,
        unit_cost: unitCost,
        quantity,
        platform_cost: lineCost,
      });
    });
  });

  platformCost = roundMoney(platformCost);
  return {
    platformCost,
    creatorCost: roundMoney(platformCost * 1.1),
    lines,
  };
}
