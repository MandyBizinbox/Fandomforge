"""PayFast hosted checkout adapter for buyer shop checkout payments."""
from __future__ import annotations

import csv
import hashlib
import hmac
import io
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, Optional
from urllib.parse import quote_plus, urlencode

import requests

from .base import PaymentGatewayAdapter, PaymentGatewayError


SECRET_PLACEHOLDERS = {"********", "••••••••"}

PAYFAST_SANDBOX_URL = "https://sandbox.payfast.co.za/eng/process"
PAYFAST_LIVE_URL = "https://www.payfast.co.za/eng/process"
PAYFAST_SANDBOX_VALIDATE_URL = "https://sandbox.payfast.co.za/eng/query/validate"
PAYFAST_LIVE_VALIDATE_URL = "https://www.payfast.co.za/eng/query/validate"
PAYFAST_API_URL = "https://api.payfast.co.za"
PAYFAST_API_VERSION = "v1"


class PayFastPaymentGateway(PaymentGatewayAdapter):
    key = "payfast"
    name = "PayFast Shop Checkout"

    def definition(self) -> Dict[str, Any]:
        return {
            "key": self.key,
            "name": self.name,
            "description": "Hosted PayFast checkout for buyer merch orders only.",
            "capabilities": ["hosted_checkout", "webhook", "itn", "verify", "zar"],
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

    def _is_live(self, config: Dict[str, Any]) -> bool:
        return str(config.get("mode") or "").strip().lower() == "live"

    def _process_url(self, config: Dict[str, Any]) -> str:
        return PAYFAST_LIVE_URL if self._is_live(config) else PAYFAST_SANDBOX_URL

    def _validate_url(self, config: Dict[str, Any]) -> str:
        return PAYFAST_LIVE_VALIDATE_URL if self._is_live(config) else PAYFAST_SANDBOX_VALIDATE_URL

    @staticmethod
    def _clean_payment_pairs(data: Dict[str, Any]) -> Iterable[tuple[str, str]]:
        """Yield PayFast payment fields without local/internal metadata.

        ``routes_main`` adds internal helper keys (currently ``__request_url``)
        for gateways that need request context. Those fields were never posted by
        PayFast and therefore must never participate in PayFast signatures or ITN
        server validation.
        """
        for key, raw_value in (data or {}).items():
            if key == "signature" or str(key).startswith("__"):
                continue
            if raw_value is None:
                continue
            value = str(raw_value).strip()
            if value == "":
                continue
            yield str(key), value

    def _signature_payload(self, data: Dict[str, Any], passphrase: str = "") -> str:
        pairs = [f"{key}={quote_plus(value)}" for key, value in self._clean_payment_pairs(data)]
        if passphrase:
            pairs.append(f"passphrase={quote_plus(str(passphrase).strip())}")
        return "&".join(pairs)

    def _signature(self, data: Dict[str, Any], passphrase: str = "") -> str:
        payload = self._signature_payload(data, passphrase)
        return hashlib.md5(payload.encode("utf-8")).hexdigest()

    def _itn_payload_string(self, payload: Dict[str, Any]) -> str:
        """Build the exact form body PayFast expects at /eng/query/validate."""
        return "&".join(f"{key}={quote_plus(value)}" for key, value in self._clean_payment_pairs(payload))

    def _verify_server_confirmation(self, payload: Dict[str, Any], config: Dict[str, Any]) -> None:
        body = self._itn_payload_string(payload)
        try:
            response = requests.post(
                self._validate_url(config),
                data=body,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=20,
            )
        except requests.RequestException as exc:
            raise PaymentGatewayError(f"PayFast ITN validation connection failed: {exc}") from exc

        if response.status_code >= 400 or response.text.strip().upper() != "VALID":
            raise PaymentGatewayError("PayFast rejected the ITN during server validation.")

    def _api_timestamp(self) -> str:
        # PayFast accepts ISO-8601. Use the merchant's South African offset
        # explicitly rather than relying on the host's local timezone.
        sa_tz = timezone(timedelta(hours=2))
        return datetime.now(sa_tz).isoformat(timespec="seconds")

    def _api_signature(self, values: Dict[str, Any], config: Dict[str, Any]) -> str:
        signed: Dict[str, str] = {}
        for key, raw_value in (values or {}).items():
            if key == "testing" or raw_value is None:
                continue
            value = str(raw_value).strip()
            if value:
                signed[str(key)] = value

        passphrase = self._setting(config, "passphrase")
        if passphrase:
            signed["passphrase"] = passphrase

        encoded = "&".join(
            f"{key}={quote_plus(signed[key])}"
            for key in sorted(signed)
        )
        return hashlib.md5(encoded.encode("utf-8")).hexdigest()

    def _api_get(self, path: str, config: Dict[str, Any], params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        merchant_id = self._setting(config, "merchant_id")
        passphrase = self._setting(config, "passphrase")
        if not merchant_id:
            raise PaymentGatewayError("PayFast merchant ID is required for payment reconciliation.")
        if not passphrase:
            raise PaymentGatewayError("PayFast passphrase is required for API payment reconciliation.")

        query = dict(params or {})
        if not self._is_live(config):
            query["testing"] = "true"

        timestamp = self._api_timestamp()
        signature_values: Dict[str, Any] = {
            "merchant-id": merchant_id,
            "version": PAYFAST_API_VERSION,
            "timestamp": timestamp,
            **query,
        }
        headers = {
            "merchant-id": merchant_id,
            "version": PAYFAST_API_VERSION,
            "timestamp": timestamp,
            "signature": self._api_signature(signature_values, config),
        }

        try:
            response = requests.get(
                f"{PAYFAST_API_URL}{path}",
                params=query,
                headers=headers,
                timeout=30,
            )
            data = response.json()
        except requests.RequestException as exc:
            raise PaymentGatewayError(f"PayFast reconciliation connection failed: {exc}") from exc
        except ValueError as exc:
            raise PaymentGatewayError("PayFast reconciliation returned an unreadable response.") from exc

        if response.status_code >= 400 or str(data.get("status") or "").lower() == "failed":
            message = data.get("message") or ((data.get("data") or {}).get("message") if isinstance(data.get("data"), dict) else None)
            raise PaymentGatewayError(message or "PayFast reconciliation request failed.")
        return data

    @staticmethod
    def _history_csv(api_response: Dict[str, Any]) -> str:
        response = api_response.get("response")
        if response is None and isinstance(api_response.get("data"), dict):
            response = api_response["data"].get("response")
        return str(response or "")

    @staticmethod
    def _history_value(row: Dict[str, Any], *names: str) -> str:
        normalised = {
            str(key or "").strip().lower().replace("_", " "): str(value or "").strip()
            for key, value in (row or {}).items()
        }
        for name in names:
            value = normalised.get(name.strip().lower().replace("_", " "))
            if value is not None:
                return value
        return ""

    def _find_history_transaction(self, response: Dict[str, Any], reference: str) -> Optional[Dict[str, str]]:
        content = self._history_csv(response)
        if not content.strip():
            return None

        rows = list(csv.DictReader(io.StringIO(content)))
        matches = [
            row for row in rows
            if self._history_value(row, "M Payment ID", "m_payment_id") == str(reference)
        ]
        if not matches:
            return None

        # Prefer a settled credit if the export also contains a later fee/refund
        # or another non-settlement row using the same merchant reference.
        for row in reversed(matches):
            tx_type = self._history_value(row, "Type").upper()
            sign = self._history_value(row, "Sign").upper()
            if tx_type == "FUNDS_RECEIVED" and sign == "CREDIT":
                return row
        return matches[-1]

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
        """Reconcile a missed PayFast ITN from authenticated transaction history.

        PayFast's standard once-off checkout does not provide a simple verify-by-
        merchant-reference endpoint. The authenticated transaction-history API
        includes both M Payment ID and PF Payment ID, so it is the safe fallback
        when an ITN was missed or rejected.
        """
        today = datetime.now(timezone.utc).date()
        params = {
            "from": (today - timedelta(days=62)).isoformat(),
            "to": today.isoformat(),
            "limit": 1000,
            "offset": 0,
        }
        response = self._api_get("/transactions/history", config, params=params)
        row = self._find_history_transaction(response, reference)
        if not row:
            return {
                "reference": reference,
                "status": "pending",
                "paid": False,
                "raw": response,
            }

        tx_type = self._history_value(row, "Type").upper()
        sign = self._history_value(row, "Sign").upper()
        paid = tx_type == "FUNDS_RECEIVED" and sign == "CREDIT"
        gross_text = self._history_value(row, "Gross", "amount_gross")
        try:
            amount_gross = float(gross_text.replace(",", "")) if gross_text else None
        except (TypeError, ValueError):
            amount_gross = None

        provider_payment_id = self._history_value(row, "PF Payment ID", "pf_payment_id") or reference
        return {
            "reference": reference,
            "payment_id": provider_payment_id,
            "status": "completed" if paid else "pending",
            "paid": paid,
            "amount_gross": amount_gross,
            "raw": row,
        }

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

        configured_merchant_id = self._setting(config, "merchant_id")
        received_merchant_id = str(payload.get("merchant_id") or "").strip()
        if configured_merchant_id and received_merchant_id != configured_merchant_id:
            raise PaymentGatewayError("PayFast ITN merchant ID does not match the configured merchant.")

        # Signature verification proves integrity of the POST body. PayFast also
        # requires a server-to-server confirmation against /eng/query/validate.
        self._verify_server_confirmation(payload, config)

        reference = payload.get("m_payment_id") or payload.get("custom_str2")
        order_id = payload.get("custom_str1")
        payment_id = payload.get("pf_payment_id") or reference
        payment_status = str(payload.get("payment_status") or "").upper()
        gross_text = str(payload.get("amount_gross") or "").strip()
        try:
            amount_gross = float(gross_text) if gross_text else None
        except (TypeError, ValueError):
            amount_gross = None

        paid = payment_status == "COMPLETE"
        failed = payment_status in {"FAILED", "CANCELLED", "CANCELED"}

        return {
            "processed": bool(reference or order_id),
            "reference": reference,
            "payment_id": payment_id,
            "order_id": order_id,
            "status": "completed" if paid else ("failed" if failed else "pending"),
            "paid": paid,
            "amount_gross": amount_gross,
            "event": f"payfast.{payment_status.lower() or 'itn'}",
            "raw": payload,
        }
