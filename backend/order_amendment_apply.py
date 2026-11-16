"""Conservative application of fully paid addition-only order amendments.

Replacing, removing, repricing or editing an existing paid item requires a
separate compensation/reversal workflow, so those are explicitly rejected.
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException
from models import CartItem, uid
from order_amendment_routes import money

APPLY_STATUSES = {"paid", "awaiting_artwork_review", "sent_to_printer"}


def additions_only(original: dict, preview: dict) -> list[dict]:
    originals = original.get("items") or []
    before = {item.get("id"): item for item in originals}
    proposals = preview.get("items") or []
    current = {item.get("existing_item_id"): item for item in proposals if item.get("existing_item_id")}
    if set(current) != set(before):
        raise HTTPException(status_code=409, detail="Removing existing paid lines requires credit and wallet review")
    for item_id, old in before.items():
        new = current[item_id]
        if (new.get("product_id") != old.get("product_id")
                or new.get("variation_id") != old.get("variation_id")
                or int(new.get("quantity") or 0) != int(old.get("quantity") or 0)
                or money(new.get("unit_price")) != money(old.get("unit_price"))):
            raise HTTPException(status_code=409, detail="Replacing or repricing existing paid lines requires wallet review")
    additions = [line for line in proposals if not line.get("existing_item_id")]
    if not additions:
        raise HTTPException(status_code=409, detail="No new items to apply")
    return additions


async def apply_paid_additions(db, order: dict, amendment: dict, user) -> dict:
    if amendment.get("status") == "applied":
        from routes_main import ensure_wallet_transactions_for_order
        await ensure_wallet_transactions_for_order(db, order)
        return {"ok": True, "status": "applied", "duplicate": True, "wallet_reconciled": True}
    if amendment.get("status") != "settled_pending_application":
        raise HTTPException(status_code=409, detail="Amendment supplement is not yet paid")
    if order.get("payment_status") != "paid" or order.get("status") not in APPLY_STATUSES:
        raise HTTPException(status_code=409, detail="Only paid, unfulfilled orders may receive automated additions")
    if order.get("collection_receipt"):
        raise HTTPException(status_code=409, detail="Already collected orders need a separate fulfilment amendment")
    if order.get("updated_at") != amendment.get("source_order_updated_at"):
        raise HTTPException(status_code=409, detail="Order changed since amendment was drafted")
    from routes_main import _build_order_items, ensure_wallet_transactions_for_order
    from models import Order
    preview = amendment.get("preview") or {}
    added = additions_only(order, preview)
    if money(preview.get("balance_due")) != money(amendment.get("payment_amount")):
        raise HTTPException(status_code=409, detail="Verified supplement amount does not match this amendment")
    original_payment = await db.payments.find_one({
        "id": order.get("payment_id"), "order_id": order["id"], "status": "completed",
    }, {"_id": 0})
    if not original_payment or money(original_payment.get("amount")) != money(order.get("amendment_base_total", order.get("total"))):
        raise HTTPException(status_code=409, detail="Original order payment evidence is inconsistent")

    paid = await db.payments.find_one({
        "id": amendment.get("payment_id"), "amendment_id": amendment["id"],
        "order_id": order["id"], "provider": "payfast", "status": "completed",
    }, {"_id": 0})
    if not paid or money(paid["amount"]) != money(preview.get("balance_due")):
        raise HTTPException(status_code=409, detail="No matching confirmed supplement payment")
    cart = [CartItem(
        product_id=line["product_id"], product_title=line["product_title"],
        band_id=line["band_id"], variation_id=line["variation_id"],
        size=line["size"], color=line["color"], quantity=line["quantity"],
        unit_price=line["unit_price"],
    ) for line in added]
    new_items, amount = await _build_order_items(db, cart, order.get("shipping_address"))
    expected_new_amount = sum((money(line["line_total"]) for line in added), Decimal("0"))
    if money(amount) != expected_new_amount:
        raise HTTPException(status_code=409, detail="Catalogue pricing changed. Cannot apply an old draft automatically")

    old_total = money(order.get("total"))
    new_total = money(preview.get("revised_total"))
    if old_total + money(amount) != new_total:
        raise HTTPException(status_code=409, detail="Amendment financial totals no longer match")
    now = datetime.now(timezone.utc).isoformat()
    new_order_items = list(order.get("items") or []) + [item.model_dump(mode="json") for item in new_items]
    # Validate all mandatory order item fields before committing.
    Order(**{**order, "items": new_order_items, "subtotal": float(money(preview["revised_subtotal"])), "total": float(new_total)})
    update = await db.orders.update_one(
        {"id": order["id"], "updated_at": order["updated_at"],
         "payment_status": "paid", "status": order["status"],
         "collection_receipt": {"$exists": False},
         "applied_amendment_ids": {"$ne": amendment["id"]}},
        {"$set": {
            "items": new_order_items,
            "subtotal": float(money(preview["revised_subtotal"])),
            "total": float(new_total),
            "amendment_base_total": order.get("amendment_base_total", float(old_total)),
            "updated_at": now,
        }, "$addToSet": {"applied_amendment_ids": amendment["id"]}},
    )
    if update.modified_count != 1:
        raise HTTPException(status_code=409, detail="Order changed during amendment application")
    await db.order_amendments.update_one(
        {"id": amendment["id"], "status": "settled_pending_application"},
        {"$set": {
            "status": "applied", "applied_at": now,
            "applied_by": user.id,
            "added_order_item_ids": [item.id for item in new_items],
        }},
    )
    # Idempotent ledger creation. If a transient failure occurs, rerunning
    # the wallet reconciliation is safe; never undo a paid order.
    updated = await db.orders.find_one({"id": order["id"]}, {"_id": 0})
    await ensure_wallet_transactions_for_order(db, updated)
    return {
        "ok": True, "status": "applied",
        "new_total": float(new_total),
        "new_item_ids": [item.id for item in new_items],
        "wallet_reconciled": True,
    }
