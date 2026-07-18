"""Request-level audit coverage for sensitive legacy and integrity routes."""
from __future__ import annotations

import json
import re
from typing import Any, Dict, Optional, Tuple

from .audit import write_audit_event

SENSITIVE_PATHS = (
    "/api/admin/settings",
    "/api/integrity/settings",
    "/api/admin/creators",
    "/api/admin/printers",
    "/api/admin/products",
    "/api/products",
    "/api/artworks",
    "/api/admin/subscription",
    "/api/subscriptions",
    "/api/admin/entitlement",
    "/api/creator-payouts/profile",
    "/api/admin/payout",
    "/api/admin/wallet-ledger",
    "/api/admin/orders",
    "/api/production-jobs",
)


def _entity(path: str) -> Tuple[str, Optional[str]]:
    patterns = [
        (r"/products/([^/]+)", "product"),
        (r"/creators/([^/]+)", "creator"),
        (r"/printers/([^/]+)", "printer"),
        (r"/orders/([^/]+)", "order"),
        (r"/production-jobs/([^/]+)", "production_job"),
        (r"/payout-batches/([^/]+)", "payout_batch"),
        (r"/subscriptions/([^/]+)", "subscription"),
        (r"/artworks/([^/]+)", "artwork"),
    ]
    for pattern, kind in patterns:
        match = re.search(pattern, path)
        if match:
            return kind, match.group(1)
    if "settings" in path:
        return "platform_settings", "platform"
    if "entitlement" in path:
        return "entitlement", None
    if "payout" in path or "wallet-ledger" in path:
        return "finance", None
    return "sensitive_request", None


async def _snapshot(db, entity_type: str, entity_id: Optional[str]) -> Any:
    if not entity_id:
        return None
    collection = {
        "product": db.products,
        "creator": db.creators,
        "printer": db.printers,
        "order": db.orders,
        "production_job": db.production_jobs,
        "payout_batch": db.payout_batches,
        "subscription": db.account_subscriptions,
        "artwork": db.artworks,
    }.get(entity_type)
    if collection is None:
        return None
    return await collection.find_one({"id": entity_id}, {"_id": 0})


async def launch_audit_middleware(request, call_next):
    method = request.method.upper()
    path = request.url.path
    if method not in {"POST", "PUT", "PATCH", "DELETE"} or not any(path.startswith(prefix) for prefix in SENSITIVE_PATHS):
        return await call_next(request)

    db = getattr(request.app.state, "db", None)
    if db is None:
        return await call_next(request)

    entity_type, entity_id = _entity(path)
    before = await _snapshot(db, entity_type, entity_id)
    body: Any = None
    try:
        raw = await request.body()
        body = json.loads(raw.decode("utf-8")) if raw else None
    except Exception:
        body = {"unparsed": True}

    response = await call_next(request)
    if response.status_code >= 400:
        return response

    after = await _snapshot(db, entity_type, entity_id)
    user = getattr(request.state, "user", None)
    actor = user if user is not None else {
        "id": request.headers.get("x-actor-user-id"),
        "role": request.headers.get("x-actor-role"),
    }
    reason = body.get("reason") if isinstance(body, dict) else ""
    await write_audit_event(
        db,
        action=f"http.{method.lower()}",
        entity_type=entity_type,
        entity_id=entity_id,
        actor=actor,
        before=before,
        after=after or {"request": body, "status_code": response.status_code},
        reason=str(reason or ""),
        request=request,
        related_product_id=entity_id if entity_type == "product" else None,
        related_order_id=entity_id if entity_type == "order" else None,
        idempotency_key=f"http-audit:{request.headers.get('x-request-id') or request.headers.get('x-correlation-id') or id(request)}:{method}:{path}",
        metadata={"path": path, "status_code": response.status_code, "request": body},
    )
    return response
