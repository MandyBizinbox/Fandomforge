"""Peach Payments Hosted Checkout V2 adapter for buyer shop checkout payments."""
from __future__ import annotations

import hashlib
import hmac
import json
from typing import Any, Dict
from uuid import uuid4

import requests

from .base import PaymentGatewayAdapter, PaymentGatewayError


SECRET_PLACEHOLDERS = {"********", "••••••••"}

PEACH_AUTH_LIVE = "https://dashboard.peachpayments.com"
PEACH_AUTH_TEST = "https://sandbox-dashboard.peachpayments.com"
PEACH_CHECKOUT_LIVE = "https://secure.peachpayments.com"
PEACH_CHECKOUT_TEST = "https://testsecure.peachpayments.com"


class PeachPaymentGateway(PaymentGatewayAdapter):
    key = "peach"
    name = "Peach Payments Checkout"

    def definition(self) -> Dict[str, Any]:
        return {
            "key": self.key,
            "name": self.name,
            "description": "Hosted Peach Payments Checkout V2 for buyer merch orders only.",
            "capabilities": ["hosted_checkout", "webhook", "zar"],
            "settings_schema": [
                {"key": "entity_id", "label": "Entity ID", "type": "text", "required": True, "scope": "settings"},
                {"key": "client_id", "label": "Client ID", "type": "text", "required": True, "scope": "settings"},
                {"key": "client_secret", "label": "Client Secret", "type": "password", "required": True, "scope": "settings"},
                {"key": "merchant_id", "label": "Merchant ID", "type": "text", "required": True, "scope": "settings"},
                {"key": "secret_token", "label": "Webhook Secret Token", "type": "password", "required": False, "scope": "settings"},
                {"key": "currency", "label": "Currency", "type": "text", "required": False, "scope": "public_config"},
                {"key": "payment_type", "label": "Payment Type", "type": "text", "required": False, "scope": "settings"},
            ],
            "supports_hosted_checkout": True,
            "supports_webhooks": True,
            "supports_refunds": False,
        }

    def default_config(self) -> Dict[str, Any]:
        return {
            "key": self.key,
            "enabled": False,
            "display_name": "Peach Payment",
            "description": "Pay securely through Peach Payments hosted checkout.",
            "mode": "test",
            "sort_order": 30,
            "public_config": {"currency": "ZAR"},
            "settings": {
                "entity_id": "",
                "client_id": "",
                "client_secret": "",
                "merchant_id": "",
                "secret_token": "",
                "payment_type": "DB",
            },
            "secret_configured": False,
        }

    def validate_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        merged = self.default_config()
        merged.update(config or {})
        merged["key"] = self.key
        merged["enabled"] = bool(merged.get("enabled"))
        merged["display_name"] = (merged.get("display_name") or "Peach Payment").strip()
        merged["description"] = merged.get("description") or ""
        merged["mode"] = merged.get("mode") or "test"
        merged["sort_order"] = int(merged.get("sort_order") or 30)
        merged["public_config"] = {**self.default_config()["public_config"], **dict(merged.get("public_config") or {})}
        merged["settings"] = {**self.default_config()["settings"], **dict(merged.get("settings") or {})}
        merged["public_config"]["currency"] = (merged["public_config"].get("currency") or "ZAR").strip().upper()
        merged["settings"]["payment_type"] = (merged["settings"].get("payment_type") or "DB").strip().upper()
        if merged["enabled"]:
            for key in ["entity_id", "client_id", "client_secret", "merchant_id"]:
                if not self._setting(merged, key):
                    raise PaymentGatewayError(f"Peach {key.replace('_', ' ')} is required before enabling Peach checkout.")
        return merged

    def _setting(self, config: Dict[str, Any], key: str) -> str:
        value = str(((config.get("settings") or {}).get(key) or "")).strip()
        if value in SECRET_PLACEHOLDERS:
            return ""
        return value

    def _auth_base(self, config: Dict[str, Any]) -> str:
        return PEACH_AUTH_LIVE if str(config.get("mode") or "").lower() == "live" else PEACH_AUTH_TEST

    def _checkout_base(self, config: Dict[str, Any]) -> str:
        return PEACH_CHECKOUT_LIVE if str(config.get("mode") or "").lower() == "live" else PEACH_CHECKOUT_TEST

    def _access_token(self, config: Dict[str, Any]) -> str:
        payload = {
            "clientId": self._setting(config, "client_id"),
            "clientSecret": self._setting(config, "client_secret"),
            "merchantId": self._setting(config, "merchant_id"),
        }
        try:
            response = requests.post(
                f"{self._auth_base(config)}/api/oauth/token",
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=30,
            )
            data = response.json()
        except requests.RequestException as exc:
            raise PaymentGatewayError(f"Peach authentication failed: {exc}") from exc
        except ValueError as exc:
            raise PaymentGatewayError("Peach authentication returned an unreadable response.") from exc

        if response.status_code >= 400:
            raise PaymentGatewayError(data.get("message") or data.get("error") or "Peach authentication failed.")

        token = data.get("access_token") or data.get("accessToken") or data.get("token")
        if not token:
            raise PaymentGatewayError("Peach authentication did not return an access token.")
        return token

    async def initialize_payment(self, order: Dict[str, Any], config: Dict[str, Any], urls: Dict[str, str]) -> Dict[str, Any]:
        amount = float(order.get("total") or 0)
        if amount <= 0:
            raise PaymentGatewayError("Peach checkout requires a positive order total.")

        public_config = config.get("public_config") or {}
        settings = config.get("settings") or {}
        reference = (urls.get("reference") or order.get("order_number") or str(uuid4())).replace("-", "")[:16]
        if len(reference) < 8:
            reference = f"{reference}{str(uuid4()).replace('-', '')}"[:8]

        payload = {
            "authentication.entityId": self._setting(config, "entity_id"),
            "merchantTransactionId": reference,
            "merchantInvoiceId": str(order.get("order_number") or reference),
            "amount": f"{amount:.2f}",
            "currency": (public_config.get("currency") or "ZAR").strip().upper(),
            "paymentType": (settings.get("payment_type") or "DB").strip().upper(),
            "nonce": str(uuid4()),
            "shopperResultUrl": urls.get("return_url"),
            "cancelUrl": urls.get("cancel_url"),
            "notificationUrl": urls.get("webhook_url"),
            "customParameters[order_id]": str(order.get("id") or ""),
            "customParameters[order_number]": str(order.get("order_number") or ""),
            "customParameters[reference]": reference,
            "customParameters[context]": "shop_checkout",
        }

        token = self._access_token(config)
        try:
            response = requests.post(
                f"{self._checkout_base(config)}/v2/checkout",
                data=payload,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Referer": urls.get("return_url") or "",
                },
                timeout=30,
            )
            data = response.json()
        except requests.RequestException as exc:
            raise PaymentGatewayError(f"Peach checkout creation failed: {exc}") from exc
        except ValueError as exc:
            raise PaymentGatewayError("Peach checkout returned an unreadable response.") from exc

        if response.status_code >= 400:
            raise PaymentGatewayError(data.get("message") or data.get("error") or "Peach checkout creation failed.")

        redirect_url = data.get("redirectUrl") or data.get("redirect_url")
        checkout_id = data.get("checkoutId") or data.get("id")
        if not redirect_url:
            raise PaymentGatewayError("Peach checkout did not return a redirect URL.")

        return {
            "provider": self.key,
            "reference": reference,
            "payment_id": checkout_id or reference,
            "checkout_id": checkout_id,
            "payment_url": redirect_url,
            "payment_action": "redirect",
            "status": "pending",
            "hosted_checkout": True,
            "raw": data,
        }

    async def verify_payment(self, reference: str, config: Dict[str, Any]) -> Dict[str, Any]:
        # Peach Checkout status is completed through webhook/POST redirect.
        return {"reference": reference, "status": "pending", "paid": False}

    def _verify_hmac_signature(self, payload: Dict[str, Any], headers: Dict[str, str], config: Dict[str, Any], raw_body: str | bytes | None = None) -> bool:
        secret = self._setting(config, "secret_token")
        if not secret:
            return True

        lower = {str(k).lower(): str(v) for k, v in (headers or {}).items()}
        received = lower.get("x-webhook-signature")
        timestamp = lower.get("x-webhook-timestamp")
        webhook_id = lower.get("x-webhook-id")
        if not received or not timestamp or not webhook_id:
            # Secret configured but Peach signature headers not active/present.
            return False

        body = raw_body.decode("utf-8") if isinstance(raw_body, bytes) else (raw_body or "")
        # Peach signs: timestamp.webhookId.url.payload. The request URL is not
        # available inside the adapter, so the route passes it as __request_url.
        request_url = str(payload.get("__request_url") or "")
        message = f"{timestamp}.{webhook_id}.{request_url}.{body}"
        expected = hmac.new(secret.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, received)

    async def handle_webhook(self, payload: Dict[str, Any], headers: Dict[str, str], config: Dict[str, Any], raw_body: str | bytes | None = None) -> Dict[str, Any]:
        if not self._verify_hmac_signature(payload, headers, config, raw_body):
            raise PaymentGatewayError("Invalid Peach webhook signature.")

        reference = (
            payload.get("merchantTransactionId")
            or payload.get("customParameters[reference]")
            or payload.get("reference")
        )
        order_id = (
            payload.get("customParameters[order_id]")
            or payload.get("order_id")
        )
        checkout_id = payload.get("checkoutId") or payload.get("id")
        result_code = str(payload.get("result.code") or payload.get("resultCode") or "")
        result_desc = str(payload.get("result.description") or payload.get("resultDescription") or payload.get("status") or "").lower()

        paid = result_desc == "successful" or result_desc == "success" or result_code.startswith("000.")
        failed = "cancel" in result_desc or "failed" in result_desc or result_code.startswith("100.") or result_code.startswith("200.")

        return {
            "processed": bool(reference or checkout_id or order_id),
            "reference": reference,
            "payment_id": checkout_id or payload.get("id") or reference,
            "order_id": order_id,
            "status": "completed" if paid else ("failed" if failed else "pending"),
            "paid": paid,
            "event": f"peach.{result_desc or result_code or 'webhook'}",
            "raw": payload,
        }
