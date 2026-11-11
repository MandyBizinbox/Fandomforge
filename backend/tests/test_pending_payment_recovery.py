"""Pending payment recovery policy tests, fully offline."""
from datetime import datetime, timedelta, timezone

import pytest

from pending_payment_recovery import (
    payment_reminder_email,
    pending_recovery_eligible,
    recovery_due_stage,
)


def sample_order(*, age_hours=24, stage=0):
    now = datetime.now(timezone.utc)
    return {
        "id": "order-test",
        "order_number": "MF-TEST",
        "created_at": (now - timedelta(hours=age_hours)).isoformat(),
        "payment_recovery_enabled": True,
        "payment_reminder_stage": stage,
        "payment_provider": "payfast",
        "payment_id": "payment-test",
        "payment_status": "pending",
        "status": "pending_payment",
        "buyer_email": "buyer@example.com",
        "shipping_address": {"full_name": "Maya Customer"},
        "shipping_total": 0,
        "total": 250,
        "items": [{
            "product_title": "<script>alert('bad')</script>",
            "size": "M", "color": "Black", "quantity": 1, "unit_price": 250,
        }],
    }


def test_only_enrolled_payment_orders_qualify():
    order = sample_order()
    assert pending_recovery_eligible(order)
    for patch in (
        {"payment_recovery_enabled": False},
        {"payment_status": "paid"},
        {"status": "cancelled"},
        {"payment_provider": "manual"},
        {"manual_payment_claim": "bank-check"},
    ):
        assert not pending_recovery_eligible({**order, **patch})


def test_first_reminder_due_at_24_hours_only():
    assert recovery_due_stage(sample_order(age_hours=23), datetime.now(timezone.utc)) == 0
    assert recovery_due_stage(sample_order(age_hours=24), datetime.now(timezone.utc)) == 1


def test_second_reminder_requires_first_delivery():
    order = sample_order(age_hours=48, stage=1)
    assert recovery_due_stage(order, datetime.now(timezone.utc)) == 0
    order["reminder_1_delivery"] = "sent"
    assert recovery_due_stage(order, datetime.now(timezone.utc)) == 2


def test_cancellation_review_requires_both_confirmed_email_deliveries():
    order = sample_order(age_hours=72, stage=2)
    assert recovery_due_stage(order, datetime.now(timezone.utc)) == 0
    order["reminder_1_delivery"] = "sent"
    assert recovery_due_stage(order, datetime.now(timezone.utc)) == 0
    order["reminder_2_delivery"] = "sent"
    assert recovery_due_stage(order, datetime.now(timezone.utc)) == 3


def test_reminder_email_has_plain_and_html_and_escapes_products():
    reminder = payment_reminder_email(
        sample_order(), stage=2,
        recovery_url="https://fandomforge.co.za/order-payment/a_secure_token",
    )
    assert "Final payment reminder" in reminder["subject"]
    assert "R 250.00" in reminder["body"]
    assert "order-payment/a_secure_token" in reminder["body"]
    assert "&lt;script&gt;" in reminder["html_body"]
    assert "<script>" not in reminder["html_body"]
    assert "Continue Payment" in reminder["html_body"]


@pytest.mark.parametrize("url", ["http://example.com/x", "https://example.com/x?token=secret"])
def test_recovery_link_requires_safe_format(url):
    with pytest.raises(ValueError):
        payment_reminder_email(sample_order(), stage=1, recovery_url=url)
