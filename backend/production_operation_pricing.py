"""Runtime pricing hook that adds production operation labour to product costs.

The core product-builder flow lives in routes_main.normalize_template_product_payload.
This module wraps that function so V1 can add method/print-area production
operations without rewriting the whole product route file during launch week.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from seed_production_operations import ACTIVE_V1_METHOD_KEYS, normalize_method_key


def _money(value: Any) -> float:
    try:
        return round(float(value or 0), 2)
    except (TypeError, ValueError):
        return 0.0


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

    return {
        "lines": lines,
        "method_keys": method_keys,
        "platform_operation_cost": round(total_platform_cost, 2),
        "estimated_operation_time": round(total_estimated_time, 2),
    }


def _operation_creator_price(routes_main_module: Any, platform_operation_cost: float) -> float:
    if platform_operation_cost <= 0:
        return 0.0
    markup = getattr(routes_main_module, "_platform_markup", None)
    if callable(markup):
        return _money(markup(platform_operation_cost, 0.10))
    return _money(platform_operation_cost * 1.10)


def _refresh_product_costing(routes_main_module: Any, product_data: Dict[str, Any], operation_breakdown: Dict[str, Any]) -> Dict[str, Any]:
    platform_operation_cost = _money(operation_breakdown.get("platform_operation_cost"))
    if platform_operation_cost <= 0:
        product_data.setdefault("production_operation_cost", 0)
        product_data.setdefault("production_operation_lines", [])
        return product_data

    operation_creator_price = _operation_creator_price(routes_main_module, platform_operation_cost)

    base_platform_print_cost = _money(product_data.get("platform_print_cost"))
    base_creator_print_price = _money(product_data.get("creator_print_price") or product_data.get("print_cost") or product_data.get("estimated_print_cost"))

    platform_print_cost = _money(base_platform_print_cost + platform_operation_cost)
    creator_print_price = _money(base_creator_print_price + operation_creator_price)

    costing_fn = getattr(routes_main_module, "_platform_costing_breakdown")
    costing = costing_fn(
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
        "production_operation_lines": operation_breakdown.get("lines") or [],
    })
    product_data["costing_breakdown"] = breakdown

    return product_data


def install_production_operation_pricing(routes_main_module: Any) -> None:
    """Patch routes_main.normalize_template_product_payload once."""
    if getattr(routes_main_module, "_production_operation_pricing_installed", False):
        return

    original = routes_main_module.normalize_template_product_payload

    async def wrapped_normalize_template_product_payload(*, db, data, creator, user, allow_admin_publish=False):
        product_data = await original(
            db=db,
            data=data,
            creator=creator,
            user=user,
            allow_admin_publish=allow_admin_publish,
        )
        operation_breakdown = await _production_operation_breakdown(db, product_data)
        return _refresh_product_costing(routes_main_module, product_data, operation_breakdown)

    routes_main_module._base_normalize_template_product_payload = original
    routes_main_module.normalize_template_product_payload = wrapped_normalize_template_product_payload
    routes_main_module._production_operation_pricing_installed = True
