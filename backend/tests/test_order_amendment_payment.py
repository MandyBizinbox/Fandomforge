"""Financial safety checks for independent PayFast amendment supplements."""
from __future__ import annotations

import asyncio
from copy import deepcopy
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from order_amendment_payment import (
    process_verified_supplement, verify_supplement_amount,
    initiate_supplement, supplement_reference,
)


def paid_itn(reference="MF-AM-DRAFT123", amount="160.00"):
    return {
        "reference": reference, "payment_id": "PF-123",
        "amount_gross": float(amount), "paid": True,
        "status": "completed", "raw": {"amount_gross": amount}
    }


def payment():
    return {
        "id": "topup-1", "order_id": "order-1", "amendment_id": "draft-1",
        "kind": "order_amendment", "provider": "payfast",
        "provider_reference": "MF-AM-DRAFT123", "amount": 160.0,
        "currency": "ZAR", "status": "pending",
    }


def draft():
    return {
        "id": "draft-1", "order_id": "order-1", "payment_id": "topup-1",
        "status": "awaiting_topup",
    }


class FakeCollection:
    def __init__(self, data):
        self.data = deepcopy(data)
        self.operations = []

    async def find_one(self, selector, projection=None):
        for item in self.data:
            if all(self.matches(item, field, expected) for field, expected in selector.items()):
                return deepcopy(item)
        return None

    @staticmethod
    def matches(item, field, expected):
        if isinstance(expected, dict):
            if "$exists" in expected:
                return (field in item) == expected["$exists"]
            if "$in" in expected:
                return item.get(field) in expected["$in"]
            if "$ne" in expected:
                return item.get(field) != expected["$ne"]
        return item.get(field) == expected

    async def insert_one(self, document):
        self.data.append(deepcopy(document))
        return SimpleNamespace(inserted_id=document.get("_id"))

    async def delete_one(self, selector):
        for i, item in enumerate(self.data):
            if all(self.matches(item, field, expected) for field, expected in selector.items()):
                self.data.pop(i)
                return SimpleNamespace(deleted_count=1)
        return SimpleNamespace(deleted_count=0)

    async def update_one(self, selector, update):
        self.operations.append(deepcopy(update))
        for item in self.data:
            if all(self.matches(item, field, expected) for field, expected in selector.items()):
                for name, value in update.get("$set", {}).items():
                    item[name] = value
                for name in update.get("$unset", {}):
                    item.pop(name, None)
                return SimpleNamespace(modified_count=1, matched_count=1)
        return SimpleNamespace(modified_count=0, matched_count=0)


def context():
    return SimpleNamespace(
        order_amendments=FakeCollection([draft()]),
        payments=FakeCollection([payment()]),
        orders=FakeCollection([{
            "id": "order-1", "total": 145,
            "payment_id": "original-1", "payment_status": "paid",
            "items": [{"id": "shirt-1", "quantity": 1}],
        }]),
    )


def test_supplement_reference_is_separate_from_original_order():
    assert supplement_reference("ab-cd-ef").startswith("MF-AM-")
    assert "MF-ORDER" not in supplement_reference("ab-cd-ef")


def test_exact_verified_amount_and_reference_required():
    p = payment()
    verify_supplement_amount(p, paid_itn())
    with pytest.raises(HTTPException, match="amount"):
        verify_supplement_amount(p, paid_itn(amount="145.00"))
    with pytest.raises(HTTPException, match="reference"):
        verify_supplement_amount(p, paid_itn(reference="other"))
    with pytest.raises(HTTPException):
        verify_supplement_amount(p, {**paid_itn(), "paid": False})


def test_supplement_settlement_does_not_change_original_paid_order():
    db = context()
    original = deepcopy(db.orders.data)
    settled = asyncio.run(process_verified_supplement(db, payment(), paid_itn()))
    assert settled["status"] == "settled_pending_application"
    assert db.payments.data[0]["status"] == "completed"
    assert db.order_amendments.data[0]["status"] == "settled_pending_application"
    assert db.orders.data == original


def test_duplicate_itn_does_not_record_second_credit():
    db = context()
    asyncio.run(process_verified_supplement(db, payment(), paid_itn()))
    completed = deepcopy(db.payments.data[0])
    settled = asyncio.run(process_verified_supplement(db, completed, paid_itn()))
    assert settled["duplicate"] is True
    assert len([a for a in db.payments.operations if a.get("$set", {}).get("status") == "completed"]) == 1


def test_wrong_amendment_payment_is_rejected():
    db = context()
    wrong = payment()
    wrong["amendment_id"] = "not-this-draft"
    with pytest.raises(HTTPException):
        asyncio.run(process_verified_supplement(db, wrong, paid_itn()))
    assert db.orders.data[0]["total"] == 145
    assert db.payments.data[0]["status"] == "pending"


def test_unverified_failed_credit_is_rejected():
    db = context()
    with pytest.raises(HTTPException):
        asyncio.run(process_verified_supplement(db, payment(), {
            **paid_itn(), "paid": False, "status": "failed",
        }))
    assert db.payments.data[0]["status"] == "pending"


def test_duplicate_paid_itn_after_application_is_acknowledged():
    db = context()
    db.order_amendments.data[0]["status"] = "applied"
    db.payments.data[0]["status"] = "completed"
    original = deepcopy(db.orders.data)
    result = asyncio.run(process_verified_supplement(db, db.payments.data[0], paid_itn()))
    assert result["duplicate"] is True
    assert result["status"] == "applied"
    assert db.orders.data == original
    assert not db.payments.operations


def test_original_order_payment_never_uses_supplement_settlement_handler():
    db = context()
    wrong = payment()
    wrong["kind"] = "order"
    with pytest.raises(HTTPException):
        asyncio.run(process_verified_supplement(db, wrong, paid_itn()))
    assert not db.payments.operations


def paid_order_for_topup():
    return {
        "id": "order-1", "order_number": "MF-123",
        "payment_id": "original-1", "payment_status": "paid", "status": "paid",
        "total": 145.0, "updated_at": "version-1",
        "buyer_email": "shopper@example.com",
        "items": [{
            "id": "item-1", "product_id": "p1", "variation_id": "v1",
            "unit_price": 145.0, "quantity": 1, "production_status": "pending",
        }],
    }


def payable_draft():
    return {
        "id": "draft-1", "order_id": "order-1", "status": "draft_financial_review",
        "source_order_updated_at": "version-1", "requested_by": "admin-1",
        "preview": {
            "balance_due": 160.0, "overpayment_review": 0,
            "financial_status": "top_up_required",
            "items": [
                {"existing_item_id": "item-1", "product_id": "p1",
                 "variation_id": "v1", "unit_price": 145, "quantity": 1},
                {"product_id": "p2", "variation_id": "v2",
                 "unit_price": 160, "quantity": 1, "line_total": 160},
            ],
        },
    }


def topup_context():
    return SimpleNamespace(
        payments=FakeCollection([{
            "id": "original-1", "order_id": "order-1", "status": "completed",
            "amount": 145.0, "provider": "payfast",
        }]),
        order_amendments=FakeCollection([payable_draft()]),
        order_amendment_payment_locks=FakeCollection([]),
        orders=FakeCollection([paid_order_for_topup()]),
    )


def test_create_supplement_keeps_original_payment_unchanged(monkeypatch):
    import routes_main

    async def gateway_config(db, gateway_key, masked=False):
        assert gateway_key == "payfast"
        return {"enabled": True}

    class Adapter:
        async def initialize_payment(self, checkout_order, gateway, urls):
            assert checkout_order["total"] == 160
            assert urls["reference"].startswith("MF-AM-")
            assert urls["webhook_url"] == "https://fandomforge.co.za/api/payments/webhooks/payfast"
            return {"payment_url": "https://www.payfast.co.za/eng/process?mock=1"}

    monkeypatch.setattr(routes_main, "_get_gateway_config", gateway_config)
    monkeypatch.setattr(routes_main, "get_payment_gateway_adapter", lambda key: Adapter())
    db = topup_context()
    order = paid_order_for_topup()
    result = asyncio.run(initiate_supplement(db, order, payable_draft(), SimpleNamespace()))
    assert result["amount"] == 160
    assert result["status"] == "awaiting_topup"
    assert order["payment_id"] == "original-1"
    assert len(db.payments.data) == 2
    assert db.payments.data[0]["id"] == "original-1"
    assert db.payments.data[1]["kind"] == "order_amendment"
    assert len(db.order_amendment_payment_locks.data) == 1


def test_unpaid_original_order_cannot_create_second_checkout_link():
    db = topup_context()
    order = paid_order_for_topup()
    order["payment_status"] = "pending"
    with pytest.raises(HTTPException, match="confirmed"):
        asyncio.run(initiate_supplement(db, order, payable_draft(), SimpleNamespace()))
    assert len(db.payments.data) == 1


def test_replacement_draft_cannot_create_payfast_charge():
    db = topup_context()
    draft_doc = payable_draft()
    draft_doc["preview"]["items"] = [
        {"existing_item_id": "item-1", "product_id": "p1",
         "variation_id": "v2", "unit_price": 160, "quantity": 1}
    ]
    with pytest.raises(HTTPException, match="Replacing"):
        asyncio.run(initiate_supplement(db, paid_order_for_topup(), draft_doc, SimpleNamespace()))
    assert len(db.payments.data) == 1


def test_topup_sets_order_hold_until_paid_additions_are_applied(monkeypatch):
    import routes_main

    async def gateway_config(db, gateway_key, masked=False):
        return {"enabled": True}

    class Adapter:
        async def initialize_payment(self, checkout_order, gateway, urls):
            return {"payment_url": "https://www.payfast.co.za/eng/process?mock=1"}

    monkeypatch.setattr(routes_main, "_get_gateway_config", gateway_config)
    monkeypatch.setattr(routes_main, "get_payment_gateway_adapter", lambda key: Adapter())
    db = topup_context()
    asyncio.run(initiate_supplement(db, paid_order_for_topup(), payable_draft(), SimpleNamespace()))
    assert db.orders.data[0]["active_order_amendment_id"] == "draft-1"
    assert db.orders.data[0]["payment_id"] == "original-1"


def test_collection_summary_blocks_handover_while_amendment_is_held():
    from order_collection_routes import _order_summary
    doc = {
        "id": "order-1", "order_number": "MF-123",
        "status": "ready_for_dispatch", "payment_status": "paid",
        "active_order_amendment_id": "draft-1",
    }
    assert _order_summary(doc)["can_collect"] is False
    doc.pop("active_order_amendment_id")
    assert _order_summary(doc)["can_collect"] is True
