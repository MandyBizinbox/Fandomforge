from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from admin_order_edit_routes import OrderCorrectionRequest, correct_order, admin_order_catalogue_search
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
            "band_id": "creator-1", "printer_id": "printer-1",
            "production_snapshot": {"costing_model": "platform_controlled_v2",
                                    "platform_commission": 12.0},
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
        if query.get("id") == "scouter":
            return {
                "id": "scouter", "title": "Scouter shirt",
                "published": True, "band_id": "creator-1",
                "assigned_printer_id": "printer-1",
                "selling_price": 160,
                "variations": [
                    {"id": "scouter-large", "size": "L", "color": "Black"},
                    {"id": "scouter-xl", "size": "XL", "color": "Black", "price_override": 190},
                ],
            }
        return {
            "id": "tee", "title": "T-shirt", "selling_price": 160,
            "variations": [
                {"id": "v1", "size": "M", "color": "Black"},
                {"id": "v2", "size": "L", "color": "Black"},
                {"id": "v3", "size": "XL", "color": "Black", "price_override": 190},
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


def test_pending_tee_variation_can_be_corrected_even_when_other_items_are_in_production():
    value = order()
    value["status"] = "in_production"
    request, orders, _ = environment(value)
    result = asyncio.run(correct_order("order-1", correction(item_corrections=[
        {"item_id": "line1", "size": "L", "color": "Black"}
    ]), request, admin()))
    assert result["ok"] is True
    line = orders.written["$set"]["items"][0]
    assert line["variation_id"] == "v2"
    assert line["unit_price"] == 160
    assert "payment_status" not in orders.written["$set"]
    assert "total" not in orders.written["$set"]


@pytest.mark.parametrize("production_status", ["accepted", "in_production", "ready"])
def test_super_admin_can_correct_same_price_tee_during_production_without_status_change(production_status):
    value = order()
    value["status"] = "in_production"
    value["items"][0]["production_status"] = production_status
    request, orders, events = environment(value)
    result = asyncio.run(correct_order("order-1", correction(item_corrections=[
        {"item_id": "line1", "size": "L", "color": "Black"}
    ]), request, admin()))
    assert result["ok"] is True
    assert orders.written["$set"]["items"][0]["variation_id"] == "v2"
    assert orders.written["$set"]["items"][0]["production_status"] == production_status
    assert not {"status", "payment_status", "payment_id", "total", "subtotal", "quantity"} & set(orders.written["$set"])
    assert len(events.rows) == 1
    assert events.rows[0]["audience"] == ["admin"]
    assert events.rows[0]["kind"] == "internal_note"


@pytest.mark.parametrize("production_status", ["shipped", "delivered"])
def test_shipped_or_delivered_tee_cannot_be_changed(production_status):
    value = order()
    value["items"][0]["production_status"] = production_status
    request, orders, _ = environment(value)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(correct_order("order-1", correction(item_corrections=[
            {"item_id": "line1", "size": "L", "color": "Black"}
        ]), request, admin()))
    assert exc.value.status_code == 409
    assert orders.written is None


def test_collected_order_cannot_change_tee():
    value = order()
    value["status"] = "completed"
    value["collection_receipt"] = {"signed_at": "2026-11-16T12:00:00Z"}
    request, orders, _ = environment(value)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(correct_order("order-1", correction(item_corrections=[
            {"item_id": "line1", "size": "L", "color": "Black"}
        ]), request, admin()))
    assert exc.value.status_code == 409


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


def test_super_admin_replaces_meerkat_tee_with_same_price_scouter_shirt_in_production(monkeypatch):
    import routes_main

    def snapshot(product, template, variation, quantity):
        assert product["id"] == "scouter"
        assert variation["id"] == "scouter-large"
        return {"artwork": {"url": "/scouter-print.png"}, "template_id": "new-scouter-template"}

    monkeypatch.setattr(routes_main, "_build_production_snapshot", snapshot)
    value = order()
    value["status"] = "in_production"
    value["items"][0]["product_title"] = "Meerkat Camp 2026"
    value["items"][0]["production_status"] = "in_production"
    request, orders, events = environment(value)
    result = asyncio.run(correct_order("order-1", correction(item_corrections=[
        {"item_id": "line1", "product_id": "scouter", "variation_id": "scouter-large",
         "size": "L", "color": "Black"}
    ]), request, admin()))
    assert result["ok"]
    line = orders.written["$set"]["items"][0]
    assert line["product_id"] == "scouter"
    assert line["product_title"] == "Scouter shirt"
    assert line["variation_id"] == "scouter-large"
    assert line["artwork_file_url"] == "/scouter-print.png"
    assert line["production_snapshot"]["platform_commission"] == 12.0
    assert line["production_status"] == "in_production"
    assert line["printer_id"] == "printer-1"
    assert line["unit_price"] == 160
    assert not {"status", "total", "subtotal", "payment_status", "payment_id"} & set(orders.written["$set"])
    assert events.rows[0]["audience"] == ["admin"]
    assert events.rows[0]["kind"] == "internal_note"
    audit = orders.written["$push"]["edit_history"]
    assert audit["before"]["items"][0]["product_title"] == "Meerkat Camp 2026"
    assert audit["after"]["items"][0]["product_title"] == "Scouter shirt"


def test_cross_creator_product_replacement_is_blocked(monkeypatch):
    value = order()
    value["items"][0]["band_id"] = "different-creator"
    request, orders, _ = environment(value)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(correct_order("order-1", correction(item_corrections=[
            {"item_id": "line1", "product_id": "scouter", "variation_id": "scouter-large",
             "size": "L", "color": "Black"}
        ]), request, admin()))
    assert exc.value.status_code == 409
    assert orders.written is None


def test_different_price_product_replacement_is_blocked():
    request, orders, _ = environment()
    with pytest.raises(HTTPException) as exc:
        asyncio.run(correct_order("order-1", correction(item_corrections=[
            {"item_id": "line1", "product_id": "scouter", "variation_id": "scouter-xl",
             "size": "XL", "color": "Black"}
        ]), request, admin()))
    assert exc.value.status_code == 409
    assert orders.written is None


def test_admin_catalogue_search_returns_server_priced_scouter_product():
    class FakeSearchCursor:
        def __init__(self):
            self.query = None
        def sort(self, field, order):
            assert field == "title"
            assert order == 1
            return self
        async def to_list(self, limit):
            assert limit == 100
            return [{
                "id": "scouter", "title": "Scouter shirt", "published": True,
                "band_id": "creator-1", "selling_price": 160.0,
                "variations": [{"id": "v-large", "size": "L", "color": "Black"}],
            }]
    cursor = FakeSearchCursor()
    class FakeSearchProducts:
        def find(self, query, projection):
            cursor.query = query
            assert projection == {"_id": 0}
            return cursor
    request = SimpleNamespace(app=SimpleNamespace(
        state=SimpleNamespace(db=SimpleNamespace(products=FakeSearchProducts()))
    ))
    result = asyncio.run(admin_order_catalogue_search(request, "Scouter", admin()))
    assert cursor.query["published"] is True
    assert result[0]["id"] == "scouter"
    assert result[0]["variations"][0]["effective_selling_price"] == 160.0


def test_non_super_admin_cannot_search_order_replacements():
    request, _, _ = environment()
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin_order_catalogue_search(request, "Scouter", admin("manager")))
    assert exc.value.status_code == 403
