"""Real payment finalizer tests with an isolated in-memory collection.

No real merchant API or MongoDB connections are used. These deliberately
exercise the real _mark_order_paid_from_payment helper, not a mocked version.
"""
import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import routes_main as routes
from test_manual_order_payment import Collection, example_order


def payment_fixture(monkeypatch, status="pending_payment", provider="manual"):
    order = example_order()
    # Use a commercially balanced order: runtime launch-integrity finance
    # rejects a non-zero subtotal paired with an empty item list.
    order["items"] = [{
        "id": "item-1", "product_id": "product-1",
        "product_title": "Isolated test garment",
        "band_id": "creator-1", "printer_id": "printer-1",
        "variation_id": "variation-1", "size": "M", "color": "Black",
        "quantity": 1, "unit_price": 250.0, "print_cost_unit": 90.0,
        "commission_rate": 0.1, "commission_amount": 25.0,
        "band_earnings": 45.0, "printer_payout": 180.0,
        "production_snapshot": {},
    }]
    order["status"] = status
    order["payment_status"] = "pending"
    order["payment_id"] = "pay-1"
    order["payment_provider"] = provider
    payment = {
        "id": "pay-1", "order_id": order["id"], "amount": 250,
        "currency": "ZAR", "provider": provider,
        "provider_reference": "receipt-123", "status": "pending",
    }
    db = SimpleNamespace(
        orders=Collection([order]),
        payments=Collection([payment]),
    )
    events, wallet_calls, emails = [], [], []

    async def wallet(database, settled):
        wallet_calls.append(settled["id"])

    async def audit(database, **kwargs):
        events.append(kwargs)

    async def email(database, **kwargs):
        emails.append(kwargs)

    monkeypatch.setattr(routes, "ensure_wallet_transactions_for_order", wallet)
    monkeypatch.setattr(routes, "add_order_event", audit)
    monkeypatch.setattr(routes, "queue_customer_order_email", email)

    # These tests target core payment state transitions. The launch-integrity
    # wrappers are installed during full-suite collection, so suppress unrelated
    # ledger/job/legacy payout mutations in this minimal in-memory fixture.
    from launch_integrity import finance as finance_module
    from launch_integrity import install as install_module
    import order_finance_patches

    async def pass_through_allocation(database, settled):
        return settled

    async def no_financial_side_effects(*args, **kwargs):
        return None

    monkeypatch.setattr(
        "launch_integrity.pricing.finalize_order_allocations",
        pass_through_allocation,
    )
    monkeypatch.setattr(finance_module, "post_paid_order_events", no_financial_side_effects)
    monkeypatch.setattr(install_module, "ensure_job_for_item", no_financial_side_effects)
    monkeypatch.setattr(
        order_finance_patches,
        "_ensure_legacy_commission_and_payout_records",
        no_financial_side_effects,
    )
    return db, payment, events, wallet_calls, emails


def settle(db, payment, claim_id=None):
    return asyncio.run(routes._mark_order_paid_from_payment(
        db, payment, {"source": "test-receipt"}, claim_id=claim_id,
    ))


@pytest.mark.parametrize("progress", [
    "sent_to_printer", "in_production", "ready_for_dispatch",
    "shipped", "completed",
])
def test_payment_preserves_existing_fulfilment_progress(monkeypatch, progress):
    db, payment, events, wallet_calls, emails = payment_fixture(monkeypatch, progress)
    result = settle(db, payment)
    assert result["payment_status"] == "paid"
    assert result["status"] == progress
    assert db.payments.docs[0]["status"] == "completed"
    assert wallet_calls == ["order-1"]
    assert len(events) == 1
    assert len(emails) == 1


def test_pending_checkout_order_advances_on_payment(monkeypatch):
    db, payment, events, wallet_calls, emails = payment_fixture(monkeypatch)
    result = settle(db, payment)
    assert result["status"] == "sent_to_printer"
    assert result["payment_status"] == "paid"


def test_repeat_confirmation_does_not_repeat_side_effects(monkeypatch):
    db, payment, events, wallet_calls, emails = payment_fixture(monkeypatch)
    first = settle(db, payment)
    second = settle(db, payment)
    assert first["payment_status"] == second["payment_status"] == "paid"
    assert wallet_calls == ["order-1"]
    assert len(events) == 1
    assert len(emails) == 1


def test_stale_gateway_attempt_cannot_overwrite_manual_payment(monkeypatch):
    db, payment, events, wallet_calls, emails = payment_fixture(monkeypatch)
    db.orders.docs[0]["payment_id"] = "newer-manual"
    with pytest.raises(HTTPException) as error:
        settle(db, payment)
    assert error.value.status_code == 409
    assert db.orders.docs[0]["payment_status"] == "pending"
    assert not wallet_calls
    assert not events


def test_unclaimed_webhook_cannot_interrupt_admin_reconciliation(monkeypatch):
    db, payment, events, wallet_calls, emails = payment_fixture(monkeypatch)
    db.orders.docs[0]["manual_payment_claim"] = "admin-claim"
    with pytest.raises(HTTPException) as error:
        settle(db, payment)
    assert error.value.status_code == 409
    assert db.orders.docs[0]["payment_status"] == "pending"
    assert not wallet_calls


def test_claimed_settlement_is_allowed_and_is_idempotent(monkeypatch):
    db, payment, events, wallet_calls, emails = payment_fixture(monkeypatch)
    db.orders.docs[0]["manual_payment_claim"] = "admin-claim"
    settled = settle(db, payment, claim_id="admin-claim")
    assert settled["payment_status"] == "paid"
    assert len(wallet_calls) == 1


def test_cancelled_order_does_not_settle(monkeypatch):
    db, payment, events, wallet_calls, emails = payment_fixture(monkeypatch, "cancelled")
    with pytest.raises(HTTPException) as error:
        settle(db, payment)
    assert error.value.status_code == 409
    assert db.orders.docs[0]["payment_status"] == "pending"
    assert not wallet_calls
