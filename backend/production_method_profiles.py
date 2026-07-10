"""Builder-facing production method pricing profiles.

This is the bridge away from raw legacy Print Options. Legacy Print Options remain
as source/compatibility records, but Template Studio and Creator Builder should
select these production-method profiles. Each returned row is intentionally
PrintOption-compatible because the existing Builder costing code already knows
how to calculate fixed, area and sheet pricing from those fields.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from seed_production_operations import normalize_method_key


PROFILE_PRICING_FIELDS = (
    "calculation_type",
    "platform_print_cost",
    "print_cost_max",
    "sheet_width_mm",
    "sheet_height_mm",
    "sheet_cost",
    "cost_per_cm2",
    "minimum_print_cost",
    "waste_percentage",
    "markup_percentage",
    "creator_print_price",
    "platform_print_markup_type",
    "platform_print_markup_value",
    "pricing_notes",
    "standard_print_size_key",
    "width_mm",
    "height_mm",
    "dpi",
    "fit_mode",
    "print_positions",
    "status",
)


def _num(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value if value not in (None, "") else fallback)
    except (TypeError, ValueError):
        return float(fallback)


def _slug(value: Any) -> str:
    return str(value or "").strip().lower().replace("&", "and").replace("/", " ").replace("-", "_").replace(" ", "_")


def _profile_identity(method_key: str, profile: Dict[str, Any]) -> str:
    return str(
        profile.get("print_option_id")
        or profile.get("id")
        or profile.get("slug")
        or f"production_method:{method_key}:{_slug(profile.get('rule_name') or profile.get('print_size') or 'profile')}"
    )


def _method_default_profile(method: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    model = dict(method.get("cost_calculation_model") or {})
    if not model:
        return None
    if not any(model.get(field) not in (None, "", [], {}) for field in PROFILE_PRICING_FIELDS):
        return None
    return {
        "source": "production_method_default_cost_model",
        "print_option_id": f"production_method:{method.get('method_key')}",
        "rule_name": model.get("model") or model.get("name") or method.get("display_name") or method.get("method_key"),
        "print_method": method.get("display_name") or method.get("method_key"),
        "print_size": model.get("print_size") or "Method Default",
        "status": method.get("status") or ("active" if method.get("active", True) else "draft"),
        **{field: model.get(field) for field in PROFILE_PRICING_FIELDS if field in model},
    }


def production_method_profile_to_print_option(method: Dict[str, Any], profile: Dict[str, Any]) -> Dict[str, Any]:
    method_key = normalize_method_key(method.get("method_key") or method.get("internal_id"))
    method_name = method.get("display_name") or method_key
    profile_id = _profile_identity(method_key, profile)
    rule_name = profile.get("rule_name") or profile.get("print_size") or method_name
    calculation_type = profile.get("calculation_type") or "fixed"
    platform_print_cost = _num(profile.get("platform_print_cost") or profile.get("print_cost_max"), 0)
    print_cost_max = _num(profile.get("print_cost_max") or profile.get("platform_print_cost"), 0)

    row: Dict[str, Any] = {
        "id": profile_id,
        "legacy_print_option_id": profile.get("print_option_id") or None,
        "source": "production_method_profile",
        "production_method_profile": True,
        "production_profile_source": profile.get("source") or "legacy_print_option",
        "production_method_id": method.get("id"),
        "manufacturing_method_id": method_key,
        "production_method_key": method_key,
        "method_key": method_key,
        "method": method_name,
        "print_method": method_name,
        "rule_name": rule_name,
        "display_name": f"{method_name} · {rule_name}",
        "print_size": profile.get("print_size") or profile.get("standard_print_size_key") or "Method Profile",
        "calculation_type": calculation_type,
        "platform_print_cost": platform_print_cost,
        "print_cost_max": print_cost_max,
        "creator_print_price": _num(profile.get("creator_print_price"), 0),
        "platform_print_profit": _num(profile.get("platform_print_profit"), 0),
        "status": profile.get("status") or ("active" if method.get("active", True) else "draft"),
        "source_print_option_id": profile.get("print_option_id") or None,
        "source_print_option_slug": profile.get("print_option_slug") or None,
        "supported_colours": method.get("supported_colours") or {},
        "creator_restrictions": method.get("creator_restrictions") or {},
        "layer_behaviour": method.get("layer_behaviour") or {},
        "press_behaviour": method.get("press_behaviour") or {},
        "cost_calculation_model": method.get("cost_calculation_model") or {},
        "production_method_display_name": method_name,
    }

    for field in PROFILE_PRICING_FIELDS:
        if field in profile and profile.get(field) is not None:
            row[field] = profile.get(field)

    row["platform_print_cost"] = _num(row.get("platform_print_cost") or row.get("print_cost_max"), 0)
    row["print_cost_max"] = _num(row.get("print_cost_max") or row.get("platform_print_cost"), 0)
    row["dpi"] = int(_num(row.get("dpi"), 300) or 300)
    row["fit_mode"] = row.get("fit_mode") or "contain"
    row["print_positions"] = list(row.get("print_positions") or [])
    return row


async def list_production_method_print_profiles(db, *, active: bool = True) -> List[Dict[str, Any]]:
    query: Dict[str, Any] = {}
    if active is not None:
        query["active"] = active
    methods = await db.production_methods.find(query, {"_id": 0}).sort("display_name", 1).to_list(200)
    rows: List[Dict[str, Any]] = []

    for method in methods:
        profiles = list(method.get("legacy_print_option_costing_profiles") or [])
        default_profile = _method_default_profile(method)
        if default_profile and not profiles:
            profiles.append(default_profile)

        for profile in profiles:
            if not isinstance(profile, dict):
                continue
            rows.append(production_method_profile_to_print_option(method, profile))

    return sorted(rows, key=lambda row: (str(row.get("production_method_display_name") or ""), str(row.get("rule_name") or ""), str(row.get("print_size") or "")))
