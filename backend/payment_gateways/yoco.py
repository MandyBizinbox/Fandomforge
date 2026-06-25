"""Yoco Checkout API adapter for buyer shop checkout payments."""
from __future__ import annotations

from typing import Any, Dict

import requests

from .base import PaymentGatewayAdapter, PaymentGatewayError


YOCO_BASE_URL = "https://payments.yoco.com/api"
SECRET_PLACEHOLDERS = {"********", "••••••••"}


class YocoPaymentGateway(PaymentGatewayAdapter):
    key = "yoco"
    name = "Yoco Shop Checkout"

    def definition(self) -> Dict[str, Any]:
        return {
            "key": self.key,
            "name": self.name,
            "description": "Hosted Yoco Checkout API payment page for buyer merch orders only.",
            "capabilities": ["hosted_checkout", "webhook", "zar_only"],
            "settings_schema": [
                {"key": "public_key", "label": "Public key", "type": "text", "required": False, "scope": "public_config"},
                {"key": "secret_key", "label": "Secret key", "type": "password", "required": True, "scope": "settings"},
            ],
            "supports_hosted_checkout": True,
            "supports_webhooks": True,
            "supports_refunds": False,
        }

    def default_config(self) -> Dict[str, Any]:
        return {
            "key": self.key,
            "enabled": False,
            "display_name": "Yoco",
            "description": "Pay securely by card with Yoco.",
            "mode": "test",
            "sort_order": 30,
            "public_config": {"public_key": ""},
            "settings": {"secret_key": ""},
            "secret_configured": False,
        }

    def validate_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        merged = self.default_config()
        merged.update(config or {})
        merged["key"] = self.key
        merged["enabled"] = bool(merged.get("enabled"))
        merged["display_name"] = (merged.get("display_name") or "Yoco").strip()
        merged["description"] = merged.get("description") or ""
        merged["mode"] = merged.get("mode") or "test"
        merged["sort_order"] = int(merged.get("sort_order") or 30)
        merged["public_config"] = {**self.default_config()["public_config"], **dict(merged.get("public_config") or {})}
        merged["settings"] = {**self.default_config()["settings"], **dict(merged.get("settings") or {})}
        if merged["enabled"] and not self._secret(merged):
            raise PaymentGatewayError("Yoco secret key is required before enabling Yoco checkout.")
        return merged

    def _secret(self, config: Dict[str, Any]) -> str:
        value = ((config.get("settings") or {}).get("secret_key") or "").strip()
        if value in SECRET_PLACEHOLDERS:
            return ""
        return value

    def _headers(self, config: Dict[str, Any], idempotency_key: str | None = None) -> Dict[str, str]:
        secret = self._secret(config)
        if not secret:
            raise PaymentGatewayError("Yoco is not configured. Add the shop checkout secret key first.")
        headers = {"Authorization": f"Bearer {secret}", "Content-Type": "application/json"}
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        return headers

    async def initialize_payment(self, order: Dict[str, Any], config: Dict[str, Any], urls: Dict[str, str]) -> Dict[str, Any]:
        amount_cents = int(round(float(order.get("total") or 0) * 100))
        if amount_cents <= 0:
            raise PaymentGatewayError("Yoco checkout requires a positive order total.")

        line_items = []
        for item in order.get("items") or []:
            line_items.append({
                "displayName": str(item.get("product_title") or "Merch item")[:255],
                "quantity": int(item.get("quantity") or 1),
                "pricingDetails": {"price": int(round(float(item.get("unit_price") or 0) * 100))},
            })

        payload = {
            "amount": amount_cents,
            "currency": "ZAR",
            "successUrl": urls.get("return_url"),
            "cancelUrl": urls.get("cancel_url"),
            "failureUrl": urls.get("failure_url") or urls.get("return_url"),
            "clientReferenceId": urls.get("reference"),
            "externalId": order.get("id"),
            "metadata": {
                "order_id": order.get("id"),
                "order_number": order.get("order_number"),
                "reference": urls.get("reference"),
                "context": "shop_checkout",
            },
            "subtotalAmount": amount_cents,
            "lineItems": line_items[:50],
        }

        try:
            response = requests.post(
                f"{YOCO_BASE_URL}/checkouts",
                json=payload,
                headers=self._headers(config, idempotency_key=urls.get("reference")),
                timeout=20,
            )
            data = response.json()
        except requests.RequestException as exc:
            raise PaymentGatewayError(f"Yoco connection failed: {exc}") from exc
        except ValueError as exc:
            raise PaymentGatewayError("Yoco returned an unreadable response.") from exc

        if response.status_code >= 400:
            raise PaymentGatewayError(data.get("message") or data.get("error") or "Yoco checkout creation failed.")

        return {
            "provider": self.key,
            "reference": data.get("clientReferenceId") or urls.get("reference"),
            "payment_id": data.get("paymentId") or data.get("id"),
            "checkout_id": data.get("id"),
            "payment_url": data.get("redirectUrl"),
            "payment_action": "redirect",
            "status": data.get("status") or "pending",
            "hosted_checkout": True,
            "raw": data,
        }

    async def verify_payment(self, reference: str, config: Dict[str, Any]) -> Dict[str, Any]:
        # Yoco Checkout API finalises payments via webhook events. The order page
        # should read the persisted payment/order state after redirect.
        return {"reference": reference, "status": "pending", "paid": False}

    async def handle_webhook(self, payload: Dict[str, Any], headers: Dict[str, str], config: Dict[str, Any], raw_body: str | bytes | None = None) -> Dict[str, Any]:
        event_type = payload.get("type") or payload.get("event") or payload.get("name") or ""
        data = payload.get("payload") or payload.get("data") or payload
        if isinstance(data, dict) and isinstance(data.get("payment"), dict):
            payment_data = data.get("payment") or {}
            checkout_data = data.get("checkout") or {}
            data = {**checkout_data, **payment_data, "checkout": checkout_data, "payment": payment_data}
        if not isinstance(data, dict):
            data = {}

        metadata = data.get("metadata") or {}
        checkout_data = data.get("checkout") if isinstance(data.get("checkout"), dict) else {}
        payment_data = data.get("payment") if isinstance(data.get("payment"), dict) else {}
        reference = (
            metadata.get("reference")
            or data.get("clientReferenceId")
            or checkout_data.get("clientReferenceId")
            or payload.get("clientReferenceId")
            or payload.get("reference")
        )
        order_id = metadata.get("order_id") or data.get("externalId") or checkout_data.get("externalId")
        checkout_id = data.get("checkoutId") or checkout_data.get("id") or data.get("id")
        payment_id = data.get("paymentId") or payment_data.get("id") or data.get("id") or checkout_id
        status = (data.get("status") or payment_data.get("status") or checkout_data.get("status") or payload.get("status") or "").lower()
        paid = status in {"completed", "succeeded", "successful", "paid"} or event_type in {
            "payment.succeeded",
            "payment.succeeded.v1",
            "checkout.completed",
            "checkout.completed.v1",
        }
        failed = status in {"failed", "cancelled", "canceled"} or "failed" in event_type

        return {
            "processed": bool(reference or checkout_id or order_id),
            "reference": reference,
            "payment_id": payment_id,
            "order_id": order_id,
            "status": "completed" if paid else ("failed" if failed else "pending"),
            "paid": paid,
            "event": event_type,
            "raw": data,
        }
