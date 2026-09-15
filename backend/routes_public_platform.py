"""Public routes whose delivery details must follow instance branding settings."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from models import uid, utcnow
from routes_main import _get_platform_settings_doc, _public_platform_payload, normalize_email


public_platform_router = APIRouter(prefix="/public")


class PublicContactPayload(BaseModel):
    name: str
    email: str
    phone: Optional[str] = ""
    topic: Optional[str] = "General enquiry"
    message: str


@public_platform_router.post("/contact")
async def submit_platform_contact(payload: PublicContactPayload, request: Request):
    name = (payload.name or "").strip()
    email = normalize_email(payload.email)
    phone = (payload.phone or "").strip()
    topic = (payload.topic or "General enquiry").strip()[:120]
    message = (payload.message or "").strip()

    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if not email or "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="A valid email address is required")
    if len(message) < 5:
        raise HTTPException(status_code=400, detail="Message is too short")

    db = request.app.state.db
    platform = _public_platform_payload(await _get_platform_settings_doc(db))
    platform_name = str(platform.get("platform_name") or "Fandom Forge").strip() or "Fandom Forge"
    support_email = (
        platform.get("public_contact_email")
        or platform.get("support_email")
        or ""
    ).strip()

    if not support_email:
        raise HTTPException(status_code=503, detail="Public support email is not configured")

    now = utcnow()
    contact_id = uid()
    contact_doc = {
        "id": contact_id,
        "source": "public_contact_form",
        "status": "new",
        "name": name,
        "email": email,
        "phone": phone,
        "topic": topic,
        "message": message,
        "platform_name": platform_name,
        "recipient_email": support_email,
        "created_at": now,
        "updated_at": now,
    }
    await db.contact_messages.insert_one(contact_doc)

    body = "\n".join([
        f"New {platform_name} website enquiry",
        "",
        f"Name: {name}",
        f"Email: {email}",
        f"Phone / WhatsApp: {phone or 'Not provided'}",
        f"Topic: {topic}",
        "",
        "Message:",
        message,
        "",
        f"Contact message ID: {contact_id}",
    ])

    await db.notification_emails.insert_one({
        "id": uid(),
        "status": "queued",
        "recipient_email": support_email,
        "subject": f"{platform_name} contact form — {topic}",
        "body": body,
        "event_type": "public_contact_form",
        "related_id": contact_id,
        "created_at": now,
        "updated_at": now,
        "provider": "",
        "error": "",
    })

    return {
        "ok": True,
        "message": "Thanks! Your message has been received.",
        "contact_id": contact_id,
    }
