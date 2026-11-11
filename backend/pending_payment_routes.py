"""Secure order-payment recovery links.

A recovery link loads the exact existing order, not a new checkout. PayFast
continue reuses the existing merchant payment reference, verifies it against
the merchant first, and never creates a new order or payment document.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import logging
import secrets
from typing import Any

from fastapi import APIRouter, HTTPException, Request

from pending_payment_recovery import pending_recovery_eligible

logger = logging.getLogger("fandomforge.payment_recovery")
recovery_router = APIRouter(prefix="/order-payment-recovery", tags=["order-payment-recovery"])


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def to_iso(dt: datetime) -> str:
    return dt.isoformat()


def digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def base_url(request: Request) -> str:
    return str(request.base_url).rstrip("/").removesuffix("/api")


async def make_recovery_link(db: Any, order: dict, *, stage: int, origin: str) -> str:
    if not pending_recovery_eligible(order):
        raise ValueError("This order is not eligible for payment reminders")
    token = secrets.token_urlsafe(32)
    now = utcnow()
    await db.order_payment_recovery_links.insert_one({
        "id": secrets.token_hex(16),
        "order_id": order["id"],
        "stage": stage,
        "token_sha256": digest(token),
        "created_at": to_iso(now),
        "expires_at": to_iso(now + timedelta(days=7)),
    })
    return f"{origin.rstrip('/')}/order-payment/{token}"


async def lookup_recovery_order(db: Any, token: str) -> dict:
    if len(token) < 32 or len(token) > 256:
        raise HTTPException(status_code=404, detail="This order link is invalid")
    now = to_iso(utcnow())
    link = await db.order_payment_recovery_links.find_one({
        "token_sha256": digest(token), "expires_at": {"$gt": now},
    }, {"_id": 0})
    if not link:
        raise HTTPException(status_code=404, detail="This order link is invalid or expired")
    order = await db.orders.find_one({"id": link["order_id"]}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


def safe_order_payload(order: dict) -> dict:
    return {
        "order_number": order.get("order_number"),
        "status": order.get("status"),
        "payment_status": order.get("payment_status"),
        "payment_provider": order.get("payment_provider"),
        "total": order.get("total"),
        "subtotal": order.get("subtotal"),
        "shipping_total": order.get("shipping_total"),
        "shipping_method_name": order.get("shipping_method_name"),
        "items": [{
            "id": item.get("id"),
            "product_title": item.get("product_title"),
            "size": item.get("size"),
            "color": item.get("color"),
            "quantity": item.get("quantity"),
            "unit_price": item.get("unit_price"),
        } for item in (order.get("items") or [])],
        "can_continue_payment": pending_recovery_eligible(order),
    }


@recovery_router.get("/{token}")
async def recovery_order(token: str, request: Request):
    order = await lookup_recovery_order(request.app.state.db, token)
    return safe_order_payload(order)


@recovery_router.post("/{token}/continue")
async def continue_existing_order_payment(token: str, request: Request):
    """Regenerate PayFast hosted URL for existing pending reference only."""
    from payment_gateways import get_payment_gateway_adapter, PaymentGatewayError
    import routes_main as core

    db = request.app.state.db
    order = await lookup_recovery_order(db, token)
    if order.get("payment_status") == "paid":
        raise HTTPException(status_code=409, detail="This order is already paid. Do not pay twice.")
    if not pending_recovery_eligible(order):
        raise HTTPException(status_code=409, detail="This order can no longer be paid using this link")

    if order.get("payment_provider") != "payfast":
        raise HTTPException(
            status_code=409,
            detail="Please contact FandomForge support to resume this payment method",
        )
    payment = await db.payments.find_one({
        "id": order.get("payment_id"), "order_id": order.get("id"),
    }, {"_id": 0})
    if not payment or not payment.get("provider_reference") or payment.get("status") == "completed":
        raise HTTPException(status_code=409, detail="Payment needs manual review")

    config = await core._get_gateway_config(db, "payfast", masked=False)
    if not config.get("enabled"):
        raise HTTPException(status_code=503, detail="Payment provider is temporarily unavailable")
    adapter = get_payment_gateway_adapter("payfast")

    # A missing PayFast history row means "not confirmed", not a definitive
    # failed transaction. Verify before returning a checkout link.
    try:
        verified = await adapter.verify_payment(payment["provider_reference"], config)
    except Exception:
        logger.exception("PayFast verification unavailable for recovery of order %s", order["id"])
        raise HTTPException(
            status_code=503,
            detail="We couldn't check your previous payment. Please retry later or contact support.",
        )

    if verified.get("paid"):
        await core._mark_order_paid_from_payment(db, payment, verified)
        raise HTTPException(status_code=409, detail="Your payment has been confirmed. Please do not pay again.")

    # Never create a second order, charge reference, or financial ledger row.
    # Reusing the existing merchant reference lets the canonical webhook
    # settle this same order if the buyer completes hosted checkout.
    origin = base_url(request)
    ref = payment["provider_reference"]
    callback = f"{origin}/order-confirmation/{order['id']}?reference={ref}"
    urls = {
        "reference": ref,
        "return_url": callback,
        "success_url": callback,
        "cancel_url": f"{origin}/order-payment/{token}",
        "failure_url": f"{origin}/order-payment/{token}",
        "webhook_url": f"{origin}/api/payments/webhooks/payfast",
    }
    try:
        init = await adapter.initialize_payment(order, config, urls)
    except PaymentGatewayError:
        logger.exception("Failed to resume PayFast for existing order %s", order["id"])
        raise HTTPException(status_code=503, detail="Could not open payment provider. Please retry later.")
    return {
        "payment_url": init.get("payment_url"),
        "payment_action": "redirect",
        "order_number": order.get("order_number"),
        "total": order.get("total"),
    }
