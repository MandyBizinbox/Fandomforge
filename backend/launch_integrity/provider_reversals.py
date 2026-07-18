"""Provider amount-only refund, dispute and reversal allocation."""
from __future__ import annotations

from copy import deepcopy
from decimal import Decimal
from typing import Any, Dict, List, Optional
import uuid

from .audit import write_audit_event
from .finance import _event_doc, _insert_event, _snapshot
from .finance_reversals import CENT, _reversal_allowed, remove_from_open_batch, utc_iso
from .pricing import D, allocate_cents, fmoney, money


async def apply_provider_amount_reversal(
    db,
    *,
    order_id: str,
    event_type: str,
    amount: Any,
    idempotency_key: str,
    provider: str,
    provider_payload: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    existing = await db.financial_adjustments.find_one({"idempotency_key": idempotency_key}, {"_id": 0})
    if existing:
        return {**existing, "already_exists": True}
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        return {"processed": False, "reason": "order_not_found"}
    requested = money(amount)
    if requested <= 0:
        return {"processed": False, "reason": "non_positive_amount"}

    items = deepcopy(order.get("items") or [])
    balances: List[Decimal] = []
    for item in items:
        snap = _snapshot(item)
        original = money(snap.get("subtotal") or D(item.get("unit_price")) * max(int(item.get("quantity") or 1), 1))
        remaining = D(snap.get("refundable_balance")) if snap.get("refundable_balance") is not None else original - D(snap.get("already_refunded_amount"))
        balances.append(max(money(remaining), Decimal("0")))
    total_remaining = money(sum(balances))
    applied_total = min(requested, total_remaining)
    allocations = allocate_cents(applied_total, balances)
    whole_order = applied_total >= total_remaining - CENT
    reversal_ids: List[str] = []
    lines: List[Dict[str, Any]] = []

    for item, balance, allocated in zip(items, balances, allocations):
        if allocated <= 0 or balance <= 0:
            continue
        snap = _snapshot(item)
        base_subtotal = money(snap.get("subtotal") or balance)
        ratio = min(allocated / base_subtotal if base_subtotal else Decimal("0"), Decimal("1"))
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
            if not _reversal_allowed(original.get("event_type"), snap, whole_order):
                continue
            original_amount = abs(D(original.get("amount")))
            reverse_amount = money(original_amount * ratio)
            if reverse_amount <= 0:
                continue
            original_status = original.get("status")
            if original_status == "in_batch":
                await remove_from_open_batch(db, original, f"{event_type} received from {provider}")
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
                            "metadata.provider_reversal_key": idempotency_key,
                            "metadata.provider_reversed_at": utc_iso(),
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

            signed = -reverse_amount if D(original.get("amount")) >= 0 else reverse_amount
            reversal = await _insert_event(db, _event_doc(
                key=f"provider:{idempotency_key}:{original.get('id')}",
                event_type="refund" if event_type == "refund" else "reversal",
                owner_type=original.get("owner_type"),
                owner_id=original.get("owner_id"),
                amount=signed,
                order=order,
                item=item,
                status=reversal_status,
                original_event_reference=original.get("id"),
                reversal_reference=idempotency_key,
                provider=provider,
                metadata={
                    "provider_event_type": event_type,
                    "allocated_customer_amount": fmoney(allocated),
                    "allocation_ratio": float(ratio),
                },
            ))
            reversal_ids.append(reversal.get("id"))

        snap["already_refunded_amount"] = fmoney(D(snap.get("already_refunded_amount")) + allocated)
        snap["refundable_balance"] = fmoney(max(balance - allocated, Decimal("0")))
        snap["provider_refund_allocation"] = fmoney(D(snap.get("provider_refund_allocation")) + allocated)
        snap["last_provider_financial_event"] = idempotency_key
        item["financial_snapshot"] = snap
        item.setdefault("production_snapshot", {})["commercial_snapshot"] = snap
        lines.append({"order_item_id": item.get("id"), "amount": fmoney(allocated), "allocation_ratio": float(ratio)})

    adjustment = {
        "id": str(uuid.uuid4()),
        "idempotency_key": idempotency_key,
        "event_type": event_type,
        "order_id": order_id,
        "payment_id": order.get("payment_id"),
        "status": "posted",
        "requested_amount": fmoney(requested),
        "amount": fmoney(applied_total),
        "unallocated_amount": fmoney(max(requested - applied_total, Decimal("0"))),
        "currency": (order.get("financial_snapshot") or {}).get("currency") or "ZAR",
        "lines": lines,
        "reversal_event_ids": reversal_ids,
        "provider": provider,
        "provider_payload_reference": (provider_payload or {}).get("id") or (provider_payload or {}).get("reference"),
        "created_at": utc_iso(),
    }
    await db.financial_adjustments.insert_one(adjustment)
    refunded_total = money(D(order.get("refunded_total")) + applied_total)
    order_total = money(order.get("total"))
    payment_status = "refunded" if refunded_total >= order_total - CENT else ("partially_refunded" if event_type == "refund" else event_type)
    patch = {
        "items": items,
        "refunded_total": fmoney(refunded_total),
        "payment_status": payment_status,
        "updated_at": utc_iso(),
        "last_provider_financial_event": idempotency_key,
    }
    if payment_status == "refunded":
        patch["status"] = "refunded"
    await db.orders.update_one({"id": order_id}, {"$set": patch})
    audit = await write_audit_event(
        db,
        action=f"provider.{event_type}",
        entity_type="order",
        entity_id=order_id,
        provider=provider,
        before={"payment_status": order.get("payment_status"), "refunded_total": order.get("refunded_total")},
        after={"payment_status": payment_status, "refunded_total": fmoney(refunded_total)},
        reason=f"Provider event {event_type}",
        related_order_id=order_id,
        related_financial_event_id=adjustment["id"],
        idempotency_key=f"audit:{idempotency_key}",
        metadata={"provider_payload": provider_payload or {}, "allocations": lines},
    )
    await db.financial_adjustments.update_one({"id": adjustment["id"]}, {"$set": {"audit_reference": audit.get("id")}})
    return adjustment
