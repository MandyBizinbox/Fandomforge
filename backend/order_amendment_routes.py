"""Draft and price Super Admin order amendments without rewriting paid orders.

This intentionally does not capture payment or mutate original order items.
Financial activation requires a dedicated supplement payment flow, payout
reconciliation, and refund/credit rules. Drafts are auditable and immutable.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from datetime import datetime, timezone
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, model_validator

from auth import get_current_user
from models import User, uid
from admin_order_edit_routes import require_super_admin

amendment_router = APIRouter(prefix="/admin/orders", tags=["order-amendments"])
CENT = Decimal("0.01")
MAX_LINES = 100


def money(value) -> Decimal:
    try:
        amount = Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)
    except (InvalidOperation, TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Invalid monetary amount")
    if not amount.is_finite() or amount < 0:
        raise HTTPException(status_code=422, detail="Invalid monetary amount")
    return amount


class AmendmentLine(BaseModel):
    existing_item_id: Optional[str] = Field(default=None, max_length=128)
    product_id: str = Field(min_length=1, max_length=128)
    variation_id: str = Field(min_length=1, max_length=128)
    quantity: int = Field(ge=1, le=1000)


class AmendmentDraft(BaseModel):
    expected_updated_at: str = Field(min_length=1, max_length=100)
    reason: str = Field(min_length=5, max_length=500)
    items: List[AmendmentLine] = Field(min_length=1, max_length=MAX_LINES)

    @model_validator(mode="after")
    def unique_existing_items(self):
        ids = [item.existing_item_id for item in self.items if item.existing_item_id]
        if len(ids) != len(set(ids)):
            raise ValueError("An existing order line cannot appear twice")
        return self


async def price_amendment(db, order: dict, payload: AmendmentDraft) -> dict:
    """Server-priced basket, original payment record untouched.

    Strictly disallow changes to already-produced lines; their original financial
    and fulfilment snapshots cannot be overwritten by this draft process.
    """
    from routes_main import _decorate_product_effective_pricing
    original = {item.get("id"): item for item in (order.get("items") or [])}
    seen = set()
    priced = []
    for proposal in payload.items:
        prior = original.get(proposal.existing_item_id) if proposal.existing_item_id else None
        if proposal.existing_item_id and not prior:
            raise HTTPException(status_code=422, detail="An original order item was not found")
        if prior:
            seen.add(proposal.existing_item_id)
        product = await db.products.find_one({"id": proposal.product_id}, {"_id": 0})
        if not product:
            raise HTTPException(status_code=422, detail="Product is unavailable")
        if not product.get("published") and not prior:
            raise HTTPException(status_code=422, detail="Cannot add an unpublished product")
        template = None
        if product.get("template_id"):
            template = await db.product_templates.find_one({"id": product.get("template_id")}, {"_id": 0})
        decorated = _decorate_product_effective_pricing(product, template=template, expose_manual_overrides=True)
        choices = [v for v in decorated.get("variations") or [] if v.get("id") == proposal.variation_id]
        if len(choices) != 1:
            raise HTTPException(status_code=422, detail="Selected product variation no longer exists")
        choice = choices[0]
        rate = choice.get("effective_selling_price")
        if rate is None:
            raise HTTPException(status_code=409, detail="Current catalogue price could not be verified")
        unchanged = bool(
            prior
            and prior.get("product_id") == proposal.product_id
            and prior.get("variation_id") == proposal.variation_id
            and int(prior.get("quantity") or 0) == proposal.quantity
        )
        # A historic paid line must retain its contracted unit price, even
        # if the product catalogue has since increased its selling price.
        unit = money(prior.get("unit_price")) if unchanged and prior.get("unit_price") is not None else money(rate)
        if prior and not unchanged:
            if prior.get("production_status", "pending") not in {"pending"} or order.get("collection_receipt"):
                raise HTTPException(status_code=409, detail="Produced or collected items cannot be replaced by an amendment draft")
        priced.append({
            "existing_item_id": proposal.existing_item_id,
            "product_id": proposal.product_id,
            "product_title": product.get("title"),
            "variation_id": choice.get("id"),
            "size": choice.get("size") or "",
            "color": choice.get("color") or "",
            "quantity": proposal.quantity,
            "unit_price": float(unit),
            "line_total": float(unit * proposal.quantity),
            "band_id": product.get("band_id"),
            "source": "catalogue",
        })

    # Removing a line from the proposed basket cannot undo work already done.
    for item in original.values():
        if item.get("id") not in seen and (
            item.get("production_status", "pending") not in {"pending"} or order.get("collection_receipt")
        ):
            raise HTTPException(status_code=409, detail="Produced or collected items cannot be removed")

    subtotal = sum((money(row["line_total"]) for row in priced), Decimal("0"))
    shipping = money(order.get("shipping_total") or 0)
    revised_total = subtotal + shipping
    existing_total = money(order.get("total") or 0)

    payments = await db.payments.find({"order_id": order["id"]}, {
        "_id": 0, "id": 1, "provider": 1, "amount": 1, "currency": 1,
        "status": 1, "provider_reference": 1,
    }).to_list(200)
    if any(payment.get("status") in {"refunded", "partially_refunded"} for payment in payments):
        raise HTTPException(
            status_code=409,
            detail="Refund or partial refund exists. Reconcile the net payment ledger before calculating an amendment."
        )

    received = Decimal("0")
    references = set()
    evidence = []
    for payment in payments:
        if payment.get("status") != "completed":
            continue
        if payment.get("currency", "ZAR").upper() != "ZAR":
            raise HTTPException(status_code=409, detail="Non-ZAR payment evidence requires review")
        payment_id = payment.get("id")
        if not payment_id or payment_id in references:
            continue
        references.add(payment_id)
        amount = money(payment.get("amount"))
        received += amount
        evidence.append({
            "id": payment_id, "provider": payment.get("provider"),
            "amount": float(amount), "reference": payment.get("provider_reference")
        })

    # Mismatched legacy evidence is not silently corrected.
    if order.get("payment_status") == "refunded":
        raise HTTPException(status_code=409, detail="Refunded orders require manual financial review")
    if order.get("payment_status") == "paid" and received == 0:
        raise HTTPException(status_code=409, detail="Order says paid but no completed payment evidence was found")
    due = max(revised_total - received, Decimal("0"))
    overpayment = max(received - revised_total, Decimal("0"))
    return {
        "order_total_before": float(existing_total),
        "revised_subtotal": float(subtotal),
        "shipping_unchanged": float(shipping),
        "revised_total": float(revised_total),
        "confirmed_payments": evidence,
        "paid_to_date": float(received),
        "balance_due": float(due),
        "overpayment_review": float(overpayment),
        "change_amount": float(revised_total - existing_total),
        "items": priced,
        "financial_status": (
            "top_up_required" if due else
            "credit_review_required" if overpayment else "balanced"
        ),
        "payment_link_available": False,
        "payment_link_reason": "Supplement payment settlement and payout allocations are not enabled until isolated payment processing is validated",
    }


async def _get_order(db, order_id: str) -> dict:
    order = await db.orders.find_one({"id": order_id, "archived": {"$ne": True}}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@amendment_router.post("/{order_id}/amendments/preview")
async def preview_order_amendment(order_id: str, payload: AmendmentDraft, request: Request,
                                  user: User = Depends(get_current_user)):
    require_super_admin(user)
    db = request.app.state.db
    order = await _get_order(db, order_id)
    if str(order.get("updated_at")) != payload.expected_updated_at:
        raise HTTPException(status_code=409, detail="Order changed. Reload before preparing amendment")
    result = await price_amendment(db, order, payload)
    return {"preview": result, "order_id": order_id}


@amendment_router.post("/{order_id}/amendments/drafts")
async def create_order_amendment_draft(order_id: str, payload: AmendmentDraft, request: Request,
                                       user: User = Depends(get_current_user)):
    require_super_admin(user)
    db = request.app.state.db
    order = await _get_order(db, order_id)
    if str(order.get("updated_at")) != payload.expected_updated_at:
        raise HTTPException(status_code=409, detail="Order changed. Reload before drafting amendment")
    preview = await price_amendment(db, order, payload)
    now = datetime.now(timezone.utc).isoformat()
    draft = {
        "id": uid(),
        "order_id": order_id,
        "order_number": order.get("order_number"),
        "source_order_updated_at": payload.expected_updated_at,
        "reason": payload.reason.strip(),
        "requested_by": user.id,
        "created_at": now,
        "status": "draft_financial_review",
        "original_items": order.get("items") or [],
        "preview": preview,
        "currency": "ZAR",
    }
    await db.order_amendments.insert_one(draft)
    return {"draft_id": draft["id"], "status": draft["status"], "preview": preview}


@amendment_router.get("/{order_id}/amendments")
async def list_order_amendments(order_id: str, request: Request,
                                user: User = Depends(get_current_user)):
    require_super_admin(user)
    db = request.app.state.db
    await _get_order(db, order_id)
    drafts = await db.order_amendments.find({"order_id": order_id}, {
        "_id": 0, "original_items": 0
    }).sort("created_at", -1).to_list(50)
    return {"drafts": drafts}


@amendment_router.post("/{order_id}/amendments/{amendment_id}/payfast-topup")
async def create_order_amendment_payfast_topup(
    order_id: str, amendment_id: str, request: Request,
    user: User = Depends(get_current_user),
):
    """Initiate a single supplemental payment; never replace original payment."""
    require_super_admin(user)
    from order_amendment_payment import initiate_supplement
    db = request.app.state.db
    order = await _get_order(db, order_id)
    draft = await db.order_amendments.find_one(
        {"id": amendment_id, "order_id": order_id}, {"_id": 0}
    )
    if not draft:
        raise HTTPException(status_code=404, detail="Amendment not found")
    return await initiate_supplement(db, order, draft, request)


@amendment_router.post("/{order_id}/amendments/{amendment_id}/verify-topup")
async def verify_order_amendment_payfast_topup(
    order_id: str, amendment_id: str, request: Request,
    user: User = Depends(get_current_user),
):
    """Merchant-history reconciliation when a genuine signed ITN was missed."""
    require_super_admin(user)
    from routes_main import _get_gateway_config, get_payment_gateway_adapter
    from payment_gateways.base import PaymentGatewayError
    from order_amendment_payment import process_verified_supplement
    db = request.app.state.db
    await _get_order(db, order_id)
    draft = await db.order_amendments.find_one(
        {"id": amendment_id, "order_id": order_id}, {"_id": 0}
    )
    if not draft:
        raise HTTPException(status_code=404, detail="Amendment not found")
    payment = await db.payments.find_one(
        {"id": draft.get("payment_id"), "amendment_id": amendment_id,
         "order_id": order_id, "provider": "payfast"}, {"_id": 0}
    )
    if not payment:
        raise HTTPException(status_code=409, detail="No linked supplement payment exists")
    gateway = await _get_gateway_config(db, "payfast", masked=False)
    adapter = get_payment_gateway_adapter("payfast")
    try:
        result = await adapter.verify_payment(payment["provider_reference"], gateway)
    except PaymentGatewayError as exc:
        raise HTTPException(status_code=502, detail="PayFast merchant confirmation unavailable") from exc
    if not result.get("paid"):
        return {"verified": False, "status": "pending"}
    settled = await process_verified_supplement(db, payment, result)
    return {"verified": True, **settled}
