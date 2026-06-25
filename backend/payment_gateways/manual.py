"""Manual EFT checkout gateway adapter."""
from __future__ import annotations

from typing import Any, Dict

from .base import PaymentGatewayAdapter


class ManualPaymentGateway(PaymentGatewayAdapter):
    """Manual EFT is a shop checkout payment method with no remote provider call."""

    key = "manual_eft"
    name = "Manual EFT"

    def definition(self) -> Dict[str, Any]:
        return {
            "key": self.key,
            "name": self.name,
            "description": "Manual bank transfer payment method for buyer checkout orders.",
            "capabilities": ["manual_payment"],
            "settings_schema": [
                {"key": "bank_name", "label": "Bank name", "type": "text", "required": False},
                {"key": "account_holder", "label": "Account holder", "type": "text", "required": False},
                {"key": "account_number", "label": "Account number", "type": "text", "required": False},
                {"key": "branch_code", "label": "Branch code", "type": "text", "required": False},
                {"key": "reference_format", "label": "Reference format", "type": "text", "required": False},
                {"key": "instructions", "label": "Checkout instructions", "type": "textarea", "required": False},
                {"key": "expiry_days", "label": "Expire unpaid orders after days", "type": "number", "required": False},
            ],
            "supports_hosted_checkout": False,
            "supports_webhooks": False,
            "supports_refunds": False,
        }

    def default_config(self) -> Dict[str, Any]:
        return {
            "key": self.key,
            "enabled": True,
            "display_name": "Manual EFT",
            "description": "Pay by bank transfer. Your order will start production after payment is confirmed.",
            "mode": "test",
            "sort_order": 10,
            "public_config": {},
            "settings": {
                "bank_name": "",
                "account_holder": "",
                "account_number": "",
                "branch_code": "",
                "reference_format": "Use your order number as payment reference.",
                "instructions": "Please make an EFT payment using your order number as reference. Your order will be processed once payment is confirmed.",
                "expiry_days": 3,
            },
            "secret_configured": False,
        }

    def validate_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        merged = self.default_config()
        merged.update(config or {})
        merged["key"] = self.key
        merged["enabled"] = bool(merged.get("enabled"))
        merged["display_name"] = (merged.get("display_name") or self.name).strip()
        merged["description"] = merged.get("description") or ""
        merged["mode"] = merged.get("mode") or "test"
        merged["sort_order"] = int(merged.get("sort_order") or 10)
        merged["public_config"] = dict(merged.get("public_config") or {})
        merged["settings"] = {**self.default_config()["settings"], **dict(merged.get("settings") or {})}
        merged["secret_configured"] = False
        return merged

    async def initialize_payment(self, order: Dict[str, Any], config: Dict[str, Any], urls: Dict[str, str]) -> Dict[str, Any]:
        settings = config.get("settings") or {}
        return {
            "provider": self.key,
            "reference": urls.get("reference") or order.get("order_number"),
            "payment_id": None,
            "payment_url": urls.get("return_url"),
            "payment_action": "manual_eft",
            "status": "pending",
            "hosted_checkout": False,
            "manual_payment_details": {
                "instructions": settings.get("instructions"),
                "bank_name": settings.get("bank_name"),
                "account_holder": settings.get("account_holder"),
                "account_number": settings.get("account_number"),
                "branch_code": settings.get("branch_code"),
                "reference": order.get("order_number"),
            },
        }
