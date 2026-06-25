"""Feature package registry for FandomForge / FandomForge.

This registry lets one codebase run as different commercial SaaS packages
without deleting code for disabled modules.
"""
from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, List

DEFAULT_MODULE_TOGGLES: Dict[str, bool] = {
    "creators_enabled": True,
    "printers_enabled": True,
    "sole_printer_mode": False,
    "product_templates_enabled": True,
    "artwork_review_enabled": True,
    "printer_marketplace_enabled": True,
    "printer_auto_assignment_enabled": True,
    "payouts_enabled": True,
    "creator_subscriptions_enabled": False,
    "printer_subscriptions_enabled": False,
    "public_shop_enabled": True,
    "manual_orders_enabled": True,
    "shipping_enabled": True,
    "bobgo_enabled": False,
    "paystack_checkout_enabled": True,
    "manual_eft_enabled": True,
}

PACKAGE_DEFINITIONS: List[Dict[str, Any]] = [
    {
        "key": "full_marketplace",
        "name": "Full Marketplace",
        "description": "Creators, external printers, printer pricing, assignment, payouts, shipping and full checkout.",
        "recommended_for": "FandomForge / FandomForge main marketplace",
        "toggles": DEFAULT_MODULE_TOGGLES,
    },
    {
        "key": "creator_sole_printer",
        "name": "Creator + Sole Printer",
        "description": "Creator storefronts with production handled by one internal/default printer. External printer marketplace is hidden.",
        "recommended_for": "Client-owned platform where the client is the only printer",
        "toggles": {
            **DEFAULT_MODULE_TOGGLES,
            "printers_enabled": False,
            "sole_printer_mode": True,
            "printer_marketplace_enabled": False,
            "printer_auto_assignment_enabled": False,
            "printer_subscriptions_enabled": False,
        },
    },
    {
        "key": "creator_storefronts",
        "name": "Creator Storefronts",
        "description": "Creator product and storefront management without printer network or payout automation.",
        "recommended_for": "Simple creator/club merch platforms",
        "toggles": {
            **DEFAULT_MODULE_TOGGLES,
            "printers_enabled": False,
            "sole_printer_mode": True,
            "printer_marketplace_enabled": False,
            "printer_auto_assignment_enabled": False,
            "payouts_enabled": False,
            "printer_subscriptions_enabled": False,
        },
    },
    {
        "key": "catalog_only",
        "name": "Catalog Only",
        "description": "Public product catalog/storefront mode. Most operational SaaS modules are disabled.",
        "recommended_for": "Brochure/catalog deployments or early demos",
        "toggles": {
            **DEFAULT_MODULE_TOGGLES,
            "creators_enabled": False,
            "printers_enabled": False,
            "sole_printer_mode": False,
            "artwork_review_enabled": False,
            "printer_marketplace_enabled": False,
            "printer_auto_assignment_enabled": False,
            "payouts_enabled": False,
            "creator_subscriptions_enabled": False,
            "printer_subscriptions_enabled": False,
            "manual_orders_enabled": False,
        },
    },
]

PACKAGE_BY_KEY = {p["key"]: p for p in PACKAGE_DEFINITIONS}


def package_definitions() -> List[Dict[str, Any]]:
    return deepcopy(PACKAGE_DEFINITIONS)


def package_keys() -> List[str]:
    return list(PACKAGE_BY_KEY.keys())


def get_package(key: str) -> Dict[str, Any]:
    if key not in PACKAGE_BY_KEY:
        raise KeyError(key)
    return deepcopy(PACKAGE_BY_KEY[key])


def default_modules() -> Dict[str, bool]:
    return deepcopy(DEFAULT_MODULE_TOGGLES)


def normalize_modules(value: Dict[str, Any] | None) -> Dict[str, bool]:
    modules = default_modules()
    for key, val in (value or {}).items():
        if key in modules:
            modules[key] = bool(val)
    if modules.get("sole_printer_mode"):
        modules["printer_marketplace_enabled"] = False
        modules["printer_auto_assignment_enabled"] = False
        modules["printer_subscriptions_enabled"] = False
    if not modules.get("printers_enabled"):
        modules["printer_marketplace_enabled"] = False
        modules["printer_auto_assignment_enabled"] = False
        modules["printer_subscriptions_enabled"] = False
    if not modules.get("payouts_enabled"):
        modules["printer_subscriptions_enabled"] = False
    return modules
