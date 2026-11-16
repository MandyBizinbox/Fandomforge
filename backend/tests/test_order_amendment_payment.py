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
        return item.get(field) == expected

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
