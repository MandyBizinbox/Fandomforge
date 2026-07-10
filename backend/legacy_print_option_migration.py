"""Migration helpers for importing legacy Print Option costing into Production Methods.

This keeps the migration reversible and explicit. Existing Print Options remain in place,
but their pricing fields can be copied into production_methods.cost_calculation_model
and production_methods.legacy_print_option_costing_profiles so the Builder can use
method-level costing without losing per-option compatibility.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from seed_production_operations import normalize_method_key


PRICING_FIELDS = (
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
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _has_value(value: Any) -> bool:
    return value not in (None, "", [], {})


def _float(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def method_key_from_print_option(option: Dict[str, Any]) -> str:
    return normalize_method_key(
        option.get("method_key")
        or option.get("manufacturing_method_id")
        or option.get("print_method")
        or option.get("method")
        or option.get("rule_name")
    )


def legacy_profile_from_print_option(option: Dict[str, Any]) -> Dict[str, Any]:
    profile: Dict[str, Any] = {
        "source": "legacy_print_option",
        "print_option_id": option.get("id"),
        "print_option_slug": option.get("slug"),
        "rule_name": option.get("rule_name") or option.get("print_method") or option.get("print_size"),
        "print_method": option.get("print_method"),
        "print_size": option.get("print_size"),
        "standard_print_size_key": option.get("standard_print_size_key"),
        "width_mm": option.get("width_mm"),
        "height_mm": option.get("height_mm"),
        "dpi": option.get("dpi"),
        "fit_mode": option.get("fit_mode"),
        "status": option.get("status") or "active",
    }
    for field in PRICING_FIELDS:
        if field in option:
            profile[field] = option.get(field)
    profile.setdefault("calculation_type", "fixed")
    profile.setdefault("platform_print_cost", option.get("platform_print_cost") or option.get("print_cost_max") or 0)
    profile.setdefault("print_cost_max", option.get("print_cost_max") or option.get("platform_print_cost") or 0)
    return profile


def profile_score(profile: Dict[str, Any]) -> tuple:
    active_score = 0 if profile.get("status") == "active" else 1
    has_cost_score = 0 if any(_float(profile.get(field)) > 0 for field in ("platform_print_cost", "print_cost_max", "sheet_cost", "cost_per_cm2")) else 1
    dynamic_score = 0 if profile.get("calculation_type") in {"area_fixed_rate", "area_from_sheet", "sheet"} else 1
    return (active_score, has_cost_score, dynamic_score, str(profile.get("rule_name") or profile.get("print_size") or ""))


def default_profile_for_method(profiles: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not profiles:
        return None
    return sorted(profiles, key=profile_score)[0]


def cost_model_from_profile(profile: Dict[str, Any], *, raw_cost_source: str, existing_model: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    model = dict(existing_model or {})
    model.update({
        "model": model.get("model") or model.get("name") or f"{profile.get('rule_name') or profile.get('print_method') or 'legacy'}_costing",
        "raw_cost_source": raw_cost_source or model.get("raw_cost_source") or "print_option_fallback_to_method",
        "legacy_seeded_from_print_option_id": profile.get("print_option_id"),
        "legacy_seeded_from_print_option_name": profile.get("rule_name") or profile.get("print_size"),
        "legacy_seeded_at": now_iso(),
    })
    for field in PRICING_FIELDS:
        if field in profile and _has_value(profile.get(field)):
            model[field] = profile.get(field)
    model.setdefault("calculation_type", profile.get("calculation_type") or "fixed")
    return model


async def seed_legacy_print_option_costing(
    db,
    *,
    dry_run: bool = False,
    raw_cost_source: str = "print_option_fallback_to_method",
) -> Dict[str, Any]:
    """Copy legacy print option costing into matching production method docs.

    The default raw_cost_source keeps the current Print Option calculation as the
    first source and only uses Method values as fallback. Admin can later switch a
    method to production_method after reviewing the seeded profiles.
    """
    allowed_sources = {"print_option", "print_option_fallback_to_method", "production_method"}
    if raw_cost_source not in allowed_sources:
        raw_cost_source = "print_option_fallback_to_method"

    print_options = await db.print_options.find({}, {"_id": 0}).to_list(1000)
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    skipped_options: List[Dict[str, Any]] = []

    for option in print_options:
        method_key = method_key_from_print_option(option)
        if not method_key:
            skipped_options.append({"id": option.get("id"), "reason": "missing_method_key", "print_method": option.get("print_method")})
            continue
        grouped.setdefault(method_key, []).append(legacy_profile_from_print_option(option))

    method_docs = await db.production_methods.find({}, {"_id": 0}).to_list(200)
    method_map = {normalize_method_key(doc.get("method_key") or doc.get("internal_id")): doc for doc in method_docs}

    updates: List[Dict[str, Any]] = []
    unmatched_methods: Dict[str, int] = {}

    for method_key, profiles in grouped.items():
        method = method_map.get(method_key)
        if not method:
            unmatched_methods[method_key] = len(profiles)
            continue

        profiles = sorted(profiles, key=profile_score)
        default_profile = default_profile_for_method(profiles)
        if not default_profile:
            continue

        existing_model = dict(method.get("cost_calculation_model") or {})
        next_model = cost_model_from_profile(default_profile, raw_cost_source=raw_cost_source, existing_model=existing_model)
        next_model["legacy_profile_count"] = len(profiles)

        update = {
            "method_key": method_key,
            "display_name": method.get("display_name") or method_key,
            "profile_count": len(profiles),
            "default_profile": {
                "print_option_id": default_profile.get("print_option_id"),
                "rule_name": default_profile.get("rule_name"),
                "print_size": default_profile.get("print_size"),
                "calculation_type": default_profile.get("calculation_type"),
            },
            "set": {
                "cost_calculation_model": next_model,
                "legacy_print_option_costing_profiles": profiles,
                "legacy_print_option_costing_seeded_at": now_iso(),
                "updated_at": now_iso(),
            },
        }
        updates.append(update)

        if not dry_run:
            await db.production_methods.update_one({"method_key": method_key}, {"$set": update["set"]})

    return {
        "dry_run": dry_run,
        "raw_cost_source": raw_cost_source,
        "print_options_seen": len(print_options),
        "methods_with_legacy_profiles": len(grouped),
        "methods_updated": 0 if dry_run else len(updates),
        "updates_preview": updates,
        "unmatched_methods": unmatched_methods,
        "skipped_options": skipped_options,
    }
