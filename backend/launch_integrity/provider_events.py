"""Provider-originated partial refunds, disputes and reversals.

Provider events often contain an amount but no SKU/quantity breakdown. This module
allocates the amount proportionally over the remaining immutable item balances and
creates linked reversals without guessing tax or fee values outside the original
snapshot.
"""
from __future__ import annotations

from copy import deepcopy
from decimal import Decimal
from typing import Any, Dict, List, Optional
import uuid

from .audit import write_audit_event
from .finance import _event_doc, _insert_event, _remove_from_open_batch, utc_iso
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
        snap = deepcopy(item.get("financial_snapshot") or (item.get("production_snapshot") or {}).get("commercial_snapshot") or {})
        original = D(snap.get("subtotal") or D(item.get("unit_price")) * max(int(item.get("quantity") or 1), 1))
        remaining = D(snap.get("refundable_balance")) if snap.get("refundable_balance") is not None else original - D(snap.get("already_refunded_amount"))
        balances.append(max(money(remaining), Decimal("0")))
    total_remaining = money(sum(balances))
    applied_total = min(requested, total_remaining)
    allocations = allocate_cents(applied_total, balances)
    reversal_ids: List[str] = []
    lines = []

    for item, balance, allocated in zip(items, balances, allocations):
        if allocated <= 0 or balance <= 0:
            continue
        snap = deepcopy(item.get("financial_snapshot") or (item.get("production_snapshot") or {}).get("commercial_snapshot") or {})
        base_subtotal = money(snap.get("subtotal") or balance)
        ratio = min(allocated / base_subtotal if base_subtotal else Decimal("0"), Decimal("1"))
        original_events = await db.wallet_transactions.find({
            "order_id": order_id,
            "order_item_id": item.get("id"),
            "event_type": {"$in": [
                "creator_earning", "printer_liability", "platform_revenue", "platform_commission",
                "tax_liability", "payment_fee", "shipping_allocation",
            ]},
            "original_event_reference": None,
        }, {"_id": 0}).to_list(100)
        for original in original_events:
            reverse_amount = money(abs(D(original.get("amount"))) * ratio)
            if reverse_amount <= 0:
                continue
            if original.get("status") in {"available", "pending", "in_batch", "failed"}:
                await _remove_from_open_batch(db, original, reverse_amount, f"{event_type} received from {provider}")
                await db.wallet_transactions.update_one(
                    {"id": original.get("id")},
                    {"$set": {
                        "status": "reversed" if ratio >= Decimal("0.9999") else original.get("status"),
                        "metadata.provider_reversal_key": idempotency_key,
                        "metadata.provider_reversed_amount": fmoney(reverse_amount),
                        "metadata.provider_reversed_at": utc_iso(),
                    }},
                )
            status = "available" if original.get("status") == "paid" and original.get("owner_type") in {"creator", "printer"} else "reversed"
            key = f"provider:{idempotency_key}:{original.get('id')}"
            signed = -reverse_amount if D(original.get("amount")) >= 0 else reverse_amount
            reversal = await _insert_event(db, _event_doc(
                key=key,
                event_type="refund" if event_type == "refund" else "reversal",
                owner_type=original.get("owner_type"),
                owner_id=original.get("owner_id"),
                amount=signed,
                order=order,
                item=item,
                status=status,
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
    payment_status = "refunded" if refunded_total >= order_total else ("partially_refunded" if event_type == "refund" else event_type)
    await db.orders.update_one({"id": order_id}, {"$set": {
        "items": items,
        "refunded_total": fmoney(refunded_total),
        "payment_status": payment_status,
        "updated_at": utc_iso(),
        "last_provider_financial_event": idempotency_key,
    }})
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
