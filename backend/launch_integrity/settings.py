"""Typed platform settings resolution and versioning.

The existing ``settings`` document with ``id=platform`` remains the central source.
This service merges launch-safe defaults at read time, records an immutable version
identifier for snapshots, and keeps platform modules separate from account-plan
entitlements.
"""
from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
import hashlib
import json
from typing import Any, Dict, Optional

from pydantic import BaseModel, ConfigDict, Field

from . import LAUNCH_INTEGRITY_VERSION


class TaxSettings(BaseModel):
    model_config = ConfigDict(extra="allow")
    enabled: bool = False
    name: str = "VAT"
    rate: float = 0.0
    prices_inclusive: bool = True
    shipping_taxable: bool = False
    payment_fees_taxable: bool = False


class GatewayFeeRule(BaseModel):
    model_config = ConfigDict(extra="allow")
    enabled: bool = False
    fixed_fee: float = 0.0
    percentage_fee: float = 0.0
    absorbed_by: str = "platform"
    refundable: bool = False


class FinancialRules(BaseModel):
    model_config = ConfigDict(extra="allow")
    currency: str = "ZAR"
    shipping_refund_treatment: str = "manual"
    gateway_fee_refund_treatment: str = "non_refundable"
    rounding_mode: str = "half_up"
    calculation_version: str = "launch_integrity_v1"


class LaunchIntegritySettings(BaseModel):
    model_config = ConfigDict(extra="allow")
    tax: TaxSettings = Field(default_factory=TaxSettings)
    gateway_fees: Dict[str, GatewayFeeRule] = Field(default_factory=dict)
    financial_rules: FinancialRules = Field(default_factory=FinancialRules)
    default_printer_id: Optional[str] = None
    packaging_cost: float = 0.0
    entitlement_modules: Dict[str, str] = Field(default_factory=dict)


DEFAULT_ENTITLEMENT_MODULES = {
    "product_publish": "creators_enabled",
    "storefront_visible": "creators_enabled",
    "checkout_enabled": "public_shop_enabled",
    "creator_reporting": "creators_enabled",
    "creator_payout_visibility": "payouts_enabled",
    "printer_jobs": "printers_enabled",
    "printer_job_limit": "printers_enabled",
    "printer_template_access": "product_templates_enabled",
    "printer_pricing": "printers_enabled",
    "printer_reporting": "printers_enabled",
    "printer_payout_visibility": "payouts_enabled",
}

DEFAULT_LAUNCH_INTEGRITY = {
    "tax": TaxSettings().model_dump(),
    "gateway_fees": {
        "paystack": GatewayFeeRule().model_dump(),
        "manual_eft": GatewayFeeRule().model_dump(),
        "mock": GatewayFeeRule().model_dump(),
    },
    "financial_rules": FinancialRules().model_dump(),
    "default_printer_id": None,
    "packaging_cost": 0.0,
    "entitlement_modules": DEFAULT_ENTITLEMENT_MODULES,
}


def _deep_merge(base: Dict[str, Any], incoming: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    out = deepcopy(base)
    for key, value in (incoming or {}).items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], value)
        else:
            out[key] = deepcopy(value)
    return out


def _canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


def settings_version(doc: Dict[str, Any]) -> str:
    public = {k: v for k, v in (doc or {}).items() if k not in {
        "paystack_secret_key", "secret_key", "smtp_password", "webhook_secret"
    }}
    digest = hashlib.sha256(_canonical(public).encode("utf-8")).hexdigest()[:20]
    return f"settings-{digest}"


@dataclass(frozen=True)
class ResolvedPlatformSettings:
    raw: Dict[str, Any]
    launch: LaunchIntegritySettings
    version_id: str

    @property
    def modules(self) -> Dict[str, bool]:
        modules = self.raw.get("modules") or {}
        return {str(k): bool(v) for k, v in modules.items()}

    @property
    def currency(self) -> str:
        return self.launch.financial_rules.currency or self.raw.get("currency") or "ZAR"


async def resolve_platform_settings(db) -> ResolvedPlatformSettings:
    raw = await db.settings.find_one({"id": "platform"}, {"_id": 0}) or {"id": "platform"}
    existing = raw.get("launch_integrity") or {}
    merged = _deep_merge(DEFAULT_LAUNCH_INTEGRITY, existing)
    if not merged.get("default_printer_id"):
        merged["default_printer_id"] = raw.get("default_printer_id")
    if raw.get("currency") and not (existing.get("financial_rules") or {}).get("currency"):
        merged["financial_rules"]["currency"] = raw.get("currency")
    launch = LaunchIntegritySettings(**merged)
    effective = {**raw, "launch_integrity": launch.model_dump(), "integrity_schema_version": LAUNCH_INTEGRITY_VERSION}
    return ResolvedPlatformSettings(raw=effective, launch=launch, version_id=settings_version(effective))


def module_enabled(settings: ResolvedPlatformSettings, module_key: str) -> bool:
    if not module_key:
        return True
    return bool(settings.modules.get(module_key, False))


def feature_platform_module(settings: ResolvedPlatformSettings, feature_key: str) -> Optional[str]:
    return settings.launch.entitlement_modules.get(feature_key)


def tax_snapshot(settings: ResolvedPlatformSettings) -> Dict[str, Any]:
    tax = settings.launch.tax
    rate = max(float(tax.rate or 0), 0.0)
    return {
        "enabled": bool(tax.enabled and rate > 0),
        "name": tax.name or "Tax",
        "rate": rate,
        "prices_inclusive": bool(tax.prices_inclusive),
        "shipping_taxable": bool(tax.shipping_taxable),
        "payment_fees_taxable": bool(tax.payment_fees_taxable),
        "settings_version": settings.version_id,
    }


def gateway_fee_snapshot(settings: ResolvedPlatformSettings, gateway: str) -> Dict[str, Any]:
    rule = settings.launch.gateway_fees.get(gateway) or GatewayFeeRule()
    return {
        "gateway": gateway,
        "enabled": bool(rule.enabled),
        "fixed_fee": max(float(rule.fixed_fee or 0), 0.0),
        "percentage_fee": max(float(rule.percentage_fee or 0), 0.0),
        "absorbed_by": rule.absorbed_by if rule.absorbed_by in {"platform", "customer"} else "platform",
        "refundable": bool(rule.refundable),
        "settings_version": settings.version_id,
    }


def estimate_gateway_fee(amount: float, rule: Dict[str, Any]) -> float:
    if not rule.get("enabled"):
        return 0.0
    return round(max(float(rule.get("fixed_fee") or 0), 0) + max(float(amount or 0), 0) * max(float(rule.get("percentage_fee") or 0), 0) / 100, 2)


async def ensure_settings_integrity_indexes(db) -> None:
    await db.settings_history.create_index([("settings_version", 1)], unique=True, sparse=True)
    await db.settings_history.create_index([("created_at", -1)])
