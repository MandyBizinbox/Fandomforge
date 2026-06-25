"""Payment gateway adapter contract for buyer checkout payments.

These adapters are intentionally scoped to shop checkout payments only. Owner SaaS
subscription billing and payout flows must use their own services/configuration.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, Optional


SECRET_FIELD_TYPES = {"password"}


class PaymentGatewayError(Exception):
    """Raised when a provider call/configuration fails in a user-safe way."""


class PaymentGatewayAdapter(ABC):
    key: str = "base"
    name: str = "Base Gateway"

    def definition(self) -> Dict[str, Any]:
        return {
            "key": self.key,
            "name": self.name,
            "description": "",
            "capabilities": [],
            "settings_schema": [],
            "supports_hosted_checkout": False,
            "supports_webhooks": False,
            "supports_refunds": False,
        }

    def default_config(self) -> Dict[str, Any]:
        return {
            "enabled": False,
            "title": self.name,
            "description": "",
            "sort_order": 50,
            "settings": {},
        }

    def validate_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        merged = self.default_config()
        merged.update(config or {})
        merged["enabled"] = bool(merged.get("enabled"))
        merged["sort_order"] = int(merged.get("sort_order") or 50)
        merged["settings"] = dict(merged.get("settings") or {})
        return merged

    def public_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Return a frontend-safe representation with secrets masked/removed."""
        safe = self.validate_config(config)
        safe_settings = dict(safe.get("settings") or {})
        schema = self.definition().get("settings_schema", [])
        for field in schema:
            if field.get("type") in SECRET_FIELD_TYPES:
                key = field.get("key")
                if key in safe_settings:
                    safe_settings[key] = "********" if safe_settings.get(key) else ""
        safe["settings"] = safe_settings
        return safe

    def is_configured(self, config: Dict[str, Any]) -> bool:
        schema = self.definition().get("settings_schema", [])
        settings = (config or {}).get("settings") or {}
        for field in schema:
            if field.get("required") and not settings.get(field.get("key")):
                return False
        return True

    @abstractmethod
    async def initialize_payment(self, order: Dict[str, Any], config: Dict[str, Any], urls: Dict[str, str]) -> Dict[str, Any]:
        """Create hosted checkout or payment intent."""

    async def verify_payment(self, reference: str, config: Dict[str, Any]) -> Dict[str, Any]:
        return {"reference": reference, "status": "pending", "paid": False}

    async def handle_webhook(
        self,
        payload: Dict[str, Any],
        headers: Dict[str, str],
        config: Dict[str, Any],
        raw_body: Optional[str] = None,
    ) -> Dict[str, Any]:
        return {"processed": False, "status": "ignored", "message": "Webhook ignored"}

    async def refund_payment(self, payment_id: str, amount: float, config: Dict[str, Any]) -> Dict[str, Any]:
        raise PaymentGatewayError(f"{self.name} refunds are not implemented")
