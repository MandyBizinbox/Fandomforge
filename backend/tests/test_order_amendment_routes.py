from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from order_amendment_routes import AmendmentDraft, money, price_amendment, preview_order_amendment, create_order_amendment_draft


def order(**overrides):
    return {
        "id": "o-1",
        "order_number": "MF-ABC",
        "updated_at": "2026-11-16T10:00:00+00:00",
        "total": 145,
        "shipping_total": 0,
        "payment_status": "paid",
        "items": [
            {"id": "i-1", "product_id": "p-1", "variation_id": "v-1",
             "product_title": "Meerkat shirt", "quantity": 1,
             "size": "Small", "color": "Black", "production_status": "pending"}
        ],
        **overrides,
    }


def draft(items):
    return AmendmentDraft(
        expected_updated_at="2026-11-16T10:00:00+00:00",
        reason="Customer requested additional shirt",
        items=items,
    )


class Cursor:
    def __init__(self, rows):
        self.rows = rows
    def sort(self, *args):
        return self
    async def to_list(self, length):
        return self.rows[:length]


class Orders:
    def __init__(self, doc):
        self.doc = doc
    async def find_one(self, query, projection=None):
        return self.doc


class Products:
    async def find_one(self, query, projection=None):
        return {
            "id": query["id"], "title": "Meerkat shirt", "published": True,
            "selling_price": 145.0, "band_id": "creator-1",
            "variations": [
                {"id": "v-1", "size": "Small", "color": "Black",
                 "effective_selling_price": 145.0},
                {"id": "v-2", "size": "Large", "color": "Black",
                 "effective_selling_price": 160.0},
            ]
        }


class Payments:
    def __init__(self, rows):
        self.rows = rows
    def find(self, query, projection):
        # The service inspects all attempts so it can reject refunds and
        # partial refunds rather than computing an incorrect outstanding amount.
        assert query == {"order_id": "o-1"}
        return Cursor(self.rows)


class Drafts:
    def __init__(self):
        self.items = []
    async def insert_one(self, value):
        self.items.append(value)


def context(doc=None, payments=None):
    db = SimpleNamespace(
        orders=Orders(doc or order()), products=Products(),
        product_templates=SimpleNamespace(find_one=None),
        payments=Payments(payments if payments is not None else [
            {"id": "payment-1", "amount": 145, "currency": "ZAR",
             "provider": "payfast", "status": "completed", "provider_reference": "ref-1"}
        ]),
        order_amendments=Drafts(),
    )
    req = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(db=db)))
    staff = SimpleNamespace(id="staff-1", role="super_admin", name="Staff")
    return db, req, staff


def test_additional_item_prices_difference_against_completed_payment():
    db, _, _ = context()
    proposal = draft([
        {"existing_item_id": "i-1", "product_id": "p-1", "variation_id": "v-1", "quantity": 1},
        {"product_id": "p-1", "variation_id": "v-2", "quantity": 1},
    ])
    result = asyncio.run(price_amendment(db, order(), proposal))
    assert result["revised_total"] == 305.0
    assert result["paid_to_date"] == 145.0
    assert result["balance_due"] == 160.0
    assert result["payment_link_available"] is False
    assert result["financial_status"] == "top_up_required"


def test_removal_creates_credit_review_not_automatic_refund():
    doc = order(items=[
        {"id": "i-1", "product_id": "p-1", "variation_id": "v-1", "quantity": 1, "production_status": "pending"},
        {"id": "i-2", "product_id": "p-1", "variation_id": "v-1", "quantity": 1, "production_status": "pending"},
    ], total=290)
    db, _, _ = context(doc, [
        {"id": "pay-1", "amount": 290, "currency": "ZAR", "status": "completed"}
    ])
    proposed = draft([{"existing_item_id": "i-1", "product_id": "p-1", "variation_id": "v-1", "quantity": 1}])
    result = asyncio.run(price_amendment(db, doc, proposed))
    assert result["overpayment_review"] == 145
    assert result["balance_due"] == 0
    assert result["financial_status"] == "credit_review_required"


def test_produced_item_cannot_be_removed():
    doc = order(items=[
        {"id": "i-1", "product_id": "p-1", "variation_id": "v-1", "quantity": 1, "production_status": "ready"},
        {"id": "i-2", "product_id": "p-1", "variation_id": "v-1", "quantity": 1, "production_status": "pending"},
    ])
    db, _, _ = context(doc)
    with pytest.raises(HTTPException) as error:
        asyncio.run(price_amendment(db, doc, draft([
            {"existing_item_id": "i-2", "product_id": "p-1", "variation_id": "v-1", "quantity": 1},
        ])))
    assert error.value.status_code == 409


def test_payment_evidence_required_for_paid_order():
    db, _, _ = context(payments=[])
    with pytest.raises(HTTPException) as error:
        asyncio.run(price_amendment(db, order(), draft([
            {"existing_item_id": "i-1", "product_id": "p-1", "variation_id": "v-1", "quantity": 1},
        ])))
    assert error.value.status_code == 409


def test_admin_draft_preserves_original_order():
    doc = order()
    db, request, staff = context(doc)
    proposed = draft([{"existing_item_id": "i-1", "product_id": "p-1", "variation_id": "v-2", "quantity": 1}])
    response = asyncio.run(create_order_amendment_draft("o-1", proposed, request, staff))
    assert response["status"] == "draft_financial_review"
    assert response["preview"]["balance_due"] == 15
    assert len(db.order_amendments.items) == 1
    assert doc["items"][0]["variation_id"] == "v-1"


def test_manager_cannot_preview():
    _, request, _ = context()
    with pytest.raises(HTTPException) as error:
        asyncio.run(preview_order_amendment("o-1", draft([
            {"existing_item_id": "i-1", "product_id": "p-1", "variation_id": "v-1", "quantity": 1},
        ]), request, SimpleNamespace(role="manager")))
    assert error.value.status_code == 403


def test_money_rejects_invalid_values():
    for value in ("nan", "-1", "inf"):
        with pytest.raises(HTTPException):
            money(value)


def test_unchanged_item_keeps_historic_paid_price_not_current_catalogue_price():
    prior = order(items=[
        {"id": "i-1", "product_id": "p-1", "variation_id": "v-1",
         "quantity": 1, "unit_price": 135, "production_status": "pending"}
    ], total=135)
    db, _, _ = context(prior, [
        {"id": "paid-1", "amount": 135, "currency": "ZAR",
         "status": "completed", "provider": "payfast"}
    ])
    result = asyncio.run(price_amendment(db, prior, draft([
        {"existing_item_id": "i-1", "product_id": "p-1", "variation_id": "v-1", "quantity": 1},
        {"product_id": "p-1", "variation_id": "v-2", "quantity": 1},
    ])))
    assert result["revised_total"] == 295
    assert result["balance_due"] == 160
    assert result["items"][0]["unit_price"] == 135


def test_refunded_payment_blocks_false_balance():
    db, _, _ = context(payments=[
        {"id": "pay-1", "amount": 145, "currency": "ZAR",
         "status": "partially_refunded", "provider": "payfast"}
    ])
    with pytest.raises(HTTPException) as error:
        asyncio.run(price_amendment(db, order(), draft([
            {"existing_item_id": "i-1", "product_id": "p-1", "variation_id": "v-1", "quantity": 1},
        ])))
    assert error.value.status_code == 409
