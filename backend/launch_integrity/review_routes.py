"""Read-only Owner/Admin review views for Creator and Printer accounts."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Request

from auth import get_current_user
from models import User

from .entitlements import FEATURE_REGISTRY, resolve_entitlement
from .permissions import require_manager_permission, role_of

review_router = APIRouter(prefix="/admin/review", tags=["launch-integrity-review"])


def _mask_profile(profile: Dict[str, Any]) -> Dict[str, Any]:
    data = dict(profile or {})
    account = str(data.get("account_number") or "")
    data["account_number"] = f"••••{account[-4:]}" if account else ""
    data.pop("paystack_recipient_code", None)
    return data


async def _entitlements(db, owner_type: str, owner_id: str) -> Dict[str, Any]:
    keys = [key for key, definition in FEATURE_REGISTRY.items() if definition.get("owner_type") in {owner_type, "both"}]
    return {key: (await resolve_entitlement(db, owner_type, owner_id, key)).as_dict() for key in keys}


@review_router.get("/creators/{creator_id}")
async def review_creator(creator_id: str, request: Request, user: User = Depends(get_current_user)):
    require_manager_permission(user, "manage_bands")
    db = request.app.state.db
    creator = await db.creators.find_one({"id": creator_id}, {"_id": 0})
    if not creator:
        raise HTTPException(status_code=404, detail="Creator not found")
    products = await db.products.find({"band_id": creator_id}, {"_id": 0}).sort("updated_at", -1).to_list(1000)
    orders = await db.orders.find({"items.band_id": creator_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    wallet = await db.wallet_transactions.find({"owner_type": "creator", "owner_id": creator_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    profile = await db.payout_profiles.find_one({"owner_type": "creator", "owner_id": creator_id, "is_default": True}, {"_id": 0})
    subscription = await db.account_subscriptions.find_one({"owner_type": "creator", "owner_id": creator_id}, {"_id": 0})
    jobs = await db.production_jobs.find({"creator_id": creator_id}, {"_id": 0}).sort("updated_at", -1).to_list(500)
    audits = await db.audit_events.find({"related_creator_id": creator_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {
        "review_mode": True,
        "reviewed_by_role": role_of(user),
        "creator": creator,
        "subscription": subscription,
        "entitlements": await _entitlements(db, "creator", creator_id),
        "products": products,
        "orders": orders,
        "wallet": wallet,
        "payout_profile": _mask_profile(profile or {}),
        "production_jobs": jobs,
        "audit_events": audits,
        "summary": {
            "products": len(products),
            "orders": len(orders),
            "wallet_balance": round(sum(float(row.get("amount") or 0) for row in wallet if row.get("status") in {"available", "in_batch", "paid"}), 2),
            "open_production_jobs": sum(1 for row in jobs if row.get("status") not in {"completed", "dispatched"}),
        },
    }


@review_router.get("/printers/{printer_id}")
async def review_printer(printer_id: str, request: Request, user: User = Depends(get_current_user)):
    require_manager_permission(user, "manage_printers")
    db = request.app.state.db
    printer = await db.printers.find_one({"id": printer_id}, {"_id": 0})
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    jobs = await db.production_jobs.find({"printer_id": printer_id}, {"_id": 0}).sort("updated_at", -1).to_list(1000)
    wallet = await db.wallet_transactions.find({"owner_type": "printer", "owner_id": printer_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    profile = await db.payout_profiles.find_one({"owner_type": "printer", "owner_id": printer_id, "is_default": True}, {"_id": 0})
    subscription = await db.account_subscriptions.find_one({"owner_type": "printer", "owner_id": printer_id}, {"_id": 0})
    pricing = await db.printer_template_prices.find({"printer_id": printer_id}, {"_id": 0}).sort("updated_at", -1).to_list(1000)
    audits = await db.audit_events.find({"related_printer_id": printer_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {
        "review_mode": True,
        "reviewed_by_role": role_of(user),
        "printer": printer,
        "subscription": subscription,
        "entitlements": await _entitlements(db, "printer", printer_id),
        "production_jobs": jobs,
        "wallet": wallet,
        "payout_profile": _mask_profile(profile or {}),
        "pricing": pricing,
        "audit_events": audits,
        "summary": {
            "jobs": len(jobs),
            "open_jobs": sum(1 for row in jobs if row.get("status") not in {"completed", "dispatched", "rejected"}),
            "failed_or_reprint_jobs": sum(1 for row in jobs if row.get("status") in {"production_failed", "qc_failed", "reprint_requested"}),
            "wallet_balance": round(sum(float(row.get("amount") or 0) for row in wallet if row.get("status") in {"available", "in_batch", "paid"}), 2),
        },
    }
