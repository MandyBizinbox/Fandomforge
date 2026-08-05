"""Runtime integration for outsourced production-rate fields.

This keeps the existing Manufacturing Rules and production-operation architecture
intact while exposing the new pricing fields and preventing duplicate direct
application/heat-press charges when a profile already embeds application_cost.
"""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict

import outsourced_production_rates as outsourced_rates
from seed_production_operations import normalize_method_key


# Dynamic outsourced pricing must not be shadowed by legacy fixed values. Keep
# this at module import time so migrations and profile enrichment use the same
# defaults before any API route is called.
outsourced_rates.COMMON_PRICING.update({
    "platform_print_cost": 0.0,
    "print_cost_max": 0.0,
    "creator_print_price": 0.0,
})


def _money_half_up(value: Any) -> float:
    try:
        decimal_value = Decimal(str(value if value not in (None, "") else 0))
    except Exception:
        decimal_value = Decimal("0")
    return float(decimal_value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


# Currency calculations must match the browser's conventional half-up cent
# rounding rather than Python's banker's rounding at values such as 15.225.
outsourced_rates.money = _money_half_up


NEW_PRICING_FIELDS = (
    "minimum_area_cm2",
    "application_cost",
    "outsourced_rate_profile_key",
    "outsourced_rate_profile_label",
    "outsourced_rate_version",
)
DIRECT_APPLICATION_OPERATION_TYPES = {"heat_press", "application"}


def _number(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value if value not in (None, "") else fallback)
    except (TypeError, ValueError):
        return float(fallback)


def _embedded_application_methods(product_data: Dict[str, Any]) -> set[str]:
    methods: set[str] = set()
    for slot in product_data.get("artworks") or []:
        if not isinstance(slot, dict):
            continue
        if _number(slot.get("application_cost")) <= 0:
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


def install_outsourced_rate_runtime(routes_main_module: Any) -> None:
    if getattr(routes_main_module, "_outsourced_rate_runtime_installed", False):
        return

    import production_method_profiles
    import production_operation_pricing

    original_profile_list = production_method_profiles.list_production_method_print_profiles

    async def patched_profile_list(db, active=True):
        rows = await original_profile_list(db, active=active)
        enriched = await outsourced_rates.enrich_profile_rows(db, rows)
        for row in enriched:
            if not row.get("outsourced_rate_profile_key"):
                continue
            row["calculation_type"] = "area_fixed_rate"
            row["platform_print_cost"] = 0.0
            row["print_cost_max"] = 0.0
            row["creator_print_price"] = 0.0
            row["minimum_print_cost"] = 0.0
        return enriched

    production_method_profiles.list_production_method_print_profiles = patched_profile_list

    pricing_fields = list(production_operation_pricing.PRICING_FIELDS)
    for field in NEW_PRICING_FIELDS:
        if field not in pricing_fields:
            pricing_fields.append(field)
    production_operation_pricing.PRICING_FIELDS = tuple(pricing_fields)

    original_raw_cost = production_operation_pricing._calculate_raw_print_cost

    def patched_raw_cost(option: Dict[str, Any], slot: Dict[str, Any]) -> Dict[str, Any]:
        calculation_type = str(
            option.get("calculation_type")
            or slot.get("calculation_type")
            or "fixed"
        ).lower()
        if calculation_type not in {
            "area_fixed_rate",
            "area",
            "cm2",
            "sheet",
            "area_from_sheet",
        }:
            return original_raw_cost(option, slot)

        actual_area_cm2 = production_operation_pricing._slot_area_cm2(slot)
        pricing = {**slot, **option}
        pricing["calculation_type"] = calculation_type
        costing = outsourced_rates.calculate_outsourced_area_cost(
            actual_area_cm2,
            pricing,
            fallback_cost=(
                option.get("platform_print_cost")
                or option.get("print_cost_max")
                or slot.get("print_cost_max")
                or 0
            ),
        )
        return {
            "calculation_type": calculation_type,
            "area_cm2": costing["actual_area_cm2"],
            "chargeable_area_cm2": costing["chargeable_area_cm2"],
            "minimum_area_cm2": costing["minimum_area_cm2"],
            "minimum_area_applied": costing["minimum_area_applied"],
            "application_cost": costing["application_cost"],
            "platform_print_cost": costing["calculated_print_cost"],
            "production_pricing_source": option.get("production_pricing_source") or "print_option",
            "production_method_key": option.get("production_method_key"),
            "legacy_print_option_profile_id": option.get("legacy_print_option_profile_id"),
            "legacy_print_option_profile_name": option.get("legacy_print_option_profile_name"),
        }

    production_operation_pricing._calculate_raw_print_cost = patched_raw_cost

    original_breakdown = production_operation_pricing._production_operation_breakdown

    async def patched_breakdown(db, product_data: Dict[str, Any]) -> Dict[str, Any]:
        result = await original_breakdown(db, product_data)
        embedded_methods = _embedded_application_methods(product_data)
        if not embedded_methods:
            return result

        lines = []
        for line in result.get("lines") or []:
            method = normalize_method_key(line.get("method_key"))
            operation_type = str(line.get("operation_type") or "")
            if (
                method in embedded_methods
                and operation_type in DIRECT_APPLICATION_OPERATION_TYPES
            ):
                continue
            lines.append(line)

        result["lines"] = lines
        result["platform_operation_cost"] = _money_half_up(
            sum(_number(line.get("platform_cost")) for line in lines)
        )
        result["estimated_operation_time"] = round(
            sum(_number(line.get("estimated_time")) for line in lines),
            2,
        )
        result["embedded_application_methods"] = sorted(embedded_methods)
        result["direct_application_operations_suppressed"] = True
        return result

    production_operation_pricing._production_operation_breakdown = patched_breakdown
    routes_main_module._outsourced_rate_runtime_installed = True
