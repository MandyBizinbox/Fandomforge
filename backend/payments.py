"""Payment provider abstraction. Supports 'mock' (MVP) and 'payfast' (stub, requires creds).

To enable PayFast, set environment vars:
  PAYFAST_MERCHANT_ID, PAYFAST_MERCHANT_KEY, PAYFAST_PASSPHRASE (optional), PAYFAST_SANDBOX=true|false
"""
from __future__ import annotations
import os
import hashlib
from abc import ABC, abstractmethod
from typing import Dict, Any
from models import uid


class PaymentProvider(ABC):
    name: str = "base"

    @abstractmethod
    def initiate(self, amount: float, description: str, reference: str, return_url: str, cancel_url: str, notify_url: str, email: str) -> Dict[str, Any]:
        ...

    def verify_webhook(self, payload: Dict[str, Any]) -> bool:
        return True


class MockProvider(PaymentProvider):
    name = "mock"

    def initiate(self, amount, description, reference, return_url, cancel_url, notify_url, email):
        # Mock flow: return a synthetic payment URL that the frontend treats as "approved"
        return {
            "provider": "mock",
            "reference": reference,
            "amount": amount,
            "payment_url": f"{return_url}?mock=1&reference={reference}",
            "status": "pending",
        }


class PayFastProvider(PaymentProvider):
    name = "payfast"

    def __init__(self):
        self.merchant_id = os.getenv("PAYFAST_MERCHANT_ID", "")
        self.merchant_key = os.getenv("PAYFAST_MERCHANT_KEY", "")
        self.passphrase = os.getenv("PAYFAST_PASSPHRASE", "")
        self.sandbox = os.getenv("PAYFAST_SANDBOX", "true").lower() == "true"
        self.base = "https://sandbox.payfast.co.za" if self.sandbox else "https://www.payfast.co.za"

    def _signature(self, data: Dict[str, Any]) -> str:
        parts = []
        for k in sorted(data.keys()):
            v = data[k]
            if v is None or v == "":
                continue
            parts.append(f"{k}={v}")
        s = "&".join(parts)
        if self.passphrase:
            s += f"&passphrase={self.passphrase}"
        return hashlib.md5(s.encode()).hexdigest()

    def initiate(self, amount, description, reference, return_url, cancel_url, notify_url, email):
        if not self.merchant_id or not self.merchant_key:
            # If not configured, degrade to mock
            return MockProvider().initiate(amount, description, reference, return_url, cancel_url, notify_url, email)
        data = {
            "merchant_id": self.merchant_id,
            "merchant_key": self.merchant_key,
            "return_url": return_url,
            "cancel_url": cancel_url,
            "notify_url": notify_url,
            "email_address": email,
            "m_payment_id": reference,
            "amount": f"{amount:.2f}",
            "item_name": description[:100],
        }
        data["signature"] = self._signature(data)
        qs = "&".join([f"{k}={v}" for k, v in data.items()])
        return {
            "provider": "payfast",
            "reference": reference,
            "amount": amount,
            "payment_url": f"{self.base}/eng/process?{qs}",
            "status": "pending",
        }

    def verify_webhook(self, payload: Dict[str, Any]) -> bool:
        sig = payload.get("signature")
        if not sig:
            return False
        copy = {k: v for k, v in payload.items() if k != "signature"}
        return self._signature(copy) == sig


_REGISTRY: Dict[str, PaymentProvider] = {
    "mock": MockProvider(),
    "payfast": PayFastProvider(),
}


def get_provider(name: str) -> PaymentProvider:
    return _REGISTRY.get(name, _REGISTRY["mock"])


def register_provider(name: str, provider: PaymentProvider):
    _REGISTRY[name] = provider


def new_reference() -> str:
    return f"mf_{uid()[:12]}"
