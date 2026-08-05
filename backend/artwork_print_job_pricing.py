"""Authoritative aggregation for multi-layer print jobs."""

from __future__ import annotations

from typing import Any


COMBINABLE_METHODS = {"dtf", "sublimation", "uv_dtf"}


def _number(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _money(value: Any) -> float:
    return round(_number(value), 2)


def _area(value: Any) -> float:
    return round(_number(value), 2)


def normalize_method_key(value: Any) -> str:
    key = str(value or "").strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "dtf_transfers": "dtf",
        "dtf_transfer": "dtf",
        "dtf_print": "dtf",
        "uvdtf": "uv_dtf",
        "uv_dtf_transfer": "uv_dtf",
        "heat_transfer_vinyl": "htv",
        "htv_vinyl": "htv",
        "vinyl": "adhesive_vinyl",
        "adhesive": "adhesive_vinyl",
        "adhesive_vinyls": "adhesive_vinyl",
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


def _has_artwork(slot: dict) -> bool:
    return bool(slot.get("original_url") or slot.get("text_layer") or slot.get("text_content"))


def _profile_id(slot: dict) -> str:
    return str(
        slot.get("manufacturing_profile_id")
        or slot.get("production_profile_id")
        or slot.get("print_option_id")
        or ""
    )


def _method_key(slot: dict) -> str:
    return normalize_method_key(
        slot.get("method_key")
        or slot.get("print_method")
        or slot.get("method_name")
        or slot.get("rule_name")
    )


def is_combinable_print_job(slot: dict) -> bool:
    if slot.get("combine_same_method_layers") is False:
        return False
    if slot.get("combine_layers") is False:
        return False
    if slot.get("additive_layer_pricing") is True:
        return False
    policy = str(
        slot.get("same_method_layer_policy")
        or slot.get("layer_pricing_mode")
        or ""
    ).strip().lower()
    if policy in {"separate", "additive", "per_layer"}:
        return False
    if policy in {"combined", "bounding_area", "per_area", "summed_area"}:
        return True
    return _method_key(slot) in COMBINABLE_METHODS


def _job_key(group_id: str, slot: dict) -> tuple[str, ...]:
    return (
        str(group_id or "group"),
        str(slot.get("screen_id") or "screen"),
        str(slot.get("print_area_id") or "area"),
        _method_key(slot),
        _profile_id(slot) or "profile",
    )


def _reference_cost(slot: dict) -> float:
    return _number(
        slot.get("calculated_print_cost")
        or slot.get("print_cost_max")
        or slot.get("creator_print_price")
        or slot.get("platform_print_cost")
        or 0
    )


def _ratio(slot: dict, key: str, reference: float) -> float:
    value = _number(slot.get(key) or 0)
    return value / reference if reference > 0 and value > 0 else 1.0


def _combined_calculated_cost(slots: list[dict]) -> dict:
    first = slots[0]
    calculation_type = str(first.get("calculation_type") or "fixed").strip().lower()
    combined_area_cm2 = sum(max(0.0, _number(slot.get("area_cm2") or 0)) for slot in slots)
    minimum = max(0.0, _number(first.get("minimum_print_cost") or 0))
    waste_percentage = max(0.0, _number(first.get("waste_percentage") or 0))
    markup_percentage = max(0.0, _number(first.get("markup_percentage") or 0))

    if calculation_type in {"area_fixed_rate", "area", "cm2"}:
        base_cost = combined_area_cm2 * _number(first.get("cost_per_cm2") or 0)
    elif calculation_type in {"sheet", "area_from_sheet"}:
        cost_per_cm2 = _number(first.get("cost_per_cm2") or 0)
        sheet_area_cm2 = (
            (_number(first.get("sheet_width_mm") or 0) / 10)
            * (_number(first.get("sheet_height_mm") or 0) / 10)
        )
        sheet_cost = _number(first.get("sheet_cost") or 0)
        if cost_per_cm2 <= 0 and sheet_area_cm2 > 0 and sheet_cost > 0:
            cost_per_cm2 = sheet_cost / sheet_area_cm2
        base_cost = combined_area_cm2 * cost_per_cm2
    elif calculation_type in {"full_sheet", "sheet_full"}:
        base_cost = _number(
            first.get("sheet_cost")
            or first.get("raw_print_cost")
            or first.get("calculated_print_cost")
            or first.get("print_cost_max")
            or 0
        )
    else:
        final_cost = _reference_cost(first)
        return {
            "calculation_type": calculation_type,
            "combined_area_cm2": _area(combined_area_cm2),
            "raw_print_cost": _money(final_cost),
            "calculated_print_cost": _money(final_cost),
            "minimum_print_cost": _money(minimum),
            "minimum_print_cost_applied": False,
        }

    waste_amount = base_cost * (waste_percentage / 100)
    after_waste = base_cost + waste_amount
    markup_amount = after_waste * (markup_percentage / 100)
    before_minimum = after_waste + markup_amount
    minimum_applied = minimum > 0 and before_minimum < minimum
    final_cost = max(before_minimum, minimum)
    return {
        "calculation_type": calculation_type,
        "combined_area_cm2": _area(combined_area_cm2),
        "base_production_cost": _money(base_cost),
        "waste_amount": _money(waste_amount),
        "markup_amount": _money(markup_amount),
        "raw_print_cost": _money(before_minimum),
        "calculated_print_cost": _money(final_cost),
        "minimum_print_cost": _money(minimum),
        "minimum_print_cost_applied": minimum_applied,
    }


def _line_for_slots(group_id: str, slots: list[dict], combined: bool) -> dict:
    first = slots[0]
    if combined:
        costing = _combined_calculated_cost(slots)
        canonical_cost = _number(costing["calculated_print_cost"])
        reference = _reference_cost(first)
        platform_cost = canonical_cost * _ratio(first, "platform_print_cost", reference)
        creator_cost = canonical_cost * _ratio(first, "creator_print_price", reference)
    else:
        canonical_cost = _reference_cost(first)
        platform_cost = _number(first.get("platform_print_cost") or canonical_cost)
        creator_cost = _number(first.get("creator_print_price") or canonical_cost)
        costing = {
            "calculation_type": str(first.get("calculation_type") or "fixed"),
            "combined_area_cm2": _area(first.get("area_cm2") or 0),
            "raw_print_cost": _money(first.get("raw_print_cost") or canonical_cost),
            "calculated_print_cost": _money(canonical_cost),
            "minimum_print_cost": _money(first.get("minimum_print_cost") or 0),
            "minimum_print_cost_applied": bool(first.get("minimum_print_cost_applied")),
        }
    return {
        "group_id": group_id,
        "slot_ids": [str(slot.get("id") or "") for slot in slots],
        "screen_id": first.get("screen_id"),
        "print_area_id": first.get("print_area_id"),
        "method_key": _method_key(first),
        "profile_id": _profile_id(first),
        "combined": combined,
        "layer_count": len(slots),
        "combined_area_cm2": costing["combined_area_cm2"],
        "calculated_print_cost": _money(canonical_cost),
        "platform_print_cost": _money(platform_cost),
        "creator_print_price": _money(creator_cost),
        "costing": costing,
    }


def aggregate_artwork_print_jobs(artwork_groups: list[dict]) -> list[dict]:
    """Aggregate artwork layers into physical printing jobs."""
    grouped: dict[tuple[str, ...], list[dict]] = {}
    order: list[tuple[str, ...]] = []
    for group in artwork_groups or []:
        group_id = str(group.get("id") or "group")
        for index, slot in enumerate(group.get("artworks") or []):
            if not isinstance(slot, dict) or not _has_artwork(slot) or not slot.get("print_option_id"):
                continue
            key = _job_key(group_id, slot) if is_combinable_print_job(slot) else (
                group_id,
                "individual",
                str(slot.get("id") or index),
            )
            if key not in grouped:
                grouped[key] = []
                order.append(key)
            grouped[key].append(slot)
    lines = []
    for key in order:
        slots = grouped[key]
        combined = len(slots) > 1 and is_combinable_print_job(slots[0])
        lines.append(_line_for_slots(str(key[0]), slots, combined))
    return lines
