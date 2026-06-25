#!/usr/bin/env python3
import asyncio
import os
import smtplib
import ssl
import sys
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path

from motor.motor_asyncio import AsyncIOMotorClient


def load_env_file(path: str) -> None:
    p = Path(path)
    if not p.exists():
        return

    for line in p.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def build_message(email_doc: dict) -> EmailMessage:
    from_email = os.getenv("SMTP_FROM_EMAIL") or os.getenv("MAIL_FROM_EMAIL")
    from_name = os.getenv("SMTP_FROM_NAME") or os.getenv("MAIL_FROM_NAME") or "FandomForge"

    msg = EmailMessage()
    msg["From"] = f"{from_name} <{from_email}>"
    msg["To"] = email_doc.get("recipient_email")
    msg["Subject"] = email_doc.get("subject") or "FandomForge notification"
    msg.set_content(email_doc.get("body") or "")
    return msg


def send_email(email_doc: dict) -> None:
    host = os.getenv("SMTP_HOST")
    port = int(os.getenv("SMTP_PORT") or "587")
    username = os.getenv("SMTP_USERNAME") or os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASSWORD") or os.getenv("SMTP_PASS")
    use_ssl = (os.getenv("SMTP_USE_SSL") or "false").lower() in ("1", "true", "yes")
    use_tls = (os.getenv("SMTP_USE_TLS") or "true").lower() in ("1", "true", "yes")
    from_email = os.getenv("SMTP_FROM_EMAIL") or os.getenv("MAIL_FROM_EMAIL")

    if not host or not from_email:
        raise RuntimeError("Missing SMTP_HOST or SMTP_FROM_EMAIL")

    msg = build_message(email_doc)

    if use_ssl:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(host, port, context=context, timeout=30) as server:
            if username:
                server.login(username, password or "")
            server.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=30) as server:
            server.ehlo()
            if use_tls:
                server.starttls(context=ssl.create_default_context())
                server.ehlo()
            if username:
                server.login(username, password or "")
            server.send_message(msg)


async def main() -> int:
    load_env_file("/etc/fandomforge-email.env")
    load_env_file("/var/www/sites/fandomforge/backend/.env")
    load_env_file("/var/www/sites/fandomforge/.env")

    if not os.getenv("SMTP_HOST") or not (os.getenv("SMTP_FROM_EMAIL") or os.getenv("MAIL_FROM_EMAIL")):
        print("Email processor not configured: set SMTP_HOST and SMTP_FROM_EMAIL in /etc/fandomforge-email.env")
        return 2

    mongo_url = os.getenv("MONGO_URL") or os.getenv("MONGODB_URL") or "mongodb://127.0.0.1:27017/fandomforge"
    db_name = os.getenv("DB_NAME") or os.getenv("MONGO_DB") or "fandomforge"

    limit = int(os.getenv("EMAIL_QUEUE_LIMIT") or "25")

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    docs = await db.notification_emails.find(
        {"status": "queued", "recipient_email": {"$nin": [None, ""]}},
        {"_id": 0},
    ).sort("created_at", 1).to_list(limit)

    print(f"Queued emails found: {len(docs)}")

    sent = 0
    failed = 0

    for doc in docs:
        email_id = doc.get("id")
        try:
            claimed = await db.notification_emails.update_one(
                {"id": email_id, "status": "queued"},
                {"$set": {"status": "processing", "processing_started_at": now_iso(), "error": None}},
            )

            if claimed.modified_count != 1:
                continue

            send_email(doc)

            await db.notification_emails.update_one(
                {"id": email_id},
                {"$set": {
                    "status": "sent",
                    "sent_at": now_iso(),
                    "provider": "smtp",
                    "error": None,
                }},
            )
            sent += 1
            print(f"SENT {email_id} -> {doc.get('recipient_email')}")

        except Exception as exc:
            failed += 1
            await db.notification_emails.update_one(
                {"id": email_id},
                {"$set": {
                    "status": "failed",
                    "error": str(exc),
                    "failed_at": now_iso(),
                    "provider": "smtp",
                }},
            )
            print(f"FAILED {email_id} -> {doc.get('recipient_email')}: {exc}", file=sys.stderr)

    print(f"Done. sent={sent} failed={failed}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
