"""Unit-level regression coverage for manually recording an existing order payment.

These tests use an in-memory DB substitute: no gateway calls or real orders.
Run with pytest on the authorised VPS checkout.
"""
import asyncio
from copy import deepcopy
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import routes_main as routes
from models import Order


def example_order():
    return Order(
        id="order-1",
        order_number="MF-TEST-1",
        buyer_email="buyer@example.com",
        items=[],
        subtotal=250,
        total=250,
        shipping_address={
            "full_name": "Test Customer",
            "email": "buyer@example.com",
            "line1": "1 Test Street",
            "city": "Cape Town",
            "postal_code": "7550",
        },
    ).model_dump(mode="json")


class Collection:
    def __init__(self, docs=None):
        self.docs = docs or []

    def matches(self, doc, query):
        for key, condition in query.items():
            if isinstance(condition, dict) and "$exists" in condition:
                if (key in doc) != condition["$exists"]:
                    return False
            elif isinstance(condition, dict) and "$nin" in condition:
                if doc.get(key) in condition["$nin"]:
                    return False
            elif doc.get(key) != condition:
                return False
        return True

    async def find_one(self, query, projection=None):
        record = next((item for item in self.docs if self.matches(item, query)), None)
        return deepcopy(record) if record is not None else None

    async def update_one(self, query, update):
        record = next((item for item in self.docs if self.matches(item, query)), None)
        if record is None:
            return SimpleNamespace(modified_count=0)
        for key, value in update.get("$set", {}).items():
            record[key] = value
        for key in update.get("$unset", {}):
            record.pop(key, None)
        return SimpleNamespace(modified_count=1)

    async def insert_one(self, doc):
        self.docs.append(deepcopy(doc))
        return SimpleNamespace(inserted_id=doc["id"])


def setup(monkeypatch):
    db = SimpleNamespace(
        orders=Collection([example_order()]),
        payments=Collection(),
    )
    events = []

    async def mark_paid(database, payment, provider_payload):
        await database.orders.update_one(
            {"id": payment["order_id"]},
            {"$set": {"payment_status": "paid", "status": "sent_to_printer"}},
        )
        return await database.orders.find_one({"id": payment["order_id"]})

    async def audit(database, **kwargs):
        events.append(kwargs)

    async def attach(database, order):
        return order

    monkeypatch.setattr(routes, "_mark_order_paid_from_payment", mark_paid)
    monkeypatch.setattr(routes, "add_order_event", audit)
    monkeypatch.setattr(routes, "_attach_order_payment_summary", attach)
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(db=db)))
    user = SimpleNamespace(id="admin-test", role="super_admin")
    return db, events, request, user


def payment_payload(**changes):
    value = {
        "method": "eft",
        "reference": "BANK-123",
        "note": "Verified on bank statement",
        "confirmed_received": True,
    }
    value.update(changes)
    return routes.ManualOrderPaymentRecord(**value)


def test_manual_payment_records_full_amount_and_audit(monkeypatch):
    db, events, request, user = setup(monkeypatch)
    result = asyncio.run(routes.record_manual_order_payment(
        "order-1", payment_payload(), request, user,
    ))
    assert result.payment_status == "paid"
    assert result.payment_provider == "manual"
    assert len(db.payments.docs) == 1
    assert db.payments.docs[0]["amount"] == 250
    assert db.payments.docs[0]["manual_reference"] == "BANK-123"
    assert db.payments.docs[0]["recorded_by"] == "admin-test"
    assert db.orders.docs[0]["payment_id"] == db.payments.docs[0]["id"]
    assert "manual_payment_claim" not in db.orders.docs[0]
    assert events[0]["actor"] is user


def test_manual_payment_cannot_be_recorded_twice(monkeypatch):
    db, events, request, user = setup(monkeypatch)
    asyncio.run(routes.record_manual_order_payment("order-1", payment_payload(), request, user))
    with pytest.raises(HTTPException) as error:
        asyncio.run(routes.record_manual_order_payment("order-1", payment_payload(), request, user))
    assert error.value.status_code == 409
    assert len(db.payments.docs) == 1


def test_manual_payment_requires_receipt_and_confirmation(monkeypatch):
    db, events, request, user = setup(monkeypatch)
    for data in [
        {"confirmed_received": False},
        {"method": "payfast"},
        {"reference": " "},
    ]:
        with pytest.raises((HTTPException, ValueError)):
            asyncio.run(routes.record_manual_order_payment(
                "order-1", payment_payload(**data), request, user,
            ))
    assert db.payments.docs == []


def test_manual_payment_preserves_original_gateway_record(monkeypatch):
    db, events, request, user = setup(monkeypatch)
    original = {
        "id": "gateway-payment-old",
        "order_id": "order-1",
        "provider": "paystack",
        "provider_reference": "PS-OLD",
        "status": "pending",
    }
    db.payments.docs.append(deepcopy(original))
    db.orders.docs[0].update({
        "payment_id": original["id"],
        "payment_provider": "paystack",
        "payment_reference": original["provider_reference"],
    })

    asyncio.run(routes.record_manual_order_payment(
        "order-1", payment_payload(reference="BANK-NEW"), request, user,
    ))

    assert len(db.payments.docs) == 2
    assert db.payments.docs[0] == original
    manual = db.payments.docs[1]
    assert manual["previous_payment_id"] == "gateway-payment-old"
    assert manual["previous_reference"] == "PS-OLD"
    assert db.orders.docs[0]["payment_id"] == manual["id"]
    assert db.orders.docs[0]["payment_provider"] == "manual"


def test_manual_payment_rejects_cancelled_orders(monkeypatch):
    db, events, request, user = setup(monkeypatch)
    db.orders.docs[0]["status"] = "cancelled"
    with pytest.raises(HTTPException) as error:
        asyncio.run(routes.record_manual_order_payment(
            "order-1", payment_payload(), request, user,
        ))
    assert error.value.status_code == 409
    assert db.payments.docs == []


def test_payfast_reconciliation_marks_paid_only_with_matching_credit(monkeypatch):
    db, events, request, user = setup(monkeypatch)
    payment = {
        "id": "payfast-1",
        "order_id": "order-1",
        "provider": "payfast",
        "provider_reference": "PF-MERCHANT-1",
        "amount": 250.0,
        "currency": "ZAR",
        "status": "pending",
        "kind": "order",
    }
    db.payments.docs.append(deepcopy(payment))
    db.orders.docs[0].update({
        "payment_id": payment["id"], "payment_provider": "payfast",
        "payment_reference": payment["provider_reference"],
    })

    async def config(database, key, masked=False):
        assert key == "payfast"
        return {"key": "payfast"}

    class VerifiedAdapter:
        async def verify_payment(self, reference, config):
            assert reference == "PF-MERCHANT-1"
            return {
                "paid": True,
                "reference": reference,
                "amount_gross": 250.00,
                "raw": {"Gross": "250.00", "Type": "FUNDS_RECEIVED", "Sign": "CREDIT"},
            }

    monkeypatch.setattr(routes, "_get_gateway_config", config)
    monkeypatch.setattr(routes, "get_payment_gateway_adapter", lambda key: VerifiedAdapter())
    result = asyncio.run(routes.admin_reconcile_order_payfast("order-1", request, user))
    assert result["verified"] is True
    assert db.orders.docs[0]["payment_status"] == "paid"
    assert any(event["title"] == "PayFast payment reconciled" for event in events)


def test_payfast_reconciliation_unconfirmed_leaves_order_unpaid(monkeypatch):
    db, events, request, user = setup(monkeypatch)
    db.payments.docs.append({
        "id": "payfast-2", "order_id": "order-1", "provider": "payfast",
        "provider_reference": "PF-MERCHANT-2", "amount": 250.0,
        "currency": "ZAR", "status": "pending",
    })
    db.orders.docs[0].update({
        "payment_id": "payfast-2", "payment_provider": "payfast",
    })
    async def config(database, key, masked=False):
        return {"key": "payfast"}
    class UnconfirmedAdapter:
        async def verify_payment(self, reference, config):
            return {"paid": False, "status": "pending", "reference": reference}
    monkeypatch.setattr(routes, "_get_gateway_config", config)
    monkeypatch.setattr(routes, "get_payment_gateway_adapter", lambda key: UnconfirmedAdapter())
    result = asyncio.run(routes.admin_reconcile_order_payfast("order-1", request, user))
    assert result["verified"] is False
    assert db.orders.docs[0]["payment_status"] == "pending"
    assert "manual_payment_claim" not in db.orders.docs[0]


def test_payfast_reconciliation_rejects_amount_mismatch(monkeypatch):
    db, events, request, user = setup(monkeypatch)
    db.payments.docs.append({
        "id": "payfast-3", "order_id": "order-1", "provider": "payfast",
        "provider_reference": "PF-MERCHANT-3", "amount": 250.0,
        "currency": "ZAR", "status": "pending",
    })
    db.orders.docs[0].update({
        "payment_id": "payfast-3", "payment_provider": "payfast",
    })
    async def config(database, key, masked=False):
        return {"key": "payfast"}
    class WrongAmountAdapter:
        async def verify_payment(self, reference, config):
            return {"paid": True, "amount_gross": 200.0, "raw": {"Gross": "200.00"}}
    monkeypatch.setattr(routes, "_get_gateway_config", config)
    monkeypatch.setattr(routes, "get_payment_gateway_adapter", lambda key: WrongAmountAdapter())
    with pytest.raises(HTTPException) as error:
        asyncio.run(routes.admin_reconcile_order_payfast("order-1", request, user))
    assert error.value.status_code == 409
    assert db.orders.docs[0]["payment_status"] == "pending"
    assert "manual_payment_claim" not in db.orders.docs[0]
