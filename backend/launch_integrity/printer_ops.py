"""Minimum launch-safe Printer job, exception, QC and reprint operations."""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from auth import get_current_user
from models import Notification, NotificationEmail, User
import routes_main as core

from .audit import write_audit_event
from .entitlements import increment_usage, require_entitlement
from .permissions import require_manager_permission, role_of

printer_ops_router = APIRouter(prefix="/production-jobs", tags=["launch-integrity-production"])


def utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class AssignJobInput(BaseModel):
    order_id: str
    order_item_id: str
    printer_id: str
    reason: str = "Initial assignment"


class ReassignJobInput(BaseModel):
    printer_id: str
    reason: str


class RejectJobInput(BaseModel):
    reason: str


class ProductionStatusInput(BaseModel):
    status: str
    notes: str = ""


class QCInput(BaseModel):
    result: str
    checklist: Dict[str, Any] = Field(default_factory=dict)
    notes: str = ""
    damage_or_failure: bool = False


class ReprintRequestInput(BaseModel):
    reason: str
    quantity: Optional[int] = None


class ReprintApprovalInput(BaseModel):
    approved: bool
    reason: str
    printer_id: Optional[str] = None


class DispatchInput(BaseModel):
    courier_name: str = ""
    tracking_number: str
    tracking_url: str = ""
    waybill_number: str = ""
    notes: str = ""


def _item(order: Dict[str, Any], item_id: str) -> Dict[str, Any]:
    item = next((row for row in order.get("items") or [] if row.get("id") == item_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Order item not found")
    return item


async def _printer_for_user(db, user: User) -> Optional[Dict[str, Any]]:
    printer = await db.printers.find_one({"user_id": user.id}, {"_id": 0})
    if printer:
        return printer
    membership = await db.printer_members.find_one({"user_id": user.id, "status": "active"}, {"_id": 0})
    if membership:
        return await db.printers.find_one({"id": membership.get("printer_id")}, {"_id": 0})
    return None


def _production_payload(order: Dict[str, Any], item: Dict[str, Any]) -> Dict[str, Any]:
    snapshot = deepcopy(item.get("production_snapshot") or {})
    design = deepcopy(snapshot.get("canonical_design_spec") or {})
    commercial = deepcopy(snapshot.get("commercial_snapshot") or item.get("financial_snapshot") or {})
    return {
        "order_id": order.get("id"),
        "order_number": order.get("order_number"),
        "order_item_id": item.get("id"),
        "product_id": item.get("product_id"),
        "product_title": item.get("product_title"),
        "product_version": snapshot.get("product_version"),
        "creator_id": snapshot.get("creator_id") or item.get("band_id"),
        "store_id": snapshot.get("store_id") or item.get("band_id"),
        "template_id": snapshot.get("template_id"),
        "template_version": snapshot.get("template_version"),
        "variation_id": item.get("variation_id"),
        "variation": deepcopy(snapshot.get("variation") or {}),
        "size": item.get("size"),
        "colour": item.get("color"),
        "quantity": max(int(item.get("quantity") or 1), 1),
        "artwork_asset_versions": deepcopy(snapshot.get("artwork_asset_versions") or design.get("assets") or []),
        "text_layers": deepcopy(snapshot.get("text_layers") or design.get("text_layers") or []),
        "print_areas": deepcopy(design.get("print_areas") or []),
        "placement": deepcopy(snapshot.get("placement") or {}),
        "production_operations": deepcopy(snapshot.get("production_operations") or []),
        "production_notes": (snapshot.get("print_option") or {}).get("production_notes") or "",
        "design_sha256": snapshot.get("design_sha256") or design.get("design_sha256"),
        "snapshot_sha256": snapshot.get("snapshot_sha256"),
        "printer_liability": commercial.get("printer_liability") or item.get("printer_payout") or 0,
        "currency": commercial.get("currency") or "ZAR",
        "immutable_order_snapshot": True,
    }


async def ensure_job_for_item(
    db,
    *,
    order: Dict[str, Any],
    item: Dict[str, Any],
    printer_id: str,
    actor: Any = None,
    reason: str = "Initial assignment",
    request: Any = None,
) -> Dict[str, Any]:
    key = f"production-job:{order.get('id')}:{item.get('id')}"
    existing = await db.production_jobs.find_one({"idempotency_key": key}, {"_id": 0})
    if existing:
        if existing.get("printer_id") != printer_id:
            return await reassign_job(db, existing, printer_id, actor, reason, request)
        return existing
    printer = await db.printers.find_one({"id": printer_id}, {"_id": 0})
    if not printer or printer.get("status") != "active":
        raise HTTPException(status_code=400, detail="An active Printer is required")
    await require_entitlement(db, "printer", printer_id, "printer_jobs")
    await require_entitlement(db, "printer", printer_id, "printer_job_limit")
    liability = await db.wallet_transactions.find_one({
        "order_id": order.get("id"),
        "order_item_id": item.get("id"),
        "event_type": "printer_liability",
        "owner_id": printer_id,
    }, {"_id": 0})
    now = utc_iso()
    job = {
        "id": str(uuid.uuid4()),
        "idempotency_key": key,
        "order_id": order.get("id"),
        "order_number": order.get("order_number"),
        "order_item_id": item.get("id"),
        "printer_id": printer_id,
        "original_printer_id": printer_id,
        "creator_id": item.get("band_id"),
        "status": "assigned",
        "acceptance_status": "pending",
        "assignment_reason": reason,
        "production": _production_payload(order, item),
        "qc": None,
        "dispatch": None,
        "failure": None,
        "reprint_of_job_id": None,
        "reprint_of_order_item_id": None,
        "printer_liability_event_id": (liability or {}).get("id"),
        "payout_batch_id": None,
        "created_at": now,
        "updated_at": now,
        "assigned_by_user_id": getattr(actor, "id", None),
        "assigned_by_role": getattr(actor, "role", None),
    }
    await db.production_jobs.insert_one(job)
    await increment_usage(
        db,
        owner_type="printer",
        owner_id=printer_id,
        feature_key="printer_job_limit",
        amount=1,
        idempotency_key=f"printer-job-usage:{job['id']}",
    )
    await write_audit_event(
        db,
        action="printer_job.assign",
        entity_type="production_job",
        entity_id=job["id"],
        actor=actor,
        before=None,
        after={"printer_id": printer_id, "status": "assigned"},
        reason=reason,
        request=request,
        related_creator_id=item.get("band_id"),
        related_printer_id=printer_id,
        related_product_id=item.get("product_id"),
        related_order_id=order.get("id"),
        related_financial_event_id=(liability or {}).get("id"),
    )
    await _notify_job_change(db, job, "Production job assigned", f"Order {order.get('order_number')} has been assigned for production.")
    return job


async def reassign_job(db, job: Dict[str, Any], printer_id: str, actor: Any, reason: str, request: Any = None) -> Dict[str, Any]:
    if not reason.strip():
        raise HTTPException(status_code=400, detail="A reassignment reason is required")
    printer = await db.printers.find_one({"id": printer_id, "status": "active"}, {"_id": 0})
    if not printer:
        raise HTTPException(status_code=400, detail="Replacement Printer must be active")
    before = {"printer_id": job.get("printer_id"), "status": job.get("status")}
    history = list(job.get("assignment_history") or [])
    history.append({
        "from_printer_id": job.get("printer_id"),
        "to_printer_id": printer_id,
        "reason": reason,
        "changed_at": utc_iso(),
        "changed_by_user_id": getattr(actor, "id", None),
        "changed_by_role": getattr(actor, "role", None),
    })
    patch = {
        "printer_id": printer_id,
        "status": "assigned",
        "acceptance_status": "pending",
        "rejection_reason": None,
        "assignment_history": history,
        "updated_at": utc_iso(),
    }
    await db.production_jobs.update_one({"id": job.get("id")}, {"$set": patch})
    await write_audit_event(
        db,
        action="printer_job.reassign",
        entity_type="production_job",
        entity_id=job.get("id"),
        actor=actor,
        before=before,
        after=patch,
        reason=reason,
        request=request,
        related_creator_id=job.get("creator_id"),
        related_printer_id=printer_id,
        related_order_id=job.get("order_id"),
    )
    job.update(patch)
    await _notify_job_change(db, job, "Production job reassigned", reason)
    return job


async def _notify_job_change(db, job: Dict[str, Any], title: str, message: str, customer: bool = False) -> None:
    key = f"production-job:{job.get('id')}:{title}:{job.get('status')}:{job.get('updated_at')}"
    if await db.notifications.find_one({"metadata.delivery_key": key}, {"_id": 1}):
        return
    recipients: List[Dict[str, Any]] = []
    printer = await db.printers.find_one({"id": job.get("printer_id")}, {"_id": 0})
    if printer and printer.get("user_id"):
        user = await db.users.find_one({"id": printer.get("user_id")}, {"_id": 0})
        if user:
            recipients.append(user)
    creator = await db.creators.find_one({"id": job.get("creator_id")}, {"_id": 0})
    if creator and creator.get("user_id"):
        user = await db.users.find_one({"id": creator.get("user_id")}, {"_id": 0})
        if user:
            recipients.append(user)
    admins = await db.users.find({"role": {"$in": ["owner", "super_admin", "admin"]}, "status": {"$ne": "archived"}}, {"_id": 0}).to_list(100)
    recipients.extend(admins)
    seen = set()
    for recipient in recipients:
        if recipient.get("id") in seen:
            continue
        seen.add(recipient.get("id"))
        notice = Notification(
            recipient_user_id=recipient.get("id"),
            recipient_role=recipient.get("role"),
            recipient_email=recipient.get("email"),
            title=title,
            message=message,
            type="production",
            event_kind="production_job_updated",
            link_url="/printer" if recipient.get("role") == "printer" else "/admin/orders",
            related_order_id=job.get("order_id"),
            related_order_item_id=job.get("order_item_id"),
            band_id=job.get("creator_id"),
            printer_id=job.get("printer_id"),
            metadata={"delivery_key": f"{key}:{recipient.get('id')}", "production_job_id": job.get("id")},
        )
        await db.notifications.insert_one(core.notification_doc(notice))
        if recipient.get("email"):
            email = NotificationEmail(
                notification_id=notice.id,
                recipient_user_id=recipient.get("id"),
                recipient_email=recipient.get("email"),
                subject=title,
                body=message,
                status="queued",
            )
            await db.notification_emails.insert_one(core.notification_email_doc(email))
    if customer:
        order = await db.orders.find_one({"id": job.get("order_id")}, {"_id": 0})
        if order and order.get("buyer_email"):
            email = NotificationEmail(
                notification_id=None,
                recipient_user_id=order.get("buyer_id"),
                recipient_email=order.get("buyer_email"),
                subject=title,
                body=message,
                status="queued",
            )
            doc = core.notification_email_doc(email)
            doc["delivery_key"] = f"{key}:customer"
            await db.notification_emails.update_one({"delivery_key": doc["delivery_key"]}, {"$setOnInsert": doc}, upsert=True)


async def ensure_printer_ops_indexes(db) -> None:
    await db.production_jobs.create_index([("idempotency_key", 1)], unique=True)
    await db.production_jobs.create_index([("printer_id", 1), ("status", 1), ("updated_at", -1)])
    await db.production_jobs.create_index([("order_id", 1), ("order_item_id", 1)], unique=True, partialFilterExpression={"reprint_of_job_id": None})
    await db.production_jobs.create_index([("reprint_of_job_id", 1)], sparse=True)


@printer_ops_router.post("/assign")
async def assign_job(payload: AssignJobInput, request: Request, user: User = Depends(get_current_user)):
    require_manager_permission(user, "manage_orders")
    db = request.app.state.db
    order = await db.orders.find_one({"id": payload.order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return await ensure_job_for_item(
        db, order=order, item=_item(order, payload.order_item_id), printer_id=payload.printer_id,
        actor=user, reason=payload.reason, request=request,
    )


@printer_ops_router.get("")
async def list_jobs(request: Request, status: Optional[str] = None, user: User = Depends(get_current_user)):
    db = request.app.state.db
    query: Dict[str, Any] = {}
    if role_of(user) == "printer":
        printer = await _printer_for_user(db, user)
        if not printer:
            raise HTTPException(status_code=404, detail="Printer account not found")
        query["printer_id"] = printer.get("id")
    else:
        require_manager_permission(user, "manage_orders")
    if status:
        query["status"] = status
    return await db.production_jobs.find(query, {"_id": 0}).sort("updated_at", -1).to_list(1000)


@printer_ops_router.get("/{job_id}")
async def get_job(job_id: str, request: Request, user: User = Depends(get_current_user)):
    db = request.app.state.db
    job = await db.production_jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Production job not found")
    if role_of(user) == "printer":
        printer = await _printer_for_user(db, user)
        if not printer or printer.get("id") != job.get("printer_id"):
            raise HTTPException(status_code=403, detail="This job is assigned to another Printer")
    else:
        require_manager_permission(user, "manage_orders")
    return job


@printer_ops_router.post("/{job_id}/accept")
async def accept_job(job_id: str, request: Request, user: User = Depends(get_current_user)):
    db = request.app.state.db
    printer = await _printer_for_user(db, user)
    job = await db.production_jobs.find_one({"id": job_id}, {"_id": 0})
    if not printer or not job or job.get("printer_id") != printer.get("id"):
        raise HTTPException(status_code=403, detail="Job is not assigned to this Printer")
    await require_entitlement(db, "printer", printer.get("id"), "printer_jobs")
    patch = {"status": "accepted", "acceptance_status": "accepted", "accepted_at": utc_iso(), "updated_at": utc_iso()}
    await db.production_jobs.update_one({"id": job_id, "acceptance_status": "pending"}, {"$set": patch})
    await write_audit_event(db, action="printer_job.accept", entity_type="production_job", entity_id=job_id, actor=user, before={"status": job.get("status")}, after=patch, request=request, related_printer_id=printer.get("id"), related_order_id=job.get("order_id"))
    job.update(patch)
    await _notify_job_change(db, job, "Production job accepted", "The assigned Printer accepted the job.")
    return job


@printer_ops_router.post("/{job_id}/reject")
async def reject_job(job_id: str, payload: RejectJobInput, request: Request, user: User = Depends(get_current_user)):
    if not payload.reason.strip():
        raise HTTPException(status_code=400, detail="A rejection reason is required")
    db = request.app.state.db
    printer = await _printer_for_user(db, user)
    job = await db.production_jobs.find_one({"id": job_id}, {"_id": 0})
    if not printer or not job or job.get("printer_id") != printer.get("id"):
        raise HTTPException(status_code=403, detail="Job is not assigned to this Printer")
    patch = {"status": "rejected", "acceptance_status": "rejected", "rejection_reason": payload.reason, "rejected_at": utc_iso(), "updated_at": utc_iso()}
    await db.production_jobs.update_one({"id": job_id}, {"$set": patch})
    await write_audit_event(db, action="printer_job.reject", entity_type="production_job", entity_id=job_id, actor=user, before={"status": job.get("status")}, after=patch, reason=payload.reason, request=request, related_printer_id=printer.get("id"), related_order_id=job.get("order_id"))
    job.update(patch)
    await _notify_job_change(db, job, "Printer rejected production job", payload.reason)
    return job


@printer_ops_router.post("/{job_id}/reassign")
async def admin_reassign(job_id: str, payload: ReassignJobInput, request: Request, user: User = Depends(get_current_user)):
    require_manager_permission(user, "manage_orders")
    db = request.app.state.db
    job = await db.production_jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Production job not found")
    return await reassign_job(db, job, payload.printer_id, user, payload.reason, request)


@printer_ops_router.post("/{job_id}/status")
async def update_status(job_id: str, payload: ProductionStatusInput, request: Request, user: User = Depends(get_current_user)):
    allowed = {"accepted", "in_production", "ready_for_qc", "qc_failed", "ready_for_dispatch", "dispatched", "completed", "production_failed"}
    if payload.status not in allowed:
        raise HTTPException(status_code=400, detail="Invalid production status")
    db = request.app.state.db
    job = await db.production_jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Production job not found")
    if role_of(user) == "printer":
        printer = await _printer_for_user(db, user)
        if not printer or printer.get("id") != job.get("printer_id"):
            raise HTTPException(status_code=403, detail="Job is assigned to another Printer")
    else:
        require_manager_permission(user, "manage_orders")
    patch = {"status": payload.status, "production_notes": payload.notes, "updated_at": utc_iso()}
    if payload.status == "production_failed":
        patch["failure"] = {"reason": payload.notes or "Production failed", "reported_at": utc_iso(), "reported_by_user_id": user.id}
    await db.production_jobs.update_one({"id": job_id}, {"$set": patch})
    await write_audit_event(db, action="printer_job.status", entity_type="production_job", entity_id=job_id, actor=user, before={"status": job.get("status")}, after=patch, reason=payload.notes, request=request, related_printer_id=job.get("printer_id"), related_order_id=job.get("order_id"))
    job.update(patch)
    await _notify_job_change(db, job, "Production status updated", f"Production status is now {payload.status.replace('_', ' ')}.", customer=payload.status in {"in_production", "ready_for_dispatch", "dispatched"})
    return job


@printer_ops_router.post("/{job_id}/qc")
async def record_qc(job_id: str, payload: QCInput, request: Request, user: User = Depends(get_current_user)):
    if payload.result not in {"passed", "failed", "conditional"}:
        raise HTTPException(status_code=400, detail="QC result must be passed, failed or conditional")
    db = request.app.state.db
    job = await db.production_jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Production job not found")
    if role_of(user) == "printer":
        printer = await _printer_for_user(db, user)
        if not printer or printer.get("id") != job.get("printer_id"):
            raise HTTPException(status_code=403, detail="Job is assigned to another Printer")
    else:
        require_manager_permission(user, "manage_orders")
    qc = {"result": payload.result, "checklist": payload.checklist, "notes": payload.notes, "damage_or_failure": payload.damage_or_failure, "recorded_at": utc_iso(), "recorded_by_user_id": user.id, "recorded_by_role": user.role}
    status = "ready_for_dispatch" if payload.result == "passed" else "qc_failed"
    patch = {"qc": qc, "status": status, "updated_at": utc_iso()}
    await db.production_jobs.update_one({"id": job_id}, {"$set": patch})
    await write_audit_event(db, action="printer_job.qc", entity_type="production_job", entity_id=job_id, actor=user, before=job.get("qc"), after=qc, reason=payload.notes, request=request, related_printer_id=job.get("printer_id"), related_order_id=job.get("order_id"))
    job.update(patch)
    await _notify_job_change(db, job, "Production QC recorded", f"QC result: {payload.result}. {payload.notes}")
    return job


@printer_ops_router.post("/{job_id}/reprint-request")
async def request_reprint(job_id: str, payload: ReprintRequestInput, request: Request, user: User = Depends(get_current_user)):
    if not payload.reason.strip():
        raise HTTPException(status_code=400, detail="A reprint reason is required")
    db = request.app.state.db
    job = await db.production_jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Production job not found")
    if role_of(user) == "printer":
        printer = await _printer_for_user(db, user)
        if not printer or printer.get("id") != job.get("printer_id"):
            raise HTTPException(status_code=403, detail="Job is assigned to another Printer")
    else:
        require_manager_permission(user, "manage_orders")
    request_doc = {"id": str(uuid.uuid4()), "reason": payload.reason, "quantity": payload.quantity or (job.get("production") or {}).get("quantity") or 1, "status": "pending", "requested_at": utc_iso(), "requested_by_user_id": user.id, "requested_by_role": user.role}
    await db.production_jobs.update_one({"id": job_id}, {"$set": {"reprint_request": request_doc, "status": "reprint_requested", "updated_at": utc_iso()}})
    await write_audit_event(db, action="reprint.request", entity_type="production_job", entity_id=job_id, actor=user, before=None, after=request_doc, reason=payload.reason, request=request, related_printer_id=job.get("printer_id"), related_order_id=job.get("order_id"))
    job.update({"reprint_request": request_doc, "status": "reprint_requested", "updated_at": utc_iso()})
    await _notify_job_change(db, job, "Reprint requested", payload.reason)
    return job


@printer_ops_router.post("/{job_id}/reprint-approval")
async def approve_reprint(job_id: str, payload: ReprintApprovalInput, request: Request, user: User = Depends(get_current_user)):
    require_manager_permission(user, "manage_orders")
    db = request.app.state.db
    job = await db.production_jobs.find_one({"id": job_id}, {"_id": 0})
    if not job or not job.get("reprint_request"):
        raise HTTPException(status_code=404, detail="Pending reprint request not found")
    approval = {"approved": payload.approved, "reason": payload.reason, "approved_at": utc_iso(), "approved_by_user_id": user.id, "approved_by_role": user.role}
    await db.production_jobs.update_one({"id": job_id}, {"$set": {"reprint_request.status": "approved" if payload.approved else "declined", "reprint_approval": approval, "updated_at": utc_iso()}})
    reprint_job = None
    if payload.approved:
        printer_id = payload.printer_id or job.get("printer_id")
        source = deepcopy(job)
        source.pop("_id", None)
        reprint_job = {
            **source,
            "id": str(uuid.uuid4()),
            "idempotency_key": f"reprint-job:{job_id}:{job.get('reprint_request', {}).get('id')}",
            "printer_id": printer_id,
            "original_printer_id": job.get("original_printer_id") or job.get("printer_id"),
            "status": "assigned",
            "acceptance_status": "pending",
            "reprint_of_job_id": job_id,
            "reprint_of_order_item_id": job.get("order_item_id"),
            "reprint_request": None,
            "reprint_approval": approval,
            "qc": None,
            "dispatch": None,
            "failure": None,
            "created_at": utc_iso(),
            "updated_at": utc_iso(),
            "assigned_by_user_id": user.id,
            "assigned_by_role": user.role,
        }
        await db.production_jobs.update_one({"idempotency_key": reprint_job["idempotency_key"]}, {"$setOnInsert": reprint_job}, upsert=True)
        reprint_job = await db.production_jobs.find_one({"idempotency_key": reprint_job["idempotency_key"]}, {"_id": 0})
    await write_audit_event(db, action="reprint.approve" if payload.approved else "reprint.decline", entity_type="production_job", entity_id=job_id, actor=user, before=job.get("reprint_request"), after={"approval": approval, "reprint_job_id": (reprint_job or {}).get("id")}, reason=payload.reason, request=request, related_printer_id=(reprint_job or job).get("printer_id"), related_order_id=job.get("order_id"))
    await _notify_job_change(db, job, "Reprint decision recorded", payload.reason)
    return {"original_job": await db.production_jobs.find_one({"id": job_id}, {"_id": 0}), "reprint_job": reprint_job}


@printer_ops_router.post("/{job_id}/dispatch")
async def dispatch_job(job_id: str, payload: DispatchInput, request: Request, user: User = Depends(get_current_user)):
    if not payload.tracking_number.strip():
        raise HTTPException(status_code=400, detail="Tracking number is required")
    db = request.app.state.db
    job = await db.production_jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Production job not found")
    if role_of(user) == "printer":
        printer = await _printer_for_user(db, user)
        if not printer or printer.get("id") != job.get("printer_id"):
            raise HTTPException(status_code=403, detail="Job is assigned to another Printer")
    else:
        require_manager_permission(user, "manage_orders")
    dispatch = {"courier_name": payload.courier_name, "tracking_number": payload.tracking_number, "tracking_url": payload.tracking_url, "waybill_number": payload.waybill_number, "notes": payload.notes, "dispatched_at": utc_iso(), "recorded_by_user_id": user.id, "recorded_by_role": user.role}
    patch = {"dispatch": dispatch, "status": "dispatched", "updated_at": utc_iso()}
    await db.production_jobs.update_one({"id": job_id}, {"$set": patch})
    await db.orders.update_one({"id": job.get("order_id")}, {"$set": {"updated_at": utc_iso(), "operational_tracking_updated_at": utc_iso()}})
    await write_audit_event(db, action="printer_job.dispatch", entity_type="production_job", entity_id=job_id, actor=user, before=job.get("dispatch"), after=dispatch, reason=payload.notes, request=request, related_printer_id=job.get("printer_id"), related_order_id=job.get("order_id"), related_financial_event_id=job.get("printer_liability_event_id"))
    job.update(patch)
    await _notify_job_change(db, job, "Order dispatched", f"Tracking number: {payload.tracking_number}", customer=True)
    return job
