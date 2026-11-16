"""Protect original paid lines and PayFast confirmation after paid additions."""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from order_amendment_apply import additions_only
from payment_confirmation import validate_payment_confirmation


def old_order(**kwargs):
    return {
        "id": "order-1", "total": 145.0,
        "payment_id": "original-pay-1", "payment_status": "paid",
        "items": [{
            "id": "item-1", "product_id": "product-1",
            "variation_id": "size-1", "unit_price": 145.0,
            "quantity": 1, "production_status": "pending",
        }],
        **kwargs,
    }


def new_line(**overrides):
    return {
        "existing_item_id": None,
        "product_id": "product-2",
        "variation_id": "size-2", "unit_price": 160.0,
        "quantity": 1, "line_total": 160.0,
        **overrides,
    }


def unchanged_line(**overrides):
    return {
        "existing_item_id": "item-1",
        "product_id": "product-1", "variation_id": "size-1",
        "unit_price": 145.0, "quantity": 1,
        **overrides,
    }


def test_addition_only_can_be_applied_without_modifying_original():
    lines = additions_only(old_order(), {
        "items": [unchanged_line(), new_line()],
    })
    assert lines == [new_line()]


@pytest.mark.parametrize("preview", [
    {"items": [new_line()]},
    {"items": [unchanged_line(variation_id="another"), new_line()]},
    {"items": [unchanged_line(quantity=2), new_line()]},
    {"items": [unchanged_line(unit_price=160), new_line()]},
])
def test_removed_replaced_or_repriced_original_requires_financial_review(preview):
    with pytest.raises(HTTPException) as exc:
        additions_only(old_order(), preview)
    assert exc.value.status_code == 409


def original_payfast_payment():
    return {
        "id": "original-pay-1", "order_id": "order-1",
        "provider": "payfast", "status": "completed",
        "amount": 145.0, "currency": "ZAR",
    }


def test_original_payfast_replay_after_addition_uses_preserved_base_total():
    settled = old_order(
        total=305.0,
        amendment_base_total=145.0,
        applied_amendment_ids=["amendment-1"],
    )
    validate_payment_confirmation(original_payfast_payment(), settled, {
        "raw": {"amount_gross": "145.00"},
    })


def test_original_payfast_replay_must_still_match_real_evidence():
    settled = old_order(
        total=305.0,
        amendment_base_total=145.0,
        applied_amendment_ids=["amendment-1"],
    )
    with pytest.raises(HTTPException):
        validate_payment_confirmation(original_payfast_payment(), settled, {
            "raw": {"amount_gross": "305.00"},
        })


def test_different_payment_cannot_reuse_original_base_total_exception():
    settled = old_order(
        total=305.0,
        amendment_base_total=145.0,
        applied_amendment_ids=["amendment-1"],
    )
    other = original_payfast_payment()
    other["id"] = "another-payment"
    with pytest.raises(HTTPException):
        validate_payment_confirmation(other, settled, {
            "raw": {"amount_gross": "145.00"},
        })
