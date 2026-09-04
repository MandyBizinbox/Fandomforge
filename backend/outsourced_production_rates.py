"""Outsourced production-rate catalogue and controlled batch migration.

The platform allocates supplier running-metre cost by usable roll area because
FandomForge jobs are routinely combined with other gang-sheet work. Each physical
print/application job therefore uses:

    max(actual_area_cm2, minimum_area_cm2) * cost_per_cm2
    + application_cost
    + configured markup

Supplier billing increments are deliberately excluded from product-level costing.
"""
from __future__ import annotations

import re
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

from legacy_print_option_migration import (
    legacy_profile_from_print_option,
    method_key_from_print_option,
)
from seed_production_operations import normalize_method_key


OUTSOURCED_RATE_VERSION = "2026-08-05-v1"
COMMON_PRICING = {
    "calculation_type": "area_fixed_rate",
    "minimum_area_cm2": 100.0,
    "application_cost": 7.5,
    "minimum_print_cost": 0.0,
    "waste_percentage": 0.0,
    "markup_percentage": 5.0,
    # Canonical outsourced profiles derive their raw cost from area rates, not
    # legacy fixed Print Option fields. Keep those compatibility fields neutral.
    "platform_print_cost": 0.0,
    "print_cost_max": 0.0,
    "creator_print_price": 0.0,
}

RATE_SPECS: Dict[str, Dict[str, Any]] = {
    "standard_dtf": {"label": "Standard DTF", "method_key": "dtf", "cost_per_cm2": 0.07},
    "uv_dtf": {"label": "UV DTF", "method_key": "uv_dtf", "cost_per_cm2": 0.077},
    "flat_sublimation": {"label": "Flat sublimation print", "method_key": "sublimation", "cost_per_cm2": 0.056},
    "mug_sublimation": {"label": "Mug sublimation print", "method_key": "sublimation", "cost_per_cm2": 0.056},
    "tumbler_sublimation": {"label": "Tumbler sublimation print", "method_key": "sublimation", "cost_per_cm2": 0.056},
    "classic_htv": {"label": "Classic HTV", "method_key": "htv", "cost_per_cm2": 62.5 / 2200},
    "glitter_htv": {"label": "Glitter HTV", "method_key": "htv", "cost_per_cm2": 125 / 2200},
    "puff_htv": {"label": "Puff HTV", "method_key": "htv", "cost_per_cm2": 125 / 2200},
    "metallic_htv": {"label": "Metallic HTV", "method_key": "htv", "cost_per_cm2": 110 / 2200},
    "glow_htv": {"label": "Glow HTV", "method_key": "htv", "cost_per_cm2": 180 / 2200},
    "classic_adhesive_vinyl": {"label": "Classic adhesive vinyl", "method_key": "adhesive_vinyl", "cost_per_cm2": 90 / 2200},
}

EXPECTED_PROFILE_KEYS = tuple(RATE_SPECS.keys())
COVERED_METHODS = {spec["method_key"] for spec in RATE_SPECS.values()}
DIRECT_APPLICATION_OPERATION_TYPES = {"heat_press", "application"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def number(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value if value not in (None, "") else fallback)
    except (TypeError, ValueError):
        return float(fallback)


def money(value: Any) -> float:
    # Financial manufacturing values use decimal half-up rounding consistently.
    try:
        decimal_value = Decimal(str(value if value not in (None, "") else 0))
    except Exception:
        decimal_value = Decimal("0")
    return float(decimal_value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def area(value: Any) -> float:
    return round(number(value), 2)


def _text_key(value: Any) -> str:
    raw = str(value or "").strip().lower().replace("&", " and ")
    raw = re.sub(r"[^a-z0-9]+", "_", raw)
    return re.sub(r"_+", "_", raw).strip("_")


def record_text(record: Optional[Dict[str, Any]]) -> str:
    row = record or {}
    fields = (
        "method_key",
        "manufacturing_method_id",
        "print_method",
        "method",
        "id",
        "profile_id",
        "manufacturing_profile_id",
        "production_profile_id",
        "method_name",
        "display_name",
        "rule_name",
        "profile_name",
        "profile_label",
        "display_label",
        "print_size",
        "standard_print_size_key",
        "slug",
        "pricing_notes",
        "production_notes",
    )
    return _text_key(" ".join(str(row.get(field) or "") for field in fields))


def method_key_for_record(record: Optional[Dict[str, Any]], fallback: str = "") -> str:
    row = record or {}
    explicit = normalize_method_key(
        row.get("method_key")
        or row.get("manufacturing_method_id")
        or row.get("production_method_key")
        or row.get("method")
        or fallback
    )
    if explicit in COVERED_METHODS:
        return explicit
    inferred = method_key_from_print_option(row)
    return inferred if inferred in COVERED_METHODS else explicit


def profile_key_for_record(record: Optional[Dict[str, Any]], fallback_method: str = "") -> Optional[str]:
    row = record or {}
    method = method_key_for_record(row, fallback_method)
    text = record_text(row)

    if method == "dtf":
        return "standard_dtf"
    if method == "uv_dtf":
        return "uv_dtf"
    if method == "sublimation":
        if any(token in text for token in ("tumbler", "water_bottle", "bottle")):
            return "tumbler_sublimation"
        if "mug" in text:
            return "mug_sublimation"
        return "flat_sublimation"
    if method == "htv":
        if "glitter" in text:
            return "glitter_htv"
        if any(token in text for token in ("puff", "3d_puff", "3_d_puff")):
            return "puff_htv"
        if "metallic" in text:
            return "metallic_htv"
        if any(token in text for token in ("glow", "dark")):
            return "glow_htv"
        return "classic_htv"
    if method == "adhesive_vinyl":
        excluded = (
            "frosted",
            "etched",
            "glow",
            "metallic",
            "colour_change",
            "color_change",
            "chrome",
            "holographic",
        )
        if any(token in text for token in excluded):
            return None
        return "classic_adhesive_vinyl"
    return None


def pricing_values_for_record(record: Optional[Dict[str, Any]], fallback_method: str = "") -> Optional[Dict[str, Any]]:
    profile_key = profile_key_for_record(record, fallback_method)
    if not profile_key:
        return None
    spec = RATE_SPECS[profile_key]
    return {
        **COMMON_PRICING,
        "cost_per_cm2": round(number(spec["cost_per_cm2"]), 6),
        "outsourced_rate_profile_key": profile_key,
        "outsourced_rate_profile_label": spec["label"],
        "outsourced_rate_version": OUTSOURCED_RATE_VERSION,
        "outsourced_rate_updated_at": now_iso(),
    }


def calculate_outsourced_area_cost(
    actual_area_cm2: Any,
    pricing: Optional[Dict[str, Any]],
    *,
    fallback_cost: Any = 0,
) -> Dict[str, Any]:
    row = dict(pricing or {})
    calculation_type = str(row.get("calculation_type") or "fixed").strip().lower()
    actual = max(0.0, number(actual_area_cm2))
    minimum_area = max(0.0, number(row.get("minimum_area_cm2")))
    application_cost = max(0.0, number(row.get("application_cost")))
    minimum_money = max(0.0, number(row.get("minimum_print_cost")))
    waste_percentage = max(0.0, number(row.get("waste_percentage")))
    markup_percentage = max(0.0, number(row.get("markup_percentage")))

    area_types = {"area_fixed_rate", "area", "cm2", "sheet", "area_from_sheet"}
    if calculation_type not in area_types:
        fixed = number(fallback_cost)
        return {
            "calculation_type": calculation_type,
            "actual_area_cm2": area(actual),
            "chargeable_area_cm2": area(actual),
            "minimum_area_cm2": area(minimum_area),
            "minimum_area_applied": False,
            "cost_per_cm2": number(row.get("cost_per_cm2")),
            "material_cost": money(fixed),
            "base_production_cost": money(fixed),
            "waste_amount": 0.0,
            "application_cost": money(application_cost),
            "production_subtotal_before_markup": money(fixed + application_cost),
            "markup_amount": 0.0,
            "raw_print_cost": money(fixed + application_cost),
            "calculated_print_cost": money(max(fixed + application_cost, minimum_money)),
            "minimum_print_cost": money(minimum_money),
            "minimum_print_cost_applied": minimum_money > fixed + application_cost,
        }

    cost_per_cm2 = number(row.get("cost_per_cm2"))
    if cost_per_cm2 <= 0 and calculation_type in {"sheet", "area_from_sheet"}:
        sheet_width_mm = number(row.get("sheet_width_mm"))
        sheet_height_mm = number(row.get("sheet_height_mm"))
        sheet_cost = number(row.get("sheet_cost"))
        sheet_area_cm2 = (sheet_width_mm / 10) * (sheet_height_mm / 10)
        if sheet_area_cm2 > 0 and sheet_cost > 0:
            cost_per_cm2 = sheet_cost / sheet_area_cm2

    chargeable = max(actual, minimum_area) if minimum_area > 0 else actual
    material_cost = chargeable * cost_per_cm2
    waste_amount = material_cost * (waste_percentage / 100)
    subtotal = material_cost + waste_amount + application_cost
    markup_amount = subtotal * (markup_percentage / 100)
    before_minimum = subtotal + markup_amount
    final_cost = max(before_minimum, minimum_money)

    return {
        "calculation_type": calculation_type,
        "actual_area_cm2": area(actual),
        "chargeable_area_cm2": area(chargeable),
        "minimum_area_cm2": area(minimum_area),
        "minimum_area_applied": minimum_area > 0 and actual < minimum_area,
        "cost_per_cm2": round(cost_per_cm2, 6),
        "material_cost": money(material_cost),
        "base_production_cost": money(material_cost),
        "waste_amount": money(waste_amount),
        "application_cost": money(application_cost),
        "production_subtotal_before_markup": money(subtotal),
        "markup_amount": money(markup_amount),
        "raw_print_cost": money(before_minimum),
        "calculated_print_cost": money(final_cost),
        "minimum_print_cost": money(minimum_money),
        "minimum_print_cost_applied": minimum_money > 0 and before_minimum < minimum_money,
    }


def _change_preview(record: Dict[str, Any], values: Dict[str, Any], *, source: str) -> Dict[str, Any]:
    fields = (
        "calculation_type",
        "cost_per_cm2",
        "minimum_area_cm2",
        "application_cost",
        "minimum_print_cost",
        "waste_percentage",
        "markup_percentage",
    )
    return {
        "source": source,
        "id": record.get("id") or record.get("print_option_id"),
        "label": record.get("rule_name") or record.get("profile_label") or record.get("print_method") or record.get("print_size"),
        "method_key": method_key_for_record(record),
        "profile_key": values.get("outsourced_rate_profile_key"),
        "old": {field: record.get(field) for field in fields},
        "new": {field: values.get(field) for field in fields},
    }


def _default_profile_key(method_key: str) -> Optional[str]:
    return {
        "dtf": "standard_dtf",
        "uv_dtf": "uv_dtf",
        "sublimation": "flat_sublimation",
        "htv": "classic_htv",
        "adhesive_vinyl": "classic_adhesive_vinyl",
    }.get(method_key)


def _values_for_profile_key(profile_key: str) -> Dict[str, Any]:
    spec = RATE_SPECS[profile_key]
    return {
        **COMMON_PRICING,
        "cost_per_cm2": round(number(spec["cost_per_cm2"]), 6),
        "outsourced_rate_profile_key": profile_key,
        "outsourced_rate_profile_label": spec["label"],
        "outsourced_rate_version": OUTSOURCED_RATE_VERSION,
        "outsourced_rate_updated_at": now_iso(),
    }


def rate_catalog() -> List[Dict[str, Any]]:
    rows = []
    for key, spec in RATE_SPECS.items():
        values = _values_for_profile_key(key)
        rows.append({
            "profile_key": key,
            "label": spec["label"],
            "method_key": spec["method_key"],
            **{field: values[field] for field in (
                "cost_per_cm2",
                "minimum_area_cm2",
                "application_cost",
                "markup_percentage",
            )},
        })
    return rows


async def batch_update_outsourced_rates(
    db,
    *,
    dry_run: bool = True,
    strict: bool = True,
) -> Dict[str, Any]:
    print_options = await db.print_options.find({}, {"_id": 0}).to_list(5000)
    option_plans: List[Dict[str, Any]] = []
    next_options: List[Dict[str, Any]] = []
    matched_keys = set()

    for option in print_options:
        values = pricing_values_for_record(option)
        if not values:
            continue
        matched_keys.add(values["outsourced_rate_profile_key"])
        next_doc = {**option, **values}
        next_options.append(next_doc)
        option_plans.append({
            "id": option.get("id"),
            "set": values,
            "preview": _change_preview(option, values, source="print_options"),
        })

    grouped_profiles: Dict[str, List[Dict[str, Any]]] = {}
    for option in next_options:
        method = method_key_for_record(option)
        if method:
            grouped_profiles.setdefault(method, []).append(legacy_profile_from_print_option(option))

    production_methods = await db.production_methods.find({}, {"_id": 0}).to_list(200)
    method_plans: List[Dict[str, Any]] = []
    for method_doc in production_methods:
        method = normalize_method_key(method_doc.get("method_key") or method_doc.get("internal_id"))
        if method not in COVERED_METHODS:
            continue

        profiles = list(grouped_profiles.get(method) or method_doc.get("legacy_print_option_costing_profiles") or [])
        updated_profiles = []
        profile_changes = []
        for profile in profiles:
            values = pricing_values_for_record(profile, method)
            if values:
                matched_keys.add(values["outsourced_rate_profile_key"])
                profile_changes.append(_change_preview(profile, values, source="production_method_profile"))
                updated_profiles.append({**profile, **values})
            else:
                updated_profiles.append(profile)

        default_key = _default_profile_key(method)
        default_values = _values_for_profile_key(default_key) if default_key else {}
        current_model = dict(method_doc.get("cost_calculation_model") or {})
        next_model = {
            **current_model,
            **default_values,
            "raw_cost_source": current_model.get("raw_cost_source") or "print_option_fallback_to_method",
            "model": current_model.get("model") or f"outsourced_{method}_area_costing",
            "outsourced_rate_version": OUTSOURCED_RATE_VERSION,
            "outsourced_rate_updated_at": now_iso(),
        }
        method_plans.append({
            "method_key": method,
            "set": {
                "cost_calculation_model": next_model,
                "legacy_print_option_costing_profiles": updated_profiles,
                "outsourced_rate_version": OUTSOURCED_RATE_VERSION,
                "outsourced_rate_updated_at": now_iso(),
                "updated_at": now_iso(),
            },
            "profile_changes": profile_changes,
        })

    missing_expected = sorted(set(EXPECTED_PROFILE_KEYS) - matched_keys)
    active_operations = await db.production_operations.find(
        {
            "active": True,
            "operation_type": {"$in": sorted(DIRECT_APPLICATION_OPERATION_TYPES)},
            "applies_to_method": {"$in": sorted(COVERED_METHODS)},
        },
        {"_id": 0},
    ).to_list(200)

    if not dry_run and strict and missing_expected:
        raise ValueError(
            "Expected outsourced profiles were not matched: " + ", ".join(missing_expected)
        )

    if not dry_run:
        for plan in option_plans:
            if plan.get("id"):
                await db.print_options.update_one({"id": plan["id"]}, {"$set": plan["set"]})
        for plan in method_plans:
            await db.production_methods.update_one(
                {"method_key": plan["method_key"]},
                {"$set": plan["set"]},
            )

    changes = [plan["preview"] for plan in option_plans]
    changes.extend(change for plan in method_plans for change in plan["profile_changes"])
    return {
        "dry_run": dry_run,
        "strict": strict,
        "version": OUTSOURCED_RATE_VERSION,
        "print_options_seen": len(print_options),
        "print_options_matched": len(option_plans),
        "production_methods_updated": 0 if dry_run else len(method_plans),
        "print_options_updated": 0 if dry_run else len(option_plans),
        "matched_profile_keys": sorted(matched_keys),
        "missing_expected_profiles": missing_expected,
        "changes_preview": changes[:500],
        "changes_total": len(changes),
        "overlapping_application_operations": [
            {
                "id": row.get("id"),
                "name": row.get("name"),
                "operation_type": row.get("operation_type"),
                "methods": row.get("applies_to_method") or [],
                "cost": row.get("cost"),
                "treatment": "suppressed at runtime when application_cost is embedded",
            }
            for row in active_operations
        ],
    }


async def enrich_profile_rows(db, rows: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Expose new fields through the existing PrintOption-compatible profile API."""
    output = [dict(row or {}) for row in rows or []]
    source_ids = {
        str(row.get("source_print_option_id") or row.get("legacy_print_option_id") or "")
        for row in output
        if row.get("source_print_option_id") or row.get("legacy_print_option_id")
    }
    options = await db.print_options.find(
        {"id": {"$in": sorted(source_ids)}},
        {"_id": 0},
    ).to_list(5000) if source_ids else []
    option_map = {str(row.get("id")): row for row in options if row.get("id")}

    fields = (
        "minimum_area_cm2",
        "application_cost",
        "outsourced_rate_profile_key",
        "outsourced_rate_profile_label",
        "outsourced_rate_version",
    )
    for row in output:
        source_id = str(row.get("source_print_option_id") or row.get("legacy_print_option_id") or "")
        source = option_map.get(source_id) or {}
        values = pricing_values_for_record(source or row, row.get("method_key") or row.get("production_method_key"))
        for field in fields:
            if field in source:
                row[field] = source.get(field)
            elif values and field in values:
                row[field] = values.get(field)
        if values:
            for field in (
                "calculation_type",
                "cost_per_cm2",
                "minimum_print_cost",
                "waste_percentage",
                "markup_percentage",
            ):
                if field in source:
                    row[field] = source.get(field)
                elif row.get(field) in (None, "", 0) or field == "minimum_print_cost":
                    row[field] = values.get(field)
    return output
