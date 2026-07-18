"""Authoritative financial event ledger, reversals and legacy reconciliation."""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, Iterable, List, Optional
import uuid

from fastapi import HTTPException

from .audit import write_audit_event
from .pricing import D, fmoney, money, stable_hash

FINANCE_VERSION = "financial_events_v1"


def utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _event_id(key: str) -> str:
    return f"fin-{stable_hash(key)[:28]}"


def _snapshot(item: Dict[str, Any]) -> Dict[str, Any]:
    return deepcopy(item.get("financial_snapshot") or (item.get("production_snapshot") or {}).get("commercial_snapshot") or {})


def _event_doc(
    *,
    key: str,
    event_type: str,
    owner_type: str,
    owner_id: Optional[str],
    amount: Any,
    order: Dict[str, Any],
    item: Optional[Dict[str, Any]] = None,
    payment_id: Optional[str] = None,
    status: str = "available",
    original_event_reference: Optional[str] = None,
    reversal_reference: Optional[str] = None,
    actor_user_id: Optional[str] = None,
    actor_role: Optional[str] = None,
    provider: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    item = item or {}
    now = utc_iso()
    return {
        "id": _event_id(key),
        "idempotency_key": key,
        "event_type": event_type,
        "type": event_type if event_type in {"creator_earning", "printer_payout", "adjustment", "refund", "reversal"} else "adjustment",
        "owner_type": owner_type,
        "owner_id": owner_id or "platform",
        "order_id": order.get("id"),
        "order_number": order.get("order_number"),
        "order_item_id": item.get("id"),
        "creator_id": item.get("creator_id") or item.get("band_id"),
        "printer_id": item.get("printer_id"),
        "payment_id": payment_id or order.get("payment_id"),
        "payout_batch_id": None,
        "payout_batch_item_id": None,
        "currency": (_snapshot(item).get("currency") or order.get("currency") or "ZAR"),
        "amount": fmoney(amount),
        "original_event_reference": original_event_reference,
        "reversal_reference": reversal_reference,
        "status": status,
        "created_at": now,
        "effective_at": now,
        "actor_user_id": actor_user_id,
        "actor_role": actor_role,
        "provider": provider,
        "description": event_type.replace("_", " ").title(),
        "source_collection": "financial_events",
        "source_id": key,
        "audit_reference": None,
        "metadata": {"finance_version": FINANCE_VERSION, **(metadata or {})},
    }


async def _insert_event(db, doc: Dict[str, Any]) -> Dict[str, Any]:
    await db.wallet_transactions.update_one(
        {"idempotency_key": doc["idempotency_key"]},
        {"$setOnInsert": doc},
        upsert=True,
    )
    return await db.wallet_transactions.find_one({"idempotency_key": doc["idempotency_key"]}, {"_id": 0}) or doc


async def _legacy_projection(db, order: Dict[str, Any], item: Dict[str, Any], events: Dict[str, Dict[str, Any]]) -> None:
    commission = events.get("platform_commission")
    if commission:
        await db.commissions.update_one(
            {"order_id": order.get("id"), "order_item_id": item.get("id")},
            {"$setOnInsert": {
                "id": str(uuid.uuid4()),
                "order_id": order.get("id"),
                "order_item_id": item.get("id"),
                "band_id": item.get("band_id"),
                "amount": commission.get("amount"),
                "rate": _snapshot(item).get("platform_commission_rate") or item.get("commission_rate") or 0,
                "source_wallet_event_id": commission.get("id"),
                "compatibility_projection": True,
                "created_at": utc_iso(),
            }},
            upsert=True,
        )
    printer = events.get("printer_liability")
    if printer and item.get("printer_id"):
        await db.payouts.update_one(
            {"order_id": order.get("id"), "order_item_id": item.get("id")},
            {"$setOnInsert": {
                "id": str(uuid.uuid4()),
                "printer_id": item.get("printer_id"),
                "order_id": order.get("id"),
                "order_item_id": item.get("id"),
                "amount": printer.get("amount"),
                "status": "due",
                "source_wallet_event_id": printer.get("id"),
                "compatibility_projection": True,
                "created_at": utc_iso(),
            }},
            upsert=True,
        )


async def post_paid_order_events(db, order: Dict[str, Any], payment: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    if not order or order.get("payment_status") != "paid":
        return {"created": 0, "skipped": True}
    created = 0
    event_ids: List[str] = []
    for item in order.get("items") or []:
        snap = _snapshot(item)
        qty = max(int(item.get("quantity") or 1), 1)
        creator_id = item.get("creator_id") or item.get("band_id")
        printer_id = item.get("printer_id")
        values = {
            "creator_earning": ("creator", creator_id, snap.get("creator_earnings") if snap else item.get("band_earnings")),
            "printer_liability": ("printer", printer_id, snap.get("printer_liability") if snap else item.get("printer_payout")),
            "platform_revenue": ("platform", "platform", D(snap.get("platform_gross_revenue")) * qty),
            "platform_commission": ("platform", "platform", snap.get("platform_commission_amount") if snap else item.get("commission_amount")),
            "tax_liability": ("tax", "platform_tax", snap.get("tax_amount") or 0),
            "payment_fee": ("platform", "platform", -abs(D(snap.get("payment_fee_allocation") or 0))),
            "shipping_allocation": ("platform", "platform", snap.get("shipping_allocation") or 0),
        }
        item_events: Dict[str, Dict[str, Any]] = {}
        for event_type, (owner_type, owner_id, amount) in values.items():
            if owner_type in {"creator", "printer"} and not owner_id:
                continue
            amount_value = money(amount)
            if amount_value == 0:
                continue
            key = f"paid-order:{order.get('id')}:{item.get('id')}:{event_type}:{FINANCE_VERSION}"
            existed = await db.wallet_transactions.find_one({"idempotency_key": key}, {"_id": 1})
            doc = await _insert_event(db, _event_doc(
                key=key,
                event_type=event_type,
                owner_type=owner_type,
                owner_id=owner_id,
                amount=amount_value,
                order=order,
                item=item,
                payment_id=(payment or {}).get("id"),
                metadata={"order_snapshot_sha256": (order.get("financial_snapshot") or {}).get("snapshot_sha256")},
            ))
            item_events[event_type] = doc
            event_ids.append(doc.get("id"))
            if not existed:
                created += 1
        await _legacy_projection(db, order, item, item_events)
    await db.orders.update_one(
        {"id": order.get("id")},
        {"$set": {
            "financial_events_version": FINANCE_VERSION,
            "financial_events_posted_at": utc_iso(),
            "financial_event_ids": event_ids,
        }},
    )
    return {"created": created, "event_ids": event_ids, "skipped": False}


def _line_requests(order: Dict[str, Any], lines: Optional[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    items = order.get("items") or []
    if not lines:
        return [{"order_item_id": item.get("id"), "quantity": max(int(item.get("quantity") or 1), 1)} for item in items]
    by_id = {item.get("id"): item for item in items}
    out = []
    for line in lines:
        item = by_id.get(line.get("order_item_id"))
        if not item:
            raise HTTPException(status_code=400, detail=f"Unknown order item: {line.get('order_item_id')}")
        requested = max(int(line.get("quantity") or 0), 0)
        if requested <= 0 or requested > max(int(item.get("quantity") or 1), 1):
            raise HTTPException(status_code=400, detail="Refund quantity is outside the ordered quantity")
        out.append({"order_item_id": item.get("id"), "quantity": requested})
    return out


async def _remove_from_open_batch(db, original: Dict[str, Any], reverse_amount: Decimal, reason: str) -> None:
    if original.get("status") != "in_batch" or not original.get("payout_batch_id"):
        return
    batch = await db.payout_batches.find_one({"id": original.get("payout_batch_id")}, {"_id": 0})
    if not batch:
        return
    for batch_item in batch.get("items") or []:
        if original.get("id") not in (batch_item.get("wallet_transaction_ids") or []):
            continue
        batch_item["wallet_transaction_ids"] = [value for value in batch_item.get("wallet_transaction_ids") or [] if value != original.get("id")]
        batch_item["amount"] = fmoney(max(D(batch_item.get("amount")) - reverse_amount, Decimal("0")))
        if not batch_item["wallet_transaction_ids"] or D(batch_item["amount"]) <= 0:
            batch_item["status"] = "failed"
            batch_item["failure_reason"] = reason
        break
    statuses = [row.get("status") for row in batch.get("items") or []]
    status = "partial" if any(value == "paid" for value in statuses) else "failed" if all(value == "failed" for value in statuses) else batch.get("status")
    await db.payout_batches.update_one(
        {"id": batch.get("id")},
        {"$set": {
            "items": batch.get("items") or [],
            "total_amount": fmoney(sum(D(row.get("amount")) for row in batch.get("items") or [])),
            "status": status,
            "updated_at": utc_iso(),
        }},
    )


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
    item_map = {item.get("id"): item for item in order.get("items") or []}
    reversal_ids: List[str] = []
    total_customer_refund = Decimal("0")
    affected = []

    for line in requests:
        item = item_map[line["order_item_id"]]
        ordered_qty = max(int(item.get("quantity") or 1), 1)
        reverse_qty = int(line["quantity"])
        ratio = D(reverse_qty) / D(ordered_qty)
        snap = _snapshot(item)
        already_qty = int(snap.get("refunded_quantity") or 0)
        if already_qty + reverse_qty > ordered_qty:
            raise HTTPException(status_code=409, detail="Refund exceeds the remaining refundable quantity")
        item_refund = money(D(snap.get("subtotal") or D(item.get("unit_price")) * ordered_qty) * ratio)
        total_customer_refund += item_refund
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
            reversal_key = f"{event_type}:{idempotency_key}:{original.get('id')}:{reverse_qty}"
            reversal_status = "available" if original.get("status") == "paid" and original.get("owner_type") in {"creator", "printer"} else "reversed"
            if original.get("status") in {"available", "pending", "in_batch", "failed"}:
                await _remove_from_open_batch(db, original, reverse_amount, f"{event_type} applied before payout")
                await db.wallet_transactions.update_one(
                    {"id": original.get("id")},
                    {"$set": {"status": "reversed", "metadata.reversed_by": idempotency_key, "metadata.reversed_at": utc_iso()}},
                )
            signed_amount = -reverse_amount if D(original.get("amount")) >= 0 else reverse_amount
            reversal = await _insert_event(db, _event_doc(
                key=reversal_key,
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
                metadata={"reversal_type": event_type, "quantity": reverse_qty, "ratio": float(ratio), "reason": reason},
            ))
            reversal_ids.append(reversal.get("id"))
        snap["refunded_quantity"] = already_qty + reverse_qty
        snap["already_refunded_amount"] = fmoney(D(snap.get("already_refunded_amount")) + item_refund)
        snap["refundable_balance"] = fmoney(max(D(snap.get("refundable_balance") or snap.get("subtotal")) - item_refund, Decimal("0")))
        item["financial_snapshot"] = snap
        item.setdefault("production_snapshot", {})["commercial_snapshot"] = snap
        affected.append({"order_item_id": item.get("id"), "quantity": reverse_qty, "amount": fmoney(item_refund)})

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
        "created_at": utc_iso(),
        "created_by_user_id": getattr(actor, "id", None),
        "created_by_role": getattr(actor, "role", None),
    }
    await db.financial_adjustments.insert_one(adjustment)
    update = {
        "items": list(item_map.values()),
        "refunded_total": fmoney(D(order.get("refunded_total")) + total_customer_refund),
        "updated_at": utc_iso(),
    }
    original_total = money(order.get("total"))
    if money(update["refunded_total"]) >= original_total:
        update.update({"status": "refunded", "payment_status": "refunded"})
    else:
        update["payment_status"] = "partially_refunded" if event_type == "refund" else event_type
    await db.orders.update_one({"id": order_id}, {"$set": update})
    audit = await write_audit_event(
        db,
        action=f"finance.{event_type}",
        entity_type="order",
        entity_id=order_id,
        actor=actor,
        provider=provider,
        before={"payment_status": order.get("payment_status"), "refunded_total": order.get("refunded_total")},
        after={"payment_status": update.get("payment_status"), "refunded_total": update.get("refunded_total")},
        reason=reason,
        request=request,
        related_order_id=order_id,
        related_financial_event_id=adjustment["id"],
        idempotency_key=f"audit:{idempotency_key}",
    )
    await db.financial_adjustments.update_one({"id": adjustment["id"]}, {"$set": {"audit_reference": audit.get("id")}})
    return adjustment


async def record_provider_fee_actual(db, payment: Dict[str, Any], actual_fee: Any) -> Dict[str, Any]:
    expected = money((payment.get("gateway_fee") or {}).get("estimated_fee") or payment.get("estimated_provider_fee"))
    actual = money(actual_fee)
    variance = money(actual - expected)
    patch = {
        "actual_provider_fee": fmoney(actual),
        "estimated_provider_fee": fmoney(expected),
        "provider_fee_variance": fmoney(variance),
        "provider_fee_recorded_at": utc_iso(),
    }
    await db.payments.update_one({"id": payment.get("id")}, {"$set": patch})
    if variance:
        order = await db.orders.find_one({"id": payment.get("order_id")}, {"_id": 0}) or {}
        await _insert_event(db, _event_doc(
            key=f"provider-fee-variance:{payment.get('id')}:{fmoney(actual)}",
            event_type="payment_fee_variance",
            owner_type="platform",
            owner_id="platform",
            amount=-variance,
            order=order,
            payment_id=payment.get("id"),
            provider=payment.get("provider"),
            metadata=patch,
        ))
    return patch


async def reconciliation_report(db, order_id: Optional[str] = None) -> Dict[str, Any]:
    query = {"order_id": order_id} if order_id else {}
    wallet = await db.wallet_transactions.find(query, {"_id": 0}).to_list(50000)
    commission_rows = await db.commissions.find(query, {"_id": 0}).to_list(50000)
    payout_rows = await db.payouts.find(query, {"_id": 0}).to_list(50000)
    wallet_commission = sum(D(row.get("amount")) for row in wallet if row.get("event_type") == "platform_commission" and row.get("status") != "reversed")
    wallet_printer = sum(D(row.get("amount")) for row in wallet if row.get("event_type") == "printer_liability" and row.get("status") != "reversed")
    legacy_commission = sum(D(row.get("amount")) for row in commission_rows)
    legacy_printer = sum(D(row.get("amount")) for row in payout_rows)
    mismatches = []
    if money(wallet_commission) != money(legacy_commission):
        mismatches.append({"kind": "commission", "wallet": fmoney(wallet_commission), "legacy": fmoney(legacy_commission)})
    if money(wallet_printer) != money(legacy_printer):
        mismatches.append({"kind": "printer_liability", "wallet": fmoney(wallet_printer), "legacy": fmoney(legacy_printer)})
    duplicates = await db.wallet_transactions.aggregate([
        {"$match": {"idempotency_key": {"$exists": True}}},
        {"$group": {"_id": "$idempotency_key", "count": {"$sum": 1}}},
        {"$match": {"count": {"$gt": 1}}},
        {"$limit": 100},
    ]).to_list(100)
    return {
        "order_id": order_id,
        "wallet_event_count": len(wallet),
        "legacy_commission_count": len(commission_rows),
        "legacy_payout_count": len(payout_rows),
        "mismatches": mismatches,
        "duplicate_idempotency_keys": duplicates,
        "generated_at": utc_iso(),
    }


async def ensure_finance_indexes(db) -> None:
    await db.wallet_transactions.create_index([("idempotency_key", 1)], unique=True, sparse=True)
    await db.wallet_transactions.create_index([("event_type", 1), ("order_id", 1), ("order_item_id", 1)])
    await db.wallet_transactions.create_index([("original_event_reference", 1)], sparse=True)
    await db.financial_adjustments.create_index([("idempotency_key", 1)], unique=True)
    await db.financial_adjustments.create_index([("order_id", 1), ("created_at", -1)])


def install_finance_integrity(routes_main_module: Any) -> None:
    if getattr(routes_main_module, "_launch_finance_integrity_installed", False):
        return
    original_mark_paid = routes_main_module._mark_order_paid_from_payment
    original_manual = routes_main_module._finalize_paid_manual_order

    async def wrapped_mark_paid(db, payment, provider_payload=None):
        order = await original_mark_paid(db, payment, provider_payload)
        if order:
            from .pricing import finalize_order_allocations
            order = await finalize_order_allocations(db, order)
            await post_paid_order_events(db, order, payment)
            data = (provider_payload or {}).get("data") if isinstance(provider_payload, dict) else None
            actual_fee = (data or {}).get("fees") if isinstance(data, dict) else None
            if actual_fee is not None:
                # Paystack reports fees in the smallest currency unit.
                await record_provider_fee_actual(db, payment, D(actual_fee) / Decimal("100"))
        return order

    async def wrapped_manual(db, order, order_items, user_id=None):
        result = await original_manual(db, order, order_items, user_id)
        refreshed = await db.orders.find_one({"id": order.id}, {"_id": 0})
        if refreshed:
            from .pricing import finalize_order_allocations
            refreshed = await finalize_order_allocations(db, refreshed)
            await post_paid_order_events(db, refreshed)
        return result

    async def authoritative_wallet(db, order):
        return await post_paid_order_events(db, order)

    routes_main_module._mark_order_paid_from_payment = wrapped_mark_paid
    routes_main_module._finalize_paid_manual_order = wrapped_manual
    routes_main_module.ensure_wallet_transactions_for_order = authoritative_wallet
    routes_main_module._launch_finance_integrity_installed = True
