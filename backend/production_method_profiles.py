"""Builder-facing views of canonical manufacturing costing profiles."""
from __future__ import annotations

from typing import Any, Dict, List

import outsourced_production_rates as outsourced_rates
from seed_production_operations import normalize_method_key
from manufacturing_profile_colours import (
    profile_available_colour_ids,
    profile_colour_mode,
    profile_stocked_colours,
    profile_supported_colour_ids,
)
from unified_manufacturing_costing import (
    UNIFIED_COSTING_ENGINE_VERSION,
    canonical_profiles_for_method,
    method_with_unified_profiles,
    profile_to_print_option,
)




def _number(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value if value not in (None, "") else fallback)
    except (TypeError, ValueError):
        return float(fallback)

def _normalise_colour(colour: Any) -> Dict[str, Any] | None:
    if isinstance(colour, str):
        value = colour.strip()
        if not value:
            return None
        return {"id": value.lower().replace(" ", "_"), "name": value, "label": value, "value": value, "hex": value if value.startswith("#") else "", "active": True}
    if not isinstance(colour, dict) or colour.get("active") is False:
        return None
    value = str(colour.get("hex") or colour.get("value") or colour.get("code") or colour.get("id") or colour.get("name") or "").strip()
    label = str(colour.get("label") or colour.get("name") or colour.get("id") or value).strip()
    if not (value or label):
        return None
    return {
        **colour,
        "id": str(colour.get("id") or label.lower().replace(" ", "_")),
        "name": label,
        "label": label,
        "value": value or label,
        "hex": str(colour.get("hex") or (value if value.startswith("#") else "")),
        "active": True,
    }


def _method_stocked_colours(method: Dict[str, Any]) -> List[Dict[str, Any]]:
    supported = method.get("supported_colours") or {}
    values = supported.get("colours") if isinstance(supported, dict) else []
    rows = values if isinstance(values, list) else []
    return [item for item in (_normalise_colour(value) for value in rows) if item]


def _method_colour_mode(method: Dict[str, Any]) -> str:
    supported = method.get("supported_colours") or {}
    restrictions = method.get("creator_restrictions") or {}
    mode = str(supported.get("mode") or restrictions.get("colour_picker") or "").lower()
    if mode in {"restricted_library", "stocked_library", "stocked", "restricted", "vinyl"}:
        return "stocked"
    method_key = normalize_method_key(method.get("method_key") or method.get("internal_id"))
    return "stocked" if method_key in {"htv", "adhesive_vinyl"} else "rgb"


def production_method_profile_to_print_option(method: Dict[str, Any], profile: Dict[str, Any]) -> Dict[str, Any]:
    row = profile_to_print_option(method, profile)
    colours = profile_stocked_colours(method, profile)
    colour_mode = _method_colour_mode(method)
    selection_mode = profile_colour_mode(profile)
    row.update({
        "colour_mode": colour_mode,
        "color_mode": colour_mode,
        "colour_selection_mode": selection_mode,
        "color_selection_mode": selection_mode,
        "supported_colour_ids": profile_supported_colour_ids(profile),
        "available_colour_ids": profile_available_colour_ids(profile),
        "approved_stocked_colours": colours,
        "stocked_colours": colours,
    })
    return row


async def list_production_method_print_profiles(db, *, active: bool = True) -> List[Dict[str, Any]]:
    query: Dict[str, Any] = {}
    if active is not None:
        query["active"] = active
    methods = await db.production_methods.find(query, {"_id": 0}).sort("display_name", 1).to_list(200)
    settings = await db.production_rule_settings.find_one(
        {"id": "default"},
        {"_id": 0, "unified_costing_engine_version": 1},
    ) or {}
    migration_complete = settings.get("unified_costing_engine_version") == "unified_manufacturing_costing_v1"

    rows: List[Dict[str, Any]] = []
    for raw_method in methods:
        method = method_with_unified_profiles(raw_method)
        for profile in canonical_profiles_for_method(method):
            if active is True and profile.get("status") != "active":
                continue
            if active is False and profile.get("status") == "active":
                continue
            row = production_method_profile_to_print_option(method, profile)
            if not migration_complete:
                aliases = list(profile.get("legacy_print_option_ids") or [])
                row["id"] = aliases[0] if aliases else profile.get("id")
                row["legacy_print_option_id"] = aliases[0] if aliases else None
            rows.append(row)
    rows = sorted(
        rows,
        key=lambda row: (
            str(row.get("production_method_display_name") or ""),
            0 if row.get("is_default") else 1,
            str(row.get("profile_label") or ""),
        ),
    )

    # Only legacy compatibility rows still need approved outsourced defaults.
    # Canonical manufacturing profiles must preserve their editable saved values.
    legacy_rows = [
        row for row in rows
        if row.get("costing_engine_version") != UNIFIED_COSTING_ENGINE_VERSION
        and row.get("source_type") != "manufacturing_costing_profile"
    ]
    enriched_legacy = await outsourced_rates.enrich_profile_rows(db, legacy_rows) if legacy_rows else []
    legacy_by_id = {str(row.get("id")): row for row in enriched_legacy}
    output: List[Dict[str, Any]] = []
    for row in rows:
        current = legacy_by_id.get(str(row.get("id")), row)
        if current.get("outsourced_rate_profile_key"):
            current["calculation_type"] = "area_fixed_rate"
            current["platform_print_cost"] = 0.0
            current["print_cost_max"] = 0.0
            current["creator_print_price"] = 0.0
            current["minimum_print_cost"] = _number(current.get("minimum_print_cost"), 0.0)
        output.append(current)
    return output
