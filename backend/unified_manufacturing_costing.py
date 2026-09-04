"""Canonical manufacturing costing profiles and migration helpers.

Production methods own one list of ``costing_profiles``. Legacy Print Options are
retained only as compatibility aliases while templates and live products are
backfilled to canonical manufacturing profile ids. Historical order snapshots are
never rewritten.
"""
from __future__ import annotations

import copy
import re
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple

from outsourced_production_rates import (
    OUTSOURCED_RATE_VERSION,
    method_key_for_record,
    pricing_values_for_record,
    profile_key_for_record,
)
from seed_production_operations import normalize_method_key


UNIFIED_COSTING_ENGINE_VERSION = "unified_manufacturing_costing_v1"
PROFILE_PRICING_FIELDS = (
    "calculation_type",
    "platform_print_cost",
    "print_cost_max",
    "cost_per_cm2",
    "minimum_area_cm2",
    "application_cost",
    "minimum_print_cost",
    "sheet_width_mm",
    "sheet_height_mm",
    "sheet_cost",
    "creator_print_price",
    "waste_percentage",
    "markup_percentage",
    "platform_print_markup_type",
    "platform_print_markup_value",
    "pricing_notes",
    "standard_print_size_key",
    "width_mm",
    "height_mm",
    "dpi",
    "fit_mode",
    "print_positions",
    "placement_tags",
    "status",
    "outsourced_rate_profile_key",
    "outsourced_rate_profile_label",
    "outsourced_rate_version",
)
DEFAULT_PROFILE_KEYS = {
    "dtf": "standard_dtf",
    "sublimation": "flat_sublimation",
    "htv": "classic_htv",
    "uv_dtf": "uv_dtf",
    "adhesive_vinyl": "classic_adhesive_vinyl",
}
REFERENCE_SCALAR_KEYS = {
    "print_option_id",
    "selected_print_option_id",
    "manufacturing_profile_id",
    "production_profile_id",
    "selected_manufacturing_profile_id",
    "selected_production_profile_id",
}
REFERENCE_LIST_KEYS = {
    "print_option_ids",
    "allowed_print_option_ids",
    "manufacturing_profile_ids",
    "production_profile_ids",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_set(value: Any) -> bool:
    return value not in (None, "", [], {})


def _number(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value if value not in (None, "") else fallback)
    except (TypeError, ValueError):
        return float(fallback)


def _slug(value: Any) -> str:
    raw = str(value or "").strip().lower().replace("&", " and ")
    raw = re.sub(r"[^a-z0-9]+", "_", raw)
    return re.sub(r"_+", "_", raw).strip("_")


def _text_list(value: Any) -> List[str]:
    if isinstance(value, list):
        raw = value
    elif isinstance(value, str):
        raw = re.split(r"[\n,]+", value)
    else:
        raw = []
    out: List[str] = []
    for item in raw:
        token = str(item or "").strip()
        if token and token not in out:
            out.append(token)
    return out


def profile_display_name(profile: Dict[str, Any], method_key: str = "") -> str:
    method = normalize_method_key(method_key or profile.get("method_key"))
    value = (
        profile.get("display_name")
        or profile.get("profile_name")
        or profile.get("profile_label")
        or profile.get("rule_name")
        or profile.get("print_method")
        or profile.get("print_size")
        or profile.get("outsourced_rate_profile_label")
        or method.upper()
        or "Costing Profile"
    )
    text = re.sub(r"\s+", " ", str(value).strip())
    return text or "Costing Profile"


def _legacy_aliases(profile: Dict[str, Any], canonical_id: str) -> List[str]:
    aliases: List[str] = []
    candidates: Iterable[Any] = (
        profile.get("legacy_print_option_ids") or [],
        profile.get("print_option_id"),
        profile.get("source_print_option_id"),
        profile.get("legacy_print_option_id"),
        profile.get("legacy_source_identifier"),
        profile.get("id"),
        profile.get("profile_id"),
        profile.get("manufacturing_profile_id"),
    )
    for candidate in candidates:
        values = candidate if isinstance(candidate, list) else [candidate]
        for value in values:
            token = str(value or "").strip()
            if token and token != canonical_id and token not in aliases:
                aliases.append(token)
    return aliases


def canonical_profile_id(method_key: str, profile: Dict[str, Any]) -> str:
    method = normalize_method_key(method_key or profile.get("method_key")) or "method"
    explicit = str(
        profile.get("manufacturing_profile_id")
        or profile.get("profile_id")
        or profile.get("id")
        or ""
    ).strip()
    if explicit.startswith("profile:"):
        return explicit

    rate_key = profile.get("outsourced_rate_profile_key") or profile_key_for_record(profile, method)
    if rate_key:
        return f"profile:{method}:{_slug(rate_key)}"

    identity = (
        profile.get("profile_name")
        or profile.get("display_name")
        or profile.get("rule_name")
        or profile.get("print_method")
        or profile.get("print_size")
        or profile.get("standard_print_size_key")
        or explicit
        or "standard"
    )
    return f"profile:{method}:{_slug(identity) or 'standard'}"


def _apply_approved_rate(profile: Dict[str, Any], method_key: str) -> Dict[str, Any]:
    # Canonical profiles are editable manufacturing records. Once migrated, do not
    # overwrite their saved pricing with legacy outsourced defaults on every read.
    if (
        profile.get("costing_engine_version") == UNIFIED_COSTING_ENGINE_VERSION
        and str(profile.get("id") or profile.get("profile_id") or "").startswith("profile:")
    ):
        return profile
    values = pricing_values_for_record(profile, method_key)
    if not values:
        return profile
    return {**profile, **values, "platform_print_cost": 0.0, "print_cost_max": 0.0, "creator_print_price": 0.0}


def normalize_costing_profile(
    profile: Dict[str, Any],
    method_key: str,
    *,
    is_default: bool = False,
) -> Dict[str, Any]:
    method = normalize_method_key(method_key or profile.get("method_key"))
    source = _apply_approved_rate(dict(profile or {}), method)
    canonical_id = canonical_profile_id(method, source)
    calculation_type = str(source.get("calculation_type") or "fixed").strip().lower()
    if calculation_type == "sheet_full":
        calculation_type = "full_sheet"
    elif calculation_type == "sheet":
        has_sheet_dimensions = _number(source.get("sheet_width_mm")) > 0 and _number(source.get("sheet_height_mm")) > 0
        has_area_rate = _number(source.get("cost_per_cm2")) > 0
        calculation_type = "area_from_sheet" if has_area_rate or has_sheet_dimensions else "full_sheet"
    status = str(source.get("status") or "active").strip().lower()
    if status not in {"active", "inactive", "archived", "draft"}:
        status = "active"

    row: Dict[str, Any] = {
        "id": canonical_id,
        "profile_id": canonical_id,
        "manufacturing_profile_id": canonical_id,
        "method_key": method,
        "display_name": source.get("outsourced_rate_profile_label") or profile_display_name(source, method),
        "profile_name": source.get("outsourced_rate_profile_label") or profile_display_name(source, method),
        "status": status,
        "is_default": bool(source.get("is_default", is_default)),
        "calculation_type": calculation_type,
        "legacy_print_option_ids": _legacy_aliases(source, canonical_id),
        "source_type": "manufacturing_costing_profile",
        "costing_engine_version": UNIFIED_COSTING_ENGINE_VERSION,
        "updated_at": source.get("updated_at") or now_iso(),
    }

    for field in PROFILE_PRICING_FIELDS:
        if field in source and _is_set(source.get(field)):
            row[field] = copy.deepcopy(source.get(field))

    for field in (
        "platform_print_cost",
        "print_cost_max",
        "cost_per_cm2",
        "minimum_area_cm2",
        "application_cost",
        "minimum_print_cost",
        "sheet_width_mm",
        "sheet_height_mm",
        "sheet_cost",
        "creator_print_price",
        "waste_percentage",
        "markup_percentage",
        "platform_print_markup_value",
        "width_mm",
        "height_mm",
    ):
        row[field] = _number(row.get(field), 0.0)

    row["platform_print_markup_type"] = str(row.get("platform_print_markup_type") or "manual")
    row["pricing_notes"] = str(row.get("pricing_notes") or "")
    row["print_positions"] = _text_list(row.get("print_positions") or row.get("placement_tags"))
    row["placement_tags"] = list(row["print_positions"])
    row["dpi"] = int(_number(row.get("dpi"), 300) or 300)
    row["fit_mode"] = str(row.get("fit_mode") or "contain")
    row.setdefault("minimum_area_cm2", 0.0)
    row.setdefault("application_cost", 0.0)
    row.setdefault("minimum_print_cost", 0.0)
    return row


def _profile_score(profile: Dict[str, Any]) -> Tuple[int, int, int, str]:
    return (
        0 if profile.get("status") == "active" else 1,
        0 if profile.get("outsourced_rate_version") == OUTSOURCED_RATE_VERSION else 1,
        0 if profile.get("is_default") else 1,
        str(profile.get("display_name") or ""),
    )


def _merge_profiles(existing: Dict[str, Any], incoming: Dict[str, Any]) -> Dict[str, Any]:
    preferred, secondary = sorted([existing, incoming], key=_profile_score)
    merged = {**secondary, **preferred}
    aliases = []
    for value in list(existing.get("legacy_print_option_ids") or []) + list(incoming.get("legacy_print_option_ids") or []):
        token = str(value or "").strip()
        if token and token != merged.get("id") and token not in aliases:
            aliases.append(token)
    merged["legacy_print_option_ids"] = aliases
    merged["print_positions"] = _text_list(
        list(existing.get("print_positions") or []) + list(incoming.get("print_positions") or [])
    )
    merged["placement_tags"] = list(merged["print_positions"])
    merged["is_default"] = bool(existing.get("is_default") or incoming.get("is_default"))
    if existing.get("status") == "active" or incoming.get("status") == "active":
        merged["status"] = "active"
    return merged


def canonical_profiles_for_method(
    method: Dict[str, Any],
    *,
    additional_profiles: Optional[Iterable[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    method_key = normalize_method_key(method.get("method_key") or method.get("internal_id"))
    source_profiles: List[Dict[str, Any]] = []
    for source in (
        method.get("costing_profiles") or [],
        method.get("legacy_print_option_costing_profiles") or [],
        list(additional_profiles or []),
    ):
        source_profiles.extend(dict(row or {}) for row in source if isinstance(row, dict))

    if not source_profiles and isinstance(method.get("cost_calculation_model"), dict):
        source_profiles.append({
            **method.get("cost_calculation_model"),
            "display_name": method.get("display_name") or method_key,
            "is_default": True,
        })

    by_id: Dict[str, Dict[str, Any]] = {}
    for index, source in enumerate(source_profiles):
        normalised = normalize_costing_profile(source, method_key, is_default=index == 0)
        profile_id = normalised["id"]
        by_id[profile_id] = _merge_profiles(by_id[profile_id], normalised) if profile_id in by_id else normalised

    profiles = sorted(by_id.values(), key=_profile_score)
    configured_default = str(method.get("default_costing_profile_id") or "")
    default_key = DEFAULT_PROFILE_KEYS.get(method_key)
    default_id = (
        configured_default
        if configured_default in by_id
        else next((row["id"] for row in profiles if row.get("is_default")), "")
    )
    if not default_id and default_key:
        default_id = next((row["id"] for row in profiles if row.get("outsourced_rate_profile_key") == default_key), "")
    if not default_id:
        default_id = next((row["id"] for row in profiles if row.get("status") == "active"), profiles[0]["id"] if profiles else "")

    for profile in profiles:
        profile["is_default"] = profile["id"] == default_id
    return profiles


def compatibility_cost_model(profile: Optional[Dict[str, Any]], method_key: str = "") -> Dict[str, Any]:
    if not profile:
        return {"raw_cost_source": "production_method", "costing_engine_version": UNIFIED_COSTING_ENGINE_VERSION}
    model = {field: copy.deepcopy(profile.get(field)) for field in PROFILE_PRICING_FIELDS if field in profile}
    model.update({
        "model": f"unified_{normalize_method_key(method_key or profile.get('method_key'))}_costing",
        "raw_cost_source": "production_method",
        "default_costing_profile_id": profile.get("id"),
        "costing_engine_version": UNIFIED_COSTING_ENGINE_VERSION,
    })
    return model


def method_with_unified_profiles(method: Dict[str, Any]) -> Dict[str, Any]:
    row = dict(method or {})
    profiles = canonical_profiles_for_method(row)
    default_profile = next((profile for profile in profiles if profile.get("is_default")), profiles[0] if profiles else None)
    storage_active = isinstance(row.get("costing_profiles"), list)
    row.update({
        "costing_profiles": profiles,
        "default_costing_profile_id": default_profile.get("id") if default_profile else None,
        "cost_calculation_model": compatibility_cost_model(default_profile, row.get("method_key")),
        "costing_engine_version": row.get("costing_engine_version") or UNIFIED_COSTING_ENGINE_VERSION,
        "canonical_costing_storage_active": storage_active,
        "legacy_profile_count": len(row.get("legacy_print_option_costing_profiles") or []),
    })
    return row


def _profile_matches_identifier(profile: Dict[str, Any], identifier: str) -> bool:
    token = str(identifier or "").strip()
    return bool(token) and token in {
        str(profile.get("id") or ""),
        str(profile.get("profile_id") or ""),
        str(profile.get("manufacturing_profile_id") or ""),
        *[str(value) for value in profile.get("legacy_print_option_ids") or []],
    }


def resolve_costing_profile(
    method: Optional[Dict[str, Any]],
    identifier: Any = None,
    *,
    option: Optional[Dict[str, Any]] = None,
    slot: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    row = method_with_unified_profiles(method or {})
    profiles = row.get("costing_profiles") or []
    candidates = [
        identifier,
        (slot or {}).get("manufacturing_profile_id"),
        (slot or {}).get("production_profile_id"),
        (slot or {}).get("print_option_id"),
        (option or {}).get("manufacturing_profile_id"),
        (option or {}).get("production_profile_id"),
        (option or {}).get("id"),
    ]
    for candidate in candidates:
        for profile in profiles:
            if _profile_matches_identifier(profile, str(candidate or "")):
                return profile
    default_id = row.get("default_costing_profile_id")
    return next((profile for profile in profiles if profile.get("id") == default_id), profiles[0] if profiles else None)


def profile_to_print_option(method: Dict[str, Any], profile: Dict[str, Any]) -> Dict[str, Any]:
    method_row = method_with_unified_profiles(method)
    profile = normalize_costing_profile(profile, method_row.get("method_key"), is_default=profile.get("is_default", False))
    canonical_id = profile["id"]
    aliases = profile.get("legacy_print_option_ids") or []
    exposed_id = canonical_id if method_row.get("canonical_costing_storage_active") else (aliases[0] if aliases else canonical_id)
    display_name = profile_display_name(profile, method_row.get("method_key"))
    row = {
        **profile,
        "id": exposed_id,
        "profile_id": canonical_id,
        "manufacturing_profile_id": canonical_id,
        "production_profile_id": canonical_id,
        "legacy_print_option_id": aliases[0] if aliases else None,
        "source_print_option_id": aliases[0] if aliases else None,
        "method_key": method_row.get("method_key"),
        "production_method_key": method_row.get("method_key"),
        "manufacturing_method_id": method_row.get("method_key"),
        "production_method_display_name": method_row.get("display_name") or method_row.get("method_key"),
        "print_method": display_name,
        "method_name": display_name,
        "rule_name": display_name,
        "print_size": profile.get("print_size") or display_name,
        "display_label": display_name,
        "profile_label": display_name,
        "calculation_type": profile.get("calculation_type") or "fixed",
        "status": profile.get("status") or "active",
        "source_type": "manufacturing_costing_profile",
        "production_pricing_source": "production_method",
        "costing_engine_version": UNIFIED_COSTING_ENGINE_VERSION,
    }
    return row


def canonical_print_option_projection(method: Dict[str, Any], profile: Dict[str, Any]) -> Dict[str, Any]:
    method_row = {**method, "canonical_costing_storage_active": True}
    row = profile_to_print_option(method_row, profile)
    row["id"] = profile.get("id")
    row["canonical_profile_projection"] = True
    row["legacy_alias_only"] = False
    row["created_at"] = row.get("created_at") or now_iso()
    row["updated_at"] = now_iso()
    return row


def profile_alias_map(methods: Iterable[Dict[str, Any]]) -> Tuple[Dict[str, str], List[Dict[str, str]]]:
    aliases: Dict[str, str] = {}
    conflicts: List[Dict[str, str]] = []
    for method in methods:
        for profile in canonical_profiles_for_method(method):
            canonical_id = str(profile.get("id") or "")
            for alias in [canonical_id, *(profile.get("legacy_print_option_ids") or [])]:
                token = str(alias or "").strip()
                if not token:
                    continue
                existing = aliases.get(token)
                if existing and existing != canonical_id:
                    conflicts.append({"alias": token, "first_profile_id": existing, "second_profile_id": canonical_id})
                    continue
                aliases[token] = canonical_id
    return aliases, conflicts


def rewrite_profile_references(value: Any, aliases: Dict[str, str], *, parent_key: str = "") -> Tuple[Any, int]:
    changes = 0
    if isinstance(value, dict):
        result: Dict[str, Any] = {}
        for key, item in value.items():
            if key in REFERENCE_SCALAR_KEYS and isinstance(item, str) and item in aliases:
                replacement = aliases[item]
                result[key] = replacement
                if replacement != item:
                    changes += 1
                if key == "print_option_id":
                    result.setdefault("manufacturing_profile_id", replacement)
                    result.setdefault("production_profile_id", replacement)
            elif key in REFERENCE_LIST_KEYS and isinstance(item, list):
                next_values = []
                for entry in item:
                    replacement = aliases.get(str(entry), entry)
                    if replacement != entry:
                        changes += 1
                    if replacement not in next_values:
                        next_values.append(replacement)
                result[key] = next_values
            else:
                result[key], nested_changes = rewrite_profile_references(item, aliases, parent_key=key)
                changes += nested_changes
        return result, changes
    if isinstance(value, list):
        result = []
        for item in value:
            rewritten, nested_changes = rewrite_profile_references(item, aliases, parent_key=parent_key)
            result.append(rewritten)
            changes += nested_changes
        return result, changes
    return value, 0


def _top_level_set_updates(original: Dict[str, Any], rewritten: Dict[str, Any]) -> Dict[str, Any]:
    return {
        key: value
        for key, value in rewritten.items()
        if key != "_id" and original.get(key) != value
    }


async def sync_canonical_print_option_projections(
    db,
    method: Dict[str, Any],
    *,
    mark_stale_archived: bool = True,
) -> Dict[str, int]:
    method_row = method_with_unified_profiles(method)
    method_key = normalize_method_key(method_row.get("method_key") or method_row.get("internal_id"))
    profiles = method_row.get("costing_profiles") or []
    profile_ids = [str(profile.get("id")) for profile in profiles if profile.get("id")]
    projections_upserted = 0
    aliases_updated = 0
    stale_archived = 0

    for profile in profiles:
        projection = canonical_print_option_projection(method_row, profile)
        result = await db.print_options.update_one(
            {"id": projection["id"]},
            {"$set": projection},
            upsert=True,
        )
        projections_upserted += 1 if result.upserted_id or result.modified_count else 0
        for alias in profile.get("legacy_print_option_ids") or []:
            result = await db.print_options.update_one(
                {"id": alias, "canonical_profile_projection": {"$ne": True}},
                {"$set": {
                    "manufacturing_profile_id": profile["id"],
                    "production_profile_id": profile["id"],
                    "legacy_alias_only": True,
                    "costing_engine_version": UNIFIED_COSTING_ENGINE_VERSION,
                    "updated_at": now_iso(),
                }},
            )
            aliases_updated += int(result.modified_count or 0)

    if mark_stale_archived:
        query: Dict[str, Any] = {
            "canonical_profile_projection": True,
            "method_key": method_key,
        }
        if profile_ids:
            query["id"] = {"$nin": profile_ids}
        result = await db.print_options.update_many(
            query,
            {"$set": {"status": "archived", "orphaned_profile_projection": True, "updated_at": now_iso()}},
        )
        stale_archived = int(result.modified_count or 0)

    return {
        "projections_upserted": projections_upserted,
        "aliases_updated": aliases_updated,
        "stale_projections_archived": stale_archived,
    }


async def migrate_unified_manufacturing_costing(
    db,
    *,
    dry_run: bool = True,
    strict: bool = True,
) -> Dict[str, Any]:
    methods = await db.production_methods.find({}, {"_id": 0}).to_list(200)
    print_options = await db.print_options.find({"canonical_profile_projection": {"$ne": True}}, {"_id": 0}).to_list(5000)
    options_by_method: Dict[str, List[Dict[str, Any]]] = {}
    unclassified_options: List[Dict[str, Any]] = []
    for option in print_options:
        method = normalize_method_key(
            option.get("method_key")
            or option.get("manufacturing_method_id")
            or option.get("method")
            or option.get("print_method")
        ) or method_key_for_record(option)
        if method:
            options_by_method.setdefault(method, []).append(option)
        else:
            unclassified_options.append(option)

    known_method_keys = {
        normalize_method_key(method.get("method_key") or method.get("internal_id"))
        for method in methods
    }
    unmatched_method_options = [
        option
        for method_key, options in options_by_method.items()
        if method_key not in known_method_keys
        for option in options
    ]

    planned_methods: List[Dict[str, Any]] = []
    canonical_methods: List[Dict[str, Any]] = []
    for method in methods:
        method_key = normalize_method_key(method.get("method_key") or method.get("internal_id"))
        profiles = canonical_profiles_for_method(method, additional_profiles=options_by_method.get(method_key) or [])
        default_profile = next((profile for profile in profiles if profile.get("is_default")), profiles[0] if profiles else None)
        next_method = {
            **method,
            "costing_profiles": profiles,
            "default_costing_profile_id": default_profile.get("id") if default_profile else None,
            "costing_engine_version": UNIFIED_COSTING_ENGINE_VERSION,
            "costing_engine_migrated_at": now_iso(),
            "updated_at": now_iso(),
        }
        next_method["cost_calculation_model"] = compatibility_cost_model(default_profile, method_key)
        canonical_methods.append(next_method)
        planned_methods.append({
            "method_key": method_key,
            "profiles_before": len(method.get("costing_profiles") or method.get("legacy_print_option_costing_profiles") or []),
            "profiles_after": len(profiles),
            "default_profile_id": next_method.get("default_costing_profile_id"),
            "profile_ids": [profile.get("id") for profile in profiles],
            "legacy_alias_count": sum(len(profile.get("legacy_print_option_ids") or []) for profile in profiles),
        })

    alias_map, conflicts = profile_alias_map(canonical_methods)
    unmatched_options = [
        option for option in print_options
        if option.get("id") and str(option.get("id")) not in alias_map
    ]
    blocking_unmatched_by_id: Dict[str, Dict[str, Any]] = {}
    for option in [*unmatched_options, *unmatched_method_options, *unclassified_options]:
        if str(option.get("status") or "active").lower() != "active":
            continue
        option_id = str(option.get("id") or "").strip()
        if option_id:
            blocking_unmatched_by_id.setdefault(option_id, option)
    blocking_unmatched = list(blocking_unmatched_by_id.values())
    if strict and not dry_run and (conflicts or blocking_unmatched):
        reasons = []
        if conflicts:
            reasons.append(f"{len(conflicts)} profile alias conflict(s)")
        if blocking_unmatched:
            reasons.append(f"{len(blocking_unmatched)} active legacy option(s) could not be mapped")
        raise ValueError("Unified costing migration blocked: " + ", ".join(reasons))

    collections = (
        ("product_templates", 5000),
        ("products", 20000),
        ("printer_template_prices", 10000),
        ("builder_drafts", 10000),
    )
    collection_plans: Dict[str, List[Dict[str, Any]]] = {}
    reference_changes = 0
    for collection_name, limit in collections:
        collection = getattr(db, collection_name)
        documents = await collection.find({}, {"_id": 0}).to_list(limit)
        plans: List[Dict[str, Any]] = []
        for document in documents:
            rewritten, count = rewrite_profile_references(document, alias_map)
            if count:
                updates = _top_level_set_updates(document, rewritten)
                if updates:
                    plans.append({"id": document.get("id"), "updates": updates, "changes": count})
                    reference_changes += count
        collection_plans[collection_name] = plans

    option_plans = []
    for option in print_options:
        option_id = str(option.get("id") or "")
        canonical_id = alias_map.get(option_id)
        if canonical_id:
            option_plans.append({"id": option_id, "manufacturing_profile_id": canonical_id})

    projection_count = sum(len(method.get("costing_profiles") or []) for method in canonical_methods)
    projection_sync = {"projections_upserted": 0, "aliases_updated": 0, "stale_projections_archived": 0}

    if not dry_run:
        for method in canonical_methods:
            sync = await sync_canonical_print_option_projections(db, method)
            for key, value in sync.items():
                projection_sync[key] += int(value or 0)

        for method in canonical_methods:
            method_key = normalize_method_key(method.get("method_key") or method.get("internal_id"))
            await db.production_methods.update_one(
                {"method_key": method_key},
                {
                    "$set": {
                        "costing_profiles": method.get("costing_profiles") or [],
                        "default_costing_profile_id": method.get("default_costing_profile_id"),
                        "cost_calculation_model": method.get("cost_calculation_model") or {},
                        "costing_engine_version": UNIFIED_COSTING_ENGINE_VERSION,
                        "costing_engine_migrated_at": method.get("costing_engine_migrated_at"),
                        "updated_at": method.get("updated_at"),
                    },
                    "$unset": {"legacy_print_option_costing_profiles": ""},
                },
            )

        for plan in option_plans:
            await db.print_options.update_one(
                {"id": plan["id"]},
                {"$set": {
                    "manufacturing_profile_id": plan["manufacturing_profile_id"],
                    "production_profile_id": plan["manufacturing_profile_id"],
                    "legacy_alias_only": True,
                    "costing_engine_version": UNIFIED_COSTING_ENGINE_VERSION,
                    "updated_at": now_iso(),
                }},
            )

        for collection_name, plans in collection_plans.items():
            collection = getattr(db, collection_name)
            for plan in plans:
                if plan.get("id"):
                    await collection.update_one({"id": plan["id"]}, {"$set": plan["updates"]})

        await db.production_rule_settings.update_one(
            {"id": "default"},
            {"$set": {
                "unified_costing_engine_version": UNIFIED_COSTING_ENGINE_VERSION,
                "unified_costing_migration_completed_at": now_iso(),
                "updated_at": now_iso(),
            }},
            upsert=True,
        )

    def ids(rows: Iterable[Dict[str, Any]]) -> List[str]:
        return [str(row.get("id") or row.get("rule_name") or row.get("print_method") or "") for row in rows]

    return {
        "dry_run": dry_run,
        "strict": strict,
        "version": UNIFIED_COSTING_ENGINE_VERSION,
        "methods_seen": len(methods),
        "methods_updated": 0 if dry_run else len(canonical_methods),
        "profiles_total": projection_count,
        "canonical_projections_planned": projection_count,
        "canonical_projections_written": 0 if dry_run else projection_sync["projections_upserted"],
        "legacy_print_options_seen": len(print_options),
        "legacy_aliases_mapped": len(option_plans),
        "legacy_aliases_unmatched": ids(unmatched_options),
        "active_unmatched_aliases": ids(blocking_unmatched),
        "unclassified_legacy_options": ids(unclassified_options),
        "alias_conflicts": conflicts,
        "templates_to_update": len(collection_plans.get("product_templates") or []),
        "templates_updated": 0 if dry_run else len(collection_plans.get("product_templates") or []),
        "products_to_update": len(collection_plans.get("products") or []),
        "products_updated": 0 if dry_run else len(collection_plans.get("products") or []),
        "printer_prices_to_update": len(collection_plans.get("printer_template_prices") or []),
        "builder_drafts_to_update": len(collection_plans.get("builder_drafts") or []),
        "reference_changes": reference_changes,
        "orders_updated": 0,
        "projection_sync": projection_sync,
        "method_preview": planned_methods,
    }
