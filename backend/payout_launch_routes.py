"""Launch-ready creator payout routes and Paystack transfer hardening.

This module is intentionally additive. It does not rewrite historical finance
records or require a destructive migration. It provides the creator self-service,
Friday batch, transfer reconciliation, notification and refund-adjustment layer
needed for launch while retaining the existing wallet ledger as source of truth.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from pymongo.errors import DuplicateKeyError

from auth import get_current_user
from models import (
    Notification,
    NotificationEmail,
    PayoutProfile,
    User,
    WalletTransaction,
    uid,
    utcnow,
)
import routes_main as core


logger = logging.getLogger("fandomforge.payouts")
payout_launch_router = APIRouter()
ZA_TZ = timezone(timedelta(hours=2))


class CreatorPayoutProfileInput(BaseModel):
    account_name: str
    bank_name: str = ""
    bank_code: str
    account_number: str
    email: Optional[EmailStr] = None
    phone: str = ""


class FridayPayoutBatchInput(BaseModel):
    title: Optional[str] = None
    min_amount: float = Field(default=1, ge=0)


class PayoutPaystackSettingsInput(BaseModel):
    enabled: Optional[bool] = None
    mode: Optional[str] = None
    public_key: Optional[str] = None
    secret_key: Optional[str] = None
    clear_secret_key: bool = False


class WalletAdjustmentInput(BaseModel):
    owner_type: str = "creator"
    owner_id: str
    amount: float
    adjustment_type: str = "adjustment"
    description: str
    order_id: Optional[str] = None
    order_item_id: Optional[str] = None
    idempotency_key: str


def _iso(value: Any) -> Any:
    return value.isoformat() if isinstance(value, datetime) else value


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _local_today():
    return datetime.now(ZA_TZ).date()


def _next_or_current_friday():
    today = _local_today()
    return today + timedelta(days=(4 - today.weekday()) % 7)


def _friday_key(value=None) -> str:
    friday = value or _next_or_current_friday()
    return f"creator-paystack-friday:{friday.isoformat()}"


def _clean_account(value: str) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit())


def _clean_bank_code(value: str) -> str:
    return "".join(ch for ch in str(value or "") if ch.isalnum())


def _safe_reference(batch_id: str, item_id: str, attempt: int) -> str:
    # Paystack references must be unique and use lowercase letters, digits,
    # hyphens or underscores. Hashing keeps the reference deterministic for a
    # single attempt while staying inside the provider's length limits.
    digest = hashlib.sha256(f"{batch_id}:{item_id}:{attempt}".encode("utf-8")).hexdigest()[:20]
    return f"ff_payout_{digest}_{attempt}"[:50]


def _require_payout_admin(user: User) -> None:
    core._require_manager_permission(user, "manage_payouts")


async def ensure_payout_launch_indexes(db) -> None:
    """Create only safe, non-destructive indexes used by launch payout queries."""
    await db.wallet_transactions.create_index(
        [("owner_type", 1), ("owner_id", 1), ("status", 1)],
        name="wallet_owner_status",
    )
    await db.wallet_transactions.create_index(
        [("order_id", 1), ("order_item_id", 1), ("type", 1)],
        name="wallet_order_item_type",
    )
    await db.payout_profiles.create_index(
        [("owner_type", 1), ("owner_id", 1), ("provider", 1), ("is_default", 1)],
        name="payout_profile_owner_provider",
    )
    await db.payout_batches.create_index(
        [("batch_key", 1)],
        name="payout_batch_key",
        sparse=True,
    )
    await db.payout_batches.create_index(
        [("items.provider_reference", 1)],
        name="payout_item_reference",
        sparse=True,
    )


async def _creator_for_user(db, user: User) -> dict:
    return await core.get_creator_account_for_user(db, user, permission="view_earnings")


async def _owner_user_and_email(db, owner_type: str, owner_id: str) -> tuple[Optional[str], Optional[str]]:
    if owner_type != "creator":
        return None, None
    creator = await db.creators.find_one({"id": owner_id}, {"_id": 0})
    if not creator:
        return None, None
    user_id = creator.get("user_id")
    email = creator.get("contact_email")
    if user_id:
        user = await db.users.find_one({"id": user_id}, {"_id": 0, "email": 1})
        email = email or (user or {}).get("email")
    return user_id, email


async def _queue_payout_notice(
    db,
    *,
    event_key: str,
    owner_type: str,
    owner_id: str,
    title: str,
    message: str,
    status: str,
    batch_id: str,
    batch_item_id: str,
    notify_admin: bool = False,
) -> None:
    existing = await db.notifications.find_one(
        {"metadata.payout_event_key": event_key},
        {"_id": 1},
    )
    if existing:
        return

    user_id, email = await _owner_user_and_email(db, owner_type, owner_id)
    metadata = {
        "payout_event_key": event_key,
        "payout_batch_id": batch_id,
        "payout_batch_item_id": batch_item_id,
        "payout_status": status,
    }
    notification = Notification(
        recipient_user_id=user_id,
        recipient_role="creator" if owner_type == "creator" else owner_type,
        recipient_email=email,
        title=title,
        message=message,
        type="payment",
        event_kind=f"payout_{status}",
        link_url="/creator/earnings" if owner_type == "creator" else "/admin/billing",
        band_id=owner_id if owner_type == "creator" else None,
        metadata=metadata,
    )
    await db.notifications.insert_one(core.notification_doc(notification))

    if email:
        email_doc = NotificationEmail(
            notification_id=notification.id,
            recipient_user_id=user_id,
            recipient_email=email,
            subject=title,
            body=message,
            status="queued",
        )
        await db.notification_emails.insert_one(core.notification_email_doc(email_doc))

    if notify_admin:
        admin_event = f"{event_key}:admin"
        if not await db.notifications.find_one({"metadata.payout_event_key": admin_event}, {"_id": 1}):
            admin_notice = Notification(
                recipient_role="admin",
                title=title,
                message=message,
                type="payment",
                event_kind=f"payout_{status}",
                link_url="/admin/billing",
                metadata={**metadata, "payout_event_key": admin_event},
            )
            await db.notifications.insert_one(core.notification_doc(admin_notice))


async def _default_paystack_profile(db, owner_type: str, owner_id: str) -> Optional[dict]:
    profile = await db.payout_profiles.find_one(
        {
            "owner_type": owner_type,
            "owner_id": owner_id,
            "provider": "paystack",
            "is_default": True,
        },
        {"_id": 0},
    )
    if profile:
        return profile
    return await db.payout_profiles.find_one(
        {"owner_type": owner_type, "owner_id": owner_id, "provider": "paystack"},
        {"_id": 0},
    )


def _profile_ready(profile: Optional[dict]) -> bool:
    return bool(
        profile
        and profile.get("provider") == "paystack"
        and profile.get("verification_status") == "verified"
        and profile.get("paystack_recipient_code")
    )


async def _recalculate_batch(db, batch: dict, *, now: Optional[str] = None) -> dict:
    items = batch.get("items") or []
    statuses = [item.get("status") or "pending" for item in items]
    now = now or _now_iso()

    if items and all(status == "paid" for status in statuses):
        batch_status = "paid"
    elif any(status == "processing" for status in statuses):
        batch_status = "processing"
    elif any(status == "paid" for status in statuses) and any(status in {"failed", "reversed"} for status in statuses):
        batch_status = "partial"
    elif items and all(status in {"failed", "reversed"} for status in statuses):
        batch_status = "failed"
    elif batch.get("status") == "approved":
        batch_status = "approved"
    else:
        batch_status = "draft"

    patch = {
        "items": items,
        "status": batch_status,
        "total_amount": round(sum(float(item.get("amount") or 0) for item in items), 2),
        "updated_at": now,
        "last_reconciled_at": now,
    }
    if batch_status == "paid":
        patch["paid_at"] = batch.get("paid_at") or now
    await db.payout_batches.update_one({"id": batch["id"]}, {"$set": patch})
    batch.update(patch)
    return batch


async def _set_item_status(
    db,
    batch: dict,
    item: dict,
    status: str,
    *,
    failure_reason: Optional[str] = None,
    provider_data: Optional[dict] = None,
    webhook_event: Optional[str] = None,
) -> None:
    now = _now_iso()
    original_status = status
    if status == "reversed":
        status = "failed"
        failure_reason = failure_reason or "Paystack reversed the transfer"
    item["status"] = status
    item["failure_reason"] = failure_reason
    item["webhook_event"] = webhook_event or item.get("webhook_event")
    item["metadata"] = {
        **(item.get("metadata") or {}),
        "provider_outcome": original_status,
    }
    item["metadata"] = {
        **(item.get("metadata") or {}),
        **({"paystack_response": provider_data} if provider_data is not None else {}),
    }

    wallet_ids = item.get("wallet_transaction_ids") or []
    wallet_patch: Dict[str, Any] = {
        "metadata.payout_status": status,
        "metadata.payout_reference": item.get("provider_reference"),
        "metadata.payout_batch_id": batch.get("id"),
    }

    if status == "paid":
        item["paid_at"] = now
        wallet_patch.update({"status": "paid", "paid_at": now})
    elif status in {"failed", "reversed"}:
        item[f"{status}_at"] = now
        # Earnings remain owed after a failed/reversed transfer. Keep them tied
        # to the batch so another batch cannot pay the same ledger rows.
        wallet_patch.update({"status": "in_batch", "paid_at": None})
    else:
        wallet_patch["status"] = "in_batch"

    if wallet_ids:
        await db.wallet_transactions.update_many(
            {"id": {"$in": wallet_ids}},
            {"$set": wallet_patch},
        )

    event_key = f"{batch.get('id')}:{item.get('id')}:{status}:{item.get('attempt_count', 0)}"
    owner_name = (item.get("metadata") or {}).get("owner_name") or "Creator"
    amount_text = f"R {float(item.get('amount') or 0):.2f}"

    if status == "paid":
        await _queue_payout_notice(
            db,
            event_key=event_key,
            owner_type=item.get("owner_type"),
            owner_id=item.get("owner_id"),
            title="FandomForge payout sent",
            message=f"{owner_name}, your {amount_text} creator payout was processed through Paystack.",
            status="paid",
            batch_id=batch.get("id"),
            batch_item_id=item.get("id"),
        )
    elif status in {"failed", "reversed"}:
        reason = failure_reason or "Paystack did not complete the transfer."
        await _queue_payout_notice(
            db,
            event_key=event_key,
            owner_type=item.get("owner_type"),
            owner_id=item.get("owner_id"),
            title="FandomForge payout needs attention",
            message=f"{owner_name}, your {amount_text} payout could not be completed. {reason}",
            status=status,
            batch_id=batch.get("id"),
            batch_item_id=item.get("id"),
            notify_admin=True,
        )


async def _paystack_transfer_status(db, reference: str) -> tuple[str, dict]:
    response = await core._paystack_request(db, "GET", f"/transfer/verify/{reference}")
    data = response.get("data") or {}
    raw = str(data.get("status") or "").lower()
    if raw in {"success", "successful"}:
        return "paid", data
    if raw in {"failed", "failure"}:
        return "failed", data
    if raw in {"reversed", "reverse"}:
        return "reversed", data
    return "processing", data


async def _reconcile_refunded_orders(db) -> dict:
    """Apply non-destructive creator-ledger corrections for fully refunded orders."""
    adjusted = 0
    held = 0
    cursor = db.orders.find(
        {"$or": [{"status": "refunded"}, {"payment_status": "refunded"}]},
        {"_id": 0, "id": 1, "order_number": 1},
    )
    async for order in cursor:
        transactions = await db.wallet_transactions.find(
            {
                "order_id": order.get("id"),
                "owner_type": "creator",
                "type": "creator_earning",
            },
            {"_id": 0},
        ).to_list(1000)

        for original in transactions:
            original_id = original.get("id")
            if not original_id:
                continue
            refund_key = f"refund:{original_id}"
            if await db.wallet_transactions.find_one({"source_id": refund_key}, {"_id": 1}):
                continue

            status = original.get("status")
            if status in {"available", "pending", "failed"}:
                await db.wallet_transactions.update_one(
                    {"id": original_id},
                    {"$set": {
                        "status": "reversed",
                        "metadata.refund_order_id": order.get("id"),
                        "metadata.refund_reconciled_at": _now_iso(),
                    }},
                )
                held += 1
                continue

            if status == "in_batch":
                batch = await db.payout_batches.find_one(
                    {"id": original.get("payout_batch_id")},
                    {"_id": 0},
                )
                if batch:
                    for item in batch.get("items") or []:
                        if original_id in (item.get("wallet_transaction_ids") or []):
                            ids = [value for value in item.get("wallet_transaction_ids") or [] if value != original_id]
                            item["wallet_transaction_ids"] = ids
                            item["amount"] = round(float(item.get("amount") or 0) - float(original.get("amount") or 0), 2)
                            if item["amount"] <= 0:
                                item["status"] = "failed"
                                item["failure_reason"] = "Order refunded before payout"
                            break
                    await _recalculate_batch(db, batch)
                await db.wallet_transactions.update_one(
                    {"id": original_id},
                    {"$set": {
                        "status": "reversed",
                        "metadata.refund_order_id": order.get("id"),
                        "metadata.refund_reconciled_at": _now_iso(),
                    }},
                )
                held += 1
                continue

            if status == "paid":
                refund = WalletTransaction(
                    owner_type="creator",
                    owner_id=original.get("owner_id"),
                    order_id=original.get("order_id"),
                    order_number=original.get("order_number"),
                    order_item_id=original.get("order_item_id"),
                    amount=-abs(float(original.get("amount") or 0)),
                    type="refund",
                    status="available",
                    description=f"Refund adjustment for order {order.get('order_number') or order.get('id')}",
                    source_collection="wallet_transactions",
                    source_id=refund_key,
                    metadata={
                        "original_wallet_transaction_id": original_id,
                        "refund_order_id": order.get("id"),
                    },
                )
                await db.wallet_transactions.insert_one(core.iso_dates(refund.model_dump()))
                adjusted += 1

    return {"adjustments_created": adjusted, "unpaid_earnings_reversed": held}


async def _create_friday_batch(db, user: User, payload: FridayPayoutBatchInput) -> dict:
    await core.rebuild_wallet_ledger_from_paid_orders(db)
    refund_result = await _reconcile_refunded_orders(db)

    scheduled_for = _next_or_current_friday()
    batch_key = _friday_key(scheduled_for)
    existing = await db.payout_batches.find_one({"batch_key": batch_key}, {"_id": 0})
    if existing:
        return {**existing, "already_exists": True, "refund_reconciliation": refund_result}

    ledger = await db.wallet_transactions.find(
        {
            "status": "available",
            "owner_type": "creator",
            "type": {"$in": ["creator_earning", "refund", "reversal", "adjustment"]},
        },
        {"_id": 0},
    ).to_list(20000)

    grouped: Dict[str, dict] = {}
    for row in ledger:
        owner_id = row.get("owner_id")
        if not owner_id:
            continue
        bucket = grouped.setdefault(
            owner_id,
            {"owner_id": owner_id, "amount": 0.0, "wallet_transaction_ids": []},
        )
        bucket["amount"] += float(row.get("amount") or 0)
        bucket["wallet_transaction_ids"].append(row.get("id"))

    items: List[dict] = []
    skipped: List[dict] = []

    for bucket in grouped.values():
        amount = round(bucket["amount"], 2)
        if amount < float(payload.min_amount or 0):
            skipped.append({
                "owner_type": "creator",
                "owner_id": bucket["owner_id"],
                "amount": amount,
                "reason": "Amount below payout minimum after adjustments",
            })
            continue

        profile = await _default_paystack_profile(db, "creator", bucket["owner_id"])
        owner_name = await core._owner_display_name(db, "creator", bucket["owner_id"])
        if not _profile_ready(profile):
            skipped.append({
                "owner_type": "creator",
                "owner_id": bucket["owner_id"],
                "owner_name": owner_name,
                "amount": amount,
                "reason": "A linked and verified Paystack payout account is required",
            })
            continue

        items.append({
            "id": uid(),
            "owner_type": "creator",
            "owner_id": bucket["owner_id"],
            "payout_profile_id": profile.get("id"),
            "provider": "paystack",
            "amount": amount,
            "currency": "ZAR",
            "wallet_transaction_ids": bucket["wallet_transaction_ids"],
            "status": "pending",
            "provider_reference": None,
            "provider_transfer_code": None,
            "failure_reason": None,
            "attempt_count": 0,
            "metadata": {
                "owner_name": owner_name,
                "owner_label": core._public_owner_label("creator", bucket["owner_id"]),
            },
        })

    batch_id = uid()
    now = _now_iso()
    batch = {
        "_id": batch_key,
        "id": batch_id,
        "batch_key": batch_key,
        "scheduled_for": scheduled_for.isoformat(),
        "title": payload.title or f"Friday creator payouts {scheduled_for.isoformat()}",
        "provider": "paystack",
        "owner_type": "creator",
        "status": "draft",
        "currency": "ZAR",
        "items": items,
        "skipped_items": skipped,
        "total_amount": round(sum(float(item["amount"]) for item in items), 2),
        "created_by_user_id": user.id,
        "approved_by_user_id": None,
        "created_at": now,
        "updated_at": now,
        "approved_at": None,
        "paid_at": None,
        "notes": "",
        "refund_reconciliation": refund_result,
    }

    try:
        await db.payout_batches.insert_one(batch)
    except DuplicateKeyError:
        existing = await db.payout_batches.find_one({"_id": batch_key}, {"_id": 0})
        return {**(existing or {}), "already_exists": True}

    for item in items:
        result = await db.wallet_transactions.update_many(
            {
                "id": {"$in": item["wallet_transaction_ids"]},
                "status": "available",
            },
            {"$set": {
                "status": "in_batch",
                "payout_batch_id": batch_id,
                "payout_batch_item_id": item["id"],
            }},
        )
        if result.modified_count != len(item["wallet_transaction_ids"]):
            item["status"] = "failed"
            item["failure_reason"] = "Ledger changed while the batch was being created"
            await db.wallet_transactions.update_many(
                {
                    "payout_batch_id": batch_id,
                    "payout_batch_item_id": item["id"],
                },
                {"$set": {
                    "status": "available",
                    "payout_batch_id": None,
                    "payout_batch_item_id": None,
                }},
            )

    await db.payout_batches.update_one(
        {"id": batch_id},
        {"$set": {"items": items, "updated_at": _now_iso()}},
    )
    clean_batch = {key: value for key, value in batch.items() if key != "_id"}
    clean_batch["items"] = items
    return await _recalculate_batch(db, clean_batch)


async def _send_or_retry_batch(
    db,
    batch: dict,
    *,
    retry_failed_only: bool = False,
    allow_off_cycle_retry: bool = False,
) -> dict:
    if batch.get("status") not in {"approved", "processing", "partial", "failed"}:
        raise HTTPException(status_code=400, detail="Approve the payout batch before sending it")

    scheduled_for = batch.get("scheduled_for")
    initial_send = not batch.get("first_sent_at")
    if initial_send and not allow_off_cycle_retry and scheduled_for and _local_today().isoformat() != scheduled_for:
        raise HTTPException(
            status_code=400,
            detail=f"This creator payout batch is scheduled for Friday {scheduled_for}",
        )

    await _reconcile_refunded_orders(db)
    batch = await db.payout_batches.find_one({"id": batch["id"]}, {"_id": 0}) or batch
    items = batch.get("items") or []
    if initial_send:
        batch["first_sent_at"] = _now_iso()
        await db.payout_batches.update_one(
            {"id": batch["id"]},
            {"$set": {"first_sent_at": batch["first_sent_at"], "updated_at": _now_iso()}},
        )

    for item in items:
        current_status = item.get("status")
        if current_status == "paid":
            continue
        if retry_failed_only and current_status not in {"failed", "reversed"}:
            continue

        profile = await db.payout_profiles.find_one(
            {"id": item.get("payout_profile_id")},
            {"_id": 0},
        )
        if not _profile_ready(profile):
            await _set_item_status(
                db,
                batch,
                item,
                "failed",
                failure_reason="Linked Paystack payout account is missing or not verified",
            )
            continue

        if current_status == "processing" and item.get("provider_reference"):
            try:
                status, data = await _paystack_transfer_status(db, item["provider_reference"])
                await _set_item_status(db, batch, item, status, provider_data=data)
            except HTTPException as exc:
                item["failure_reason"] = str(exc.detail)
            continue

        attempt = int(item.get("attempt_count") or 0) + 1
        reference = _safe_reference(batch["id"], item["id"], attempt)
        item["attempt_count"] = attempt
        item["last_attempt_at"] = _now_iso()
        item["provider_reference"] = reference
        item["status"] = "processing"
        item["failure_reason"] = None

        # Persist the reference before the external call. A repeated request will
        # verify this reference instead of initiating a duplicate transfer.
        await db.payout_batches.update_one(
            {"id": batch["id"]},
            {"$set": {"items": items, "status": "processing", "updated_at": _now_iso()}},
        )

        request_payload = {
            "source": "balance",
            "amount": int(round(float(item.get("amount") or 0) * 100)),
            "recipient": profile.get("paystack_recipient_code"),
            "reason": f"FandomForge Friday creator payout {batch.get('scheduled_for')}",
            "reference": reference,
        }

        try:
            response = await core._paystack_request(db, "POST", "/transfer", request_payload)
            data = response.get("data") or {}
            item["provider_transfer_code"] = data.get("transfer_code")
            raw_status = str(data.get("status") or "").lower()
            status = "paid" if raw_status in {"success", "successful"} else "processing"
            await _set_item_status(db, batch, item, status, provider_data=data)
        except HTTPException as exc:
            await _set_item_status(
                db,
                batch,
                item,
                "failed",
                failure_reason=str(exc.detail),
            )

        await db.payout_batches.update_one(
            {"id": batch["id"]},
            {"$set": {"items": items, "updated_at": _now_iso()}},
        )

    return await _recalculate_batch(db, batch)


async def _handle_transfer_event(db, payload: dict) -> dict:
    event = str(payload.get("event") or "")
    if event not in {"transfer.success", "transfer.failed", "transfer.reversed"}:
        return {"ok": True, "processed": False, "event": event}

    data = payload.get("data") or {}
    reference = data.get("reference")
    transfer_code = data.get("transfer_code")
    if not reference and not transfer_code:
        return {"ok": True, "processed": False, "reason": "missing_transfer_reference"}

    query: Dict[str, Any] = {}
    if reference:
        query["items.provider_reference"] = reference
    else:
        query["items.provider_transfer_code"] = transfer_code

    batch = await db.payout_batches.find_one(query, {"_id": 0})
    if not batch:
        return {"ok": True, "processed": False, "reason": "batch_not_found"}

    item = next(
        (
            row
            for row in batch.get("items") or []
            if (reference and row.get("provider_reference") == reference)
            or (transfer_code and row.get("provider_transfer_code") == transfer_code)
        ),
        None,
    )
    if not item:
        return {"ok": True, "processed": False, "reason": "item_not_found"}

    item["provider_transfer_code"] = transfer_code or item.get("provider_transfer_code")
    status = {
        "transfer.success": "paid",
        "transfer.failed": "failed",
        "transfer.reversed": "reversed",
    }[event]
    failure_reason = None if status == "paid" else str(data.get("reason") or data.get("message") or event)
    await _set_item_status(
        db,
        batch,
        item,
        status,
        failure_reason=failure_reason,
        provider_data=data,
        webhook_event=event,
    )
    await _recalculate_batch(db, batch)
    return {"ok": True, "processed": True, "batch_id": batch.get("id"), "item_id": item.get("id"), "status": status}


async def _verify_webhook(raw_body: bytes, signature: Optional[str], secret: str) -> bool:
    if not secret or not signature:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected, signature)


@payout_launch_router.get("/admin/payout-settings")
async def payout_paystack_settings(
    request: Request,
    user: User = Depends(get_current_user),
):
    _require_payout_admin(user)
    db = request.app.state.db
    platform = await db.settings.find_one({"id": "platform"}, {"_id": 0}) or {}
    secret = await core._payout_paystack_secret_key(db)
    return {
        "enabled": bool(platform.get("paystack_enabled")),
        "mode": platform.get("paystack_mode") or "test",
        "public_key": platform.get("paystack_public_key") or "",
        "secret_configured": bool(secret),
        "webhook_path": "/api/payments/webhooks/paystack",
        "payout_day": "Friday",
    }


@payout_launch_router.patch("/admin/payout-settings")
async def update_payout_paystack_settings(
    payload: PayoutPaystackSettingsInput,
    request: Request,
    user: User = Depends(get_current_user),
):
    _require_payout_admin(user)
    db = request.app.state.db
    patch: Dict[str, Any] = {"updated_at": _now_iso()}

    if payload.enabled is not None:
        patch["paystack_enabled"] = bool(payload.enabled)
    if payload.mode is not None:
        mode = payload.mode.strip().lower()
        if mode not in {"test", "live"}:
            raise HTTPException(status_code=400, detail="Paystack mode must be test or live")
        patch["paystack_mode"] = mode
    if payload.public_key is not None:
        patch["paystack_public_key"] = payload.public_key.strip()

    if payload.clear_secret_key:
        patch["paystack_secret_key"] = None
    elif payload.secret_key is not None and payload.secret_key.strip():
        secret = payload.secret_key.strip()
        if not secret.startswith(("sk_test_", "sk_live_")):
            raise HTTPException(status_code=400, detail="Paystack secret key must start with sk_test_ or sk_live_")
        patch["paystack_secret_key"] = secret

    await db.settings.update_one(
        {"id": "platform"},
        {"$set": patch, "$setOnInsert": {"id": "platform"}},
        upsert=True,
    )
    return await payout_paystack_settings(request, user)


@payout_launch_router.get("/creator-payouts/profile")
async def creator_payout_profile(
    request: Request,
    user: User = Depends(get_current_user),
):
    db = request.app.state.db
    creator = await _creator_for_user(db, user)
    profile = await _default_paystack_profile(db, "creator", creator["id"])
    return {
        "profile": profile,
        "ready_for_payouts": _profile_ready(profile),
        "payout_day": "Friday",
        "provider": "paystack",
    }


@payout_launch_router.put("/creator-payouts/profile")
async def save_creator_payout_profile(
    payload: CreatorPayoutProfileInput,
    request: Request,
    user: User = Depends(get_current_user),
):
    db = request.app.state.db
    creator = await _creator_for_user(db, user)

    account_name = payload.account_name.strip()
    account_number = _clean_account(payload.account_number)
    bank_code = _clean_bank_code(payload.bank_code)
    if not account_name or not account_number or not bank_code:
        raise HTTPException(status_code=400, detail="Account holder, account number and bank code are required")

    existing = await _default_paystack_profile(db, "creator", creator["id"])
    now = _now_iso()
    changed = bool(
        existing
        and (
            existing.get("account_name") != account_name
            or existing.get("account_number") != account_number
            or existing.get("bank_code") != bank_code
        )
    )
    patch = {
        "owner_type": "creator",
        "owner_id": creator["id"],
        "provider": "paystack",
        "account_name": account_name,
        "bank_name": payload.bank_name.strip(),
        "bank_code": bank_code,
        "account_number": account_number,
        "email": str(payload.email or user.email or ""),
        "phone": payload.phone.strip(),
        "is_default": True,
        "verification_status": (
            existing.get("verification_status")
            if existing and not changed
            else "pending_verification"
        ),
        "updated_at": now,
    }
    if changed:
        patch.update({
            "paystack_recipient_code": None,
            "verified_at": None,
            "verification_error": None,
        })

    await db.payout_profiles.update_many(
        {"owner_type": "creator", "owner_id": creator["id"]},
        {"$set": {"is_default": False, "updated_at": now}},
    )

    if existing:
        await db.payout_profiles.update_one({"id": existing["id"]}, {"$set": patch})
        profile_id = existing["id"]
    else:
        profile = PayoutProfile(
            owner_type="creator",
            owner_id=creator["id"],
            provider="paystack",
            account_name=account_name,
            bank_name=payload.bank_name.strip(),
            bank_code=bank_code,
            account_number=account_number,
            email=payload.email or user.email,
            phone=payload.phone.strip(),
            verification_status="pending_verification",
            is_default=True,
        )
        doc = core.iso_dates(profile.model_dump())
        doc["updated_at"] = now
        await db.payout_profiles.insert_one(doc)
        profile_id = profile.id

    out = await db.payout_profiles.find_one({"id": profile_id}, {"_id": 0})
    return {"profile": out, "ready_for_payouts": _profile_ready(out)}


@payout_launch_router.post("/creator-payouts/profile/verify")
async def verify_creator_paystack_profile(
    request: Request,
    user: User = Depends(get_current_user),
):
    db = request.app.state.db
    creator = await _creator_for_user(db, user)
    profile = await _default_paystack_profile(db, "creator", creator["id"])
    if not profile:
        raise HTTPException(status_code=404, detail="Save payout account details first")
    if _profile_ready(profile):
        return {"profile": profile, "ready_for_payouts": True}

    payload = {
        "type": "basa",
        "name": profile.get("account_name"),
        "account_number": profile.get("account_number"),
        "bank_code": profile.get("bank_code"),
        "currency": "ZAR",
        "metadata": {
            "owner_type": "creator",
            "owner_id": creator["id"],
            "payout_profile_id": profile["id"],
        },
    }
    try:
        response = await core._paystack_request(db, "POST", "/transferrecipient", payload)
        data = response.get("data") or {}
        recipient_code = data.get("recipient_code")
        if not recipient_code:
            raise HTTPException(status_code=400, detail="Paystack did not return a recipient code")
        patch = {
            "provider": "paystack",
            "paystack_recipient_code": recipient_code,
            "verification_status": "verified",
            "verified_at": _now_iso(),
            "verification_error": None,
            "updated_at": _now_iso(),
        }
    except HTTPException as exc:
        await db.payout_profiles.update_one(
            {"id": profile["id"]},
            {"$set": {
                "verification_status": "failed",
                "verification_error": str(exc.detail),
                "updated_at": _now_iso(),
            }},
        )
        raise

    await db.payout_profiles.update_one({"id": profile["id"]}, {"$set": patch})
    out = await db.payout_profiles.find_one({"id": profile["id"]}, {"_id": 0})
    return {"profile": out, "ready_for_payouts": True}


@payout_launch_router.get("/creator-payouts/summary")
async def creator_payout_summary(
    request: Request,
    user: User = Depends(get_current_user),
):
    db = request.app.state.db
    creator = await _creator_for_user(db, user)
    rows = await db.wallet_transactions.find(
        {"owner_type": "creator", "owner_id": creator["id"]},
        {"_id": 0},
    ).sort("created_at", -1).to_list(1000)
    summary: Dict[str, float] = {}
    for row in rows:
        summary[row.get("status") or "unknown"] = round(
            summary.get(row.get("status") or "unknown", 0) + float(row.get("amount") or 0),
            2,
        )
    batches = await db.payout_batches.find(
        {"items.owner_type": "creator", "items.owner_id": creator["id"]},
        {"_id": 0},
    ).sort("created_at", -1).to_list(50)
    history = []
    for batch in batches:
        for item in batch.get("items") or []:
            if item.get("owner_id") == creator["id"]:
                history.append({
                    "batch_id": batch.get("id"),
                    "title": batch.get("title"),
                    "scheduled_for": batch.get("scheduled_for"),
                    "amount": item.get("amount"),
                    "status": item.get("status"),
                    "reference": item.get("provider_reference"),
                    "failure_reason": item.get("failure_reason"),
                    "paid_at": item.get("paid_at"),
                })
    profile = await _default_paystack_profile(db, "creator", creator["id"])
    return {
        "summary": summary,
        "history": history,
        "profile": profile,
        "ready_for_payouts": _profile_ready(profile),
        "payout_day": "Friday",
    }


@payout_launch_router.get("/admin/payout-batches/friday/readiness")
async def friday_payout_readiness(
    request: Request,
    user: User = Depends(get_current_user),
):
    _require_payout_admin(user)
    db = request.app.state.db
    await core.rebuild_wallet_ledger_from_paid_orders(db)
    refund_result = await _reconcile_refunded_orders(db)
    creators = await db.wallet_transactions.distinct(
        "owner_id",
        {"owner_type": "creator", "status": "available"},
    )
    ready = 0
    blocked = []
    for owner_id in creators:
        profile = await _default_paystack_profile(db, "creator", owner_id)
        if _profile_ready(profile):
            ready += 1
        else:
            blocked.append({
                "owner_id": owner_id,
                "owner_name": await core._owner_display_name(db, "creator", owner_id),
                "reason": "Linked and verified Paystack account required",
            })
    scheduled_for = _next_or_current_friday()
    existing = await db.payout_batches.find_one({"batch_key": _friday_key(scheduled_for)}, {"_id": 0})
    return {
        "scheduled_for": scheduled_for.isoformat(),
        "ready_creator_count": ready,
        "blocked_creators": blocked,
        "existing_batch": existing,
        "refund_reconciliation": refund_result,
    }


@payout_launch_router.post("/admin/payout-batches/friday")
async def create_friday_payout_batch(
    payload: FridayPayoutBatchInput,
    request: Request,
    user: User = Depends(get_current_user),
):
    _require_payout_admin(user)
    return await _create_friday_batch(request.app.state.db, user, payload)


@payout_launch_router.post("/admin/payout-batches/{batch_id}/send-paystack")
async def send_paystack_batch_safe(
    batch_id: str,
    request: Request,
    user: User = Depends(get_current_user),
):
    _require_payout_admin(user)
    db = request.app.state.db
    batch = await db.payout_batches.find_one({"id": batch_id}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Payout batch not found")
    if batch.get("provider") != "paystack" or batch.get("owner_type") not in {None, "creator"}:
        raise HTTPException(status_code=400, detail="This route is for creator Paystack payout batches")
    return await _send_or_retry_batch(db, batch)


@payout_launch_router.post("/admin/payout-batches/{batch_id}/retry-failed")
async def retry_failed_payouts(
    batch_id: str,
    request: Request,
    user: User = Depends(get_current_user),
):
    _require_payout_admin(user)
    db = request.app.state.db
    batch = await db.payout_batches.find_one({"id": batch_id}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Payout batch not found")
    return await _send_or_retry_batch(
        db,
        batch,
        retry_failed_only=True,
        allow_off_cycle_retry=True,
    )


@payout_launch_router.post("/admin/payout-batches/{batch_id}/reconcile")
async def reconcile_payout_batch(
    batch_id: str,
    request: Request,
    user: User = Depends(get_current_user),
):
    _require_payout_admin(user)
    db = request.app.state.db
    batch = await db.payout_batches.find_one({"id": batch_id}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Payout batch not found")
    for item in batch.get("items") or []:
        if item.get("status") != "processing" or not item.get("provider_reference"):
            continue
        try:
            status, data = await _paystack_transfer_status(db, item["provider_reference"])
            await _set_item_status(db, batch, item, status, provider_data=data)
        except HTTPException as exc:
            item["failure_reason"] = str(exc.detail)
    return await _recalculate_batch(db, batch)


@payout_launch_router.post("/admin/wallet-ledger/reconcile-refunds")
async def reconcile_refunds(
    request: Request,
    user: User = Depends(get_current_user),
):
    _require_payout_admin(user)
    return await _reconcile_refunded_orders(request.app.state.db)


@payout_launch_router.post("/admin/wallet-ledger/adjustments")
async def create_wallet_adjustment(
    payload: WalletAdjustmentInput,
    request: Request,
    user: User = Depends(get_current_user),
):
    _require_payout_admin(user)
    db = request.app.state.db
    if payload.owner_type not in {"creator", "printer", "platform"}:
        raise HTTPException(status_code=400, detail="Invalid wallet owner type")
    if payload.adjustment_type not in {"adjustment", "refund", "reversal"}:
        raise HTTPException(status_code=400, detail="Invalid adjustment type")
    key = payload.idempotency_key.strip()
    if not key:
        raise HTTPException(status_code=400, detail="An idempotency key is required")
    existing = await db.wallet_transactions.find_one(
        {"source_collection": "manual_adjustments", "source_id": key},
        {"_id": 0},
    )
    if existing:
        return existing
    entry = WalletTransaction(
        owner_type=payload.owner_type,
        owner_id=payload.owner_id,
        order_id=payload.order_id,
        order_item_id=payload.order_item_id,
        amount=round(float(payload.amount), 2),
        type=payload.adjustment_type,
        status="available",
        description=payload.description.strip(),
        source_collection="manual_adjustments",
        source_id=key,
        metadata={"created_by_user_id": user.id},
    )
    doc = core.iso_dates(entry.model_dump())
    await db.wallet_transactions.insert_one(doc)
    return doc


async def _paystack_webhook_dispatch(request: Request):
    raw_body = await request.body()
    try:
        payload = json.loads(raw_body.decode("utf-8") or "{}")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    event = str(payload.get("event") or "")
    if not event.startswith("transfer."):
        # Preserve the existing checkout/subscription webhook behavior.
        return await core.gateway_payment_webhook("paystack", request)

    db = request.app.state.db
    secret = await core._payout_paystack_secret_key(db)
    signature = request.headers.get("x-paystack-signature")
    if not await _verify_webhook(raw_body, signature, secret or ""):
        raise HTTPException(status_code=403, detail="Invalid Paystack payout signature")
    return await _handle_transfer_event(db, payload)


@payout_launch_router.post("/payments/webhooks/paystack")
async def unified_paystack_webhook(request: Request):
    return await _paystack_webhook_dispatch(request)


@payout_launch_router.post("/payments/webhooks/paystack-payouts")
async def dedicated_paystack_payout_webhook(request: Request):
    return await _paystack_webhook_dispatch(request)
