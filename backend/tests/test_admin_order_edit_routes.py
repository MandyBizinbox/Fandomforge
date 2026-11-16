from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from admin_order_edit_routes import OrderCorrectionRequest, correct_order
from models import ShippingAddress


def order():
    return {
        "id": "order-1",
        "order_number": "MF-123",
        "updated_at": "2026-11-16T10:00:00+00:00",
        "status": "paid",
        "payment_status": "paid",
        "buyer_email": "before@example.com",
        "shipping_address": {
            "full_name": "Previous Name",
            "email": "before@example.com",
            "phone": "",
            "line1": "1 Road",
            "line2": "",
            "city": "Cape Town",
            "state": "Western Cape",
            "postal_code": "7000",
            "country": "ZA",
        },
        "items": [{
            "id": "line1", "product_id": "tee", "product_title": "T-shirt",
            "size": "M", "color": "Black", "variation_id": "v1",
            "unit_price": 160, "quantity": 1, "production_status": "pending",
        }],
        "subtotal": 160,
        "shipping_total": 0,
        "total": 160,
    }


class FakeOrders:
    def __init__(self, value=None, modified=1):
        self.doc = value or order()
        self.modified = modified
        self.filter = None
        self.written = None

    async def find_one(self, query, projection=None):
        return self.doc

    async def update_one(self, query, updates):
        self.filter, self.written = query, updates
        return SimpleNamespace(modified_count=self.modified)


class FakeProducts:
    async def find_one(self, query, projection=None):
        return {
            "variations": [
                {"id": "v1", "size": "M", "color": "Black", "effective_selling_price": 160},
                {"id": "v2", "size": "L", "color": "Black", "effective_selling_price": 160},
                {"id": "v3", "size": "XL", "color": "Black", "effective_selling_price": 190},
            ]
        }


class FakeEvents:
    def __init__(self):
        self.rows = []

    async def insert_one(self, value):
        self.rows.append(value)


def environment(value=None, modified=1):
    orders = FakeOrders(value, modified)
    events = FakeEvents()
    db = SimpleNamespace(orders=orders, products=FakeProducts(), order_events=events)
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(db=db)))
    return request, orders, events


def admin(role="super_admin"):
    return SimpleNamespace(role=role, id="staff-1", name="Staff")


def correction(**kwargs):
    return OrderCorrectionRequest(
        expected_updated_at="2026-11-16T10:00:00+00:00",
        reason="Client requested correction before printing",
        **kwargs,
    )


def test_customer_address_change_keeps_payment_amount_and_audit_record():
    request, orders, events = environment()
    updated_address = {**order()["shipping_address"], "full_name": "Updated Name", "email": "after@example.com"}
    result = asyncio.run(correct_order("order-1", correction(shipping_address=updated_address), request, admin()))
    assert result["ok"] is True
    saved = orders.written["$set"]
    assert saved["buyer_email"] == "after@example.com"
    assert saved["shipping_address"]["full_name"] == "Updated Name"
    assert "payment_status" not in saved
    assert "total" not in saved
    assert "payment_id" not in saved
    assert orders.written["$push"]["edit_history"]["before"]["buyer_email"] == "before@example.com"
    assert len(events.rows) == 1


def test_variant_change_matches_existing_same_price_variant():
    request, orders, _ = environment()
    result = asyncio.run(correct_order("order-1", correction(item_corrections=[
        {"item_id": "line1", "size": "L", "color": "Black"}
    ]), request, admin()))
    assert result["ok"] is True
    line = orders.written["$set"]["items"][0]
    assert line["size"] == "L"
    assert line["variation_id"] == "v2"
    assert line["quantity"] == 1
    assert line["unit_price"] == 160


def test_different_price_variant_is_blocked():
    request, orders, _ = environment()
    with pytest.raises(HTTPException) as exc:
        asyncio.run(correct_order("order-1", correction(item_corrections=[
            {"item_id": "line1", "size": "XL", "color": "Black"}
        ]), request, admin()))
    assert exc.value.status_code == 409
    assert orders.written is None


def test_paid_order_after_production_start_cannot_be_corrected():
    value = order()
    value["status"] = "in_production"
    request, orders, _ = environment(value)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(correct_order("order-1", correction(shipping_address={
            **order()["shipping_address"], "full_name": "New"
        }), request, admin()))
    assert exc.value.status_code == 409
    assert orders.written is None


def test_non_super_admin_cannot_edit():
    request, orders, _ = environment()
    with pytest.raises(HTTPException) as exc:
        asyncio.run(correct_order("order-1", correction(shipping_address={
            **order()["shipping_address"], "full_name": "New"
        }), request, admin("manager")))
    assert exc.value.status_code == 403
    assert orders.written is None


def test_conflicting_order_revision_returns_409():
    request, orders, _ = environment(modified=0)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(correct_order("order-1", correction(shipping_address={
            **order()["shipping_address"], "full_name": "New"
        }), request, admin()))
    assert exc.value.status_code == 409
    assert orders.filter["updated_at"] == "2026-11-16T10:00:00+00:00"


@pytest.mark.parametrize("status", [
    "sent_to_printer", "in_production", "ready_for_dispatch",
    "shipped", "completed", "cancelled", "refunded",
])
def test_super_admin_can_correct_contact_details_at_any_status(status):
    value = order()
    value["status"] = status
    if status == "completed":
        value["collection_receipt"] = {"signed_at": "2026-11-16T11:00:00Z"}
    request, orders, _ = environment(value)
    result = asyncio.run(correct_order("order-1", correction(shipping_address={
        **order()["shipping_address"], "phone": "0712345678",
    }), request, admin()))
    assert result["ok"] is True
    assert orders.written["$set"]["shipping_address"]["phone"] == "0712345678"
    assert "status" not in orders.written["$set"]
    assert "collection_receipt" not in orders.written["$set"]


def test_item_changes_after_collection_rejected_but_contact_changes_remain_allowed():
    value = order()
    value["status"] = "completed"
    value["collection_receipt"] = {"signed_at": "2026-11-16T11:00:00Z"}
    request, orders, _ = environment(value)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(correct_order("order-1", correction(item_corrections=[
            {"item_id": "line1", "size": "L", "color": "Black"}
        ]), request, admin()))
    assert exc.value.status_code == 409
    assert orders.written is None
