"""Authoritative launch-gate wrapper for Printer job assignment."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from auth import get_current_user
from models import User

from .permissions import require_manager_permission
from .printer_ops import AssignJobInput, _item, ensure_job_for_item

printer_gate_router = APIRouter(prefix="/production-jobs", tags=["launch-integrity-production-gate"])


@printer_gate_router.post("/assign")
async def assign_job_authoritatively(
    payload: AssignJobInput,
    request: Request,
    user: User = Depends(get_current_user),
):
    require_manager_permission(user, "manage_orders")
    db = request.app.state.db
    order = await db.orders.find_one({"id": payload.order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    job = await ensure_job_for_item(
        db,
        order=order,
        item=_item(order, payload.order_item_id),
        printer_id=payload.printer_id,
        actor=user,
        reason=payload.reason,
        request=request,
    )
    clean = dict(job or {})
    clean.pop("_id", None)
    return clean
