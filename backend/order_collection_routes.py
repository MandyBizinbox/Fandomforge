"""Staff-only mobile order handover and signature capture.

No customer-facing lookup. Completing an order requires verified paid status,
ready_for_dispatch, a deliberate handover confirmation and a PNG signature.
The receipt and status change are written atomically to the order document.
"""
from __future__ import annotations

import base64
import binascii
import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from auth import get_current_user
from models import User, uid
from routes_main import _require_manager_permission


collection_router = APIRouter(prefix="/admin/collection", tags=["admin-collection"])
PNG_PREFIX = "data:image/png;base64,"
MAX_PNG_BYTES = 160_000
COLLECTABLE_STATUS = "ready_for_dispatch"


class CollectionLookup(BaseModel):
    query: str = Field(min_length=3, max_length=254)


class CompleteCollection(BaseModel):
    signer_name: str = Field(min_length=2, max_length=120)
    signature_data_url: str = Field(min_length=100, max_length=225_000)
    handover_confirmed: bool = False


def _check_access(user: User) -> None:
    _require_manager_permission(user, "manage_orders")


def _order_summary(order: dict) -> dict:
    address = order.get("shipping_address") or {}
    return {
        "id": order.get("id"),
        "order_number": order.get("order_number"),
        "created_at": order.get("created_at"),
        "buyer_email": order.get("buyer_email"),
        "customer_name": address.get("full_name") or "",
        "customer_phone": address.get("phone") or "",
        "status": order.get("status"),
        "payment_status": order.get("payment_status"),
        "shipping_method_name": order.get("shipping_method_name") or order.get("shipping_method_key") or "",
        "total": order.get("total"),
        "items": [
            {
                "id": item.get("id"),
                "product_title": item.get("product_title"),
                "size": item.get("size"),
                "color": item.get("color"),
                "quantity": item.get("quantity"),
            }
            for item in (order.get("items") or [])
        ],
        "collection_completed": bool(order.get("collection_receipt")),
        "collected_at": (order.get("collection_receipt") or {}).get("signed_at"),
        "can_collect": (
            order.get("payment_status") == "paid"
            and order.get("status") == COLLECTABLE_STATUS
            and not order.get("collection_receipt")
        ),
    }


def _validate_signature(data_url: str) -> None:
    if not data_url.startswith(PNG_PREFIX):
        raise HTTPException(status_code=422, detail="A PNG signature is required")
    encoded = data_url[len(PNG_PREFIX):]
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error):
        raise HTTPException(status_code=422, detail="Invalid signature encoding")
    if not (300 <= len(raw) <= MAX_PNG_BYTES and raw.startswith(b"\x89PNG\r\n\x1a\n")):
        raise HTTPException(status_code=422, detail="Invalid or oversized signature image")


@collection_router.post("/lookup")
async def lookup_collection(payload: CollectionLookup, request: Request, user: User = Depends(get_current_user)):
    _check_access(user)
    query = payload.query.strip()
    if len(query) < 3:
        raise HTTPException(status_code=422, detail="Enter an email or order number")
    # Exact lookup only: no bulk customer directory search.
    field = "buyer_email" if "@" in query else "order_number"
    match = re.compile("^" + re.escape(query) + "$", flags=re.IGNORECASE)
    docs = await request.app.state.db.orders.find(
        {field: match, "archived": {"$ne": True}},
        {"_id": 0, "id": 1, "order_number": 1, "buyer_email": 1, "created_at": 1,
         "shipping_address": 1, "status": 1, "payment_status": 1, "total": 1,
         "shipping_method_name": 1, "shipping_method_key": 1,
         "items": 1, "collection_receipt.signed_at": 1},
    ).sort("created_at", -1).to_list(length=25)
    return {"orders": [_order_summary(order) for order in docs], "limited": len(docs) == 25}


@collection_router.get("/orders/{order_id}")
async def get_collection_order(order_id: str, request: Request, user: User = Depends(get_current_user)):
    _check_access(user)
    order = await request.app.state.db.orders.find_one(
        {"id": order_id, "archived": {"$ne": True}},
        {"_id": 0, "id": 1, "order_number": 1, "buyer_email": 1, "created_at": 1,
         "shipping_address": 1, "status": 1, "payment_status": 1, "total": 1,
         "shipping_method_name": 1, "shipping_method_key": 1,
         "items": 1, "collection_receipt.signed_at": 1},
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return _order_summary(order)


@collection_router.post("/orders/{order_id}/complete")
async def complete_collection(
    order_id: str,
    payload: CompleteCollection,
    request: Request,
    user: User = Depends(get_current_user),
):
    _check_access(user)
    if not payload.handover_confirmed:
        raise HTTPException(status_code=422, detail="Confirm all items have been handed over")
    signer_name = payload.signer_name.strip()
    if len(signer_name) < 2:
        raise HTTPException(status_code=422, detail="Enter the name of the person collecting")
    _validate_signature(payload.signature_data_url)

    db = request.app.state.db
    signed_at = datetime.now(timezone.utc).isoformat()
    receipt = {
        "id": uid(),
        "signer_name": signer_name,
        "signature_data_url": payload.signature_data_url,
        "signed_at": signed_at,
        "collected_by_user_id": user.id,
        "collected_by_user_name": user.name,
        "method": "in_person_touchscreen",
    }
    # Atomic compare-and-set: protects against double handover and prevents
    # a paid-but-unready or cancelled order from being completed.
    result = await db.orders.update_one(
        {
            "id": order_id,
            "archived": {"$ne": True},
            "status": COLLECTABLE_STATUS,
            "payment_status": "paid",
            "collection_receipt": {"$exists": False},
        },
        {"$set": {
            "status": "completed",
            "updated_at": signed_at,
            "completed_at": signed_at,
            "collection_receipt": receipt,
        }},
    )
    if result.modified_count != 1:
        current = await db.orders.find_one(
            {"id": order_id}, {"_id": 0, "status": 1, "payment_status": 1, "collection_receipt.signed_at": 1}
        )
        if not current:
            raise HTTPException(status_code=404, detail="Order not found")
        if current.get("collection_receipt"):
            raise HTTPException(status_code=409, detail="Order has already been collected")
        raise HTTPException(status_code=409, detail="Only paid orders ready for dispatch can be collected")

    # Audit insertion follows the authoritative atomic order update. A failure
    # here must not erase the receipt or encourage another signature submission.
    try:
        await db.order_events.insert_one({
            "id": uid(),
            "order_id": order_id,
            "actor_user_id": user.id,
            "actor_role": user.role,
            "audience": ["admin"],
            "kind": "order_status_changed",
            "title": "Order collected and signed",
            "message": f"Handed over to {signer_name} by {user.name}.",
            "metadata": {"collection_receipt_id": receipt["id"], "status": "completed"},
            "created_at": signed_at,
        })
    except Exception:
        import logging
        logging.getLogger(__name__).exception("Collection audit event insert failed for order %s", order_id)
    return {"ok": True, "order_id": order_id, "status": "completed", "signed_at": signed_at, "receipt_id": receipt["id"]}


@collection_router.get("/orders/{order_id}/receipt")
async def collection_receipt(order_id: str, request: Request, user: User = Depends(get_current_user)):
    _check_access(user)
    doc = await request.app.state.db.orders.find_one(
        {"id": order_id}, {"_id": 0, "order_number": 1, "collection_receipt": 1}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Order not found")
    receipt = doc.get("collection_receipt")
    if not receipt:
        raise HTTPException(status_code=404, detail="No collection signature recorded")
    return {"order_number": doc.get("order_number"), **receipt}
