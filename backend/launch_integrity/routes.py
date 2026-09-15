"""Integrated launch-integrity API routes registered before legacy handlers."""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import os
from typing import Any, Dict, List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from auth import get_current_user, optional_user
from models import CheckoutRequest, User
import routes_main as core

from . import LAUNCH_INTEGRITY_VERSION
from .audit import write_audit_event
from .entitlements import (
    FEATURE_REGISTRY,
    resolve_entitlement,
    set_entitlement_override,
)
from .finance import apply_financial_reversal, reconciliation_report
from .permissions import (
    is_admin,
    is_owner,
    require_admin,
    require_manager_permission,
    require_owner,
    role_of,
)
from .pricing import (
    CHECKOUT_GATEWAY,
    calculate_product_pricing,
    finalize_order_allocations,
    replay_matches,
)
from .settings import (
    DEFAULT_LAUNCH_INTEGRITY,
    LaunchIntegritySettings,
    resolve_platform_settings,
    settings_version,
)

integrity_router = APIRouter(tags=["launch-integrity"])


def utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class LaunchSettingsUpdate(BaseModel):
    tax: Optional[Dict[str, Any]] = None
    gateway_fees: Optional[Dict[str, Dict[str, Any]]] = None
    financial_rules: Optional[Dict[str, Any]] = None
    default_printer_id: Optional[str] = None
    packaging_cost: Optional[float] = None
    entitlement_modules: Optional[Dict[str, str]] = None
    reason: str


class EntitlementOverrideInput(BaseModel):
    owner_type: str
    owner_id: str
    feature_key: str
    value: Any
    reason: str
    expires_at: Optional[datetime] = None


class ProductTransferInput(BaseModel):
    new_creator_id: str
    reason: str


class PricingPreviewInput(BaseModel):
    product_id: str
    variation_id: Optional[str] = None
    quantity: int = Field(default=1, ge=1)
    printer_id: Optional[str] = None
    gateway: str = "paystack"
    customer_unit_price: Optional[float] = None


class FinancialAdjustmentLine(BaseModel):
    order_item_id: str
    quantity: int = Field(ge=1)


class FinancialAdjustmentInput(BaseModel):
    idempotency_key: str
    lines: Optional[List[FinancialAdjustmentLine]] = None
    reason: str
    provider: Optional[str] = None


class SubscriptionChangeInput(BaseModel):
    plan_id: str
    activation_mode: str = "paystack_test"  # paystack_test | free | controlled_manual
    callback_url: Optional[str] = None
    reason: str = "Account plan change"


class ManualSubscriptionInput(BaseModel):
    owner_type: str
    owner_id: str
    plan_id: str
    status: str = "active"
    reason: str


async def _owner_for_user(db, user: User) -> tuple[str, str, dict]:
    if user.role == "creator":
        creator = await core.get_creator_account_for_user(db, user)
        return "creator", creator["id"], creator
    if user.role == "printer":
        printer = await db.printers.find_one({"user_id": user.id}, {"_id": 0})
        if not printer:
            membership = await db.printer_members.find_one({"user_id": user.id, "status": "active"}, {"_id": 0})
            if membership:
                printer = await db.printers.find_one({"id": membership.get("printer_id")}, {"_id": 0})
        if not printer:
            raise HTTPException(status_code=404, detail="Printer account not found")
        return "printer", printer["id"], printer
    raise HTTPException(status_code=400, detail="This account does not have a Creator or Printer subscription owner")


async def _subscription_doc(db, owner_type: str, owner_id: str) -> dict:
    return await db.account_subscriptions.find_one({"owner_type": owner_type, "owner_id": owner_id}, {"_id": 0}) or {}


async def _available_plan(db, plan_id: str, owner_type: str) -> dict:
    plan = await db.subscription_plans.find_one({
        "id": plan_id,
        "audience": {"$in": [owner_type, "both"]},
        "status": "active",
    }, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="An active approved plan for this account type was not found")
    return plan


async def _apply_subscription(
    db,
    *,
    owner_type: str,
    owner_id: str,
    plan: dict,
    status: str,
    payment_method: str,
    actor: User,
    reason: str,
    request: Request,
) -> dict:
    before = await _subscription_doc(db, owner_type, owner_id)
    now = utc_iso()
    plan_entitlements = dict(plan.get("entitlements") or {})
    limits = dict(plan.get("limits") or {})
    patch = {
        "owner_type": owner_type,
        "owner_id": owner_id,
        "plan_id": plan.get("id"),
        "status": status,
        "payment_method": payment_method,
        "monthly_fee": float(plan.get("monthly_price") or 0),
        "billing_cycle": plan.get("billing_cycle") or "monthly",
        "plan_entitlements_snapshot": plan_entitlements,
        "plan_limits_snapshot": limits,
        "plan_version": plan.get("version") or plan.get("updated_at") or "legacy-unversioned",
        "updated_at": now,
        "last_changed_by_user_id": actor.id,
        "last_changed_by_role": actor.role,
        "last_change_reason": reason,
    }
    if before:
        await db.account_subscriptions.update_one({"id": before.get("id")}, {"$set": patch})
        subscription_id = before.get("id")
    else:
        subscription_id = str(uuid.uuid4())
        await db.account_subscriptions.insert_one({"id": subscription_id, "created_at": now, **patch})
    updated = await db.account_subscriptions.find_one({"id": subscription_id}, {"_id": 0})
    await core._sync_owner_subscription_status(db, updated)
    await write_audit_event(
        db,
        action="subscription.change",
        entity_type="account_subscription",
        entity_id=subscription_id,
        actor=actor,
        before=before,
        after=updated,
        reason=reason,
        request=request,
        related_creator_id=owner_id if owner_type == "creator" else None,
        related_printer_id=owner_id if owner_type == "printer" else None,
    )
    return updated


@integrity_router.get("/integrity/health")
async def integrity_health(request: Request):
    db = request.app.state.db
    email_counts = {}
    for status in ["queued", "sending", "retry", "sent", "failed"]:
        email_counts[status] = await db.notification_emails.count_documents({"status": status})
    return {
        "status": "ok",
        "integrity_version": LAUNCH_INTEGRITY_VERSION,
        "production_mutation": False,
        "workers": {"email": email_counts},
        "collections": {
            "audit_events": await db.audit_events.estimated_document_count(),
            "financial_adjustments": await db.financial_adjustments.estimated_document_count(),
            "production_jobs": await db.production_jobs.estimated_document_count(),
        },
    }


@integrity_router.get("/integrity/settings")
async def get_integrity_settings(request: Request, user: User = Depends(get_current_user)):
    require_manager_permission(user, "manage_platform_branding")
    settings = await resolve_platform_settings(request.app.state.db)
    return {
        "version_id": settings.version_id,
        "launch_integrity": settings.launch.model_dump(),
        "platform_modules": settings.modules,
        "precedence": [
            "platform module",
            "active account subscription",
            "plan entitlement",
            "audited account override",
        ],
    }


@integrity_router.patch("/integrity/settings")
async def update_integrity_settings(payload: LaunchSettingsUpdate, request: Request, user: User = Depends(get_current_user)):
    require_owner(user)
    if not payload.reason.strip():
        raise HTTPException(status_code=400, detail="A settings-change reason is required")
    db = request.app.state.db
    before_doc = await db.settings.find_one({"id": "platform"}, {"_id": 0}) or {"id": "platform"}
    current = await resolve_platform_settings(db)
    merged = current.launch.model_dump()
    for field in ["tax", "gateway_fees", "financial_rules", "entitlement_modules"]:
        value = getattr(payload, field)
        if value is not None:
            if isinstance(merged.get(field), dict):
                merged[field] = {**merged.get(field, {}), **value}
            else:
                merged[field] = value
    if payload.default_printer_id is not None:
        if payload.default_printer_id:
            printer = await db.printers.find_one({"id": payload.default_printer_id, "status": "active"}, {"_id": 1})
            if not printer:
                raise HTTPException(status_code=400, detail="Default Printer must be active")
        merged["default_printer_id"] = payload.default_printer_id
    if payload.packaging_cost is not None:
        if payload.packaging_cost < 0:
            raise HTTPException(status_code=400, detail="Packaging cost cannot be negative")
        merged["packaging_cost"] = round(payload.packaging_cost, 2)
    typed = LaunchIntegritySettings(**merged)
    after_doc = {**before_doc, "launch_integrity": typed.model_dump(), "integrity_schema_version": LAUNCH_INTEGRITY_VERSION, "updated_at": utc_iso()}
    after_version = settings_version(after_doc)
    await db.settings.update_one({"id": "platform"}, {"$set": {
        "launch_integrity": typed.model_dump(),
        "integrity_schema_version": LAUNCH_INTEGRITY_VERSION,
        "updated_at": after_doc["updated_at"],
    }}, upsert=True)
    history = {
        "id": str(uuid.uuid4()),
        "settings_version": after_version,
        "previous_settings_version": settings_version(before_doc),
        "launch_integrity": typed.model_dump(),
        "reason": payload.reason,
        "created_at": utc_iso(),
        "created_by_user_id": user.id,
        "created_by_role": user.role,
    }
    await db.settings_history.update_one({"settings_version": after_version}, {"$setOnInsert": history}, upsert=True)
    await write_audit_event(db, action="platform_settings.update", entity_type="platform_settings", entity_id="platform", actor=user, before=before_doc.get("launch_integrity"), after=typed.model_dump(), reason=payload.reason, request=request, idempotency_key=f"audit:settings:{after_version}")
    return {"settings_version": after_version, "launch_integrity": typed.model_dump()}


@integrity_router.get("/entitlements/registry")
async def entitlement_registry(user: User = Depends(get_current_user)):
    if not is_admin(user):
        raise HTTPException(status_code=403, detail="Administrator access required")
    return FEATURE_REGISTRY


@integrity_router.get("/entitlements/me")
async def my_entitlements(request: Request, user: User = Depends(get_current_user)):
    owner_type, owner_id, _ = await _owner_for_user(request.app.state.db, user)
    keys = [key for key, definition in FEATURE_REGISTRY.items() if definition.get("owner_type") in {owner_type, "both"}]
    return {key: (await resolve_entitlement(request.app.state.db, owner_type, owner_id, key)).as_dict() for key in keys}


@integrity_router.get("/entitlements/me/{feature_key}")
async def my_entitlement(feature_key: str, request: Request, user: User = Depends(get_current_user)):
    owner_type, owner_id, _ = await _owner_for_user(request.app.state.db, user)
    return (await resolve_entitlement(request.app.state.db, owner_type, owner_id, feature_key)).as_dict()


@integrity_router.post("/admin/entitlement-overrides")
async def create_entitlement_override(payload: EntitlementOverrideInput, request: Request, user: User = Depends(get_current_user)):
    require_admin(user)
    return await set_entitlement_override(
        request.app.state.db,
        owner_type=payload.owner_type,
        owner_id=payload.owner_id,
        feature_key=payload.feature_key,
        value=payload.value,
        actor=user,
        reason=payload.reason,
        expires_at=payload.expires_at,
        request=request,
    )


@integrity_router.get("/subscriptions/plans/available")
async def available_plans(request: Request, owner_type: Optional[str] = None, user: User = Depends(get_current_user)):
    if owner_type is None:
        owner_type, _, _ = await _owner_for_user(request.app.state.db, user)
    elif not is_admin(user):
        own_type, _, _ = await _owner_for_user(request.app.state.db, user)
        if owner_type != own_type:
            raise HTTPException(status_code=403, detail="Cannot inspect plans for another account type")
    plans = await request.app.state.db.subscription_plans.find({
        "audience": {"$in": [owner_type, "both"]},
        "status": "active",
    }, {"_id": 0, "secret_key": 0}).sort("sort_order", 1).to_list(100)
    return plans


@integrity_router.post("/subscriptions/me/change-plan")
async def change_my_plan(payload: SubscriptionChangeInput, request: Request, user: User = Depends(get_current_user)):
    db = request.app.state.db
    owner_type, owner_id, owner = await _owner_for_user(db, user)
    plan = await _available_plan(db, payload.plan_id, owner_type)
    price = float(plan.get("monthly_price") or 0)
    mode = payload.activation_mode
    if price <= 0:
        return await _apply_subscription(db, owner_type=owner_type, owner_id=owner_id, plan=plan, status="free", payment_method="free", actor=user, reason=payload.reason, request=request)
    if mode == "controlled_manual":
        if not (os.environ.get("E2E_TEST_MODE") == "1" and os.environ.get("ENVIRONMENT", "development") != "production"):
            raise HTTPException(status_code=403, detail="Controlled manual self-upgrade is available only in non-production test mode")
        return await _apply_subscription(db, owner_type=owner_type, owner_id=owner_id, plan=plan, status="active", payment_method="manual", actor=user, reason=payload.reason, request=request)
    settings = await core._get_subscription_billing_settings(db, masked=False)
    if not settings.get("enabled") or settings.get("mode") != "test":
        raise HTTPException(status_code=409, detail="Paystack test subscription billing must be enabled before a paid self-upgrade can be tested")
    subscription = await _apply_subscription(db, owner_type=owner_type, owner_id=owner_id, plan=plan, status="requires_payment", payment_method="paystack", actor=user, reason=payload.reason, request=request)
    email = owner.get("contact_email") or user.email
    checkout_url = await core._signup_paystack_checkout(db, request, subscription, plan, email, payload.callback_url)
    return {"subscription": subscription, "checkout_url": checkout_url, "status": "requires_payment"}


@integrity_router.post("/admin/subscriptions/manual-activate")
async def manual_activate_subscription(payload: ManualSubscriptionInput, request: Request, user: User = Depends(get_current_user)):
    require_manager_permission(user, "manage_subscriptions")
    if payload.status not in {"active", "manual", "free", "trial", "cancelled", "suspended"}:
        raise HTTPException(status_code=400, detail="Invalid controlled subscription status")
    plan = await _available_plan(request.app.state.db, payload.plan_id, payload.owner_type)
    return await _apply_subscription(request.app.state.db, owner_type=payload.owner_type, owner_id=payload.owner_id, plan=plan, status=payload.status, payment_method="manual", actor=user, reason=payload.reason, request=request)


@integrity_router.post("/admin/products/{product_id}/transfer")
async def transfer_product(product_id: str, payload: ProductTransferInput, request: Request, user: User = Depends(get_current_user)):
    require_admin(user)
    if not payload.reason.strip():
        raise HTTPException(status_code=400, detail="A product-transfer reason is required")
    db = request.app.state.db
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    creator = await db.creators.find_one({"id": payload.new_creator_id}, {"_id": 0})
    if not product or not creator:
        raise HTTPException(status_code=404, detail="Product or destination Creator not found")
    before = {key: product.get(key) for key in ["band_id", "creator_id", "creator_account_id", "store_id", "product_version"]}
    patch = {
        "band_id": creator["id"],
        "creator_id": creator["id"],
        "creator_account_id": creator["id"],
        "store_id": creator["id"],
        "product_version": int(product.get("product_version") or 1) + 1,
        "ownership_transferred_at": utc_iso(),
        "ownership_transferred_by_user_id": user.id,
        "ownership_transfer_reason": payload.reason,
        "updated_at": utc_iso(),
    }
    await db.products.update_one({"id": product_id, "band_id": product.get("band_id")}, {"$set": patch})
    await write_audit_event(db, action="product.ownership_transfer", entity_type="product", entity_id=product_id, actor=user, before=before, after=patch, reason=payload.reason, request=request, related_creator_id=creator["id"], related_product_id=product_id)
    return await db.products.find_one({"id": product_id}, {"_id": 0})


@integrity_router.post("/pricing/preview")
async def pricing_preview(payload: PricingPreviewInput, request: Request, user: User = Depends(get_current_user)):
    db = request.app.state.db
    product = await db.products.find_one({"id": payload.product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if not is_admin(user):
        allowed = await core.user_can_access_band(db, user, product.get("band_id"), permission="manage_products")
        if not allowed:
            raise HTTPException(status_code=403, detail="Cannot price another Creator's product")
    return await calculate_product_pricing(db, product=product, variation_id=payload.variation_id, quantity=payload.quantity, printer_id=payload.printer_id or product.get("assigned_printer_id"), gateway=payload.gateway, customer_unit_price=payload.customer_unit_price)


@integrity_router.post("/pricing/replay")
async def pricing_replay(snapshot: Dict[str, Any], user: User = Depends(get_current_user)):
    require_manager_permission(user, "manage_reports")
    return {"matches": replay_matches(snapshot), "calculation_sha256": snapshot.get("calculation_sha256")}


async def _financial_action(order_id: str, event_type: str, payload: FinancialAdjustmentInput, request: Request, user: User):
    require_manager_permission(user, "manage_payouts")
    lines = [row.model_dump() for row in payload.lines] if payload.lines else None
    return await apply_financial_reversal(request.app.state.db, order_id=order_id, event_type=event_type, idempotency_key=payload.idempotency_key, lines=lines, actor=user, provider=payload.provider, reason=payload.reason, request=request)


@integrity_router.post("/admin/orders/{order_id}/refunds")
async def refund_order(order_id: str, payload: FinancialAdjustmentInput, request: Request, user: User = Depends(get_current_user)):
    return await _financial_action(order_id, "refund", payload, request, user)


@integrity_router.post("/admin/orders/{order_id}/chargebacks")
async def chargeback_order(order_id: str, payload: FinancialAdjustmentInput, request: Request, user: User = Depends(get_current_user)):
    return await _financial_action(order_id, "chargeback", payload, request, user)


@integrity_router.post("/admin/orders/{order_id}/provider-reversals")
async def provider_reversal(order_id: str, payload: FinancialAdjustmentInput, request: Request, user: User = Depends(get_current_user)):
    return await _financial_action(order_id, "provider_reversal", payload, request, user)


@integrity_router.get("/admin/finance/reconciliation")
async def finance_reconciliation(request: Request, order_id: Optional[str] = None, user: User = Depends(get_current_user)):
    require_manager_permission(user, "manage_reports")
    return await reconciliation_report(request.app.state.db, order_id)


@integrity_router.get("/admin/audit-events")
async def audit_events(request: Request, entity_type: Optional[str] = None, entity_id: Optional[str] = None, limit: int = 200, user: User = Depends(get_current_user)):
    require_manager_permission(user, "manage_reports")
    query: Dict[str, Any] = {}
    if entity_type:
        query["entity_type"] = entity_type
    if entity_id:
        query["entity_id"] = entity_id
    return await request.app.state.db.audit_events.find(query, {"_id": 0}).sort("created_at", -1).to_list(min(max(limit, 1), 1000))


@integrity_router.post("/orders/checkout", response_model=dict)
async def integrity_checkout(payload: CheckoutRequest, request: Request, user: User = Depends(optional_user)):
    db = request.app.state.db
    creator_ids = set()
    for cart_item in payload.items or []:
        product = await db.products.find_one({"id": cart_item.product_id}, {"_id": 0, "band_id": 1})
        if not product:
            raise HTTPException(status_code=400, detail=f"Product not found: {cart_item.product_id}")
        creator_ids.add(product.get("band_id"))
    for creator_id in creator_ids:
        storefront = await resolve_entitlement(db, "creator", creator_id, "storefront_visible")
        checkout = await resolve_entitlement(db, "creator", creator_id, "checkout_enabled")
        denied = next((row for row in [storefront, checkout] if not row.allowed), None)
        if denied:
            raise HTTPException(status_code=403, detail={"code": "creator_checkout_locked", **denied.as_dict()})
    token = CHECKOUT_GATEWAY.set((payload.payment_provider or "manual_eft").strip())
    try:
        response = await core.checkout(payload, request, user)
    finally:
        CHECKOUT_GATEWAY.reset(token)
    order = await db.orders.find_one({"id": response.get("order_id")}, {"_id": 0})
    if order:
        await finalize_order_allocations(db, order)
    return response
