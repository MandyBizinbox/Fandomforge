"""Audited, restricted order corrections for Super Admin.

Allows audited Super Admin contact/address and same-price variation corrections
including orders already in production. Financial fields, quantities, payment
state, artwork, inventory and payouts are immutable in this endpoint.
"""
from __future__ import annotations

from datetime import datetime, timezone
from copy import deepcopy
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
BLOCKED_ITEM_STATUSES = {"shipped", "delivered"}


class OrderItemCorrection(BaseModel):
    item_id: str = Field(min_length=1, max_length=128)
    product_id: Optional[str] = Field(default=None, min_length=1, max_length=128)
    variation_id: Optional[str] = Field(default=None, min_length=1, max_length=128)
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


def normalized_revision(value) -> str:
    """Compare ISO timestamps consistently across Pydantic and Mongo formats."""
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat()
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(timezone.utc).isoformat()
    except (TypeError, ValueError):
        return str(value)


def collection_not_completed_condition() -> dict:
    return {"$or": [{"collection_receipt": {"$exists": False}}, {"collection_receipt": None}]}


def require_super_admin(user: User) -> None:
    if user.role not in {"super_admin", "owner"}:
        raise HTTPException(status_code=403, detail="Super Admin access required")


@order_edit_router.get("/catalogue-search")
async def admin_order_catalogue_search(
    request: Request,
    q: str = "",
    user: User = Depends(get_current_user),
):
    """Search published products across the entire catalogue (not first 500).

    Results are server-priced; the save endpoint remains authoritative.
    """
    import re
    from routes_main import _decorate_product_effective_pricing
    require_super_admin(user)
    term = q.strip()
    if len(term) > 120:
        raise HTTPException(status_code=422, detail="Search term too long")
    query = {"published": True}
    if term:
        pattern = re.compile(re.escape(term), re.IGNORECASE)
        query["$or"] = [{"title": pattern}, {"sku": pattern}, {"slug": pattern}]
    db = request.app.state.db
    products = await db.products.find(query, {"_id": 0}).sort("title", 1).to_list(100)
    return [
        {
            "id": product["id"],
            "title": product.get("title") or "Untitled product",
            "band_id": product.get("band_id"),
            "assigned_printer_id": product.get("assigned_printer_id"),
            "variations": [
                {
                    "id": variation.get("id"),
                    "size": variation.get("size") or "",
                    "color": variation.get("color") or "",
                    "sku": variation.get("sku") or "",
                    "effective_selling_price": variation.get("effective_selling_price"),
                }
                for variation in _decorate_product_effective_pricing(
                    product, expose_manual_overrides=False
                ).get("variations") or []
            ],
        }
        for product in products
    ]


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
    if payload.item_corrections and (original.get("collection_receipt") or original.get("status") in {"shipped", "delivered", "completed", "cancelled", "canceled", "refunded"}):
        raise HTTPException(status_code=409, detail="Already shipped, collected, completed, cancelled or refunded items require a separate fulfilment correction")
    if normalized_revision(original.get("updated_at")) != normalized_revision(payload.expected_updated_at):
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
                raise HTTPException(status_code=409, detail="A selected item has already shipped or been delivered")
            new_size, new_color = correction.size.strip(), correction.color.strip()
            target_product_id = correction.product_id or item.get("product_id")
            target_variation_id = correction.variation_id
            if not new_size or not new_color:
                raise HTTPException(status_code=422, detail="Size and colour are required")
            replacement_product = target_product_id != item.get("product_id")
            if (not replacement_product and
                    (new_size, new_color) == (item.get("size"), item.get("color")) and
                    (not target_variation_id or target_variation_id == item.get("variation_id"))):
                continue

            product = await db.products.find_one({"id": target_product_id}, {"_id": 0})
            if not product:
                raise HTTPException(status_code=409, detail="Selected catalogue product no longer exists")
            if replacement_product:
                if not product.get("published"):
                    raise HTTPException(status_code=409, detail="Replacement product must be published")
                if product.get("band_id") != item.get("band_id"):
                    raise HTTPException(status_code=409, detail="Cannot switch creator on a paid order without payout reconciliation")
                new_printer = product.get("assigned_printer_id")
                existing_printer = item.get("printer_id")
                if new_printer and existing_printer and new_printer != existing_printer:
                    raise HTTPException(status_code=409, detail="Replacement product uses a different printer; manual production review required")

            candidates = [
                variation for variation in (product.get("variations") or [])
                if str(variation.get("size") or "").strip().casefold() == new_size.casefold()
                and str(variation.get("color") or "").strip().casefold() == new_color.casefold()
                and (not target_variation_id or variation.get("id") == target_variation_id)
            ]
            if len(candidates) != 1:
                raise HTTPException(status_code=422, detail="Select one valid size and colour for the target product")
            variation = candidates[0]
            from routes_main import _decorate_product_effective_pricing, _build_production_snapshot
            template = None
            if product.get("template_id"):
                template = await db.product_templates.find_one({"id": product["template_id"]}, {"_id": 0})
            decorated = _decorate_product_effective_pricing(product, template=template)
            matching = [v for v in decorated.get("variations") or [] if v.get("id") == variation.get("id")]
            if len(matching) != 1 or matching[0].get("effective_selling_price") is None:
                raise HTTPException(status_code=409, detail="Variation price cannot be verified; review manually")
            candidate_price = matching[0]["effective_selling_price"]
            if abs(float(candidate_price) - float(item.get("unit_price") or 0)) > 0.005:
                raise HTTPException(status_code=409, detail="Replacement has a different price; financial amendment required")

            previous = {
                "item_id": correction.item_id,
                "product_id": item.get("product_id"),
                "product_title": item.get("product_title"),
                "size": item.get("size"),
                "color": item.get("color"),
                "variation_id": item.get("variation_id"),
            }
            if replacement_product:
                # Update the production specification and artwork to match
                # the replacement, without recalculating historical payments
                # or creator/printer ledger credits.
                previous_snapshot = item.get("production_snapshot") or {}
                new_snapshot = _build_production_snapshot(
                    product, template, variation, int(item.get("quantity") or 1)
                )
                if not new_snapshot:
                    raise HTTPException(status_code=409, detail="Replacement print specification is unavailable")
                new_snapshot = deepcopy(new_snapshot)
                for key in (
                    "costing_model", "costing_breakdown", "production_cost",
                    "printer_payout", "platform_commission", "creator_profit",
                    "platform_blank_profit", "platform_print_profit",
                    "estimated_platform_profit", "creator_product_cost",
                ):
                    if key in previous_snapshot:
                        new_snapshot[key] = deepcopy(previous_snapshot[key])
                item["production_snapshot"] = new_snapshot
                item["product_id"] = product["id"]
                item["product_title"] = product.get("title") or item.get("product_title")
                # The old line, production status and printer assignment remain
                # stable; existing historical wallet rows remain attributable.
                item["artwork_file_url"] = (new_snapshot.get("artwork") or {}).get("url")
            item["size"] = new_size
            item["color"] = new_color
            item["variation_id"] = variation["id"]
            item_changes.append({
                "before": previous,
                "after": {
                    "item_id": correction.item_id,
                    "product_id": item.get("product_id"),
                    "product_title": item.get("product_title"),
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
            "updated_at": original.get("updated_at"),
            **({"status": {"$nin": ["shipped", "delivered", "completed", "cancelled", "canceled", "refunded"]},
                **collection_not_completed_condition()} if payload.item_corrections else {}),
            "$and": [
                {"$or": [{"active_order_amendment_id": {"$exists": False}},
                          {"active_order_amendment_id": None}]},
            ],
        },
        {"$set": changes, "$push": {"edit_history": record}},
    )
    if result.modified_count != 1:
        raise HTTPException(status_code=409, detail="Order changed during editing. Reload before saving")
    # A successful Mongo acknowledgment alone is insufficient. Check that the
    # actual saved order contains every requested replacement.
    verified = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not verified:
        raise HTTPException(status_code=500, detail="Order disappeared after correction; investigate")
    if payload.item_corrections:
        verified_items = {item.get("id"): item for item in verified.get("items") or []}
        for entry in item_changes:
            saved = verified_items.get(entry["after"]["item_id"])
            expected = entry["after"]
            if not saved or any(saved.get(key) != expected.get(key)
                                for key in ("product_id", "product_title", "variation_id", "size", "color")):
                raise HTTPException(
                    status_code=500,
                    detail="Order write did not persist the selected product and variation. Review the order.",
                )
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
