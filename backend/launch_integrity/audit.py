"""Universal redacted audit events for sensitive FandomForge mutations."""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
from typing import Any, Dict, Optional
import uuid

SENSITIVE_KEYS = {
    "password", "password_hash", "secret", "secret_key", "paystack_secret_key",
    "webhook_secret", "smtp_password", "authorization", "token", "access_token",
    "account_number", "bank_account", "card_number", "cvv", "private_key",
}


def utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _redact(value: Any, key: Optional[str] = None) -> Any:
    if key and key.lower() in SENSITIVE_KEYS:
        return "[REDACTED]"
    if isinstance(value, dict):
        return {str(k): _redact(v, str(k)) for k, v in value.items()}
    if isinstance(value, list):
        return [_redact(v) for v in value]
    if isinstance(value, tuple):
        return [_redact(v) for v in value]
    return value


def _stable_hash(value: Any) -> str:
    payload = json.dumps(_redact(value), sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def correlation_id_from_request(request: Any = None) -> str:
    if request is not None:
        headers = getattr(request, "headers", {}) or {}
        for key in ("x-correlation-id", "x-request-id", "traceparent"):
            value = headers.get(key)
            if value:
                return str(value)[:200]
    return str(uuid.uuid4())


async def write_audit_event(
    db,
    *,
    action: str,
    entity_type: str,
    entity_id: Optional[str],
    actor: Any = None,
    provider: Optional[str] = None,
    before: Any = None,
    after: Any = None,
    reason: Optional[str] = None,
    request: Any = None,
    related_creator_id: Optional[str] = None,
    related_printer_id: Optional[str] = None,
    related_product_id: Optional[str] = None,
    related_order_id: Optional[str] = None,
    related_financial_event_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    idempotency_key: Optional[str] = None,
) -> Dict[str, Any]:
    actor_id = getattr(actor, "id", None) or (actor or {}).get("id") if actor else None
    actor_role = getattr(actor, "role", None) or (actor or {}).get("role") if actor else None
    now = utc_iso()
    correlation_id = correlation_id_from_request(request)
    safe_before = _redact(deepcopy(before))
    safe_after = _redact(deepcopy(after))
    key = idempotency_key or _stable_hash({
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "actor_id": actor_id,
        "provider": provider,
        "before": safe_before,
        "after": safe_after,
        "correlation_id": correlation_id,
    })
    event = {
        "id": str(uuid.uuid4()),
        "idempotency_key": key,
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "actor_user_id": actor_id,
        "actor_role": actor_role,
        "provider": provider,
        "created_at": now,
        "effective_at": now,
        "before": safe_before,
        "after": safe_after,
        "before_hash": _stable_hash(safe_before),
        "after_hash": _stable_hash(safe_after),
        "reason": reason or "",
        "related_creator_id": related_creator_id,
        "related_printer_id": related_printer_id,
        "related_product_id": related_product_id,
        "related_order_id": related_order_id,
        "related_financial_event_id": related_financial_event_id,
        "correlation_id": correlation_id,
        "metadata": _redact(metadata or {}),
    }
    await db.audit_events.update_one(
        {"idempotency_key": key},
        {"$setOnInsert": event},
        upsert=True,
    )
    return await db.audit_events.find_one({"idempotency_key": key}, {"_id": 0}) or event


async def ensure_audit_indexes(db) -> None:
    await db.audit_events.create_index([("idempotency_key", 1)], unique=True)
    await db.audit_events.create_index([("created_at", -1)])
    await db.audit_events.create_index([("entity_type", 1), ("entity_id", 1), ("created_at", -1)])
    await db.audit_events.create_index([("related_order_id", 1), ("created_at", -1)])
    await db.audit_events.create_index([("related_product_id", 1), ("created_at", -1)])
