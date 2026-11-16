"""Audited, restricted order corrections for Super Admin.

Allows customer contact/address corrections and pre-production variation label
corrections. Financial fields, quantities, payment state, artwork, inventory,
payouts and completed/collected orders are immutable in this endpoint.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field, model_validator

from auth import get_current_user
from models import ShippingAddress, User, uid

order_edit_router = APIRouter(prefix="/admin/orders", tags=["admin-order-edits"])
BLOCKED_STATUSES = {
    "sent_to_printer", "in_production", "ready_for_dispatch",
    "shipped", "delivered", "completed", "cancelled", "canceled", "refunded",
}
BLOCKED_ITEM_STATUSES = {"accepted", "in_production", "ready", "shipped", "delivered"}


class OrderItemCorrection(BaseModel):
    item_id: str = Field(min_length=1, max_length=128)
    size: str = Field(max_length=100)
    color: str = Field(max_length=100)


class OrderCorrectionRequest(BaseModel):
    reason: str = Field(min_length=5, max_length=500)
    expected_updated_at: str = Field(min_length=1, max_length=80)
    shipping_address: Optional[ShippingAddress] = None
    item_corrections: List[OrderItemCorrection] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def has_requested_change(self):
        if self.shipping_address is None and not self.item_corrections:
            raise ValueError("No corrections supplied")
        ids = [item.item_id for item in self.item_corrections]
        if len(ids) != len(set(ids)):
            raise ValueError("Each order item can only be corrected once")
        return self


def require_super_admin(user: User) -> None:
    if user.role not in {"super_admin", "owner"}:
        raise HTTPException(status_code=403, detail="Super Admin access required")


@order_edit_router.patch("/{order_id}/corrections")
async def correct_order(
    order_id: str,
    payload: OrderCorrectionRequest,
    request: Request,
    user: User = Depends(get_current_user),
):
    require_super_admin(user)
    db = request.app.state.db
    original = await db.orders.find_one(
        {"id": order_id, "archived": {"$ne": True}}, {"_id": 0}
    )
    if not original:
        raise HTTPException(status_code=404, detail="Order not found")
    if original.get("active_order_amendment_id"):
        raise HTTPException(status_code=409, detail="Order editing is held while a PayFast supplement is payable")
    if payload.item_corrections and (original.get("status") in BLOCKED_STATUSES or original.get("collection_receipt")):
        raise HTTPException(status_code=409, detail="Production or collection has begun. Item changes require an amendment and cannot overwrite fulfilment records")
    if original.get("updated_at") != payload.expected_updated_at:
        raise HTTPException(status_code=409, detail="Order changed since opening. Refresh before editing")

    before = {}
    after = {}
    changes = {}
    if payload.shipping_address is not None:
        new_address = payload.shipping_address.model_dump()
        old_address = original.get("shipping_address") or {}
        if new_address != {key: old_address.get(key, "") for key in new_address}:
            before["shipping_address"] = old_address
            after["shipping_address"] = new_address
            before["buyer_email"] = original.get("buyer_email")
            after["buyer_email"] = new_address["email"]
            changes["shipping_address"] = new_address
            changes["buyer_email"] = new_address["email"]

    if payload.item_corrections:
        old_items = original.get("items") or []
        items = [dict(item) for item in old_items]
        indexes = {item.get("id"): index for index, item in enumerate(items)}
        item_changes = []
        for correction in payload.item_corrections:
            index = indexes.get(correction.item_id)
            if index is None:
                raise HTTPException(status_code=422, detail="One or more order items no longer exist")
            item = items[index]
            if item.get("production_status", "pending") in BLOCKED_ITEM_STATUSES:
                raise HTTPException(status_code=409, detail="A selected item has already entered production")
            new_size, new_color = correction.size.strip(), correction.color.strip()
            if not new_size or not new_color:
                raise HTTPException(status_code=422, detail="Size and colour are required")
            if (new_size, new_color) == (item.get("size"), item.get("color")):
                continue
            # A variant correction is only safe if the requested combination
            # exists on the same product and has identical effective pricing.
            product = await db.products.find_one({"id": item.get("product_id")}, {"_id": 0, "variations": 1})
            if not product:
                raise HTTPException(status_code=409, detail="Product no longer exists; variation cannot be corrected automatically")
            candidates = [
                variation for variation in (product.get("variations") or [])
                if str(variation.get("size") or "").strip().casefold() == new_size.casefold()
                and str(variation.get("color") or "").strip().casefold() == new_color.casefold()
            ]
            if len(candidates) != 1:
                raise HTTPException(status_code=422, detail="Requested size and colour must match exactly one existing product variation")
            variation = candidates[0]
            # Different variation prices affect paid orders and creator
            # allocations. Do not silently recalculate/refund them.
            candidate_price = variation.get("effective_selling_price")
            if candidate_price is None:
                candidate_price = variation.get("price_override")
            if candidate_price is None:
                raise HTTPException(status_code=409, detail="Variation price cannot be verified; use the financial amendment workflow")
            if abs(float(candidate_price) - float(item.get("unit_price") or 0)) > 0.005:
                raise HTTPException(status_code=409, detail="Variation has a different price; financial amendment required")
            previous = {
                "item_id": correction.item_id,
                "size": item.get("size"),
                "color": item.get("color"),
                "variation_id": item.get("variation_id"),
            }
            item["size"] = new_size
            item["color"] = new_color
            item["variation_id"] = variation["id"]
            item_changes.append({
                "before": previous,
                "after": {
                    "item_id": correction.item_id,
                    "size": new_size,
                    "color": new_color,
                    "variation_id": variation["id"],
                },
            })
        if item_changes:
            before["items"] = [change["before"] for change in item_changes]
            after["items"] = [change["after"] for change in item_changes]
            changes["items"] = items

    if not changes:
        raise HTTPException(status_code=422, detail="No actual differences to save")

    now = datetime.now(timezone.utc).isoformat()
    correction_id = uid()
    record = {
        "id": correction_id,
        "at": now,
        "actor_user_id": user.id,
        "actor_role": user.role,
        "reason": payload.reason.strip(),
        "before": before,
        "after": after,
    }
    changes["updated_at"] = now
    result = await db.orders.update_one(
        {
            "id": order_id,
            "archived": {"$ne": True},
            "updated_at": payload.expected_updated_at,
            "active_order_amendment_id": {"$exists": False},
            **({"status": {"$nin": sorted(BLOCKED_STATUSES)}, "collection_receipt": {"$exists": False}} if payload.item_corrections else {}),
        },
        {"$set": changes, "$push": {"edit_history": record}},
    )
    if result.modified_count != 1:
        raise HTTPException(status_code=409, detail="Order changed during editing. Reload before saving")
    try:
        await db.order_events.insert_one({
            "id": uid(),
            "order_id": order_id,
            "order_number": original.get("order_number"),
            "actor_user_id": user.id,
            "actor_role": user.role,
            "audience": ["admin"],
            "kind": "internal_note",
            "title": "Super Admin order correction",
            "message": payload.reason.strip(),
            "metadata": {"correction_id": correction_id, "fields": list(before)},
            "created_at": now,
        })
    except Exception:
        import logging
        logging.getLogger(__name__).exception("Order correction event insert failed for %s", order_id)
    return {
        "ok": True,
        "order_id": order_id,
        "correction_id": correction_id,
        "updated_at": now,
        "changed_fields": list(before),
    }
