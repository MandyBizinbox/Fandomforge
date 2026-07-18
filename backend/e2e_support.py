"""Non-production E2E controls.

This router is conditionally registered only when E2E_TEST_MODE=1 and the database
name starts with ``fandomforge_e2e_``. It never contacts a payment provider.
"""
from __future__ import annotations

import os
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Request

from auth import get_current_user
from models import User
import routes_main as core

from launch_integrity.finance import reconciliation_report
from launch_integrity.permissions import require_owner


e2e_router = APIRouter(prefix="/e2e", tags=["e2e-test-only"])


def e2e_enabled() -> bool:
    return (
        os.environ.get("E2E_TEST_MODE") == "1"
        and os.environ.get("ENVIRONMENT", "development").lower() != "production"
        and os.environ.get("DB_NAME", "").startswith("fandomforge_e2e_")
    )


def require_e2e() -> None:
    if not e2e_enabled():
        raise HTTPException(status_code=404, detail="Not found")


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
    return {
        "order": order,
        "wallet_transactions": await db.wallet_transactions.find({"order_id": order_id}, {"_id": 0}).sort("created_at", 1).to_list(1000),
        "financial_adjustments": await db.financial_adjustments.find({"order_id": order_id}, {"_id": 0}).sort("created_at", 1).to_list(1000),
        "production_jobs": await db.production_jobs.find({"order_id": order_id}, {"_id": 0}).sort("created_at", 1).to_list(1000),
        "audit_events": await db.audit_events.find({"related_order_id": order_id}, {"_id": 0}).sort("created_at", 1).to_list(1000),
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
