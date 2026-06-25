"""Paystack shop checkout payment gateway adapter.

This adapter is scoped to buyer checkout payments only. Owner SaaS subscription
billing and payout flows must continue to use their separate settings/services.
"""
from __future__ import annotations

import hashlib
import hmac
from typing import Any, Dict, Iterable

import requests

from .base import PaymentGatewayAdapter, PaymentGatewayError


PAYSTACK_BASE_URL = "https://api.paystack.co"
SECRET_PLACEHOLDERS = {"********", "••••••••"}


class PaystackPaymentGateway(PaymentGatewayAdapter):
    key = "paystack"
    name = "Paystack Shop Checkout"

    def definition(self) -> Dict[str, Any]:
        return {
            "key": self.key,
            "name": self.name,
            "description": "Hosted Paystack checkout for buyer merch orders only.",
            "capabilities": ["hosted_checkout", "webhook", "verify", "zar"],
            "settings_schema": [
                {"key": "public_key", "label": "Public key", "type": "text", "required": False, "scope": "public_config"},
                {"key": "currency", "label": "Currency", "type": "text", "required": False, "scope": "public_config"},
                {"key": "channels", "label": "Allowed channels", "type": "text", "required": False, "scope": "public_config"},
                {"key": "secret_key", "label": "Secret key", "type": "password", "required": True, "scope": "settings"},
                {"key": "payment_description_prefix", "label": "Payment description prefix", "type": "text", "required": False, "scope": "settings"},
            ],
            "supports_hosted_checkout": True,
            "supports_webhooks": True,
            "supports_refunds": False,
        }

    def default_config(self) -> Dict[str, Any]:
        return {
            "key": self.key,
            "enabled": False,
            "display_name": "Paystack",
            "description": "Pay securely by card or supported Paystack payment methods.",
            "mode": "test",
            "sort_order": 20,
            "public_config": {
                "public_key": "",
                "channels": ["card"],
                "currency": "ZAR",
            },
            "settings": {
                "secret_key": "",
                "payment_description_prefix": "FandomForge Order",
            },
            "secret_configured": False,
        }

    def validate_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        merged = self.default_config()
        merged.update(config or {})
        merged["key"] = self.key
        merged["enabled"] = bool(merged.get("enabled"))
        merged["display_name"] = (merged.get("display_name") or "Paystack").strip()
        merged["description"] = merged.get("description") or ""
        merged["mode"] = merged.get("mode") or "test"
        merged["sort_order"] = int(merged.get("sort_order") or 20)
        merged["public_config"] = {**self.default_config()["public_config"], **dict(merged.get("public_config") or {})}
        merged["settings"] = {**self.default_config()["settings"], **dict(merged.get("settings") or {})}
        channels = merged["public_config"].get("channels") or []
        if isinstance(channels, str):
            channels = [c.strip() for c in channels.split(",") if c.strip()]
        merged["public_config"]["channels"] = channels
        merged["public_config"]["currency"] = (merged["public_config"].get("currency") or "ZAR").strip().upper()
        if merged["enabled"] and not self._secret(merged):
            raise PaymentGatewayError("Paystack secret key is required before enabling Paystack checkout.")
        return merged

    def _secret(self, config: Dict[str, Any], key: str = "secret_key") -> str:
        value = ((config.get("settings") or {}).get(key) or "").strip()
        if value in SECRET_PLACEHOLDERS:
            return ""
        return value

    def _headers(self, config: Dict[str, Any]) -> Dict[str, str]:
        secret = self._secret(config)
        if not secret:
            raise PaymentGatewayError("Paystack is not configured. Add the shop checkout secret key first.")
        return {"Authorization": f"Bearer {secret}", "Content-Type": "application/json"}

    def _request(self, config: Dict[str, Any], method: str, path: str, payload: Dict[str, Any] | None = None) -> Dict[str, Any]:
        try:
            response = requests.request(
                method.upper(),
                f"{PAYSTACK_BASE_URL}{path}",
                json=payload,
                headers=self._headers(config),
                timeout=30,
            )
            data = response.json()
        except requests.RequestException as exc:
            raise PaymentGatewayError(f"Paystack connection failed: {exc}") from exc
        except ValueError as exc:
            raise PaymentGatewayError("Paystack returned an unreadable response.") from exc

        if response.status_code >= 400 or data.get("status") is False:
            raise PaymentGatewayError(data.get("message") or "Paystack request failed.")
        return data

    async def initialize_payment(self, order: Dict[str, Any], config: Dict[str, Any], urls: Dict[str, str]) -> Dict[str, Any]:
        public_config = config.get("public_config") or {}
        settings = config.get("settings") or {}
        reference = urls.get("reference")
        amount_cents = int(round(float(order.get("total") or 0) * 100))
        if amount_cents <= 0:
            raise PaymentGatewayError("Paystack checkout requires a positive order total.")

        metadata = {
            "order_id": order.get("id"),
            "order_number": order.get("order_number"),
            "tracking_token": order.get("tracking_token"),
            "kind": "order",
            "context": "shop_checkout",
            "custom_fields": [
                {"display_name": "Order Number", "variable_name": "order_number", "value": order.get("order_number")}
            ],
        }
        payload: Dict[str, Any] = {
            "email": order.get("buyer_email") or "buyer@example.com",
            "amount": amount_cents,
            "currency": (public_config.get("currency") or "ZAR").strip().upper(),
            "reference": reference,
            "callback_url": urls.get("return_url"),
            "metadata": metadata,
        }
        channels = public_config.get("channels") or []
        if channels:
            payload["channels"] = channels

        response = self._request(config, "POST", "/transaction/initialize", payload)
        data = response.get("data") or {}
        return {
            "provider": self.key,
            "reference": data.get("reference") or reference,
            "payment_id": data.get("access_code") or data.get("reference") or reference,
            "payment_url": data.get("authorization_url"),
            "payment_action": "redirect",
            "status": "pending",
            "hosted_checkout": True,
            "raw": response,
        }

    async def verify_payment(self, reference: str, config: Dict[str, Any]) -> Dict[str, Any]:
        response = self._request(config, "GET", f"/transaction/verify/{reference}")
        data = response.get("data") or {}
        paid = response.get("status") is True and data.get("status") == "success"
        return {
            "reference": data.get("reference") or reference,
            "payment_id": data.get("id") or data.get("reference"),
            "status": "completed" if paid else (data.get("status") or "failed"),
            "paid": paid,
            "raw": response,
        }

    def _verify_signature(self, raw_body: bytes, signature: str | None, config: Dict[str, Any]) -> bool:
        # Paystack signs webhook payloads with the integration secret key.
        # Shop checkout must use the shop Paystack secret only.
        if not signature:
            return False
        secret = self._secret(config)
        if not secret:
            return False
        expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha512).hexdigest()
        return hmac.compare_digest(expected, signature)

    async def handle_webhook(self, payload: Dict[str, Any], headers: Dict[str, str], config: Dict[str, Any], raw_body: str | bytes | None = None) -> Dict[str, Any]:
        raw_bytes = raw_body if isinstance(raw_body, bytes) else (raw_body or "").encode("utf-8")
        lower_headers = {str(k).lower(): v for k, v in (headers or {}).items()}
        signature = lower_headers.get("x-paystack-signature")
        if signature and not self._verify_signature(raw_bytes, signature, config):
            raise PaymentGatewayError("Invalid Paystack webhook signature.")

        event = payload.get("event") or ""
        data = payload.get("data") or {}
        metadata = data.get("metadata") or {}
        reference = data.get("reference") or metadata.get("reference")
        paid = event == "charge.success" and data.get("status") == "success"
        failed = event in {"charge.failed", "transfer.failed"} or data.get("status") in {"failed", "abandoned", "reversed"}
        return {
            "processed": bool(reference),
            "reference": reference,
            "payment_id": data.get("id") or reference,
            "status": "completed" if paid else ("failed" if failed else "pending"),
            "paid": paid,
            "event": event,
            "raw": data,
        }
