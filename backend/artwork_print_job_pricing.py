"""Authoritative aggregation for multi-layer print jobs."""

from __future__ import annotations

from typing import Any

from outsourced_production_rates import calculate_outsourced_area_cost


COMBINABLE_METHODS = {"dtf", "sublimation", "uv_dtf"}
AREA_CALCULATION_TYPES = {"area_fixed_rate", "area", "cm2", "sheet", "area_from_sheet"}


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


def _actual_area(slot: dict) -> float:
    return max(0.0, _number(slot.get("area_cm2") or slot.get("charged_area_cm2") or 0))


def _authoritative_costing(slots: list[dict]) -> dict:
    first = slots[0]
    calculation_type = str(first.get("calculation_type") or "fixed").strip().lower()
    combined_area_cm2 = sum(_actual_area(slot) for slot in slots)
    pricing = dict(first)
    pricing["calculation_type"] = calculation_type
    costing = calculate_outsourced_area_cost(
        combined_area_cm2,
        pricing,
        fallback_cost=_reference_cost(first),
    )
    return {
        **costing,
        "combined_area_cm2": _area(combined_area_cm2),
        "actual_area_cm2": _area(combined_area_cm2),
    }


def _stored_single_costing(slot: dict, canonical_cost: float) -> dict:
    return {
        "calculation_type": str(slot.get("calculation_type") or "fixed"),
        "combined_area_cm2": _area(_actual_area(slot)),
        "actual_area_cm2": _area(_actual_area(slot)),
        "chargeable_area_cm2": _area(slot.get("chargeable_area_cm2") or _actual_area(slot)),
        "minimum_area_cm2": _area(slot.get("minimum_area_cm2") or 0),
        "minimum_area_applied": bool(slot.get("minimum_area_applied")),
        "material_cost": _money(slot.get("material_cost") or slot.get("base_production_cost") or 0),
        "base_production_cost": _money(slot.get("base_production_cost") or slot.get("material_cost") or 0),
        "waste_amount": _money(slot.get("waste_amount") or 0),
        "application_cost": _money(slot.get("application_cost") or 0),
        "production_subtotal_before_markup": _money(slot.get("production_subtotal_before_markup") or 0),
        "markup_amount": _money(slot.get("markup_amount") or 0),
        "raw_print_cost": _money(slot.get("raw_print_cost") or canonical_cost),
        "calculated_print_cost": _money(canonical_cost),
        "minimum_print_cost": _money(slot.get("minimum_print_cost") or 0),
        "minimum_print_cost_applied": bool(slot.get("minimum_print_cost_applied")),
    }


def _line_for_slots(group_id: str, slots: list[dict], combined: bool) -> dict:
    first = slots[0]
    calculation_type = str(first.get("calculation_type") or "fixed").strip().lower()
    reference = _reference_cost(first)

    if combined or calculation_type in AREA_CALCULATION_TYPES:
        costing = _authoritative_costing(slots)
        canonical_cost = _number(costing["calculated_print_cost"])
    else:
        canonical_cost = reference
        costing = _stored_single_costing(first, canonical_cost)

    platform_cost = canonical_cost * _ratio(first, "platform_print_cost", reference)
    creator_cost = canonical_cost * _ratio(first, "creator_print_price", reference)

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
        "chargeable_area_cm2": costing.get("chargeable_area_cm2"),
        "minimum_area_cm2": costing.get("minimum_area_cm2"),
        "minimum_area_applied": costing.get("minimum_area_applied"),
        "application_cost": costing.get("application_cost"),
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
