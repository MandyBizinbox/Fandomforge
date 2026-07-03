"""Runtime order-finance compatibility patches for FandomForge.

The legacy OrderItem field ``print_cost_unit`` is used by the existing order
screens as the creator-facing production/product cost. After the Creator Studio
pricing work, production cost is no longer just raw print cost; it is:

    creator blank price + creator print/material price + production operations

This patch keeps order creation compatible with the current model without a
large routes_main rewrite before launch.
"""
from __future__ import annotations

from typing import Any


def _money(value: Any) -> float:
    try:
        return round(float(value or 0), 2)
    except Exception:
        return 0.0


def _get_snapshot_value(snapshot: Any, key: str, default: Any = None) -> Any:
    if isinstance(snapshot, dict):
        return snapshot.get(key, default)
    return getattr(snapshot, key, default)


def _set_snapshot_value(snapshot: Any, key: str, value: Any) -> None:
    if isinstance(snapshot, dict):
        snapshot[key] = value
    else:
        setattr(snapshot, key, value)


def _snapshot_breakdown(snapshot: Any) -> dict:
    value = _get_snapshot_value(snapshot, "costing_breakdown", {}) or {}
    if not isinstance(value, dict):
        return {}
    return value


def _resolve_creator_production_cost_unit(item: Any) -> float:
    """Resolve the creator-facing production cost per unit for an order item."""
    qty = max(int(getattr(item, "quantity", 1) or 1), 1)
    snapshot = getattr(item, "production_snapshot", None)

    if snapshot:
        breakdown = _snapshot_breakdown(snapshot)
        candidates = [
            breakdown.get("creator_product_cost"),
            breakdown.get("production_unit_cost"),
            _get_snapshot_value(snapshot, "creator_product_cost"),
        ]

        production_cost_total = _get_snapshot_value(snapshot, "production_cost")
        if production_cost_total not in (None, ""):
            candidates.append(_money(production_cost_total) / qty)

        for candidate in candidates:
            value = _money(candidate)
            if value > 0:
                return value

    # Last-resort legacy fallback.
    current = _money(getattr(item, "print_cost_unit", 0))
    if current > 0:
        return current

    unit_price = _money(getattr(item, "unit_price", 0))
    commission = _money(getattr(item, "commission_amount", 0)) / qty
    creator_markup = _money(getattr(item, "band_earnings", 0)) / qty
    return max(_money(unit_price - commission - creator_markup), 0.0)


def _normalise_order_item_finance(item: Any) -> Any:
    qty = max(int(getattr(item, "quantity", 1) or 1), 1)
    creator_production_cost_unit = _resolve_creator_production_cost_unit(item)

    # Legacy field name, current commercial meaning:
    # creator-facing production/product cost per unit.
    item.print_cost_unit = creator_production_cost_unit

    snapshot = getattr(item, "production_snapshot", None)
    if snapshot:
        _set_snapshot_value(snapshot, "production_cost", _money(creator_production_cost_unit * qty))
        _set_snapshot_value(snapshot, "creator_profit", _money(getattr(item, "band_earnings", 0)))
        _set_snapshot_value(snapshot, "platform_commission", _money(getattr(item, "commission_amount", 0)))

        breakdown = _snapshot_breakdown(snapshot)
        if breakdown:
            breakdown["creator_visible_production_cost_unit"] = creator_production_cost_unit
            breakdown["creator_visible_production_cost_total"] = _money(creator_production_cost_unit * qty)
            _set_snapshot_value(snapshot, "costing_breakdown", breakdown)

    return item


def _dict_value(row: Any, key: str, default: Any = None) -> Any:
    if isinstance(row, dict):
        return row.get(key, default)
    return getattr(row, key, default)


async def _ensure_legacy_commission_and_payout_records(routes_main_module, db, order: dict) -> None:
    """Create legacy commission/payout records for paid gateway orders.

    Wallet transactions are the newer ledger source of truth, but legacy admin
    screens and payout reports still read ``commissions`` and ``payouts``. Manual
    paid orders already create these records. Gateway-paid orders must do the
    same, idempotently.
    """
    if not order or order.get("payment_status") != "paid":
        return

    order_id = order.get("id")
    if not order_id:
        return

    Commission = routes_main_module.Commission
    Payout = routes_main_module.Payout
    iso_dates = routes_main_module.iso_dates

    for item in order.get("items") or []:
        item_id = _dict_value(item, "id")
        if not item_id:
            continue

        existing_commission = await db.commissions.find_one({"order_id": order_id, "order_item_id": item_id}, {"_id": 1})
        if not existing_commission:
            commission_amount = _money(_dict_value(item, "commission_amount"))
            if commission_amount:
                await db.commissions.insert_one(iso_dates(Commission(
                    order_id=order_id,
                    order_item_id=item_id,
                    band_id=_dict_value(item, "band_id"),
                    amount=commission_amount,
                    rate=float(_dict_value(item, "commission_rate") or 0),
                ).model_dump()))

        printer_id = _dict_value(item, "printer_id")
        existing_payout = await db.payouts.find_one({"order_id": order_id, "order_item_id": item_id}, {"_id": 1})
        if printer_id and not existing_payout:
            payout_amount = _money(_dict_value(item, "printer_payout"))
            if payout_amount:
                await db.payouts.insert_one(iso_dates(Payout(
                    printer_id=printer_id,
                    order_id=order_id,
                    order_item_id=item_id,
                    amount=payout_amount,
                ).model_dump()))


def install_order_finance_patches(routes_main_module):
    """Install order finance patches onto routes_main."""
    if getattr(routes_main_module, "_order_finance_patches_installed", False):
        return

    original_build_order_items = routes_main_module._build_order_items
    original_mark_order_paid = routes_main_module._mark_order_paid_from_payment

    async def patched_build_order_items(*args, **kwargs):
        order_items, subtotal = await original_build_order_items(*args, **kwargs)
        order_items = [_normalise_order_item_finance(item) for item in order_items]
        return order_items, subtotal

    async def patched_mark_order_paid_from_payment(db, payment, payload=None):
        order = await original_mark_order_paid(db, payment, payload)
        if order:
            await _ensure_legacy_commission_and_payout_records(routes_main_module, db, order)
        return order

    routes_main_module._build_order_items = patched_build_order_items
    routes_main_module._mark_order_paid_from_payment = patched_mark_order_paid_from_payment
    routes_main_module._order_finance_patches_installed = True
