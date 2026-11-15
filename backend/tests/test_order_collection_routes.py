from __future__ import annotations

import asyncio
import base64
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from order_collection_routes import (
    CollectionLookup,
    CompleteCollection,
    _order_summary,
    _validate_signature,
    complete_collection,
    lookup_collection,
)


def sample_order(**changes):
    order = {
        "id": "order-1",
        "order_number": "MF-ABC123",
        "buyer_email": "customer@example.com",
        "shipping_address": {"full_name": "Customer Example", "phone": "0710000000"},
        "status": "ready_for_dispatch",
        "payment_status": "paid",
        "items": [{"id": "item-1", "product_title": "Shirt", "quantity": 2}],
        "total": 320,
    }
    order.update(changes)
    return order


def signature():
    # Small synthetic fixture for the PNG-container validation threshold.
    return "data:image/png;base64," + base64.b64encode(
        b"\x89PNG\r\n\x1a\n" + b"x" * 400
    ).decode("ascii")


def staff():
    return SimpleNamespace(id="staff-1", role="admin", name="Collection Staff")


def test_ready_paid_order_can_be_collected():
    assert _order_summary(sample_order())["can_collect"] is True
    assert _order_summary(sample_order(payment_status="pending"))["can_collect"] is False
    assert _order_summary(sample_order(status="in_production"))["can_collect"] is False
    assert _order_summary(sample_order(status="completed"))["can_collect"] is False
    assert _order_summary(sample_order(collection_receipt={"signed_at": "2026-11-15"}))["can_collect"] is False


def test_signature_input_validation():
    _validate_signature(signature())
    with pytest.raises(HTTPException) as exc:
        _validate_signature("data:image/svg+xml;base64,PHN2Zy8+")
    assert exc.value.status_code == 422


class FakeCursor:
    def __init__(self, rows):
        self.rows = rows
    def sort(self, *args):
        return self
    async def to_list(self, length):
        return self.rows[:length]


class FakeOrders:
    def __init__(self, order=None, modified=1):
        self.order = order or sample_order()
        self.modified = modified
        self.filter = None
        self.changes = None
    def find(self, filter, projection):
        self.filter = filter
        return FakeCursor([self.order])
    async def find_one(self, filter, projection=None):
        return self.order
    async def update_one(self, filter, changes):
        self.filter = filter
        self.changes = changes
        return SimpleNamespace(modified_count=self.modified)


class FakeEvents:
    def __init__(self):
        self.saved = []
    async def insert_one(self, event):
        self.saved.append(event)


def request(orders):
    events = FakeEvents()
    database = SimpleNamespace(orders=orders, order_events=events)
    return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(db=database))), events


def test_exact_order_number_lookup_is_staff_only():
    orders = FakeOrders()
    req, _ = request(orders)
    result = asyncio.run(lookup_collection(CollectionLookup(query="MF-ABC123"), req, staff()))
    assert len(result["orders"]) == 1
    assert orders.filter["order_number"].match("MF-ABC123")
    assert not orders.filter["order_number"].match("MF-ABC123-other")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(lookup_collection(CollectionLookup(query="MF-ABC123"), req, SimpleNamespace(role="buyer")))
    assert exc.value.status_code == 403


def test_successful_collection_requires_atomic_paid_ready_transition():
    orders = FakeOrders()
    req, events = request(orders)
    payload = CompleteCollection(
        signer_name="Customer Example",
        signature_data_url=signature(),
        handover_confirmed=True,
    )
    result = asyncio.run(complete_collection("order-1", payload, req, staff()))
    assert result["status"] == "completed"
    assert orders.filter["payment_status"] == "paid"
    assert orders.filter["status"] == "ready_for_dispatch"
    assert orders.filter["collection_receipt"] == {"$exists": False}
    receipt = orders.changes["$set"]["collection_receipt"]
    assert receipt["signer_name"] == "Customer Example"
    assert receipt["collected_by_user_id"] == "staff-1"
    assert receipt["signature_data_url"].startswith("data:image/png;base64,")
    assert orders.changes["$set"]["status"] == "completed"
    assert events.saved[0]["metadata"]["collection_receipt_id"] == receipt["id"]


def test_no_completion_without_confirmed_handover():
    orders = FakeOrders()
    req, _ = request(orders)
    payload = CompleteCollection(signer_name="Customer Example", signature_data_url=signature(), handover_confirmed=False)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(complete_collection("order-1", payload, req, staff()))
    assert exc.value.status_code == 422
    assert orders.changes is None


def test_concurrent_or_ineligible_order_cannot_be_completed():
    orders = FakeOrders(sample_order(payment_status="pending"), modified=0)
    req, _ = request(orders)
    payload = CompleteCollection(signer_name="Customer Example", signature_data_url=signature(), handover_confirmed=True)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(complete_collection("order-1", payload, req, staff()))
    assert exc.value.status_code == 409
