"""Owner/admin SMTP configuration and dashboard-managed email delivery."""
from __future__ import annotations

import asyncio
import base64
from datetime import datetime, timezone
import hashlib
import logging
import os
from typing import Any, Dict, List, Optional

from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field

from auth import get_current_user
from email_delivery import (
    EmailDeliverySettings,
    _release_stale_claims,
    _send_message,
    claim_next_email,
    deliver_claimed_email,
    ensure_email_delivery_indexes,
    load_email_delivery_settings,
)
from models import User, uid


logger = logging.getLogger("fandomforge.email_settings")
email_settings_router = APIRouter(tags=["email-delivery"])
EMAIL_SETTINGS_ID = "email_delivery"
EMAIL_ADMIN_ROLES = {"super_admin", "owner", "admin"}


DEFAULT_TEMPLATES = {
    "order_confirmation": {
        "label": "Order confirmation",
        "subject": "Order {order_number} received",
        "body": "Hi {customer_name},\n\nWe received order {order_number} for {order_total}. We will keep you updated as it moves through production.\n\n{platform_name}",
    },
    "payment_confirmation": {
        "label": "Payment confirmation",
        "subject": "Payment received for {order_number}",
        "body": "Hi {customer_name},\n\nPayment for order {order_number} has been confirmed.\n\n{platform_name}",
    },
    "order_status_update": {
        "label": "Order status update",
        "subject": "Order {order_number}: {order_status}",
        "body": "Hi {customer_name},\n\nYour order {order_number} is now {order_status}.\n\n{platform_name}",
    },
    "tracking_update": {
        "label": "Tracking update",
        "subject": "Tracking for order {order_number}",
        "body": "Hi {customer_name},\n\nTracking number: {tracking_number}\n{tracking_url}\n\n{platform_name}",
    },
    "internal_notification": {
        "label": "Internal notification",
        "subject": "{notification_title}",
        "body": "{notification_message}\n\n{link_url}",
    },
}


class SMTPSettingsUpdate(BaseModel):
    enabled: bool = False
    smtp_host: str = ""
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_username: str = ""
    smtp_password: str = ""
    clear_password: bool = False
    smtp_use_tls: bool = True
    smtp_use_ssl: bool = False
    from_email: str = ""
    from_name: str = "FandomForge Support"
    reply_to_email: str = ""
    order_notification_emails: List[EmailStr] = Field(default_factory=list)
    admin_notification_emails: List[EmailStr] = Field(default_factory=list)
    templates: Dict[str, Dict[str, Any]] = Field(default_factory=dict)


class SMTPTestRequest(BaseModel):
    recipient_email: EmailStr


def _require_email_admin(user: User) -> None:
    if user.role not in EMAIL_ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Owner or administrator access required")


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _int_value(value: Any, fallback: int, minimum: int = 1) -> int:
    try:
        return max(minimum, int(value))
    except (TypeError, ValueError):
        return fallback


def _fernet() -> Fernet:
    configured = os.environ.get("EMAIL_SETTINGS_ENCRYPTION_KEY", "").strip()
    if configured:
        try:
            return Fernet(configured.encode("utf-8"))
        except (TypeError, ValueError):
            logger.warning("EMAIL_SETTINGS_ENCRYPTION_KEY is not a Fernet key; deriving a valid key")
    seed = configured or os.environ.get("JWT_SECRET", "fandomforge-dev-secret-change-me")
    key = base64.urlsafe_b64encode(hashlib.sha256(seed.encode("utf-8")).digest())
    return Fernet(key)


def _encrypt_password(value: str) -> str:
    if not value:
        return ""
    return _fernet().encrypt(value.encode("utf-8")).decode("utf-8")


def _decrypt_password(value: str) -> str:
    if not value:
        return ""
    try:
        return _fernet().decrypt(value.encode("utf-8")).decode("utf-8")
    except (InvalidToken, TypeError, ValueError):
        logger.error("Stored SMTP password cannot be decrypted; save it again from Email / SMTP settings")
        return ""


def _merged_templates(value: Optional[dict]) -> dict:
    supplied = value or {}
    return {
        key: {**default, **(supplied.get(key) or {})}
        for key, default in DEFAULT_TEMPLATES.items()
    }


async def _document(db) -> Optional[dict]:
    return await db.settings.find_one({"id": EMAIL_SETTINGS_ID}, {"_id": 0})


async def effective_email_settings(db) -> tuple[EmailDeliverySettings, dict]:
    """Return dashboard settings when saved, with environment settings as legacy fallback."""
    doc = await _document(db)
    if not doc:
        settings = load_email_delivery_settings()
        return settings, {"enabled": settings.configured, "source": "environment"}

    enabled = bool(doc.get("enabled", False))
    settings = EmailDeliverySettings(
        from_email=str(doc.get("from_email") or "").strip(),
        from_name=str(doc.get("from_name") or "FandomForge Support").strip(),
        reply_to=str(doc.get("reply_to_email") or doc.get("from_email") or "").strip(),
        smtp_host=str(doc.get("smtp_host") or "").strip() if enabled else "",
        smtp_port=_int_value(doc.get("smtp_port"), 587),
        smtp_username=str(doc.get("smtp_username") or "").strip(),
        smtp_password=_decrypt_password(str(doc.get("smtp_password_ciphertext") or "")),
        smtp_starttls=bool(doc.get("smtp_use_tls", True)),
        smtp_ssl=bool(doc.get("smtp_use_ssl", False)),
        sendmail_path="",
        max_attempts=_int_value(doc.get("max_attempts"), 5),
        poll_seconds=_int_value(doc.get("poll_seconds"), 30, minimum=5),
    )
    return settings, {"enabled": enabled, "source": "dashboard"}


async def email_delivery_status(db) -> dict:
    settings, meta = await effective_email_settings(db)
    doc = await _document(db) or {}
    queue = {}
    for status in ("queued", "sending", "retry", "sent", "failed"):
        queue[status] = await db.notification_emails.count_documents({"status": status})
    return {
        "enabled": bool(meta.get("enabled")),
        "configured": settings.configured,
        "provider": settings.provider,
        "source": meta.get("source"),
        "smtp_host": doc.get("smtp_host") or settings.smtp_host,
        "smtp_port": doc.get("smtp_port") or settings.smtp_port,
        "from_email": doc.get("from_email") or settings.from_email,
        "queue": queue,
        "last_test_at": doc.get("last_test_at"),
        "last_test_status": doc.get("last_test_status"),
        "last_test_error": doc.get("last_test_error") or "",
        "updated_at": doc.get("updated_at"),
    }


async def process_dashboard_email_queue_once(db, worker_id: str, limit: int = 25) -> dict:
    settings, _ = await effective_email_settings(db)
    if not settings.configured:
        return {"configured": False, "provider": settings.provider, "processed": 0, "sent": 0, "failed": 0}

    processed = sent = failed = 0
    for _ in range(max(1, min(limit, 100))):
        row = await claim_next_email(db, worker_id)
        if not row:
            break
        processed += 1
        result = await deliver_claimed_email(db, row, settings)
        if result.get("status") == "sent":
            sent += 1
        else:
            failed += 1
    return {"configured": True, "provider": settings.provider, "processed": processed, "sent": sent, "failed": failed}


async def dashboard_email_delivery_loop(db, worker_id: str) -> None:
    await ensure_email_delivery_indexes(db)
    await _release_stale_claims(db)
    settings, _ = await effective_email_settings(db)
    if not settings.configured:
        logger.warning("Email delivery is not configured; messages remain queued until SMTP is enabled in the admin dashboard")

    while True:
        try:
            await process_dashboard_email_queue_once(db, worker_id)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Email queue processing failed")
        try:
            settings, _ = await effective_email_settings(db)
            delay = settings.poll_seconds
        except Exception:
            logger.exception("Could not load email delivery settings")
            delay = 30
        await asyncio.sleep(delay)


async def _public_settings(db) -> dict:
    doc = await _document(db)
    env = load_email_delivery_settings()
    if not doc:
        doc = {
            "enabled": env.configured,
            "smtp_host": env.smtp_host,
            "smtp_port": env.smtp_port,
            "smtp_username": env.smtp_username,
            "smtp_use_tls": env.smtp_starttls,
            "smtp_use_ssl": env.smtp_ssl,
            "from_email": env.from_email,
            "from_name": env.from_name,
            "reply_to_email": env.reply_to,
            "order_notification_emails": [],
            "admin_notification_emails": [],
            "templates": {},
        }
    password_configured = bool(doc.get("smtp_password_ciphertext") or (not await _document(db) and env.smtp_password))
    return {
        "enabled": bool(doc.get("enabled", False)),
        "smtp_host": doc.get("smtp_host") or "",
        "smtp_port": int(doc.get("smtp_port") or 587),
        "smtp_username": doc.get("smtp_username") or "",
        "smtp_password": "********" if password_configured else "",
        "password_configured": password_configured,
        "smtp_use_tls": bool(doc.get("smtp_use_tls", True)),
        "smtp_use_ssl": bool(doc.get("smtp_use_ssl", False)),
        "from_email": doc.get("from_email") or "",
        "from_name": doc.get("from_name") or "FandomForge Support",
        "reply_to_email": doc.get("reply_to_email") or "",
        "order_notification_emails": doc.get("order_notification_emails") or [],
        "admin_notification_emails": doc.get("admin_notification_emails") or [],
        "templates": _merged_templates(doc.get("templates")),
        "status": await email_delivery_status(db),
    }


@email_settings_router.get("/admin/smtp-settings")
async def get_smtp_settings(request: Request, user: User = Depends(get_current_user)):
    _require_email_admin(user)
    return await _public_settings(request.app.state.db)


@email_settings_router.get("/admin/smtp-settings/status")
async def get_smtp_status(request: Request, user: User = Depends(get_current_user)):
    _require_email_admin(user)
    return await email_delivery_status(request.app.state.db)


@email_settings_router.patch("/admin/smtp-settings")
async def update_smtp_settings(payload: SMTPSettingsUpdate, request: Request, user: User = Depends(get_current_user)):
    _require_email_admin(user)
    if payload.smtp_use_ssl and payload.smtp_use_tls:
        raise HTTPException(status_code=400, detail="Choose either SSL or STARTTLS, not both")
    if payload.enabled:
        if not payload.smtp_host.strip():
            raise HTTPException(status_code=400, detail="SMTP host is required when email sending is enabled")
        if not payload.from_email.strip() or "@" not in payload.from_email:
            raise HTTPException(status_code=400, detail="A valid From email is required when email sending is enabled")

    db = request.app.state.db
    current = await _document(db) or {}
    ciphertext = str(current.get("smtp_password_ciphertext") or "")
    if payload.clear_password:
        ciphertext = ""
    elif payload.smtp_password and payload.smtp_password != "********":
        ciphertext = _encrypt_password(payload.smtp_password)
    elif not ciphertext and load_email_delivery_settings().smtp_password:
        ciphertext = _encrypt_password(load_email_delivery_settings().smtp_password)

    patch = {
        "id": EMAIL_SETTINGS_ID,
        "enabled": bool(payload.enabled),
        "smtp_host": payload.smtp_host.strip(),
        "smtp_port": int(payload.smtp_port),
        "smtp_username": payload.smtp_username.strip(),
        "smtp_password_ciphertext": ciphertext,
        "smtp_use_tls": bool(payload.smtp_use_tls),
        "smtp_use_ssl": bool(payload.smtp_use_ssl),
        "from_email": payload.from_email.strip(),
        "from_name": payload.from_name.strip() or "FandomForge Support",
        "reply_to_email": payload.reply_to_email.strip(),
        "order_notification_emails": [str(value) for value in payload.order_notification_emails],
        "admin_notification_emails": [str(value) for value in payload.admin_notification_emails],
        "templates": _merged_templates(payload.templates),
        "max_attempts": int(current.get("max_attempts") or 5),
        "poll_seconds": int(current.get("poll_seconds") or 30),
        "updated_at": _iso_now(),
        "updated_by_user_id": user.id,
        "updated_by_role": user.role,
    }
    await db.settings.update_one({"id": EMAIL_SETTINGS_ID}, {"$set": patch}, upsert=True)
    return await _public_settings(db)


@email_settings_router.post("/admin/smtp-settings/test")
async def test_smtp_settings(payload: SMTPTestRequest, request: Request, user: User = Depends(get_current_user)):
    _require_email_admin(user)
    db = request.app.state.db
    settings, _ = await effective_email_settings(db)
    if not settings.configured:
        raise HTTPException(status_code=409, detail="Save and enable valid SMTP settings before sending a test")

    row = {
        "id": uid(),
        "recipient_email": str(payload.recipient_email),
        "subject": "FandomForge SMTP test",
        "body": "This is a FandomForge SMTP delivery test. If you received it, outgoing email is configured correctly.",
    }
    try:
        await asyncio.to_thread(_send_message, row, settings)
    except Exception as exc:
        await db.settings.update_one({"id": EMAIL_SETTINGS_ID}, {"$set": {
            "last_test_at": _iso_now(), "last_test_status": "failed", "last_test_error": str(exc)[:2000],
        }}, upsert=True)
        raise HTTPException(status_code=502, detail=f"SMTP test failed: {exc}")

    await db.settings.update_one({"id": EMAIL_SETTINGS_ID}, {"$set": {
        "last_test_at": _iso_now(), "last_test_status": "sent", "last_test_error": "",
    }}, upsert=True)
    return {"ok": True, "recipient_email": str(payload.recipient_email)}


@email_settings_router.post("/admin/smtp-settings/process-queue")
async def process_smtp_queue(request: Request, user: User = Depends(get_current_user)):
    _require_email_admin(user)
    db = request.app.state.db
    settings, _ = await effective_email_settings(db)
    if not settings.configured:
        raise HTTPException(status_code=409, detail="SMTP delivery is not configured and enabled")

    await db.notification_emails.update_many(
        {"status": {"$in": ["failed", "retry"]}},
        {"$set": {"status": "queued", "next_attempt_at": None, "claimed_at": None, "claimed_by": None, "error": ""}},
    )
    result = await process_dashboard_email_queue_once(db, f"manual-{user.id}", limit=100)
    return {
        "total": result.get("processed", 0),
        "sent": result.get("sent", 0),
        "failed": result.get("failed", 0),
        "status": await email_delivery_status(db),
    }
