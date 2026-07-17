"""Reliable delivery for queued FandomForge notification and contact emails.

The existing application already writes durable rows to ``notification_emails``.
This worker atomically claims queued rows and sends them through configured SMTP
or a local sendmail binary. It is safe to run in more than one API worker because
only one process can claim a row at a time.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
import logging
import os
from pathlib import Path
import shutil
import smtplib
import ssl
import subprocess
from typing import Optional

from pymongo import ReturnDocument


logger = logging.getLogger("fandomforge.email_delivery")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime) -> str:
    return value.isoformat()


def _truthy(value: Optional[str], default: bool = False) -> bool:
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class EmailDeliverySettings:
    from_email: str
    from_name: str
    reply_to: str
    smtp_host: str
    smtp_port: int
    smtp_username: str
    smtp_password: str
    smtp_starttls: bool
    smtp_ssl: bool
    sendmail_path: str
    max_attempts: int
    poll_seconds: int

    @property
    def provider(self) -> str:
        if self.smtp_host:
            return "smtp"
        if self.sendmail_path:
            return "sendmail"
        return "unconfigured"

    @property
    def configured(self) -> bool:
        return self.provider != "unconfigured" and bool(self.from_email)


def load_email_delivery_settings() -> EmailDeliverySettings:
    sendmail = os.environ.get("SENDMAIL_PATH", "").strip()
    if not sendmail:
        sendmail = shutil.which("sendmail") or ""

    smtp_port_raw = os.environ.get("SMTP_PORT", "587").strip() or "587"
    try:
        smtp_port = int(smtp_port_raw)
    except ValueError:
        smtp_port = 587

    max_attempts_raw = os.environ.get("EMAIL_MAX_ATTEMPTS", "5")
    poll_seconds_raw = os.environ.get("EMAIL_POLL_SECONDS", "30")
    try:
        max_attempts = max(1, int(max_attempts_raw))
    except ValueError:
        max_attempts = 5
    try:
        poll_seconds = max(5, int(poll_seconds_raw))
    except ValueError:
        poll_seconds = 30

    smtp_ssl = _truthy(os.environ.get("SMTP_SSL"), default=smtp_port == 465)
    smtp_starttls = _truthy(
        os.environ.get("SMTP_STARTTLS"),
        default=bool(os.environ.get("SMTP_HOST")) and not smtp_ssl,
    )

    return EmailDeliverySettings(
        from_email=(
            os.environ.get("SMTP_FROM_EMAIL")
            or os.environ.get("MAIL_FROM_EMAIL")
            or "help@fandomforge.co.za"
        ).strip(),
        from_name=(
            os.environ.get("SMTP_FROM_NAME")
            or os.environ.get("MAIL_FROM_NAME")
            or "FandomForge Support"
        ).strip(),
        reply_to=(
            os.environ.get("SMTP_REPLY_TO")
            or os.environ.get("MAIL_REPLY_TO")
            or "help@fandomforge.co.za"
        ).strip(),
        smtp_host=os.environ.get("SMTP_HOST", "").strip(),
        smtp_port=smtp_port,
        smtp_username=os.environ.get("SMTP_USERNAME", "").strip(),
        smtp_password=os.environ.get("SMTP_PASSWORD", ""),
        smtp_starttls=smtp_starttls,
        smtp_ssl=smtp_ssl,
        sendmail_path=sendmail,
        max_attempts=max_attempts,
        poll_seconds=poll_seconds,
    )


async def ensure_email_delivery_indexes(db) -> None:
    await db.notification_emails.create_index(
        [("status", 1), ("next_attempt_at", 1), ("created_at", 1)],
        name="notification_email_delivery_queue",
    )
    await db.notification_emails.create_index(
        [("recipient_email", 1), ("created_at", -1)],
        name="notification_email_recipient_history",
    )


def _build_message(row: dict, settings: EmailDeliverySettings) -> EmailMessage:
    recipient = str(row.get("recipient_email") or "").strip()
    subject = str(row.get("subject") or "FandomForge notification").strip()
    body = str(row.get("body") or "").strip()
    if not recipient or "@" not in recipient:
        raise ValueError("Queued email has no valid recipient")

    message = EmailMessage()
    message["From"] = f"{settings.from_name} <{settings.from_email}>"
    message["To"] = recipient
    message["Subject"] = subject
    if settings.reply_to:
        message["Reply-To"] = settings.reply_to
    message["X-FandomForge-Message-ID"] = str(row.get("id") or row.get("notification_id") or "")
    message.set_content(body or subject)
    return message


def _send_smtp(message: EmailMessage, settings: EmailDeliverySettings) -> None:
    context = ssl.create_default_context()
    if settings.smtp_ssl:
        smtp = smtplib.SMTP_SSL(
            settings.smtp_host,
            settings.smtp_port,
            timeout=30,
            context=context,
        )
    else:
        smtp = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30)

    with smtp:
        smtp.ehlo()
        if settings.smtp_starttls and not settings.smtp_ssl:
            smtp.starttls(context=context)
            smtp.ehlo()
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(message)


def _send_sendmail(message: EmailMessage, settings: EmailDeliverySettings) -> None:
    path = Path(settings.sendmail_path)
    if not path.exists():
        raise RuntimeError(f"sendmail binary not found: {path}")
    result = subprocess.run(
        [str(path), "-i", "-t"],
        input=message.as_bytes(),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        timeout=30,
    )
    if result.returncode != 0:
        error = result.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(error or f"sendmail exited with code {result.returncode}")


def _send_message(row: dict, settings: EmailDeliverySettings) -> None:
    if not settings.configured:
        raise RuntimeError(
            "Email delivery is not configured. Set SMTP_HOST and SMTP_FROM_EMAIL, "
            "or install/configure sendmail."
        )
    message = _build_message(row, settings)
    if settings.provider == "smtp":
        _send_smtp(message, settings)
    else:
        _send_sendmail(message, settings)


async def _release_stale_claims(db) -> int:
    cutoff = _iso(_now() - timedelta(minutes=10))
    result = await db.notification_emails.update_many(
        {"status": "sending", "claimed_at": {"$lt": cutoff}},
        {"$set": {
            "status": "retry",
            "next_attempt_at": _iso(_now()),
            "error": "Recovered stale delivery claim",
        }},
    )
    return result.modified_count


async def claim_next_email(db, worker_id: str) -> Optional[dict]:
    now = _iso(_now())
    return await db.notification_emails.find_one_and_update(
        {
            "$or": [
                {"status": "queued"},
                {"status": "retry", "next_attempt_at": {"$lte": now}},
                {"status": "retry", "next_attempt_at": {"$exists": False}},
            ]
        },
        {"$set": {
            "status": "sending",
            "claimed_at": now,
            "claimed_by": worker_id,
            "provider": "pending",
            "error": "",
        }},
        sort=[("created_at", 1)],
        return_document=ReturnDocument.AFTER,
    )


async def deliver_claimed_email(db, row: dict, settings: EmailDeliverySettings) -> dict:
    message_id = row.get("id")
    query = {"id": message_id} if message_id else {"_id": row.get("_id")}
    attempts = int(row.get("attempt_count") or 0) + 1

    try:
        await asyncio.to_thread(_send_message, row, settings)
    except Exception as exc:
        terminal = attempts >= settings.max_attempts
        delay_minutes = min(60, 2 ** max(0, attempts - 1))
        patch = {
            "status": "failed" if terminal else "retry",
            "attempt_count": attempts,
            "last_attempt_at": _iso(_now()),
            "next_attempt_at": None if terminal else _iso(_now() + timedelta(minutes=delay_minutes)),
            "provider": settings.provider,
            "error": str(exc)[:2000],
            "claimed_at": None,
            "claimed_by": None,
        }
        await db.notification_emails.update_one(query, {"$set": patch})
        logger.warning(
            "Email delivery failed for %s on attempt %s: %s",
            row.get("recipient_email"),
            attempts,
            exc,
        )
        return patch

    patch = {
        "status": "sent",
        "attempt_count": attempts,
        "last_attempt_at": _iso(_now()),
        "sent_at": _iso(_now()),
        "provider": settings.provider,
        "error": "",
        "next_attempt_at": None,
        "claimed_at": None,
        "claimed_by": None,
    }
    await db.notification_emails.update_one(query, {"$set": patch})
    return patch


async def process_email_queue_once(db, worker_id: str, limit: int = 25) -> dict:
    settings = load_email_delivery_settings()
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

    return {
        "configured": settings.configured,
        "provider": settings.provider,
        "processed": processed,
        "sent": sent,
        "failed_or_retrying": failed,
    }


async def email_delivery_loop(db, worker_id: str) -> None:
    settings = load_email_delivery_settings()
    if not settings.configured:
        logger.warning(
            "Email queue delivery is not configured; messages will remain queued until "
            "SMTP_HOST/SMTP_FROM_EMAIL or sendmail is available."
        )

    await _release_stale_claims(db)
    while True:
        try:
            await process_email_queue_once(db, worker_id)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Email queue processing failed")
        await asyncio.sleep(load_email_delivery_settings().poll_seconds)
