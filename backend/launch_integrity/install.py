"""Runtime installation of launch-integrity services over legacy compatibility code."""
from __future__ import annotations

from contextvars import ContextVar
import json
import logging
from typing import Any, Dict, Optional

from fastapi import HTTPException

from platform_modules.registry import normalize_modules

from .audit import ensure_audit_indexes
from .design import install_design_integrity
from .entitlements import ensure_entitlement_indexes, require_entitlement
from . import finance as finance_module
from .finance import ensure_finance_indexes, install_finance_integrity, record_provider_fee_actual
from .finance_reversals import apply_financial_reversal as corrected_financial_reversal
from .middleware import launch_audit_middleware
from .permissions import require_manager_permission, require_owner, role_of
from .printer_ops import ensure_job_for_item, ensure_printer_ops_indexes
from .provider_reversals import apply_provider_amount_reversal
from .settings import ensure_settings_integrity_indexes, resolve_platform_settings
from . import pricing

logger = logging.getLogger("fandomforge.launch_integrity")


def _payment_amount(data: Dict[str, Any], order: Dict[str, Any]) -> float:
    raw = data.get("amount") or (data.get("transaction") or {}).get("amount") or (data.get("refund") or {}).get("amount")
    if raw not in (None, ""):
        value = float(raw or 0)
        return round(value / 100, 2) if value > float(order.get("total") or 0) * 10 else round(value, 2)
    return round(float(order.get("total") or 0), 2)


def _provider_fee_amount(provider_payload: Optional[Dict[str, Any]], payment: Dict[str, Any]) -> Optional[float]:
    """Return an actual provider fee in major currency units when supplied.

    Paystack reports ``fees`` in the currency's smallest unit. Other adapters may
    explicitly mark smallest-unit values; otherwise their numeric fee is treated as
    a major-unit amount. Missing fees remain ``None`` and do not manufacture a value.
    """
    payload = provider_payload or {}
    data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    transaction = data.get("transaction") if isinstance(data.get("transaction"), dict) else {}
    raw = data.get("fees")
    if raw is None:
        raw = data.get("fee")
    if raw is None:
        raw = transaction.get("fees")
    if raw is None:
        raw = transaction.get("fee")
    if raw in (None, ""):
        return None
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    provider = str(payment.get("provider") or data.get("provider") or "").lower()
    smallest_unit = provider == "paystack" or bool(data.get("fee_in_smallest_unit") or data.get("fees_in_smallest_unit"))
    return round(value / 100, 2) if smallest_unit else round(value, 2)


def install_launch_integrity(app: Any, core: Any) -> None:
    if getattr(core, "_launch_integrity_installed", False):
        return

    if not hasattr(pricing, "CHECKOUT_GATEWAY"):
        pricing.CHECKOUT_GATEWAY = ContextVar("fandomforge_checkout_gateway", default="paystack")

    # Routes import this symbol after installation, so the corrected additive
    # implementation supersedes the early compatibility helper without deletion.
    finance_module.apply_financial_reversal = corrected_financial_reversal

    core._require_owner_user = require_owner
    core._require_manager_permission = require_manager_permission

    def require_adminish(user):
        if role_of(user) not in {"owner", "super_admin", "admin", "manager"}:
            raise HTTPException(status_code=403, detail="Owner, administrator or manager access required")
        return user

    core._require_adminish_user = require_adminish
    core._require_adminish_or_owner = require_adminish
    core._is_owner_user = lambda user: role_of(user) in {"owner", "super_admin"}

    original_band_access = core.user_can_access_band

    async def admin_aware_band_access(db, user, band_id, permission=None):
        if role_of(user) in {"owner", "super_admin", "admin"}:
            return True
        return await original_band_access(db, user, band_id, permission=permission)

    core.user_can_access_band = admin_aware_band_access

    async def canonical_settings(db):
        resolved = await resolve_platform_settings(db)
        return {**resolved.raw, "modules": normalize_modules(resolved.raw.get("modules"))}

    core._get_platform_settings_doc = canonical_settings

    install_design_integrity(core)
    pricing.install_authoritative_pricing(core)
    install_finance_integrity(core)

    normalized_product = core.normalize_template_product_payload

    async def entitlement_product_normalize(*, db, data, creator, user, allow_admin_publish=False):
        is_new = not bool(data.get("id"))
        if is_new:
            await require_entitlement(db, "creator", creator.get("id"), "max_products")
        if data.get("published") is True:
            await require_entitlement(db, "creator", creator.get("id"), "product_publish")
        return await normalized_product(
            db=db,
            data=data,
            creator=creator,
            user=user,
            allow_admin_publish=allow_admin_publish,
        )

    core.normalize_template_product_payload = entitlement_product_normalize

    built_items = core._build_order_items

    async def gateway_aware_build_items(db, cart_items, shipping_address=None):
        items, _ = await built_items(db, cart_items, shipping_address)
        gateway = pricing.CHECKOUT_GATEWAY.get()
        settings = await resolve_platform_settings(db)
        default_printer_id = settings.launch.default_printer_id

        # Resolve assignment first so the authoritative pricing pass can choose a
        # Printer-specific liability instead of the platform fallback.
        for item in items:
            if not getattr(item, "printer_id", None) and default_printer_id:
                item.printer_id = default_printer_id
                snapshot = getattr(item, "production_snapshot", None)
                if snapshot is not None:
                    data = snapshot.model_dump() if hasattr(snapshot, "model_dump") else dict(snapshot)
                    data["assigned_printer"] = {"id": default_printer_id, "source": "platform_default"}
                    item.production_snapshot = data

        items = await pricing.enrich_order_items(db, items, gateway=gateway)
        subtotal = 0.0
        for item in items:
            snapshot = getattr(item, "production_snapshot", None)
            data = snapshot.model_dump() if hasattr(snapshot, "model_dump") else dict(snapshot or {})
            commercial = dict(data.get("commercial_snapshot") or {})
            payment_fee = dict(commercial.get("payment_fee") or {})
            payment_fee["refund_treatment"] = settings.launch.financial_rules.gateway_fee_refund_treatment
            commercial["payment_fee"] = payment_fee
            shipping = dict(commercial.get("shipping") or {})
            shipping["treatment"] = settings.launch.financial_rules.shipping_refund_treatment
            commercial["shipping"] = shipping
            data["commercial_snapshot"] = commercial
            item.production_snapshot = data

            # Customer unit total includes exclusive tax and any fee explicitly
            # allocated to the customer; liabilities remain based on the selling
            # price and immutable commercial snapshot.
            item.unit_price = float(commercial.get("customer_unit_total") or item.unit_price or 0)
            subtotal += float(item.unit_price or 0) * max(int(getattr(item, "quantity", 1) or 1), 1)
        return items, round(subtotal, 2)

    core._build_order_items = gateway_aware_build_items

    marked_paid = core._mark_order_paid_from_payment

    async def marked_paid_with_jobs(db, payment, provider_payload=None):
        order = await marked_paid(db, payment, provider_payload)
        if not order:
            return order

        # Provider fee variance is a platform-only event. It never recalculates or
        # mutates the immutable customer total, Creator earnings or Printer liability.
        actual_fee = _provider_fee_amount(provider_payload, payment or {})
        if actual_fee is not None:
            stored_payment = await db.payments.find_one({"id": (payment or {}).get("id")}, {"_id": 0})
            await record_provider_fee_actual(db, stored_payment or payment or {}, actual_fee)

        for item in order.get("items") or []:
            printer_id = item.get("printer_id")
            if not printer_id:
                await db.production_exceptions.update_one(
                    {"idempotency_key": f"missing-printer:{order.get('id')}:{item.get('id')}"},
                    {"$setOnInsert": {
                        "idempotency_key": f"missing-printer:{order.get('id')}:{item.get('id')}",
                        "order_id": order.get("id"),
                        "order_item_id": item.get("id"),
                        "kind": "missing_printer_assignment",
                        "status": "open",
                        "created_at": core.utcnow().isoformat(),
                    }},
                    upsert=True,
                )
                continue
            try:
                await ensure_job_for_item(
                    db,
                    order=order,
                    item=item,
                    printer_id=printer_id,
                    actor=None,
                    reason="Assigned from paid order snapshot",
                )
            except Exception as exc:
                logger.exception("Could not create production job for order item %s", item.get("id"))
                await db.production_exceptions.update_one(
                    {"idempotency_key": f"job-create:{order.get('id')}:{item.get('id')}"},
                    {"$set": {
                        "idempotency_key": f"job-create:{order.get('id')}:{item.get('id')}",
                        "order_id": order.get("id"),
                        "order_item_id": item.get("id"),
                        "printer_id": printer_id,
                        "kind": "production_job_creation_failed",
                        "status": "open",
                        "last_error": str(exc)[:2000],
                        "updated_at": core.utcnow().isoformat(),
                    }, "$setOnInsert": {"created_at": core.utcnow().isoformat()}},
                    upsert=True,
                )
        return order

    core._mark_order_paid_from_payment = marked_paid_with_jobs

    payment_webhook = core.gateway_payment_webhook

    async def financial_payment_webhook(gateway_key: str, request):
        raw = await request.body()
        try:
            payload = json.loads(raw.decode("utf-8") or "{}")
        except Exception:
            payload = {}
        result = await payment_webhook(gateway_key, request)
        event = str(payload.get("event") or "").lower()
        event_type = {
            "refund.processed": "refund",
            "refund.success": "refund",
            "charge.dispute.create": "chargeback",
            "dispute.create": "chargeback",
            "chargeback": "chargeback",
            "charge.reversal": "provider_reversal",
            "transaction.reversed": "provider_reversal",
        }.get(event)
        if not event_type:
            return result
        db = request.app.state.db
        data = payload.get("data") or {}
        reference = data.get("reference") or (data.get("transaction") or {}).get("reference")
        payment = await db.payments.find_one({"provider_reference": reference}, {"_id": 0}) if reference else None
        if not payment or not payment.get("order_id"):
            await db.provider_webhook_events.update_one(
                {"idempotency_key": f"{gateway_key}:{event}:{data.get('id') or reference}"},
                {"$setOnInsert": {
                    "idempotency_key": f"{gateway_key}:{event}:{data.get('id') or reference}",
                    "provider": gateway_key,
                    "event": event,
                    "status": "unmatched",
                    "payload": payload,
                    "created_at": core.utcnow().isoformat(),
                }},
                upsert=True,
            )
            return result
        order = await db.orders.find_one({"id": payment.get("order_id")}, {"_id": 0}) or {}
        key = f"provider:{gateway_key}:{event}:{data.get('id') or reference}"
        await apply_provider_amount_reversal(
            db,
            order_id=payment.get("order_id"),
            event_type=event_type,
            amount=_payment_amount(data, order),
            idempotency_key=key,
            provider=gateway_key,
            provider_payload=data,
        )
        return {**(result or {}), "financial_event_processed": True, "financial_event_type": event_type}

    core.gateway_payment_webhook = financial_payment_webhook
    app.middleware("http")(launch_audit_middleware)
    core._launch_integrity_installed = True


async def ensure_launch_integrity_indexes(db) -> None:
    await ensure_settings_integrity_indexes(db)
    await ensure_audit_indexes(db)
    await ensure_entitlement_indexes(db)
    await ensure_finance_indexes(db)
    await ensure_printer_ops_indexes(db)
    await db.production_exceptions.create_index([("idempotency_key", 1)], unique=True)
    await db.production_exceptions.create_index([("status", 1), ("created_at", -1)])
    await db.provider_webhook_events.create_index([("idempotency_key", 1)], unique=True)
