"""Backend patch for Builder V2 artwork payloads and combined layer costing."""
from __future__ import annotations

from copy import deepcopy
from urllib.parse import quote


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
    if policy in {"combined", "bounding_area", "per_area"}:
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


def _bounds(slot: dict) -> dict:
    placement = slot.get("placement") or {}
    x = float(placement.get("x") if placement.get("x") is not None else placement.get("x_pct") or 0)
    y = float(placement.get("y") if placement.get("y") is not None else placement.get("y_pct") or 0)
    width = float(placement.get("width") if placement.get("width") is not None else placement.get("width_pct") or 100)
    height = float(placement.get("height") if placement.get("height") is not None else placement.get("height_pct") or 100)
    return {"x": x, "y": y, "right": x + width, "bottom": y + height}


def _combined_slot(slots: list[dict]) -> dict:
    first = deepcopy(slots[0] or {})
    bounds = [_bounds(slot) for slot in slots]
    x = min(item["x"] for item in bounds)
    y = min(item["y"] for item in bounds)
    right = max(item["right"] for item in bounds)
    bottom = max(item["bottom"] for item in bounds)
    placement = dict(first.get("placement") or {})
    placement.update({"x": x, "y": y, "width": max(1, right - x), "height": max(1, bottom - y), "rotation": 0})
    first["placement"] = placement
    return first


def _apply_costing_to_slot(routes_main_module, slot: dict, costing: dict, option: dict | None, area: dict | None, zero: bool = False) -> None:
    option = option or {}
    for key in (
        "calculation_type", "placement_box_width_mm", "placement_box_height_mm", "artwork_aspect_ratio",
        "print_width_mm", "print_height_mm", "area_cm2", "print_area_width_mm", "print_area_height_mm",
        "artwork_width_mm", "artwork_height_mm", "charged_width_mm", "charged_height_mm", "charged_area_cm2",
        "pricing_source",
    ):
        if key in costing:
            slot[key] = costing.get(key)
    raw_cost = 0 if zero else float(costing.get("raw_print_cost") or 0)
    final_cost = 0 if zero else float(costing.get("calculated_print_cost") or 0)
    slot["raw_print_cost"] = round(raw_cost, 2)
    slot["calculated_print_cost"] = round(final_cost, 2)
    slot["print_cost_max"] = round(final_cost, 2)
    resolved = routes_main_module._resolve_print_costing(option, slot, final_cost)
    slot["platform_print_cost"] = resolved["platform_print_cost"]
    slot["creator_print_price"] = resolved["creator_print_price"]
    slot["platform_print_profit"] = resolved["platform_print_profit"]
    slot["platform_print_margin_percent"] = resolved["platform_print_margin_percent"]


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
                str(slot.get("print_option_id") or "option"),
            ])
            buckets.setdefault(key, []).append(slot)

        for slots in buckets.values():
            if len(slots) <= 1:
                continue
            first = slots[0]
            area = area_map.get(str(first.get("print_area_id"))) or {}
            option = option_map.get(str(first.get("print_option_id"))) or {}
            combined = _combined_slot(slots)
            costing = routes_main_module._calculate_area_print_cost(combined, area, option)
            _apply_costing_to_slot(routes_main_module, first, costing, option, area, zero=False)
            first["combined_layer_count"] = len(slots)
            first["combined_layer_pricing"] = True
            for duplicate in slots[1:]:
                duplicate_costing = routes_main_module._calculate_area_print_cost(duplicate, area_map.get(str(duplicate.get("print_area_id"))) or area, option_map.get(str(duplicate.get("print_option_id"))) or option)
                _apply_costing_to_slot(routes_main_module, duplicate, duplicate_costing, option_map.get(str(duplicate.get("print_option_id"))) or option, area, zero=True)
                duplicate["combined_layer_pricing"] = True
                duplicate["combined_priced_on_slot_id"] = first.get("id")


def install_builder_artwork_costing_patch(routes_main_module):
    """Install monkey patches into routes_main without replacing the large router file."""
    if getattr(routes_main_module, "_builder_artwork_costing_patch_installed", False):
        return

    original_has_file = routes_main_module._artwork_slot_has_file
    original_normalize_slot = routes_main_module._normalize_product_artwork_slot
    original_enrich = routes_main_module._enrich_and_validate_product_artwork_slots

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

    routes_main_module._artwork_slot_has_file = patched_has_file
    routes_main_module._normalize_product_artwork_slot = patched_normalize_slot
    routes_main_module._enrich_and_validate_product_artwork_slots = patched_enrich
    routes_main_module._builder_artwork_costing_patch_installed = True
