"""Controlled real-Mongo payment settlement smoke test.

Usage (only in authorised VPS validation window):
    PYTHONPATH=backend backend/.venv/bin/python backend/tests/validate_payment_mongo.py

Requires FANDOMFORGE_TEST_MONGO_URL and FANDOMFORGE_TEST_DB_NAME.
Refuses any database name not matching the explicitly disposable test prefix.
It never loads the production .env, never calls a payment provider and stubs
outbound emails/events. Cleans up ONLY its own uniquely named database.
"""
import asyncio
import os
from copy import deepcopy
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorClient

import routes_main as routes
from models import Order, OrderItem


async def run():
    uri = os.environ.get("FANDOMFORGE_TEST_MONGO_URL", "")
    prefix = os.environ.get("FANDOMFORGE_TEST_DB_NAME", "")
    production = os.environ.get("DB_NAME", "")
    if not uri or not prefix.startswith("fandomforge_disposable_test_"):
        raise SystemExit("Refusing database test: explicit disposable URI and database prefix required")
    if prefix == production or len(prefix) < 28:
        raise SystemExit("Refusing database test: database name is not safely isolated")
    database_name = prefix + "_" + uuid4().hex[:12]
    client = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=5000)
    db = client[database_name]
    events = []
    emails = []

    async def event_stub(database, **kwargs):
        events.append(kwargs)

    async def email_stub(database, **kwargs):
        emails.append(kwargs)

    real_event, real_email = routes.add_order_event, routes.queue_customer_order_email
    routes.add_order_event = event_stub
    routes.queue_customer_order_email = email_stub

    def make_order(number, status="in_production", provider="payfast"):
        item = OrderItem(
            id=f"item-{number}", product_id="test-product", product_title="Disposable test product",
            band_id="test-creator", printer_id="test-printer", variation_id="test-variation",
            size="M", color="Black", quantity=1, unit_price=250, print_cost_unit=90,
            commission_rate=0.1, commission_amount=25, band_earnings=45, printer_payout=180,
        )
        order = Order(
            id=f"order-{number}", order_number=number, buyer_email="test@example.com",
            items=[item], subtotal=250, total=250, status=status,
            payment_provider=provider, payment_status="pending",
            shipping_address={
                "full_name": "Disposable Test", "email": "test@example.com",
                "line1": "Test Only", "city": "Cape Town", "postal_code": "7550",
            },
        )
        return routes.iso_dates(order.model_dump())

    try:
        await client.admin.command("ping")
        if database_name in await client.list_database_names():
            raise AssertionError("Disposable test database unexpectedly exists")

        order = make_order("MF-ISOLATED-EFT")
        order.update(payment_id="payfast-old", payment_reference="PF-OLD")
        await db.orders.insert_one(deepcopy(order))
        await db.payments.insert_one({
            "id": "payfast-old", "order_id": order["id"], "provider": "payfast",
            "provider_reference": "PF-OLD", "status": "pending", "amount": 250, "currency": "ZAR",
        })
        request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(db=db)))
        user = SimpleNamespace(id="isolated-superadmin", role="super_admin")
        payload = routes.ManualOrderPaymentRecord(
            method="eft", reference="ISOLATED-BANK-RECEIPT", note="Disposable test only",
            confirmed_received=True,
        )
        result = await routes.record_manual_order_payment(order["id"], payload, request, user)
        assert result.payment_status == "paid"
        assert result.status == "in_production", "Settling must preserve production progress"
        assert result.payment_provider == "manual"
        assert await db.payments.count_documents({"order_id": order["id"]}) == 2
        assert await db.payments.count_documents({
            "order_id": order["id"], "provider": "payfast", "status": "pending"
        }) == 1
        wallet_count = await db.wallet_transactions.count_documents({"order_id": order["id"]})
        assert wallet_count == 3, f"Expected exactly 3 distinct wallet entries, found {wallet_count}"
        try:
            await routes.record_manual_order_payment(order["id"], payload, request, user)
        except HTTPException as exc:
            assert exc.status_code == 409
        else:
            raise AssertionError("Second EFT record should be rejected")
        assert await db.payments.count_documents({"order_id": order["id"]}) == 2
        await routes.ensure_wallet_transactions_for_order(db, await db.orders.find_one({"id": order["id"]}))
        assert await db.wallet_transactions.count_documents({"order_id": order["id"]}) == wallet_count
        assert not (await db.orders.find_one({"id": order["id"]})).get("manual_payment_claim")
        print("PASS: real Mongo EFT settlement, preserved fulfilment, gateway history, duplicate guard, wallet idempotence")

        second = make_order("MF-ISOLATED-PF", status="sent_to_printer")
        second.update(payment_id="payfast-active", payment_reference="PF-ACTIVE")
        await db.orders.insert_one(deepcopy(second))
        payfast = {
            "id": "payfast-active", "order_id": second["id"], "provider": "payfast",
            "provider_reference": "PF-ACTIVE", "status": "pending",
            "amount": 250, "currency": "ZAR", "kind": "order",
        }
        await db.payments.insert_one(deepcopy(payfast))
        payload = {
            "paid": True, "amount_gross": 250.0,
            "raw": {"Gross": "250.00", "Type": "FUNDS_RECEIVED", "Sign": "CREDIT"},
        }
        settled = await routes._mark_order_paid_from_payment(db, payfast, payload)
        assert settled["payment_status"] == "paid"
        assert settled["status"] == "sent_to_printer"
        assert await db.wallet_transactions.count_documents({"order_id": second["id"]}) == 3
        await routes._mark_order_paid_from_payment(db, payfast, payload)
        assert await db.wallet_transactions.count_documents({"order_id": second["id"]}) == 3
        assert await db.payments.count_documents({"order_id": second["id"]}) == 1
        print("PASS: real Mongo PayFast settlement, progress preservation and repeated confirmation")
        print(f"PASS: {len(events)} internal audit event calls and {len(emails)} outbound-email calls were stubbed")
        print("NO LIVE ORDERS, PAYMENTS, EMAILS OR GATEWAY REQUESTS WERE TOUCHED")
    finally:
        routes.add_order_event = real_event
        routes.queue_customer_order_email = real_email
        if database_name.startswith("fandomforge_disposable_test_") and database_name != production:
            await client.drop_database(database_name)
            print("Disposable test database removed:", database_name)
        client.close()


if __name__ == "__main__":
    asyncio.run(run())
