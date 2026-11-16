"""Independent PayFast supplement payments for order amendment drafts.

A supplement never overwrites the original order payment, wallet ledger,
production records or previously verified receipt. Settlement is retained as
evidence for a subsequent separately audited order-application operation.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException

from models import uid
from order_amendment_routes import money

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def supplement_reference(amendment_id: str) -> str:
    return "MF-AM-" + amendment_id.replace("-", "")[:28].upper()


def verify_supplement_amount(payment: dict, result: dict) -> None:
    from payment_confirmation import _money
    expected = _money(payment.get("amount"))
    raw = result.get("raw") if isinstance(result.get("raw"), dict) else {}
    value = raw.get("amount_gross")
    if value is None:
        value = raw.get("Gross")
        if isinstance(value, str):
            value = value.replace(",", "")
    if value is None:
        value = result.get("amount_gross")
    actual = _money(value)
    if actual != expected or str(payment.get("currency") or "ZAR").upper() != "ZAR":
        raise HTTPException(status_code=409, detail="PayFast supplement amount or currency mismatch")
    if result.get("reference") != payment.get("provider_reference"):
        raise HTTPException(status_code=409, detail="PayFast supplement reference mismatch")
    if not result.get("paid"):
        raise HTTPException(status_code=409, detail="No completed PayFast supplement credit")


async def process_verified_supplement(db, payment: dict, result: dict) -> dict:
    """Idempotent settlement. The amendment is NOT applied to original order."""
    if payment.get("kind") != "order_amendment" or payment.get("provider") != "payfast":
        raise HTTPException(status_code=409, detail="Payment is not a PayFast order supplement")
    verify_supplement_amount(payment, result)
    amendment_id = payment.get("amendment_id")
    if not amendment_id:
        raise HTTPException(status_code=409, detail="Payment has no amendment reference")
    draft = await db.order_amendments.find_one({"id": amendment_id, "order_id": payment.get("order_id")}, {"_id": 0})
    if not draft:
        raise HTTPException(status_code=409, detail="Amendment not found")
    if draft.get("payment_id") != payment.get("id"):
        raise HTTPException(status_code=409, detail="Amendment payment does not match")
    if draft.get("status") in {"settled_pending_application", "applied"}:
        if payment.get("status") == "completed":
            return {"ok": True, "status": draft["status"], "duplicate": True}
    elif draft.get("status") != "awaiting_topup":
        raise HTTPException(status_code=409, detail="Amendment cannot accept this payment")

    now = now_iso()
    # CAS prevents two ITN deliveries from crediting the amendment twice.
    claim = uid()
    reserved = await db.order_amendments.update_one(
        {"id": amendment_id, "payment_id": payment["id"], "status": "awaiting_topup", "settlement_claim": {"$exists": False}},
        {"$set": {"settlement_claim": claim}},
    )
    if reserved.modified_count != 1:
        latest = await db.order_amendments.find_one({"id": amendment_id}, {"_id": 0})
        if latest and latest.get("status") == "settled_pending_application":
            return {"ok": True, "status": "settled_pending_application", "duplicate": True}
        raise HTTPException(status_code=409, detail="Supplement settlement is already in progress")
    try:
        # Store only audit-safe provider fields; never copy raw ITN or credentials.
        payment_update = await db.payments.update_one(
            {"id": payment["id"], "amendment_id": amendment_id, "status": {"$in": ["pending", "processing", "failed", "completed"]}},
            {"$set": {
                "status": "completed", "completed_at": now,
                "provider_payment_id": result.get("payment_id"),
                "verified_amount": float(money(payment["amount"])),
            }},
        )
        if payment_update.matched_count != 1:
            raise HTTPException(status_code=409, detail="Payment attempt changed during settlement")
        completed = await db.order_amendments.update_one(
            {"id": amendment_id, "settlement_claim": claim, "status": "awaiting_topup"},
            {"$set": {
                "status": "settled_pending_application",
                "settled_at": now,
                "payment_provider_reference": payment.get("provider_reference"),
                "payment_amount": float(money(payment["amount"])),
                "payment_provider_id": result.get("payment_id"),
            }, "$unset": {"settlement_claim": ""}},
        )
        if completed.modified_count != 1:
            raise HTTPException(status_code=409, detail="Amendment changed during settlement")
        return {"ok": True, "status": "settled_pending_application", "duplicate": False}
    finally:
        await db.order_amendments.update_one(
            {"id": amendment_id, "settlement_claim": claim},
            {"$unset": {"settlement_claim": ""}},
        )


async def initiate_supplement(db, order: dict, draft: dict, request) -> dict:
    """Create one isolated hosted checkout for the amount approved in draft."""
    from routes_main import _get_gateway_config, get_payment_gateway_adapter
    from payment_gateways.base import PaymentGatewayError

    if draft.get("status") != "draft_financial_review":
        raise HTTPException(status_code=409, detail="This amendment is not an available financial draft")
    if draft.get("source_order_updated_at") != order.get("updated_at"):
        raise HTTPException(status_code=409, detail="Order changed since amendment draft; create a fresh draft")
    if order.get("payment_status") != "paid" or order.get("status") in {"refunded", "cancelled"}:
        raise HTTPException(status_code=409, detail="PayFast top-ups require a confirmed, non-cancelled original payment. Unpaid orders need replacement checkout.")
    original = await db.payments.find_one(
        {"id": order.get("payment_id"), "order_id": order["id"], "status": "completed"},
        {"_id": 0},
    )
    if not original or money(original.get("amount")) != money(order.get("amendment_base_total", order.get("total"))):
        raise HTTPException(status_code=409, detail="Original payment evidence is inconsistent; reconcile before requesting a top-up")
    preview = draft.get("preview") or {}
    if preview.get("financial_status") != "top_up_required" or money(preview.get("overpayment_review") or 0) != 0:
        raise HTTPException(status_code=409, detail="Draft has no payable supplement")
    amount = money(preview.get("balance_due"))
    if amount <= 0:
        raise HTTPException(status_code=409, detail="Draft has no outstanding balance")

    # Only one active supplement may exist per order at a time.
    existing = await db.order_amendments.find_one({
        "order_id": order["id"], "id": {"$ne": draft["id"]},
        "status": {"$in": ["awaiting_topup", "settled_pending_application"]},
    }, {"_id": 0, "id": 1})
    if existing:
        raise HTTPException(status_code=409, detail="Another order amendment already has an active supplement")
    gateway = await _get_gateway_config(db, "payfast", masked=False)
    if not gateway.get("enabled"):
        raise HTTPException(status_code=409, detail="PayFast checkout is disabled")
    adapter = get_payment_gateway_adapter("payfast")
    ref = supplement_reference(draft["id"])
    # An _id-unique Mongo document serializes PayFast link issuance across
    # parallel admins and across different drafts for the same order.
    from pymongo.errors import DuplicateKeyError
    try:
        await db.order_amendment_payment_locks.insert_one({
            "_id": order["id"], "amendment_id": draft["id"],
            "reference": ref, "created_at": now_iso(),
        })
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="A supplement payment is already active for this order") from exc

    payment_id = uid()
    now = now_iso()
    try:
        # Never use an untrusted Host header to construct a gateway callback.
        base = "https://fandomforge.co.za"
        urls = {
            "reference": ref,
            "return_url": f"{base}/order-confirmation/{order['id']}?amendment={draft['id']}",
            "cancel_url": f"{base}/order-confirmation/{order['id']}?amendment=cancelled",
            "webhook_url": f"{base}/api/payments/webhooks/payfast",
        }
        try:
            checkout = await adapter.initialize_payment({
                "id": order["id"],
                "order_number": f"{order['order_number']} TOPUP {draft['id'][:8]}",
                "buyer_email": order.get("buyer_email"),
                "total": float(amount),
            }, gateway, urls)
        except PaymentGatewayError as exc:
            raise HTTPException(status_code=502, detail="Could not create PayFast supplement checkout") from exc

        reserved = await db.order_amendments.update_one(
            {
                "id": draft["id"], "order_id": order["id"],
                "status": "draft_financial_review",
                "source_order_updated_at": order["updated_at"],
            },
            {"$set": {
                "status": "awaiting_topup", "payment_id": payment_id,
                "topup_reference": ref, "topup_amount": float(amount),
                "topup_url": checkout["payment_url"], "topup_created_at": now,
            }},
        )
        if reserved.modified_count != 1:
            raise HTTPException(status_code=409, detail="Supplement was already created; reload amendment")

        # The supplement is deliberately NOT the original order.payment_id.
        payment = {
            "id": payment_id, "order_id": order["id"],
            "amendment_id": draft["id"], "provider": "payfast",
            "provider_reference": ref, "kind": "order_amendment",
            "amount": float(amount), "currency": "ZAR",
            "status": "pending", "created_at": now,
            "created_by": draft.get("requested_by"),
        }
        try:
            await db.payments.insert_one(payment)
        except Exception as exc:
            await db.order_amendments.update_one(
                {"id": draft["id"], "payment_id": payment_id,
                 "status": "awaiting_topup"},
                {"$set": {"status": "payment_setup_failed"},
                 "$unset": {"topup_url": ""}},
            )
            raise HTTPException(status_code=503, detail="Could not register supplement payment attempt") from exc
    except Exception:
        # Once a payment row exists, never auto-release the lock: the external
        # payment could settle independently of an admin HTTP response.
        registered = await db.payments.find_one(
            {"id": payment_id, "amendment_id": draft["id"]}, {"_id": 1}
        )
        if not registered:
            await db.order_amendment_payment_locks.delete_one(
                {"_id": order["id"], "amendment_id": draft["id"]}
            )
        raise

    return {
        "amendment_id": draft["id"], "payment_id": payment_id,
        "amount": float(amount), "currency": "ZAR",
        "reference": ref, "payment_url": checkout["payment_url"],
        "status": "awaiting_topup",
    }
