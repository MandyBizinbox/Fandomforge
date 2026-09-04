"""Runtime pricing hook that adds production operation labour to product costs.

The core product-builder flow lives in routes_main.normalize_template_product_payload.
This module wraps that function so V1 can add method/print-area production
operations without rewriting the whole product route file during launch week.

Print Options remain backward-compatible, but Manufacturing Rules / Print Methods
can now carry the same costing model. Each method controls its source through
cost_calculation_model.raw_cost_source:
- print_option: current legacy behaviour.
- print_option_fallback_to_method: use Print Option first, fill blanks from method.
- production_method: method costing model becomes the pricing source.

When legacy Print Options are imported, production methods can also carry
legacy_print_option_costing_profiles. Those profiles preserve exact per-option
costing while allowing the method to become the source of truth.
"""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Callable, Dict, List, Optional

import outsourced_production_rates as outsourced_rates
from seed_production_operations import ACTIVE_V1_METHOD_KEYS, normalize_method_key


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
    "minimum_area_cm2",
    "application_cost",
    "outsourced_rate_profile_key",
    "outsourced_rate_profile_label",
    "outsourced_rate_version",
    "manufacturing_profile_id",
    "production_profile_id",
    "legacy_print_option_ids",
    "is_default",
    "costing_engine_version",
)

DIRECT_APPLICATION_OPERATION_TYPES = {"heat_press", "application"}

def _money_half_up(value: Any) -> float:
    try:
        decimal_value = Decimal(str(value if value not in (None, "") else 0))
    except Exception:
        decimal_value = Decimal("0")
    return float(decimal_value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

def _embedded_application_methods(product_data: Dict[str, Any]) -> set[str]:
    methods: set[str] = set()
    for slot in product_data.get("artworks") or []:
        if not isinstance(slot, dict) or _float(slot.get("application_cost")) <= 0:
            continue
        method = normalize_method_key(
            slot.get("method_key")
            or slot.get("manufacturing_method_id")
            or slot.get("production_method_key")
            or slot.get("print_method")
        )
        if method:
            methods.add(method)
    return methods


def _money(value: Any) -> float:
    try:
        return round(float(value or 0), 2)
    except (TypeError, ValueError):
        return 0.0


def _float(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _has_value(value: Any) -> bool:
    return value not in (None, "", [], {})


def _token(value: Any) -> str:
    return str(value or "").strip().lower()


def _slot_has_production(slot: Dict[str, Any]) -> bool:
    if not isinstance(slot, dict):
        return False
    return bool(slot.get("print_area_id") and (slot.get("method_key") or slot.get("print_method") or slot.get("manufacturing_method_id")))


def _slot_method(slot: Dict[str, Any], fallback: Optional[str] = None) -> str:
    return normalize_method_key(
        slot.get("method_key")
        or slot.get("manufacturing_method_id")
        or slot.get("print_method")
        or fallback
    )


def _slot_area_cm2(slot: Dict[str, Any]) -> float:
    existing = _float(slot.get("area_cm2") or slot.get("charged_area_cm2"))
    if existing > 0:
        return existing

    width_mm = _float(
        slot.get("print_width_mm")
        or slot.get("charged_width_mm")
        or slot.get("placement_box_width_mm")
        or slot.get("width_mm")
    )
    height_mm = _float(
        slot.get("print_height_mm")
        or slot.get("charged_height_mm")
        or slot.get("placement_box_height_mm")
        or slot.get("height_mm")
    )
    return (width_mm * height_mm) / 100 if width_mm > 0 and height_mm > 0 else 0.0


def _method_key_from_option_slot(option: Dict[str, Any], slot: Dict[str, Any]) -> str:
    return normalize_method_key(
        slot.get("method_key")
        or slot.get("manufacturing_method_id")
        or slot.get("print_method")
        or option.get("method_key")
        or option.get("manufacturing_method_id")
        or option.get("print_method")
        or option.get("method")
    )


def _profile_matches_option(profile: Dict[str, Any], option: Dict[str, Any], slot: Dict[str, Any]) -> bool:
    if not isinstance(profile, dict):
        return False
    option_id = _token(option.get("id") or slot.get("print_option_id"))
    if option_id and _token(profile.get("print_option_id")) == option_id:
        return True
    standard_key = _token(option.get("standard_print_size_key") or slot.get("standard_print_size_key"))
    if standard_key and _token(profile.get("standard_print_size_key")) == standard_key:
        return True
    print_size = _token(option.get("print_size") or slot.get("print_size"))
    if print_size and _token(profile.get("print_size")) == print_size:
        return True
    rule_name = _token(option.get("rule_name") or option.get("print_method") or slot.get("print_method"))
    if rule_name and rule_name in {_token(profile.get("rule_name")), _token(profile.get("print_method"))}:
        return True
    return False


def _method_profile_for_slot(method_rule: Optional[Dict[str, Any]], option: Dict[str, Any], slot: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    rule = dict(method_rule or {})
    profiles = list(rule.get("legacy_print_option_costing_profiles") or [])
    for profile in profiles:
        if _profile_matches_option(profile, option, slot):
            return profile
    return None


def _pricing_fields_from_method(method_rule: Optional[Dict[str, Any]], option: Optional[Dict[str, Any]] = None, slot: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    rule = dict(method_rule or {})
    model = dict(rule.get("cost_calculation_model") or {})
    profile = _method_profile_for_slot(rule, option or {}, slot or {})

    out: Dict[str, Any] = {}
    for field in PRICING_FIELDS:
        if field in model:
            out[field] = model.get(field)

    if profile:
        for field in PRICING_FIELDS:
            if field in profile and _has_value(profile.get(field)):
                out[field] = profile.get(field)
        out["legacy_print_option_profile_id"] = profile.get("print_option_id")
        out["legacy_print_option_profile_name"] = profile.get("rule_name") or profile.get("print_size")

    out["raw_cost_source"] = model.get("raw_cost_source") or "print_option"
    out["cost_model_name"] = model.get("model") or model.get("name") or rule.get("display_name") or rule.get("method_key")
    return out


def _merge_method_costing(option: Dict[str, Any], slot: Dict[str, Any], method_rule: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Return the active pricing row for a slot.

    This is the bridge between legacy Print Options and the new Print Method cost
    model. Default mode preserves legacy pricing. If legacy profiles were seeded,
    production_method mode can still calculate per original print option.
    """
    option = dict(option or {})
    method_fields = _pricing_fields_from_method(method_rule, option, slot)
    source = method_fields.get("raw_cost_source") or "print_option"

    if source in {"production_method", "method", "manufacturing_method"}:
        merged = dict(option)
        for field, value in method_fields.items():
            if field != "raw_cost_source" and _has_value(value):
                merged[field] = value
        merged["production_pricing_source"] = "production_method"
        merged["production_method_key"] = _method_key_from_option_slot(option, slot)
        merged["legacy_print_option_profile_id"] = method_fields.get("legacy_print_option_profile_id")
        merged["legacy_print_option_profile_name"] = method_fields.get("legacy_print_option_profile_name")
        return merged

    if source in {"print_option_fallback_to_method", "fallback_to_method", "hybrid"}:
        merged = dict(option)
        for field, value in method_fields.items():
            if field == "raw_cost_source" or not _has_value(value):
                continue
            if not _has_value(merged.get(field)) or merged.get(field) == 0:
                merged[field] = value
        merged["production_pricing_source"] = "print_option_fallback_to_method"
        merged["production_method_key"] = _method_key_from_option_slot(option, slot)
        merged["legacy_print_option_profile_id"] = method_fields.get("legacy_print_option_profile_id")
        merged["legacy_print_option_profile_name"] = method_fields.get("legacy_print_option_profile_name")
        return merged

    option["production_pricing_source"] = "print_option"
    option["production_method_key"] = _method_key_from_option_slot(option, slot)
    return option


def _calculate_raw_print_cost(option: Dict[str, Any], slot: Dict[str, Any]) -> Dict[str, Any]:
    calculation_type = str(option.get("calculation_type") or slot.get("calculation_type") or "fixed").lower()
    area_cm2 = _slot_area_cm2(slot)

    if calculation_type in {"area_fixed_rate", "area", "cm2", "sheet", "area_from_sheet"}:
        pricing = {**slot, **option, "calculation_type": calculation_type}
        costing = outsourced_rates.calculate_outsourced_area_cost(
            area_cm2,
            pricing,
            fallback_cost=(option.get("platform_print_cost") or option.get("print_cost_max") or slot.get("print_cost_max") or 0),
        )
        return {
            "calculation_type": calculation_type,
            "area_cm2": costing["actual_area_cm2"],
            "chargeable_area_cm2": costing["chargeable_area_cm2"],
            "minimum_area_cm2": costing["minimum_area_cm2"],
            "minimum_area_applied": costing["minimum_area_applied"],
            "application_cost": costing["application_cost"],
            "platform_print_cost": costing["calculated_print_cost"],
            "production_pricing_source": option.get("production_pricing_source") or "production_method",
            "production_method_key": option.get("production_method_key"),
            "manufacturing_profile_id": option.get("manufacturing_profile_id") or slot.get("manufacturing_profile_id"),
            "legacy_print_option_profile_id": option.get("legacy_print_option_profile_id"),
            "legacy_print_option_profile_name": option.get("legacy_print_option_profile_name"),
        }

    platform_cost = _float(option.get("platform_print_cost") or option.get("print_cost_max") or slot.get("print_cost_max"))
    waste_percentage = _float(option.get("waste_percentage") or slot.get("waste_percentage"))
    if platform_cost > 0 and waste_percentage:
        platform_cost *= 1 + (waste_percentage / 100)
    markup_percentage = _float(option.get("markup_percentage") or slot.get("markup_percentage"))
    if platform_cost > 0 and markup_percentage:
        platform_cost *= 1 + (markup_percentage / 100)
    minimum_print_cost = _float(option.get("minimum_print_cost") or slot.get("minimum_print_cost"))
    if platform_cost > 0 and minimum_print_cost:
        platform_cost = max(platform_cost, minimum_print_cost)
    return {
        "calculation_type": calculation_type,
        "area_cm2": round(area_cm2, 2),
        "platform_print_cost": _money(platform_cost),
        "production_pricing_source": option.get("production_pricing_source") or "print_option",
        "production_method_key": option.get("production_method_key"),
        "legacy_print_option_profile_id": option.get("legacy_print_option_profile_id"),
        "legacy_print_option_profile_name": option.get("legacy_print_option_profile_name"),
    }


def _creator_print_price(resolve_marked_price: Optional[Callable], option: Dict[str, Any], platform_print_cost: float) -> float:
    explicit = option.get("creator_print_price")
    if explicit not in (None, "", 0):
        return _money(explicit)

    if callable(resolve_marked_price):
        return _money(resolve_marked_price(
            platform_print_cost,
            None,
            option.get("platform_print_markup_type") or "manual",
            option.get("platform_print_markup_value") or 0,
            default_rate=0.10,
        ))

    return _money(platform_print_cost * 1.10)


async def _repair_missing_raw_print_costs(db, resolve_marked_price: Optional[Callable], product_data: Dict[str, Any]) -> Dict[str, Any]:
    """Repair zero raw print costs using live pricing source data.

    Legacy source is db.print_options. Production Methods can now supply the same
    cost model as Print Options while preserving legacy behaviour by default.
    """
    slots = [slot for slot in product_data.get("artworks") or [] if isinstance(slot, dict) and slot.get("print_option_id")]
    if not slots:
        return product_data

    option_ids = sorted({str(slot.get("print_option_id")) for slot in slots if slot.get("print_option_id")})
    options = await db.print_options.find({"id": {"$in": option_ids}}, {"_id": 0}).to_list(500)
    option_map = {str(option.get("id")): option for option in options if option.get("id")}

    method_keys: List[str] = []
    for slot in slots:
        option = option_map.get(str(slot.get("print_option_id"))) or {}
        method = _method_key_from_option_slot(option, slot)
        if method and method not in method_keys:
            method_keys.append(method)
    method_rules = await db.production_methods.find({"method_key": {"$in": method_keys}}, {"_id": 0}).to_list(200) if method_keys else []
    method_map = {normalize_method_key(rule.get("method_key") or rule.get("internal_id")): rule for rule in method_rules}

    repaired = False
    for slot in slots:
        option = option_map.get(str(slot.get("print_option_id")))
        if not option:
            continue

        method_key = _method_key_from_option_slot(option, slot)
        active_option = _merge_method_costing(option, slot, method_map.get(method_key))
        current_platform_cost = _float(slot.get("platform_print_cost") or slot.get("calculated_print_cost") or slot.get("raw_print_cost"))
        live_costing = _calculate_raw_print_cost(active_option, slot)
        live_platform_cost = _money(live_costing.get("platform_print_cost"))

        # Preserve existing valid Builder calculations unless this method has been
        # explicitly switched to production_method pricing.
        if live_platform_cost <= 0:
            continue
        if current_platform_cost > 0 and live_costing.get("production_pricing_source") != "production_method":
            continue

        creator_price = _creator_print_price(resolve_marked_price, active_option, live_platform_cost)

        slot["calculation_type"] = live_costing["calculation_type"]
        slot["method_key"] = method_key or option.get("method_key") or slot.get("method_key")
        slot["print_method"] = option.get("print_method") or slot.get("print_method")
        slot["area_cm2"] = live_costing["area_cm2"]
        slot["charged_area_cm2"] = slot.get("charged_area_cm2") or live_costing["area_cm2"]
        slot["raw_print_cost"] = live_platform_cost
        slot["calculated_print_cost"] = live_platform_cost
        slot["print_cost_max"] = live_platform_cost
        slot["platform_print_cost"] = live_platform_cost
        slot["creator_print_price"] = creator_price
        slot["production_pricing_source"] = live_costing.get("production_pricing_source") or "print_option"
        slot["production_method_costing_applied"] = slot["production_pricing_source"] == "production_method"
        slot["production_pricing_repaired_from_global_option"] = slot["production_pricing_source"] != "production_method"
        slot["legacy_print_option_profile_id"] = live_costing.get("legacy_print_option_profile_id")
        slot["legacy_print_option_profile_name"] = live_costing.get("legacy_print_option_profile_name")
        repaired = True

    if not repaired:
        return product_data

    platform_print_cost = _money(sum(_float(slot.get("platform_print_cost")) for slot in slots))
    creator_print_price = _money(sum(_float(slot.get("creator_print_price")) for slot in slots))

    product_data["platform_print_cost"] = platform_print_cost
    product_data["creator_print_price"] = creator_print_price
    product_data["print_cost"] = creator_print_price
    product_data["estimated_print_cost"] = creator_print_price

    breakdown = dict(product_data.get("costing_breakdown") or {})
    breakdown.update({
        "raw_print_cost_repaired_from_global_options": True,
        "platform_raw_print_cost": platform_print_cost,
        "creator_raw_print_price": creator_print_price,
        "production_method_costing_supported": True,
    })
    product_data["costing_breakdown"] = breakdown

    return product_data


def _operation_line(operation: Dict[str, Any], method_key: str, slot: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    cost_basis = operation.get("cost_basis") or "per_operation"
    unit_cost = _money(operation.get("cost"))
    default_quantity = float(operation.get("default_quantity") or 1)
    estimated_time = float(operation.get("estimated_time") or 0)
    area_cm2 = float((slot or {}).get("area_cm2") or (slot or {}).get("charged_area_cm2") or 0)

    if cost_basis == "per_minute":
        charge_quantity = estimated_time * default_quantity
    elif cost_basis == "per_cm2":
        charge_quantity = area_cm2 * default_quantity
    else:
        charge_quantity = default_quantity

    platform_cost = round(unit_cost * charge_quantity, 4)

    return {
        "operation_id": operation.get("id"),
        "operation_name": operation.get("name"),
        "operation_type": operation.get("operation_type"),
        "cost_basis": cost_basis,
        "method_key": method_key,
        "print_area_id": (slot or {}).get("print_area_id"),
        "unit_cost": unit_cost,
        "quantity": round(charge_quantity, 4),
        "estimated_time": round(estimated_time * default_quantity, 4),
        "platform_cost": platform_cost,
        "notes": operation.get("notes") or "",
    }


async def _production_operation_breakdown(db, product_data: Dict[str, Any]) -> Dict[str, Any]:
    slots = [slot for slot in product_data.get("artworks") or [] if _slot_has_production(slot)]

    fallback_method = None
    if not slots:
        fallback_method = normalize_method_key(product_data.get("method_key") or product_data.get("print_method"))

    method_keys: List[str] = []
    for slot in slots:
        method = _slot_method(slot, fallback_method)
        if method and method in ACTIVE_V1_METHOD_KEYS and method not in method_keys:
            method_keys.append(method)

    if fallback_method and fallback_method in ACTIVE_V1_METHOD_KEYS and fallback_method not in method_keys:
        method_keys.append(fallback_method)

    lines: List[Dict[str, Any]] = []
    total_platform_cost = 0.0
    total_estimated_time = 0.0

    for method in method_keys:
        operations = await db.production_operations.find(
            {"active": True, "applies_to_method": method},
            {"_id": 0},
        ).to_list(100)

        method_slots = [slot for slot in slots if _slot_method(slot, fallback_method) == method]
        if not method_slots:
            method_slots = [{}]

        for operation in operations:
            if operation.get("cost_basis") == "per_job":
                line = _operation_line(operation, method, None)
                lines.append(line)
                total_platform_cost += line["platform_cost"]
                total_estimated_time += line["estimated_time"]
                continue

            for slot in method_slots:
                line = _operation_line(operation, method, slot)
                lines.append(line)
                total_platform_cost += line["platform_cost"]
                total_estimated_time += line["estimated_time"]

    embedded_methods = _embedded_application_methods(product_data)
    if embedded_methods:
        lines = [
            line for line in lines
            if not (
                normalize_method_key(line.get("method_key")) in embedded_methods
                and str(line.get("operation_type") or "") in DIRECT_APPLICATION_OPERATION_TYPES
            )
        ]
        total_platform_cost = sum(_float(line.get("platform_cost")) for line in lines)
        total_estimated_time = sum(_float(line.get("estimated_time")) for line in lines)

    result = {
        "lines": lines,
        "method_keys": method_keys,
        "platform_operation_cost": _money_half_up(total_platform_cost),
        "estimated_operation_time": round(total_estimated_time, 2),
    }
    if embedded_methods:
        result["embedded_application_methods"] = sorted(embedded_methods)
        result["direct_application_operations_suppressed"] = True
    return result


def _operation_creator_price(
    routes_main_module: Any,
    platform_operation_cost: float,
) -> float:
    # Production operations are internal components of the configured
    # printing price. They must not be charged to creators a second time.
    return 0.0


def _refresh_product_costing(platform_costing_breakdown: Callable, product_data: Dict[str, Any], operation_breakdown: Dict[str, Any]) -> Dict[str, Any]:
    platform_operation_cost = _money(operation_breakdown.get("platform_operation_cost"))
    if platform_operation_cost <= 0:
        product_data.setdefault("production_operation_cost", 0)
        product_data.setdefault("production_operation_lines", [])
        return product_data

    operation_creator_price = _operation_creator_price(None, platform_operation_cost)

    base_platform_print_cost = _money(product_data.get("platform_print_cost"))
    base_creator_print_price = _money(product_data.get("creator_print_price") or product_data.get("print_cost") or product_data.get("estimated_print_cost"))

    platform_print_cost = _money(base_platform_print_cost + platform_operation_cost)
    creator_print_price = base_creator_print_price

    costing = platform_costing_breakdown(
        product_data.get("platform_blank_cost") or product_data.get("estimated_blank_cost") or 0,
        platform_print_cost,
        product_data.get("commission_rate") or 0,
        product_data.get("customer_selling_price") or product_data.get("selling_price") or 0,
        quantity=1,
        creator_blank_price=product_data.get("creator_blank_price") or product_data.get("estimated_blank_cost") or 0,
        creator_print_price=creator_print_price,
    )

    product_data.update({
        "print_cost": creator_print_price,
        "estimated_print_cost": costing["print_payout_unit"],
        "estimated_total_cost": costing["production_unit_cost"],
        "platform_print_cost": costing["platform_print_cost"],
        "creator_print_price": costing["creator_print_price"],
        "creator_product_cost": costing["creator_product_cost"],
        "platform_print_profit": costing["platform_print_profit"],
        "estimated_platform_profit": costing["estimated_platform_profit"],
        "estimated_commission": costing["commission_unit"],
        "estimated_creator_profit": costing["creator_profit_unit"],
        "production_operation_cost": operation_creator_price,
        "platform_production_operation_cost": platform_operation_cost,
        "production_operation_lines": operation_breakdown.get("lines") or [],
        "production_operation_method_keys": operation_breakdown.get("method_keys") or [],
        "estimated_operation_time": operation_breakdown.get("estimated_operation_time") or 0,
    })

    breakdown = dict(product_data.get("costing_breakdown") or {})
    breakdown.update({
        "platform_print_cost": costing["platform_print_cost"],
        "creator_print_price": costing["creator_print_price"],
        "print_payout_unit": costing["print_payout_unit"],
        "production_unit_cost": costing["production_unit_cost"],
        "minimum_selling_price": costing["minimum_selling_price"],
        "production_operation_platform_cost": platform_operation_cost,
        "production_operation_creator_price": operation_creator_price,
        "production_operation_pricing_treatment": "internal_only",
        "production_operation_lines": operation_breakdown.get("lines") or [],
    })
    product_data["costing_breakdown"] = breakdown

    return product_data


async def apply_production_operation_pricing(
    db,
    product_data: Dict[str, Any],
    *,
    resolve_marked_price: Optional[Callable] = None,
    platform_costing_breakdown: Callable,
) -> Dict[str, Any]:
    """Apply print-cost repair and internal production-operation costing explicitly."""
    product_data = await _repair_missing_raw_print_costs(db, resolve_marked_price, product_data)
    operation_breakdown = await _production_operation_breakdown(db, product_data)
    return _refresh_product_costing(platform_costing_breakdown, product_data, operation_breakdown)
