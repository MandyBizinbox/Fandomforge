"""One-time account password recovery using the existing SMTP settings."""
from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from auth import hash_password
from email_delivery import _send_message
from email_settings_routes import effective_email_settings

logger = logging.getLogger("fandomforge.password_recovery")
password_recovery_router = APIRouter(prefix="/auth", tags=["password-recovery"])
TOKEN_LIFETIME = timedelta(minutes=30)
GENERIC_REPLY = {"message": "If an account exists for that email address, a password reset link will be sent."}


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=30, max_length=200)
    password: str = Field(min_length=12, max_length=128)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _password_valid(password: str) -> bool:
    return (len(password) >= 12 and len(password.encode("utf-8")) <= 72
            and bool(re.search(r"[A-Za-z]", password)) and bool(re.search(r"\d", password)))


async def ensure_password_recovery_indexes(db) -> None:
    await db.password_reset_tokens.create_index("token_hash", unique=True)
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.password_reset_limits.create_index("expires_at", expireAfterSeconds=0)


async def _allow(db, kind: str, key: str, limit: int) -> bool:
    """Atomic per-key fixed-hour request bucket across API workers."""
    now = _now()
    bucket = int(now.timestamp()) // 3600
    identifier = f"{kind}:{bucket}:{_digest(key)}"
    try:
        result = await db.password_reset_limits.find_one_and_update(
            {"_id": identifier},
            {"$inc": {"count": 1}, "$setOnInsert": {"expires_at": now + timedelta(hours=2)}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError:
        result = await db.password_reset_limits.find_one_and_update(
            {"_id": identifier}, {"$inc": {"count": 1}},
            return_document=ReturnDocument.AFTER,
        )
    return bool(result) and int(result.get("count", 999)) <= limit


def _client_ip(request: Request) -> str:
    """Trust Nginx's overwritten X-Real-IP only over the local loopback proxy."""
    from ipaddress import ip_address

    peer = request.client.host if request.client else "unknown"
    if peer not in {"127.0.0.1", "::1"}:
        return peer
    forwarded = request.headers.get("x-real-ip", "").strip()
    try:
        return str(ip_address(forwarded))
    except ValueError:
        return peer


@password_recovery_router.post("/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest, request: Request):
    db = request.app.state.db
    email = str(payload.email).strip().lower()
    ip = _client_ip(request)
    if not await _allow(db, "ip", ip, 20):
        return GENERIC_REPLY
    if not await _allow(db, "email", email, 3):
        return GENERIC_REPLY

    user = await db.users.find_one(
        {"email": {"$regex": f"^{re.escape(email)}$", "$options": "i"}},
        {"id": 1, "email": 1, "name": 1, "status": 1},
    )
    if not user or user.get("status") == "suspended":
        return GENERIC_REPLY

    settings, _ = await effective_email_settings(db)
    if not settings.configured:
        logger.error("Password recovery email unavailable: SMTP is not configured")
        return GENERIC_REPLY

    token = secrets.token_urlsafe(48)
    now = _now()
    hashed = _digest(token)
    await db.password_reset_tokens.delete_many({"user_id": user["id"]})
    await db.password_reset_tokens.insert_one({
        "token_hash": hashed,
        "user_id": user["id"],
        "created_at": now,
        "expires_at": now + TOKEN_LIFETIME,
    })
    base = os.environ.get("FRONTEND_URL", "https://fandomforge.co.za").rstrip("/")
    url = f"{base}/reset-password#token={quote(token)}"
    email_row = {
        "recipient_email": str(user.get("email") or email),
        "subject": "Reset your FandomForge password",
        "body": (
            f"Hi {user.get('name') or 'there'},\n\n"
            "We received a request to reset your FandomForge password.\n\n"
            f"Reset your password here:\n{url}\n\n"
            "This link expires in 30 minutes and can only be used once.\n"
            "If you did not request this, you can ignore this email.\n\n"
            "FandomForge Support\n"
        ),
    }
    try:
        await asyncio.to_thread(_send_message, email_row, settings)
    except Exception:
        logger.exception("Password recovery SMTP delivery failed")
        await db.password_reset_tokens.delete_one({"token_hash": hashed})
    return GENERIC_REPLY


@password_recovery_router.post("/reset-password")
async def reset_password(payload: ResetPasswordRequest, request: Request):
    if not _password_valid(payload.password):
        raise HTTPException(
            status_code=422,
            detail="Use at least 12 characters including letters and numbers (maximum 72 UTF-8 bytes).",
        )
    db = request.app.state.db
    if not await _allow(db, "reset_ip", _client_ip(request), 30):
        raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")
    now = _now()
    record = await db.password_reset_tokens.find_one_and_delete({
        "token_hash": _digest(payload.token), "expires_at": {"$gt": now}
    })
    if not record:
        raise HTTPException(
            status_code=400,
            detail="This reset link has expired or has already been used. Request a new link.",
        )
    result = await db.users.update_one(
        {"id": record["user_id"], "status": {"$ne": "suspended"}},
        {"$set": {"password_hash": hash_password(payload.password)}, "$inc": {"auth_version": 1}},
    )
    if result.matched_count != 1:
        raise HTTPException(status_code=400, detail="Password could not be reset. Contact support.")
    await db.password_reset_tokens.delete_many({"user_id": record["user_id"]})
    return {"message": "Your password has been updated. Please sign in again."}
