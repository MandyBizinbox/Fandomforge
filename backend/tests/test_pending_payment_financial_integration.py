"""Disposable MongoDB integration checks for PR #141.

Run only against the separately started, isolated localhost mongod:
    FF_PR141_TEST_MONGO_URI=mongodb://127.0.0.1:27943 \
    PYTHONPATH=backend .venv-test/bin/python -m pytest \
    backend/tests/test_pending_payment_financial_integration.py -v

Never points at the production DB. The test aborts unless the explicit
loopback port 27943 is supplied and all test records are fictional.
No network requests to external payment gateways or SMTP are permitted.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from urllib.parse import urlencode
import os

import pytest
from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorClient

import routes_main
from pending_payment_routes import (
    continue_existing_order_payment,
    lookup_recovery_order,
    make_recovery_link,
    recovery_order,
)
from pending_payment_worker import _review_cancellation, ensure_indexes


@pytest.fixture
async def db():
    uri = os.getenv("FF_PR141_TEST_MONGO_URI")
    if uri != "mongodb://127.0.0.1:27943":
        pytest.skip("Requires explicit isolated MongoDB on 127.0.0.1:27943")
    client = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=3000)
    await client.admin.command("ping")
    name = "ff_pr141_financial_isolation"
    database = client[name]
    await database.client.drop_database(name)
    await ensure_indexes(database)
    try:
        yield database
    finally:
        await database.client.drop_database(name)
        client.close()


def request_for(db, *, body=b""):
    class FakeRequest:
        app = SimpleNamespace(state=SimpleNamespace(db=db))
        headers = {"content-type": "application/x-www-form-urlencoded"}
        url = "https://fandomforge.co.za/api/payments/webhooks/payfast"

        async def body(self):
            return body

    return FakeRequest()


def order_doc(order_id, *, status="pending_payment", payment_status="pending"):
    return {
        "id": order_id,
        "order_number": f"MF-{order_id}",
        "tracking_token": f"track-{order_id}",
        "buyer_email": "fictional@example.invalid",
        "shipping_address": {"full_name": "Test Customer"},
        "created_at": (datetime.now(timezone.utc) - timedelta(days=5)).isoformat(),
        "status": status,
        "payment_status": payment_status,
        "payment_provider": "payfast",
        "payment_id": f"payment-{order_id}",
        "payment_recovery_enabled": True,
        "payment_reminder_stage": 2,
        "reminder_1_delivery": "sent",
        "reminder_2_delivery": "sent",
        "reminder_2_sent_at": (datetime.now(timezone.utc) - timedelta(days=2)).isoformat(),
        "items": [{
            "id": "item-1",
            "product_title": "Black T-Shirt",
            "size": "L", "color": "Black", "quantity": 1,
            "unit_price": 250,
        }],
        "subtotal": 250.0,
        "shipping_total": 0.0,
        "total": 250.0,
    }


def payment_doc(order_id, *, status="pending"):
    return {
        "id": f"payment-{order_id}",
        "order_id": order_id,
        "provider": "payfast",
        "provider_reference": f"ref-{order_id}",
        "status": status,
        "currency": "ZAR",
        "amount": 250.0,
    }


@pytest.mark.anyio
async def test_recovery_load_and_retry_reuse_existing_order_payment(db):
    await db.orders.insert_one(order_doc("RECOVER"))
    await db.payments.insert_one(payment_doc("RECOVER"))
    order = await db.orders.find_one({"id": "RECOVER"})
    url = await make_recovery_link(
        db, order, stage=1, origin="https://fandomforge.co.za"
    )
    token = url.rsplit("/", 1)[-1]

    response = await recovery_order(token, request_for(db))
    assert response["order_number"] == "MF-RECOVER"
    assert response["items"][0]["size"] == "L"
    assert response["total"] == 250.0
    assert "buyer_email" not in response
    assert "shipping_address" not in response

    class FakePayFast:
        async def verify_payment(self, reference, config):
            assert reference == "ref-RECOVER"
            return {"reference": reference, "paid": False, "status": "pending"}

        async def initialize_payment(self, order, config, urls):
            assert order["id"] == "RECOVER"
            assert urls["reference"] == "ref-RECOVER"
            assert urls["webhook_url"] == "https://fandomforge.co.za/api/payments/webhooks/payfast"
            return {
                "payment_action": "redirect",
                "payment_url": "https://www.payfast.co.za/eng/process?test=1",
            }

    with patch.object(
        routes_main, "_get_gateway_config",
        new=AsyncMock(return_value={"enabled": True})
    ), patch("payment_gateways.get_payment_gateway_adapter", return_value=FakePayFast()):
        payment = await continue_existing_order_payment(token, request_for(db))

    assert payment["payment_action"] == "redirect"
    assert await db.orders.count_documents({}) == 1
    assert await db.payments.count_documents({}) == 1


@pytest.mark.anyio
async def test_payment_recovery_refuses_paid_and_expired_orders(db):
    await db.orders.insert_one(order_doc("PAID"))
    await db.payments.insert_one(payment_doc("PAID"))
    order = await db.orders.find_one({"id": "PAID"})
    url = await make_recovery_link(db, order, stage=1, origin="https://fandomforge.co.za")
    token = url.rsplit("/", 1)[-1]
    await db.orders.update_one(
        {"id": "PAID"},
        {"$set": {"status": "paid", "payment_status": "paid"}},
    )
    with pytest.raises(HTTPException) as exc:
        await continue_existing_order_payment(token, request_for(db))
    assert exc.value.status_code == 409

    await db.order_payment_recovery_links.update_one(
        {"order_id": "PAID"},
        {"$set": {"expires_at": "2000-01-01T00:00:00+00:00"}},
    )
    with pytest.raises(HTTPException) as exc:
        await lookup_recovery_order(db, token)
    assert exc.value.status_code == 404


@pytest.mark.anyio
async def test_overdue_paid_order_advances_to_fulfilment(db):
    order = order_doc("OVERDUE", status="payment_overdue")
    await db.orders.insert_one(order)
    payment = payment_doc("OVERDUE")
    await db.payments.insert_one(payment)
    confirmed = {
        "paid": True,
        "status": "completed",
        "reference": "ref-OVERDUE",
        "amount_gross": 250.0,
        "raw": {"Gross": "250.00"},
    }
    with (
        patch.object(routes_main, "ensure_wallet_transactions_for_order", new=AsyncMock()),
        patch.object(routes_main, "add_order_event", new=AsyncMock()),
        patch.object(routes_main, "queue_customer_order_email", new=AsyncMock()),
    ):
        updated = await routes_main._mark_order_paid_from_payment(db, payment, confirmed)
    assert updated["status"] == "sent_to_printer"
    assert updated["payment_status"] == "paid"
    assert (await db.payments.find_one({"id": payment["id"]}))["status"] == "completed"


@pytest.mark.anyio
async def test_payment_during_cancellation_review_is_never_cancelled(db):
    await db.orders.insert_one(order_doc("RACE", status="payment_overdue"))
    await db.payments.insert_one(payment_doc("RACE"))

    class PaidDuringVerification:
        async def verify_payment(self, reference, config):
            # Simulate a separate verified ITN settling the order after the
            # review worker read it, but before cancellation CAS.
            await db.orders.update_one(
                {"id": "RACE"},
                {"$set": {"payment_status": "paid", "status": "sent_to_printer"}},
            )
            await db.payments.update_one(
                {"order_id": "RACE"}, {"$set": {"status": "completed"}},
            )
            return {"reference": reference, "paid": False, "status": "failed"}

    with patch.object(
        routes_main, "_get_gateway_config", new=AsyncMock(return_value={"enabled": True})
    ), patch("payment_gateways.get_payment_gateway_adapter", return_value=PaidDuringVerification()):
        result = await _review_cancellation(
            db, await db.orders.find_one({"id": "RACE"}), datetime.now(timezone.utc)
        )
    assert result == "review_race_or_new_payment"
    saved = await db.orders.find_one({"id": "RACE"})
    assert saved["payment_status"] == "paid"
    assert saved["status"] == "sent_to_printer"


@pytest.mark.anyio
async def test_late_payfast_webhook_creates_one_exception_without_wallets(db):
    await db.orders.insert_one(order_doc("LATE", status="cancelled", payment_status="failed"))
    await db.payments.insert_one(payment_doc("LATE", status="cancelled"))

    class SignedFakePayFast:
        async def handle_webhook(self, payload, headers, config, raw):
            return {
                "reference": "ref-LATE",
                "payment_id": "provider-LATE",
                "order_id": "LATE",
                "status": "completed",
                "paid": True,
                "event": "payfast.complete",
                "raw": dict(payload),
            }

    body = urlencode({
        "m_payment_id": "ref-LATE",
        "amount_gross": "250.00",
        "payment_status": "COMPLETE",
    }).encode("utf-8")
    request = request_for(db, body=body)
    with (
        patch.object(
            routes_main, "_get_gateway_config",
            new=AsyncMock(return_value={"enabled": True})
        ),
        patch.object(
            routes_main, "ensure_wallet_transactions_for_order",
            new=AsyncMock(),
        ) as wallet,
        patch("payment_gateways.get_payment_gateway_adapter", return_value=SignedFakePayFast()),
    ):
        first = await routes_main.gateway_payment_webhook("payfast", request)
        second = await routes_main.gateway_payment_webhook("payfast", request)
        wallet.assert_not_awaited()

    assert first["status"] == "late_paid_requires_review"
    assert second["status"] == "late_paid_requires_review"
    assert await db.payment_reconciliation_exceptions.count_documents({
        "idempotency_key": "late-credit:payment-LATE"
    }) == 1
    saved = await db.orders.find_one({"id": "LATE"})
    assert saved["status"] == "cancelled"
    assert saved["payment_status"] == "failed"
    payment = await db.payments.find_one({"id": "payment-LATE"})
    assert payment["status"] == "completed"
    assert payment["late_payment_requires_review"] is True
