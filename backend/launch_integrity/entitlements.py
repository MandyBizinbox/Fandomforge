"""Creator and Printer subscription entitlement resolution.

Platform modules and account plan entitlements are intentionally evaluated as two
separate gates. Existing data is never deleted when an entitlement is removed;
new restricted actions are denied with structured upgrade metadata.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import HTTPException

from .audit import write_audit_event
from .settings import feature_platform_module, module_enabled, resolve_platform_settings


FEATURE_REGISTRY: Dict[str, Dict[str, Any]] = {
    # Creator launch features.
    "product_publish": {"owner_type": "creator", "kind": "boolean", "default": True},
    "max_products": {"owner_type": "creator", "kind": "limit", "default": None, "usage": "products"},
    "storefront_visible": {"owner_type": "creator", "kind": "boolean", "default": True},
    "checkout_enabled": {"owner_type": "creator", "kind": "boolean", "default": True},
    "artwork_storage_mb": {"owner_type": "creator", "kind": "limit", "default": None, "usage": "artwork_storage_mb"},
    "team_members": {"owner_type": "creator", "kind": "limit", "default": 1, "usage": "team_members"},
    "creator_reporting": {"owner_type": "creator", "kind": "boolean", "default": True},
    "creator_payout_visibility": {"owner_type": "creator", "kind": "boolean", "default": True},
    # Printer launch features.
    "printer_jobs": {"owner_type": "printer", "kind": "boolean", "default": True},
    "printer_job_limit": {"owner_type": "printer", "kind": "limit", "default": None, "usage": "printer_jobs"},
    "printer_template_access": {"owner_type": "printer", "kind": "boolean", "default": True},
    "printer_team_members": {"owner_type": "printer", "kind": "limit", "default": 1, "usage": "printer_team_members"},
    "printer_pricing": {"owner_type": "printer", "kind": "boolean", "default": True},
    "printer_payout_visibility": {"owner_type": "printer", "kind": "boolean", "default": True},
    "printer_reporting": {"owner_type": "printer", "kind": "boolean", "default": True},
    # Future creator keys: disabled until an approved plan explicitly enables them.
    "external_ecommerce_links": {"owner_type": "creator", "kind": "boolean", "default": False, "future": True},
    "woocommerce_integration": {"owner_type": "creator", "kind": "boolean", "default": False, "future": True},
    "shopify_integration": {"owner_type": "creator", "kind": "boolean", "default": False, "future": True},
    "marketplace_integrations": {"owner_type": "creator", "kind": "boolean", "default": False, "future": True},
    "advanced_reports": {"owner_type": "creator", "kind": "boolean", "default": False, "future": True},
    "custom_reports": {"owner_type": "creator", "kind": "boolean", "default": False, "future": True},
    "sales_export": {"owner_type": "creator", "kind": "boolean", "default": False, "future": True},
    "customer_export": {"owner_type": "creator", "kind": "boolean", "default": False, "future": True},
    "bulk_product_tools": {"owner_type": "creator", "kind": "boolean", "default": False, "future": True},
    "custom_storefront_themes": {"owner_type": "creator", "kind": "boolean", "default": False, "future": True},
    "custom_domain": {"owner_type": "creator", "kind": "boolean", "default": False, "future": True},
    "additional_stores": {"owner_type": "creator", "kind": "limit", "default": 0, "future": True},
    "enhanced_mockups": {"owner_type": "creator", "kind": "boolean", "default": False, "future": True},
    "priority_support": {"owner_type": "both", "kind": "boolean", "default": False, "future": True},
    "custom_payout_schedule": {"owner_type": "both", "kind": "boolean", "default": False, "future": True},
    "payout_threshold_controls": {"owner_type": "creator", "kind": "boolean", "default": False, "future": True},
    "api_access": {"owner_type": "both", "kind": "boolean", "default": False, "future": True},
    "webhooks": {"owner_type": "both", "kind": "boolean", "default": False, "future": True},
    "promotional_tools": {"owner_type": "creator", "kind": "boolean", "default": False, "future": True},
    "discount_codes": {"owner_type": "creator", "kind": "boolean", "default": False, "future": True},
    "email_marketing": {"owner_type": "creator", "kind": "boolean", "default": False, "future": True},
    "advanced_analytics": {"owner_type": "creator", "kind": "boolean", "default": False, "future": True},
    # Future printer keys.
    "printer_multiple_locations": {"owner_type": "printer", "kind": "boolean", "default": False, "future": True},
    "printer_routing_priority": {"owner_type": "printer", "kind": "boolean", "default": False, "future": True},
    "printer_advanced_production_reports": {"owner_type": "printer", "kind": "boolean", "default": False, "future": True},
    "printer_financial_reports": {"owner_type": "printer", "kind": "boolean", "default": False, "future": True},
    "printer_ecommerce_integration": {"owner_type": "printer", "kind": "boolean", "default": False, "future": True},
    "printer_automated_job_acceptance": {"owner_type": "printer", "kind": "boolean", "default": False, "future": True},
    "printer_custom_payout_frequency": {"owner_type": "printer", "kind": "boolean", "default": False, "future": True},
    "printer_white_label_documents": {"owner_type": "printer", "kind": "boolean", "default": False, "future": True},
    "printer_advanced_capacity": {"owner_type": "printer", "kind": "boolean", "default": False, "future": True},
    "printer_featured_placement": {"owner_type": "printer", "kind": "boolean", "default": False, "future": True},
}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: Any) -> Optional[str]:
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value) if value else None


def _month_period(now: Optional[datetime] = None) -> tuple[str, datetime]:
    now = now or utcnow()
    if now.month == 12:
        reset = datetime(now.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        reset = datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc)
    return f"{now.year:04d}-{now.month:02d}", reset


def _plan_entitlements(plan: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    plan = plan or {}
    result = dict(plan.get("entitlements") or {})
    limits = plan.get("limits") or {}
    result.update({k: v for k, v in limits.items() if k in FEATURE_REGISTRY})
    legacy = {
        "product_publish": plan.get("allow_product_publishing"),
        "storefront_visible": plan.get("storefront_visible"),
        "checkout_enabled": plan.get("checkout_enabled"),
        "max_products": plan.get("max_products"),
        "printer_jobs": plan.get("allow_job_assignment"),
        "printer_job_limit": plan.get("max_jobs_per_month"),
    }
    for key, value in legacy.items():
        if value is not None and key not in result:
            result[key] = value
    return result


async def _usage_value(db, owner_type: str, owner_id: str, feature_key: str, registry: Dict[str, Any]) -> int:
    usage_key = registry.get("usage")
    if not usage_key:
        return 0
    if usage_key == "products":
        return await db.products.count_documents({"band_id": owner_id, "status": {"$ne": "archived"}})
    if usage_key == "team_members":
        return await db.band_members.count_documents({"band_id": owner_id, "status": "active"})
    if usage_key == "printer_team_members":
        return await db.printer_members.count_documents({"printer_id": owner_id, "status": "active"})
    if usage_key == "printer_jobs":
        period, _ = _month_period()
        row = await db.entitlement_usage.find_one({
            "owner_type": owner_type, "owner_id": owner_id, "feature_key": feature_key, "period": period
        }, {"_id": 0}) or {}
        return int(row.get("usage") or 0)
    if usage_key == "artwork_storage_mb":
        pipeline = [
            {"$match": {"band_id": owner_id}},
            {"$group": {"_id": None, "bytes": {"$sum": {"$ifNull": ["$file_size_bytes", 0]}}}},
        ]
        rows = await db.artworks.aggregate(pipeline).to_list(1)
        return int(round(float((rows[0] if rows else {}).get("bytes") or 0) / 1024 / 1024))
    return 0


@dataclass
class EntitlementResult:
    feature_key: str
    owner_type: str
    owner_id: str
    allowed: bool
    reason_code: str
    message: str
    current_plan: Optional[str]
    required_plan: Optional[str]
    current_usage: int
    limit: Any
    reset_date: Optional[str]
    upgrade_available: bool
    value: Any
    platform_module: Optional[str]
    platform_module_enabled: bool
    override: Optional[Dict[str, Any]]

    def as_dict(self) -> Dict[str, Any]:
        return self.__dict__.copy()


async def resolve_entitlement(db, owner_type: str, owner_id: str, feature_key: str) -> EntitlementResult:
    if feature_key not in FEATURE_REGISTRY:
        raise HTTPException(status_code=400, detail=f"Unknown entitlement feature: {feature_key}")
    registry = FEATURE_REGISTRY[feature_key]
    if registry.get("owner_type") not in {owner_type, "both"}:
        raise HTTPException(status_code=400, detail=f"Feature {feature_key} is not valid for {owner_type}")

    settings = await resolve_platform_settings(db)
    platform_module = feature_platform_module(settings, feature_key)
    platform_ok = module_enabled(settings, platform_module) if platform_module else True

    subscription = await db.account_subscriptions.find_one(
        {"owner_type": owner_type, "owner_id": owner_id}, {"_id": 0}
    ) or {}
    plan = None
    if subscription.get("plan_id"):
        plan = await db.subscription_plans.find_one({"id": subscription.get("plan_id")}, {"_id": 0})
    plan = plan or {}
    current_plan = plan.get("name") or subscription.get("plan_id") or "Unassigned"
    values = _plan_entitlements(plan)
    if feature_key not in values:
        values[feature_key] = registry.get("default")

    override = await db.entitlement_overrides.find_one({
        "owner_type": owner_type,
        "owner_id": owner_id,
        "feature_key": feature_key,
        "active": {"$ne": False},
    }, {"_id": 0})
    if override and override.get("expires_at"):
        expires = override.get("expires_at")
        if isinstance(expires, str):
            try:
                expires = datetime.fromisoformat(expires.replace("Z", "+00:00"))
            except ValueError:
                expires = utcnow() - timedelta(seconds=1)
        if expires <= utcnow():
            override = None
    value = override.get("value") if override else values.get(feature_key)

    usage = await _usage_value(db, owner_type, owner_id, feature_key, registry)
    _, reset = _month_period()
    limit = value if registry.get("kind") == "limit" else None
    account_active = subscription.get("status") in {"active", "trial", "manual", "free"} or not subscription

    if not platform_ok:
        allowed, code, message = False, "platform_module_disabled", "This feature is disabled for the entire platform."
    elif not account_active:
        allowed, code, message = False, "subscription_inactive", "Your subscription is not active."
    elif registry.get("kind") == "boolean":
        allowed = bool(value)
        code = "allowed" if allowed else "plan_feature_locked"
        message = "Feature available." if allowed else "Your current plan does not include this feature."
    else:
        allowed = value is None or int(value) < 0 or usage < int(value)
        code = "allowed" if allowed else "plan_limit_reached"
        message = "Usage is within the plan limit." if allowed else "Your current plan limit has been reached."

    available_plan = await db.subscription_plans.find_one({
        "audience": {"$in": [owner_type, "both"]},
        "status": "active",
        "$or": [
            {f"entitlements.{feature_key}": True},
            {f"limits.{feature_key}": {"$exists": True}},
        ],
    }, {"_id": 0, "id": 1, "name": 1})

    return EntitlementResult(
        feature_key=feature_key,
        owner_type=owner_type,
        owner_id=owner_id,
        allowed=allowed,
        reason_code=code,
        message=message,
        current_plan=current_plan,
        required_plan=(available_plan or {}).get("name"),
        current_usage=usage,
        limit=limit,
        reset_date=_iso(reset) if registry.get("usage") == "printer_jobs" else None,
        upgrade_available=bool(available_plan),
        value=value,
        platform_module=platform_module,
        platform_module_enabled=platform_ok,
        override=override,
    )


async def require_entitlement(db, owner_type: str, owner_id: str, feature_key: str) -> EntitlementResult:
    result = await resolve_entitlement(db, owner_type, owner_id, feature_key)
    if not result.allowed:
        raise HTTPException(status_code=403, detail={"code": "entitlement_denied", **result.as_dict()})
    return result


async def increment_usage(
    db,
    *,
    owner_type: str,
    owner_id: str,
    feature_key: str,
    amount: int = 1,
    idempotency_key: str,
) -> Dict[str, Any]:
    period, reset = _month_period()
    event = {
        "owner_type": owner_type,
        "owner_id": owner_id,
        "feature_key": feature_key,
        "period": period,
        "amount": int(amount),
        "idempotency_key": idempotency_key,
        "created_at": utcnow().isoformat(),
    }
    result = await db.entitlement_usage_events.update_one(
        {"idempotency_key": idempotency_key}, {"$setOnInsert": event}, upsert=True
    )
    if result.upserted_id is not None:
        await db.entitlement_usage.update_one(
            {"owner_type": owner_type, "owner_id": owner_id, "feature_key": feature_key, "period": period},
            {"$inc": {"usage": int(amount)}, "$setOnInsert": {"reset_at": reset.isoformat()}},
            upsert=True,
        )
    return await db.entitlement_usage.find_one(
        {"owner_type": owner_type, "owner_id": owner_id, "feature_key": feature_key, "period": period}, {"_id": 0}
    ) or {}


async def set_entitlement_override(
    db,
    *,
    owner_type: str,
    owner_id: str,
    feature_key: str,
    value: Any,
    actor: Any,
    reason: str,
    expires_at: Optional[datetime] = None,
    request: Any = None,
) -> Dict[str, Any]:
    if feature_key not in FEATURE_REGISTRY:
        raise HTTPException(status_code=400, detail="Unknown feature key")
    query = {"owner_type": owner_type, "owner_id": owner_id, "feature_key": feature_key}
    before = await db.entitlement_overrides.find_one(query, {"_id": 0})
    doc = {
        **query,
        "value": value,
        "active": True,
        "reason": reason,
        "expires_at": expires_at.isoformat() if expires_at else None,
        "updated_at": utcnow().isoformat(),
        "updated_by_user_id": getattr(actor, "id", None),
        "updated_by_role": getattr(actor, "role", None),
    }
    await db.entitlement_overrides.update_one(query, {"$set": doc, "$setOnInsert": {"created_at": utcnow().isoformat()}}, upsert=True)
    await write_audit_event(
        db,
        action="entitlement.override",
        entity_type="entitlement_override",
        entity_id=f"{owner_type}:{owner_id}:{feature_key}",
        actor=actor,
        before=before,
        after=doc,
        reason=reason,
        request=request,
        related_creator_id=owner_id if owner_type == "creator" else None,
        related_printer_id=owner_id if owner_type == "printer" else None,
    )
    return doc


async def ensure_entitlement_indexes(db) -> None:
    await db.entitlement_overrides.create_index(
        [("owner_type", 1), ("owner_id", 1), ("feature_key", 1)], unique=True
    )
    await db.entitlement_usage.create_index(
        [("owner_type", 1), ("owner_id", 1), ("feature_key", 1), ("period", 1)], unique=True
    )
    await db.entitlement_usage_events.create_index([("idempotency_key", 1)], unique=True)
    await db.entitlement_usage_events.create_index([("created_at", -1)])
