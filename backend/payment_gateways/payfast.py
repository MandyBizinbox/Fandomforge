"""PayFast hosted checkout adapter for buyer shop checkout payments."""
from __future__ import annotations

import hashlib
import hmac
from typing import Any, Dict
from urllib.parse import quote_plus, urlencode

from .base import PaymentGatewayAdapter, PaymentGatewayError


SECRET_PLACEHOLDERS = {"********", "••••••••"}


PAYFAST_SANDBOX_URL = "https://sandbox.payfast.co.za/eng/process"
PAYFAST_LIVE_URL = "https://www.payfast.co.za/eng/process"


class PayFastPaymentGateway(PaymentGatewayAdapter):
    key = "payfast"
    name = "PayFast Shop Checkout"

    def definition(self) -> Dict[str, Any]:
        return {
            "key": self.key,
            "name": self.name,
            "description": "Hosted PayFast checkout for buyer merch orders only.",
            "capabilities": ["hosted_checkout", "webhook", "itn", "zar"],
            "settings_schema": [
                {"key": "merchant_id", "label": "Merchant ID", "type": "text", "required": True, "scope": "settings"},
                {"key": "merchant_key", "label": "Merchant Key", "type": "password", "required": True, "scope": "settings"},
                {"key": "passphrase", "label": "Security Passphrase", "type": "password", "required": False, "scope": "settings"},
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
            "display_name": "PayFast Payment",
            "description": "Pay securely by card, Instant EFT or supported PayFast payment methods.",
            "mode": "test",
            "sort_order": 20,
            "public_config": {},
            "settings": {
                "merchant_id": "",
                "merchant_key": "",
                "passphrase": "",
                "payment_description_prefix": "FandomForge Order",
            },
            "secret_configured": False,
        }

    def validate_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        merged = self.default_config()
        merged.update(config or {})
        merged["key"] = self.key
        merged["enabled"] = bool(merged.get("enabled"))
        merged["display_name"] = (merged.get("display_name") or "PayFast Payment").strip()
        merged["description"] = merged.get("description") or ""
        merged["mode"] = merged.get("mode") or "test"
        merged["sort_order"] = int(merged.get("sort_order") or 20)
        merged["public_config"] = dict(merged.get("public_config") or {})
        merged["settings"] = {**self.default_config()["settings"], **dict(merged.get("settings") or {})}
        if merged["enabled"]:
            if not self._setting(merged, "merchant_id"):
                raise PaymentGatewayError("PayFast merchant ID is required before enabling PayFast checkout.")
            if not self._setting(merged, "merchant_key"):
                raise PaymentGatewayError("PayFast merchant key is required before enabling PayFast checkout.")
        return merged

    def _setting(self, config: Dict[str, Any], key: str) -> str:
        value = str(((config.get("settings") or {}).get(key) or "")).strip()
        if value in SECRET_PLACEHOLDERS:
            return ""
        return value

    def _process_url(self, config: Dict[str, Any]) -> str:
        return PAYFAST_LIVE_URL if str(config.get("mode") or "").lower() == "live" else PAYFAST_SANDBOX_URL

    def _signature_payload(self, data: Dict[str, Any], passphrase: str = "") -> str:
        """Build the PayFast signature string in the same order as submitted.

        PayFast validates the MD5 signature against the posted payment fields.
        Do not sort fields alphabetically here; keep the insertion order used by
        the outgoing checkout payload, exclude the signature field itself, skip
        blank values, URL-encode values, then append passphrase last when set.
        """
        pairs = []
        for key, raw_value in data.items():
            if key == "signature":
                continue
            if raw_value is None:
                continue
            value = str(raw_value).strip()
            if value == "":
                continue
            pairs.append(f"{key}={quote_plus(value)}")
        if passphrase:
            pairs.append(f"passphrase={quote_plus(str(passphrase).strip())}")
        return "&".join(pairs)

    def _signature(self, data: Dict[str, Any], passphrase: str = "") -> str:
        payload = self._signature_payload(data, passphrase)
        return hashlib.md5(payload.encode("utf-8")).hexdigest()

    async def initialize_payment(self, order: Dict[str, Any], config: Dict[str, Any], urls: Dict[str, str]) -> Dict[str, Any]:
        settings = config.get("settings") or {}
        merchant_id = self._setting(config, "merchant_id")
        merchant_key = self._setting(config, "merchant_key")
        passphrase = self._setting(config, "passphrase")

        if not merchant_id or not merchant_key:
            raise PaymentGatewayError("PayFast is not configured. Add merchant ID and merchant key first.")

        amount = float(order.get("total") or 0)
        if amount <= 0:
            raise PaymentGatewayError("PayFast checkout requires a positive order total.")

        reference = urls.get("reference") or order.get("order_number")
        item_name = f"{settings.get('payment_description_prefix') or 'FandomForge Order'} {order.get('order_number')}".strip()

        payload: Dict[str, Any] = {
            "merchant_id": merchant_id,
            "merchant_key": merchant_key,
            "return_url": urls.get("return_url"),
            "cancel_url": urls.get("cancel_url"),
            "notify_url": urls.get("webhook_url"),
            "email_address": order.get("buyer_email") or "",
            "m_payment_id": reference,
            "amount": f"{amount:.2f}",
            "item_name": item_name[:100],
            "item_description": f"Order {order.get('order_number')}"[:255],
            "custom_str1": str(order.get("id") or ""),
            "custom_str2": str(order.get("order_number") or ""),
            "custom_str3": "shop_checkout",
        }

        # PayFast signature validation is sensitive to the exact submitted field set.
        # Remove blank values before signing and before building the redirect URL.
        payload = {
            key: value
            for key, value in payload.items()
            if value is not None and str(value).strip() != ""
        }

        payload["signature"] = self._signature(payload, passphrase)

        payment_url = f"{self._process_url(config)}?{urlencode(payload)}"

        return {
            "provider": self.key,
            "reference": reference,
            "payment_id": reference,
            "payment_url": payment_url,
            "payment_action": "redirect",
            "status": "pending",
            "hosted_checkout": True,
            "raw": {
                "process_url": self._process_url(config),
                "reference": reference,
                "order_id": order.get("id"),
                "order_number": order.get("order_number"),
            },
        }

    async def verify_payment(self, reference: str, config: Dict[str, Any]) -> Dict[str, Any]:
        # PayFast final confirmation is handled via ITN/webhook.
        return {"reference": reference, "status": "pending", "paid": False}

    def _verify_signature(self, payload: Dict[str, Any], config: Dict[str, Any]) -> bool:
        supplied = str(payload.get("signature") or "").strip()
        if not supplied:
            return False
        passphrase = self._setting(config, "passphrase")
        expected = self._signature(payload, passphrase)
        return hmac.compare_digest(expected, supplied)

    async def handle_webhook(self, payload: Dict[str, Any], headers: Dict[str, str], config: Dict[str, Any], raw_body: str | bytes | None = None) -> Dict[str, Any]:
        if not self._verify_signature(payload, config):
            raise PaymentGatewayError("Invalid PayFast ITN signature.")

        reference = payload.get("m_payment_id") or payload.get("custom_str2")
        order_id = payload.get("custom_str1")
        payment_id = payload.get("pf_payment_id") or reference
        payment_status = str(payload.get("payment_status") or "").upper()

        paid = payment_status == "COMPLETE"
        failed = payment_status in {"FAILED", "CANCELLED", "CANCELED"}

        return {
            "processed": bool(reference or order_id),
            "reference": reference,
            "payment_id": payment_id,
            "order_id": order_id,
            "status": "completed" if paid else ("failed" if failed else "pending"),
            "paid": paid,
            "event": f"payfast.{payment_status.lower() or 'itn'}",
            "raw": payload,
        }
