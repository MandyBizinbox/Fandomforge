"""Backend patch for Builder V2 artwork payloads and outsourced area costing."""
from __future__ import annotations

from copy import deepcopy
from urllib.parse import quote

from outsourced_production_rates import calculate_outsourced_area_cost, number


def _method_key(value) -> str:
    key = str(value or "").strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "dtf_transfers": "dtf",
        "dtf_transfer": "dtf",
        "dtf_print": "dtf",
        "uvdtf": "uv_dtf",
        "uv_dtf_transfer": "uv_dtf",
        "heat_transfer_vinyl": "htv",
        "vinyl": "adhesive_vinyl",
        "adhesive": "adhesive_vinyl",
    }
    if key in aliases:
        return aliases[key]
    for prefix, canonical in (
        ("adhesive_vinyl_", "adhesive_vinyl"),
        ("sublimation_", "sublimation"),
        ("uv_dtf_", "uv_dtf"),
        ("dtf_", "dtf"),
        ("htv_", "htv"),
    ):
        if key.startswith(prefix):
            return canonical
    return key


def _option_policy(option: dict | None, method: str) -> bool:
    option = option or {}
    policy = str(option.get("same_method_layer_policy") or option.get("layer_pricing_mode") or "").lower()
    if option.get("combine_same_method_layers") is False or option.get("combine_layers") is False or option.get("additive_layer_pricing") is True:
        return False
    if policy in {"separate", "additive", "per_layer"}:
        return False
    if policy in {"combined", "bounding_area", "per_area", "summed_area"}:
        return True
    return method in {"dtf", "sublimation", "uv_dtf"}


def _slot_has_artwork(slot: dict | None) -> bool:
    if not slot:
        return False
    return bool(slot.get("original_url") or slot.get("text_layer") or slot.get("text_content"))


def _escape_svg(value: str) -> str:
    return (
        str(value or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _text_svg_data_url(slot: dict) -> str:
    text = str(slot.get("text_content") or slot.get("text") or "Custom Text")[:240]
    font = str(slot.get("text_font_family") or "Arial")
    weight = str(slot.get("text_font_weight") or "700")
    size = max(24, min(int(float(slot.get("text_font_size") or 180)), 1200))
    colour = str(slot.get("text_color") or "#111111")
    lines = [line for line in text.splitlines() if line.strip()] or ["Custom Text"]
    width = max(320, min(2400, max(len(line) for line in lines) * int(size * 0.62) + int(size * 0.6)))
    height = max(160, min(2400, len(lines) * int(size * 1.35) + int(size * 0.6)))
    tspans = []
    y = int(size * 0.85)
    for index, line in enumerate(lines):
        tspans.append(f'<tspan x="50%" y="{y + index * int(size * 1.28)}" text-anchor="middle">{_escape_svg(line)}</tspan>')
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">'
        f'<rect width="100%" height="100%" fill="transparent"/>'
        f'<text font-family="{_escape_svg(font)}" font-size="{size}" font-weight="{_escape_svg(weight)}" fill="{_escape_svg(colour)}">'
        f'{"".join(tspans)}</text></svg>'
    )
    return f"data:image/svg+xml;charset=utf-8,{quote(svg)}"


def _ensure_text_slot_file(slot: dict) -> None:
    if not slot or slot.get("original_url"):
        return
    if not (slot.get("text_layer") or slot.get("text_content")):
        return
    slot["original_url"] = _text_svg_data_url(slot)
    slot["file_name"] = slot.get("file_name") or "text-layer.svg"
    slot["mime_type"] = slot.get("mime_type") or "image/svg+xml"
    slot["original_width_px"] = slot.get("original_width_px") or 1000
    slot["original_height_px"] = slot.get("original_height_px") or 350
    slot["artwork_aspect_ratio"] = slot.get("artwork_aspect_ratio") or 2.85


def _pricing_row(option: dict | None, slot: dict | None) -> dict:
    return {**dict(slot or {}), **dict(option or {})}


def _patched_calculation(original_calculate, slot: dict, area: dict, option: dict) -> dict:
    original = original_calculate(slot, area, option)
    calculation_type = str(option.get("calculation_type") or slot.get("calculation_type") or original.get("calculation_type") or "fixed").lower()
    actual_area = number(slot.get("combined_area_cm2") or original.get("area_cm2") or original.get("charged_area_cm2") or 0)
    pricing = _pricing_row(option, slot)
    pricing["calculation_type"] = calculation_type
    costing = calculate_outsourced_area_cost(
        actual_area,
        pricing,
        fallback_cost=original.get("calculated_print_cost") or option.get("print_cost_max") or slot.get("print_cost_max") or 0,
    )

    result = {
        **original,
        **costing,
        "calculation_type": calculation_type,
        "area_cm2": costing["actual_area_cm2"],
        "charged_area_cm2": costing["chargeable_area_cm2"],
        "chargeable_area_cm2": costing["chargeable_area_cm2"],
        "raw_print_cost": costing["raw_print_cost"],
        "calculated_print_cost": costing["calculated_print_cost"],
        "calculated_profile_cost": costing["raw_print_cost"],
        "final_artwork_production_cost": costing["calculated_print_cost"],
        "pricing_source": "outsourced_area_rate" if calculation_type in {"area_fixed_rate", "area", "cm2", "sheet", "area_from_sheet"} else original.get("pricing_source"),
    }
    if slot.get("combined_area_cm2"):
        result["combined_area_cm2"] = round(actual_area, 2)
    return result


def _apply_costing_to_slot(routes_main_module, slot: dict, costing: dict, option: dict | None, zero: bool = False) -> None:
    option = option or {}
    for key in (
        "calculation_type",
        "placement_box_width_mm",
        "placement_box_height_mm",
        "artwork_aspect_ratio",
        "print_width_mm",
        "print_height_mm",
        "area_cm2",
        "print_area_width_mm",
        "print_area_height_mm",
        "artwork_width_mm",
        "artwork_height_mm",
        "charged_width_mm",
        "charged_height_mm",
        "charged_area_cm2",
        "chargeable_area_cm2",
        "combined_area_cm2",
        "pricing_source",
        "minimum_area_cm2",
        "minimum_area_applied",
        "cost_per_cm2",
        "material_cost",
        "base_production_cost",
        "waste_amount",
        "application_cost",
        "production_subtotal_before_markup",
        "markup_amount",
        "minimum_print_cost",
        "minimum_print_cost_applied",
        "calculated_profile_cost",
        "final_artwork_production_cost",
    ):
        if key in costing:
            slot[key] = costing.get(key)

    for key in (
        "minimum_area_cm2",
        "application_cost",
        "cost_per_cm2",
        "minimum_print_cost",
        "waste_percentage",
        "markup_percentage",
        "outsourced_rate_profile_key",
        "outsourced_rate_profile_label",
        "outsourced_rate_version",
    ):
        if key in option:
            slot[key] = option.get(key)

    raw_cost = 0 if zero else float(costing.get("raw_print_cost") or 0)
    final_cost = 0 if zero else float(costing.get("calculated_print_cost") or 0)
    slot["raw_print_cost"] = round(raw_cost, 2)
    slot["calculated_print_cost"] = round(final_cost, 2)
    slot["print_cost_max"] = round(final_cost, 2)
    resolved = routes_main_module._resolve_print_costing(option, slot, final_cost)
    slot["platform_print_cost"] = 0 if zero else round(float(resolved.get("platform_print_cost") or final_cost), 2)
    slot["creator_print_price"] = 0 if zero else round(float(resolved.get("creator_print_price") or final_cost), 2)
    slot["platform_print_profit"] = 0 if zero else resolved.get("platform_print_profit", 0)
    slot["platform_print_margin_percent"] = resolved.get("platform_print_margin_percent", 0)


def _individual_area_costings(routes_main_module, slots: list[dict], area_map: dict, option_map: dict) -> list[dict]:
    costings = []
    for slot in slots:
        area = area_map.get(str(slot.get("print_area_id"))) or {}
        option = option_map.get(str(slot.get("print_option_id"))) or {}
        costings.append(routes_main_module._calculate_area_print_cost(slot, area, option))
    return costings


def _adjust_combined_costing(routes_main_module, template: dict, global_print_options: list, groups: list) -> None:
    area_map = routes_main_module._product_template_print_area_map(template)
    option_map = routes_main_module._product_print_option_map(template, global_print_options)

    for group in groups or []:
        buckets: dict[str, list[dict]] = {}
        for slot in group.get("artworks") or []:
            _ensure_text_slot_file(slot)
            if not _slot_has_artwork(slot) or not slot.get("print_option_id"):
                continue
            option = option_map.get(str(slot.get("print_option_id"))) or {}
            method = _method_key(option.get("method_key") or slot.get("method_key") or option.get("print_method") or option.get("method") or slot.get("print_method"))
            if not method or not _option_policy(option, method):
                continue
            key = "|".join([
                str(group.get("id") or "group"),
                str(slot.get("screen_id") or "screen"),
                str(slot.get("print_area_id") or "area"),
                method,
                str(slot.get("manufacturing_profile_id") or slot.get("production_profile_id") or slot.get("print_option_id") or "option"),
            ])
            buckets.setdefault(key, []).append(slot)

        for slots in buckets.values():
            if len(slots) <= 1:
                continue
            first = slots[0]
            area = area_map.get(str(first.get("print_area_id"))) or {}
            option = option_map.get(str(first.get("print_option_id"))) or {}
            layer_costings = _individual_area_costings(routes_main_module, slots, area_map, option_map)
            combined_area = round(sum(number(row.get("area_cm2")) for row in layer_costings), 2)
            combined = deepcopy(first)
            combined["combined_area_cm2"] = combined_area
            combined["combined_layer_count"] = len(slots)
            combined["combined_layer_areas"] = [
                {"slot_id": slots[index].get("id"), "area_cm2": number(costing.get("area_cm2"))}
                for index, costing in enumerate(layer_costings)
            ]
            costing = routes_main_module._calculate_area_print_cost(combined, area, option)
            _apply_costing_to_slot(routes_main_module, first, costing, option, zero=False)
            first["combined_layer_count"] = len(slots)
            first["combined_layer_pricing"] = True
            first["combined_layer_areas"] = combined["combined_layer_areas"]
            first["combined_area_cm2"] = combined_area

            for index, duplicate in enumerate(slots[1:], start=1):
                duplicate_option = option_map.get(str(duplicate.get("print_option_id"))) or option
                duplicate_costing = layer_costings[index]
                _apply_costing_to_slot(routes_main_module, duplicate, duplicate_costing, duplicate_option, zero=True)
                duplicate["combined_layer_pricing"] = True
                duplicate["combined_priced_on_slot_id"] = first.get("id")


def install_builder_artwork_costing_patch(routes_main_module):
    """Install monkey patches into routes_main without replacing the large router file."""
    if getattr(routes_main_module, "_builder_artwork_costing_patch_installed", False):
        return

    original_has_file = routes_main_module._artwork_slot_has_file
    original_normalize_slot = routes_main_module._normalize_product_artwork_slot
    original_enrich = routes_main_module._enrich_and_validate_product_artwork_slots
    original_calculate = routes_main_module._calculate_area_print_cost

    def patched_calculate(slot: dict, area: dict, option: dict) -> dict:
        return _patched_calculation(original_calculate, slot, area, option)

    def patched_has_file(slot: dict) -> bool:
        return bool(original_has_file(slot) or _slot_has_artwork(slot))

    def patched_normalize_slot(row: dict, index: int = 0) -> dict:
        slot = original_normalize_slot(row, index)
        _ensure_text_slot_file(slot)
        return slot

    def patched_enrich(template: dict, global_print_options: list, groups: list, flat_artworks: list) -> None:
        for group in groups or []:
            for slot in group.get("artworks") or []:
                _ensure_text_slot_file(slot)
        for slot in flat_artworks or []:
            _ensure_text_slot_file(slot)
        original_enrich(template, global_print_options, groups, flat_artworks)
        _adjust_combined_costing(routes_main_module, template, global_print_options, groups)
        by_id = {slot.get("id"): slot for group in groups or [] for slot in group.get("artworks") or [] if slot.get("id")}
        for slot in flat_artworks or []:
            if slot.get("id") in by_id:
                slot.update(by_id[slot.get("id")])

    routes_main_module._calculate_area_print_cost = patched_calculate
    routes_main_module._artwork_slot_has_file = patched_has_file
    routes_main_module._normalize_product_artwork_slot = patched_normalize_slot
    routes_main_module._enrich_and_validate_product_artwork_slots = patched_enrich
    routes_main_module._builder_artwork_costing_patch_installed = True
