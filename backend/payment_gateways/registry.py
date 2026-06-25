"""Registry for shop checkout payment adapters."""
from __future__ import annotations

from typing import Dict, List

from .base import PaymentGatewayAdapter
from .manual import ManualPaymentGateway
from .paystack import PaystackPaymentGateway
from .payfast import PayFastPaymentGateway
from .peach import PeachPaymentGateway
from .yoco import YocoPaymentGateway


_ADAPTERS: Dict[str, PaymentGatewayAdapter] = {
    "manual_eft": ManualPaymentGateway(),
    "paystack": PaystackPaymentGateway(),
    "payfast": PayFastPaymentGateway(),
    "peach": PeachPaymentGateway(),
    "yoco": YocoPaymentGateway(),
}


def list_payment_gateway_adapters() -> List[PaymentGatewayAdapter]:
    return list(_ADAPTERS.values())


def get_payment_gateway_adapter(key: str) -> PaymentGatewayAdapter:
    adapter = _ADAPTERS.get((key or "").strip().lower())
    if not adapter:
        raise KeyError(f"Unknown payment gateway: {key}")
    return adapter


def adapter_definitions() -> List[dict]:
    return [adapter.definition() for adapter in list_payment_gateway_adapters()]
