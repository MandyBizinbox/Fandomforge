"""Non-production E2E controls.

This module is loaded only when E2E_TEST_MODE=1 and the database name starts
with ``fandomforge_e2e_``. It never contacts a payment provider. The email alias
adapter translates the reserved fixture suffix ``.test`` to the same-length,
syntactically valid ``.site`` suffix before Pydantic validation.
"""
from __future__ import annotations

from typing import Any, Dict

from e2e_runtime import e2e_enabled

from fastapi import APIRouter, Depends, HTTPException, Request

from auth import get_current_user
from models import User
import routes_main as core

from launch_integrity.finance import reconciliation_report
from launch_integrity.permissions import require_owner


E2E_EMAIL_ALIAS_FROM = "@e2e.fandomforge.test"
E2E_EMAIL_ALIAS_TO = "@e2e.fandomforge.site"
E2E_EMAIL_ALIAS_PATTERN = r"@e2e\.fandomforge\.test$"
e2e_router = APIRouter(prefix="/e2e", tags=["e2e-test-only"])


def require_e2e() -> None:
    if not e2e_enabled():
        raise HTTPException(status_code=404, detail="Not found")


async def normalize_e2e_fixture_emails(db) -> Dict[str, int]:
    """Normalize only disposable E2E fixture records; never runs in production."""
    require_e2e()
    changed: Dict[str, int] = {}
    for collection_name, field in (
        ("users", "email"),
        ("printers", "contact_email"),
        ("creators", "contact_email"),
    ):
        collection = db[collection_name]
        rows = await collection.find(
            {field: {"$regex": E2E_EMAIL_ALIAS_PATTERN}},
            {"_id": 0, "id": 1, field: 1},
        ).to_list(1000)
        count = 0
        for row in rows:
            value = str(row.get(field) or "")
            normalized = value.replace(E2E_EMAIL_ALIAS_FROM, E2E_EMAIL_ALIAS_TO)
            if normalized == value:
                continue
            result = await collection.update_one({"id": row.get("id")}, {"$set": {field: normalized}})
            count += int(result.modified_count or 0)
        changed[f"{collection_name}.{field}"] = count
    return changed


class E2EEmailAliasMiddleware:
    """Translate fixture email aliases in request bodies on the isolated E2E app."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if not e2e_enabled() or scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        body = b""
        while True:
            message = await receive()
            body += message.get("body", b"")
            if not message.get("more_body", False):
                break
        translated = body.replace(E2E_EMAIL_ALIAS_FROM.encode(), E2E_EMAIL_ALIAS_TO.encode())
        delivered = False

        async def translated_receive():
            nonlocal delivered
            if delivered:
                return {"type": "http.request", "body": b"", "more_body": False}
            delivered = True
            return {"type": "http.request", "body": translated, "more_body": False}

        await self.app(scope, translated_receive, send)


@e2e_router.post("/orders/{order_id}/confirm-mock-payment")
async def confirm_mock_payment(order_id: str, request: Request, user: User = Depends(get_current_user)):
    require_e2e()
    require_owner(user)
    db = request.app.state.db
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    payment = await db.payments.find_one({"order_id": order_id}, {"_id": 0})
    if not payment:
        payment = {
            "id": f"e2e-payment-{order_id}",
            "order_id": order_id,
            "amount": order.get("total"),
            "currency": (order.get("financial_snapshot") or {}).get("currency") or "ZAR",
            "provider": "mock",
            "provider_reference": f"e2e-mock-{order_id}",
            "status": "pending",
            "kind": "order",
        }
        await db.payments.insert_one(payment)
        await db.orders.update_one({"id": order_id}, {"$set": {"payment_id": payment["id"], "payment_provider": "mock"}})
        order["payment_id"] = payment["id"]
    paid = await core._mark_order_paid_from_payment(db, payment, {"event": "e2e.mock.success", "data": {"reference": payment.get("provider_reference"), "status": "success", "fees": 0}})
    return {"order": paid, "payment": await db.payments.find_one({"id": payment["id"]}, {"_id": 0})}


@e2e_router.get("/orders/{order_id}/evidence")
async def order_evidence(order_id: str, request: Request, user: User = Depends(get_current_user)):
    require_e2e()
    require_owner(user)
    db = request.app.state.db
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    product_ids = sorted({str(item.get("product_id")) for item in order.get("items") or [] if item.get("product_id")})
    audit_query = {"related_order_id": order_id}
    if product_ids:
        audit_query = {
            "$or": [
                {"related_order_id": order_id},
                {"related_product_id": {"$in": product_ids}},
            ]
        }
    return {
        "order": order,
        "wallet_transactions": await db.wallet_transactions.find({"order_id": order_id}, {"_id": 0}).sort("created_at", 1).to_list(1000),
        "financial_adjustments": await db.financial_adjustments.find({"order_id": order_id}, {"_id": 0}).sort("created_at", 1).to_list(1000),
        "production_jobs": await db.production_jobs.find({"order_id": order_id}, {"_id": 0}).sort("created_at", 1).to_list(1000),
        "audit_events": await db.audit_events.find(audit_query, {"_id": 0}).sort("created_at", 1).to_list(1000),
        "notifications": await db.notifications.find({"related_order_id": order_id}, {"_id": 0}).sort("created_at", 1).to_list(1000),
        "reconciliation": await reconciliation_report(db, order_id),
    }


@e2e_router.get("/database-summary")
async def database_summary(request: Request, user: User = Depends(get_current_user)):
    require_e2e()
    require_owner(user)
    db = request.app.state.db
    collections = [
        "users", "creators", "printers", "products", "orders", "payments",
        "wallet_transactions", "financial_adjustments", "payout_batches",
        "account_subscriptions", "entitlement_overrides", "production_jobs",
        "audit_events", "notification_emails",
    ]
    return {name: await db[name].count_documents({}) for name in collections}
