"""Controlled pending-order reminder worker.

Runs within the existing VPS backend, never through hosted CI/schedulers.
Default OFF until validated and explicitly enabled on VPS.
Historical orders are excluded unless individually enrolled.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
import logging
import os
import secrets

from pymongo.errors import DuplicateKeyError

from pending_payment_recovery import (
    pending_recovery_eligible,
    recovery_due_stage,
    payment_reminder_email,
)
from pending_payment_routes import make_recovery_link

logger = logging.getLogger("fandomforge.payment_reminders")
POLL_SECONDS = 300


def enabled() -> bool:
    return os.getenv("FF_PENDING_PAYMENT_AUTOMATION_ENABLED", "false").lower() == "true"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def origin() -> str:
    value = os.getenv("FANDOMFORGE_PUBLIC_ORIGIN", "https://fandomforge.co.za").rstrip("/")
    if not value.startswith("https://"):
        raise ValueError("Payment reminder origin must be HTTPS")
    return value


async def ensure_indexes(db):
    await db.order_payment_recovery_links.create_index("token_sha256", unique=True)
    await db.notification_emails.create_index("recovery_key", unique=True, sparse=True)
    await db.orders.create_index([
        ("payment_recovery_enabled", 1), ("payment_status", 1), ("created_at", 1),
    ])


async def _update_delivery_status(db, order: dict) -> dict:
    """Observe confirmed SMTP results, not merely queue submission."""
    refreshed = dict(order)
    for stage in (1, 2):
        row = await db.notification_emails.find_one(
            {"recovery_key": f"pending-payment:{order['id']}:{stage}"},
            {"_id": 0, "status": 1, "sent_at": 1},
        )
        delivery = (row or {}).get("status")
        key = f"reminder_{stage}_delivery"
        sent_key = f"reminder_{stage}_sent_at"
        patch = {}
        if delivery and delivery != refreshed.get(key):
            patch[key] = delivery
        if delivery == "sent" and row.get("sent_at") and row["sent_at"] != refreshed.get(sent_key):
            patch[sent_key] = row["sent_at"]
        if patch:
            await db.orders.update_one(
                {"id": order["id"], "payment_status": "pending"},
                {"$set": patch},
            )
            refreshed.update(patch)
    return refreshed


async def _queue_reminder(db, order: dict, stage: int, now: datetime):
    from models import uid

    if not pending_recovery_eligible(order):
        return "skipped"

    key = f"pending-payment:{order['id']}:{stage}"
    old = await db.notification_emails.find_one({"recovery_key": key}, {"_id": 0})
    if old:
        # Recover an interrupted worker after queueing, without a second send.
        await db.orders.update_one(
            {"id": order["id"], "payment_status": "pending"},
            {"$max": {"payment_reminder_stage": stage}},
        )
        return "already_queued"

    url = await make_recovery_link(db, order, stage=stage, origin=origin())
    email = payment_reminder_email(order, stage=stage, recovery_url=url)
    row = {
        "id": uid(),
        "notification_id": None,
        "recipient_user_id": order.get("buyer_id"),
        "recipient_email": order["buyer_email"],
        "subject": email["subject"],
        "body": email["body"],
        "html_body": email["html_body"],
        "status": "queued",
        "created_at": now.isoformat(),
        "attempt_count": 0,
        "recovery_key": key,
        "recovery_order_id": order["id"],
    }
    try:
        await db.notification_emails.insert_one(row)
    except DuplicateKeyError:
        return "already_queued"
    await db.orders.update_one(
        {"id": order["id"], "payment_status": "pending", "payment_id": order.get("payment_id")},
        {"$max": {"payment_reminder_stage": stage}},
    )
    return "queued"


async def _review_cancellation(db, order: dict, now: datetime):
    """Cancel only after authoritative, terminal gateway failure.

    A PayFast merchant-history MISS is only 'pending', NOT proof of nonpayment.
    Bank transfers, unavailable providers and uncertain payments need review.
    """
    import routes_main as core
    from payment_gateways import get_payment_gateway_adapter

    await db.orders.update_one(
        {"id": order["id"], "payment_status": "pending"},
        {"$set": {"status": "payment_overdue", "cancellation_review_required": True}},
    )
    payment = await db.payments.find_one(
        {"id": order.get("payment_id"), "order_id": order["id"]},
        {"_id": 0},
    )
    if not payment:
        return "review_missing_payment"
    completed = await db.payments.find_one(
        {"order_id": order["id"], "status": "completed"}, {"_id": 1},
    )
    if completed:
        return "review_existing_completed_payment"

    provider = order.get("payment_provider")
    try:
        config = await core._get_gateway_config(db, provider, masked=False)
        result = await get_payment_gateway_adapter(provider).verify_payment(
            payment.get("provider_reference"), config,
        )
    except Exception:
        logger.exception("Cannot verify payment before cancellation: %s", order["id"])
        return "review_provider_unavailable"

    if result.get("paid"):
        try:
            await core._mark_order_paid_from_payment(db, payment, result)
        except Exception:
            logger.exception("Gateway confirmed payment but settlement failed for %s", order["id"])
            return "review_settlement_failure"
        return "settled"

    # Only an explicitly terminal provider result permits automatic cancellation.
    if str(result.get("status") or "").lower() not in {
        "failed", "cancelled", "canceled", "expired", "declined",
    }:
        return "review_unconfirmed_not_paid"

    changed = await db.orders.update_one(
        {
            "id": order["id"],
            "payment_id": payment["id"],
            "payment_status": "pending",
            "status": "payment_overdue",
            "manual_payment_claim": {"$exists": False},
            "recovery_payment_claim": {"$exists": False},
        },
        {"$set": {
            "status": "cancelled",
            "payment_status": "failed",
            "cancel_reason": "unpaid_after_two_reminders",
            "cancelled_at": now.isoformat(),
            "updated_at": now.isoformat(),
            "cancellation_review_required": False,
        }},
    )
    if changed.modified_count:
        await db.payments.update_one(
            {"id": payment["id"], "status": {"$nin": ["completed", "refunded"]}},
            {"$set": {"status": "cancelled"}},
        )
        return "cancelled"
    return "review_race_or_new_payment"


async def process_pending_payment_recovery_once(db, *, now=None, limit=50) -> dict:
    """Poll eligible new orders; safe to call repeatedly."""
    results = {
        "queued": 0, "cancelled": 0, "settled": 0,
        "reviews": 0, "skipped": 0,
    }
    if not enabled():
        return {**results, "enabled": False}
    now = now or utcnow()
    cutoff = (now - timedelta(hours=24)).isoformat()
    cursor = db.orders.find({
        "payment_recovery_enabled": True,
        "payment_status": "pending",
        "status": {"$in": ["pending_payment", "payment_overdue"]},
        "created_at": {"$lte": cutoff},
    }, {"_id": 0}).sort("created_at", 1).limit(limit)
    async for original in cursor:
        order = await _update_delivery_status(db, original)
        stage = recovery_due_stage(order, now)
        if stage in (1, 2):
            outcome = await _queue_reminder(db, order, stage, now)
            results["queued" if outcome == "queued" else "skipped"] += 1
            if stage == 2 and outcome in ("queued", "already_queued"):
                await db.orders.update_one(
                    {"id": order["id"], "payment_status": "pending"},
                    {"$set": {"status": "payment_overdue"}},
                )
        elif stage == 3:
            outcome = await _review_cancellation(db, order, now)
            results[
                "cancelled" if outcome == "cancelled"
                else "settled" if outcome == "settled"
                else "reviews"
            ] += 1
        else:
            results["skipped"] += 1
    return {**results, "enabled": True}


async def pending_payment_recovery_loop(db):
    await ensure_indexes(db)
    while True:
        try:
            await process_pending_payment_recovery_once(db)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Pending payment recovery scan failed")
        await asyncio.sleep(POLL_SECONDS)
