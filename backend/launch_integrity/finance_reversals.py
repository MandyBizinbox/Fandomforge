"""Launch-safe partial/full financial reversals.

This module supersedes the early compatibility reversal helper without rewriting
historic events. It preserves the unpaid remainder of a partially refunded event,
releases in-batch rows before adjusting them, and applies the order's snapshotted
shipping and gateway-fee treatments.
"""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional
import uuid

from fastapi import HTTPException

from .audit import write_audit_event
from .finance import _event_doc, _insert_event, _line_requests, _snapshot
from .pricing import D, fmoney, money
from .settings import resolve_platform_settings

CENT = Decimal("0.01")


def utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def remove_from_open_batch(db, original: Dict[str, Any], reason: str) -> None:
    if original.get("status") != "in_batch" or not original.get("payout_batch_id"):
        return
    batch = await db.payout_batches.find_one({"id": original.get("payout_batch_id")}, {"_id": 0})
    if not batch:
        return
    full_amount = abs(D(original.get("amount")))
    for item in batch.get("items") or []:
        ids = list(item.get("wallet_transaction_ids") or [])
        if original.get("id") not in ids:
            continue
        item["wallet_transaction_ids"] = [value for value in ids if value != original.get("id")]
        item["amount"] = fmoney(max(D(item.get("amount")) - full_amount, Decimal("0")))
        if not item["wallet_transaction_ids"] or D(item["amount"]) <= 0:
            item["status"] = "failed"
            item["failure_reason"] = reason
        break
    statuses = [row.get("status") for row in batch.get("items") or []]
    if statuses and all(value == "failed" for value in statuses):
        batch_status = "failed"
    elif any(value == "paid" for value in statuses):
        batch_status = "partial"
    else:
        batch_status = batch.get("status")
    await db.payout_batches.update_one(
        {"id": batch.get("id")},
        {"$set": {
            "items": batch.get("items") or [],
            "total_amount": fmoney(sum(D(row.get("amount")) for row in batch.get("items") or [])),
            "status": batch_status,
            "updated_at": utc_iso(),
        }},
    )
    await db.wallet_transactions.update_one(
        {"id": original.get("id")},
        {"$set": {
            "status": "available",
            "payout_batch_id": None,
            "payout_batch_item_id": None,
            "metadata.released_from_batch_at": utc_iso(),
            "metadata.released_from_batch_reason": reason,
        }},
    )


def _whole_order_reversal(order: Dict[str, Any], requests: List[Dict[str, Any]]) -> bool:
    requested = {row.get("order_item_id"): int(row.get("quantity") or 0) for row in requests}
    for item in order.get("items") or []:
        snap = _snapshot(item)
        remaining = max(int(item.get("quantity") or 1) - int(snap.get("refunded_quantity") or 0), 0)
        if requested.get(item.get("id"), 0) < remaining:
            return False
    return True


def _reversal_allowed(event_type: str, snapshot: Dict[str, Any], whole_order: bool) -> bool:
    if event_type == "shipping_allocation":
        treatment = str((snapshot.get("shipping") or {}).get("treatment") or "manual")
        return treatment == "proportional" or (treatment == "full" and whole_order)
    if event_type == "payment_fee":
        payment = snapshot.get("payment_fee") or {}
        treatment = str(payment.get("refund_treatment") or "non_refundable")
        return bool(payment.get("refundable")) or treatment in {"refundable", "provider_actual"}
    return True


def _customer_refund_amount(snapshot: Dict[str, Any], ratio: Decimal, whole_order: bool) -> Decimal:
    amount = money(D(snapshot.get("subtotal")) * ratio)
    payment = snapshot.get("payment_fee") or {}
    if payment.get("absorbed_by") == "customer" and not _reversal_allowed("payment_fee", snapshot, whole_order):
        amount -= money(D(snapshot.get("payment_fee_allocation")) * ratio)
    if _reversal_allowed("shipping_allocation", snapshot, whole_order):
        amount += money(D(snapshot.get("shipping_allocation")) * ratio)
    return max(money(amount), Decimal("0"))


async def apply_financial_reversal(
    db,
    *,
    order_id: str,
    event_type: str,
    idempotency_key: str,
    lines: Optional[List[Dict[str, Any]]] = None,
    actor: Any = None,
    provider: Optional[str] = None,
    reason: str = "",
    request: Any = None,
) -> Dict[str, Any]:
    if event_type not in {"refund", "chargeback", "provider_reversal"}:
        raise HTTPException(status_code=400, detail="Invalid financial reversal type")
    existing = await db.financial_adjustments.find_one({"idempotency_key": idempotency_key}, {"_id": 0})
    if existing:
        return {**existing, "already_exists": True}
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    requests = _line_requests(order, lines)
    whole_order = _whole_order_reversal(order, requests)
    settings = await resolve_platform_settings(db)
    item_map = {item.get("id"): deepcopy(item) for item in order.get("items") or []}
    reversal_ids: List[str] = []
    total_customer_refund = Decimal("0")
    affected: List[Dict[str, Any]] = []

    for line in requests:
        item = item_map[line["order_item_id"]]
        ordered_qty = max(int(item.get("quantity") or 1), 1)
        reverse_qty = int(line["quantity"])
        snap = _snapshot(item)
        already_qty = int(snap.get("refunded_quantity") or 0)
        if already_qty + reverse_qty > ordered_qty:
            raise HTTPException(status_code=409, detail="Refund exceeds the remaining refundable quantity")
        ratio = D(reverse_qty) / D(ordered_qty)
        customer_refund = _customer_refund_amount(snap, ratio, whole_order)
        total_customer_refund += customer_refund

        originals = await db.wallet_transactions.find({
            "order_id": order_id,
            "order_item_id": item.get("id"),
            "event_type": {"$in": [
                "creator_earning", "printer_liability", "platform_revenue", "platform_commission",
                "tax_liability", "payment_fee", "shipping_allocation",
            ]},
            "original_event_reference": None,
        }, {"_id": 0}).to_list(100)

        for original in originals:
            source_type = original.get("event_type")
            if not _reversal_allowed(source_type, snap, whole_order):
                continue
            original_amount = abs(D(original.get("amount")))
            reverse_amount = money(original_amount * ratio)
            if reverse_amount <= 0:
                continue
            original_status = original.get("status")
            if original_status == "in_batch":
                await remove_from_open_batch(db, original, f"{event_type} applied before payout")
                original_status = "available"
            full_source_reversal = reverse_amount >= original_amount - CENT
            if original_status in {"available", "pending", "failed"}:
                if full_source_reversal:
                    await db.wallet_transactions.update_one(
                        {"id": original.get("id")},
                        {"$set": {
                            "status": "reversed",
                            "payout_batch_id": None,
                            "payout_batch_item_id": None,
                            "metadata.reversed_by": idempotency_key,
                            "metadata.reversed_at": utc_iso(),
                        }},
                    )
                    reversal_status = "reversed"
                else:
                    await db.wallet_transactions.update_one(
                        {"id": original.get("id")},
                        {"$set": {"status": "available", "payout_batch_id": None, "payout_batch_item_id": None}},
                    )
                    reversal_status = "available"
            elif original_status == "paid":
                reversal_status = "available"
            else:
                reversal_status = "reversed" if full_source_reversal else "available"

            signed_amount = -reverse_amount if D(original.get("amount")) >= 0 else reverse_amount
            reversal = await _insert_event(db, _event_doc(
                key=f"{event_type}:{idempotency_key}:{original.get('id')}:{reverse_qty}",
                event_type="refund" if event_type == "refund" else "reversal",
                owner_type=original.get("owner_type"),
                owner_id=original.get("owner_id"),
                amount=signed_amount,
                order=order,
                item=item,
                status=reversal_status,
                original_event_reference=original.get("id"),
                reversal_reference=idempotency_key,
                actor_user_id=getattr(actor, "id", None),
                actor_role=getattr(actor, "role", None),
                provider=provider,
                metadata={
                    "reversal_type": event_type,
                    "quantity": reverse_qty,
                    "ratio": float(ratio),
                    "reason": reason,
                    "settings_version": settings.version_id,
                },
            ))
            reversal_ids.append(reversal.get("id"))

        snap["refunded_quantity"] = already_qty + reverse_qty
        snap["already_refunded_amount"] = fmoney(D(snap.get("already_refunded_amount")) + customer_refund)
        snap["refundable_balance"] = fmoney(max(D(snap.get("refundable_balance") or snap.get("subtotal")) - customer_refund, Decimal("0")))
        snap["last_reversal_reference"] = idempotency_key
        item["financial_snapshot"] = snap
        item.setdefault("production_snapshot", {})["commercial_snapshot"] = snap
        affected.append({"order_item_id": item.get("id"), "quantity": reverse_qty, "amount": fmoney(customer_refund)})

    adjustment = {
        "id": str(uuid.uuid4()),
        "idempotency_key": idempotency_key,
        "event_type": event_type,
        "order_id": order_id,
        "payment_id": order.get("payment_id"),
        "status": "posted",
        "amount": fmoney(total_customer_refund),
        "currency": (order.get("financial_snapshot") or {}).get("currency") or "ZAR",
        "lines": affected,
        "reversal_event_ids": reversal_ids,
        "reason": reason,
        "provider": provider,
        "settings_version": settings.version_id,
        "created_at": utc_iso(),
        "created_by_user_id": getattr(actor, "id", None),
        "created_by_role": getattr(actor, "role", None),
    }
    # PyMongo mutates inserted dictionaries by adding an ObjectId. Insert a copy so
    # the API result remains JSON/BSON-safe and contains only the stable public ID.
    await db.financial_adjustments.insert_one(dict(adjustment))
    refunded_total = money(D(order.get("refunded_total")) + total_customer_refund)
    original_total = money(order.get("total"))
    payment_status = "refunded" if refunded_total >= original_total - CENT else ("partially_refunded" if event_type == "refund" else event_type)
    patch = {
        "items": list(item_map.values()),
        "refunded_total": fmoney(refunded_total),
        "payment_status": payment_status,
        "updated_at": utc_iso(),
    }
    if payment_status == "refunded":
        patch["status"] = "refunded"
    await db.orders.update_one({"id": order_id}, {"$set": patch})
    audit = await write_audit_event(
        db,
        action=f"finance.{event_type}",
        entity_type="order",
        entity_id=order_id,
        actor=actor,
        provider=provider,
        before={"payment_status": order.get("payment_status"), "refunded_total": order.get("refunded_total")},
        after={"payment_status": payment_status, "refunded_total": fmoney(refunded_total)},
        reason=reason,
        request=request,
        related_order_id=order_id,
        related_financial_event_id=adjustment["id"],
        idempotency_key=f"audit:{idempotency_key}",
        metadata={"lines": affected, "whole_order": whole_order},
    )
    await db.financial_adjustments.update_one({"id": adjustment["id"]}, {"$set": {"audit_reference": audit.get("id")}})
    return {**adjustment, "audit_reference": audit.get("id")}
