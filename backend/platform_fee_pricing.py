"""Authoritative production-cost platform fee calculations."""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any


CENT = Decimal("0.01")


def decimal_value(value: Any) -> Decimal:
    try:
        return Decimal(str(value or 0))
    except Exception:
        return Decimal("0")


def money(value: Any) -> Decimal:
    return decimal_value(value).quantize(CENT, rounding=ROUND_HALF_UP)


def normalize_rate(value: Any) -> Decimal:
    rate = decimal_value(value)

    if rate > 1:
        rate /= Decimal("100")

    return max(Decimal("0"), min(rate, Decimal("1")))


def production_fee_amount(production_subtotal: Any, rate: Any) -> Decimal:
    """Platform fee charged on blank plus printing—not on retail."""

    subtotal = money(production_subtotal)
    return money(subtotal * normalize_rate(rate))


def total_cost_to_produce(production_subtotal: Any, rate: Any) -> Decimal:
    subtotal = money(production_subtotal)
    return money(subtotal + production_fee_amount(subtotal, rate))


def creator_amount_for_sale(
    selling_price: Any,
    production_subtotal: Any,
    rate: Any,
) -> Decimal:
    return money(
        money(selling_price)
        - total_cost_to_produce(production_subtotal, rate)
    )
