"""Shipping method registry."""
from __future__ import annotations

from typing import Dict

from .base import ShippingMethodAdapter
from .bobgo import BobGoShippingAdapter
from .group_delivery import GroupDeliveryAdapter
from .manual import FreeShippingAdapter, LocalPickupAdapter, ManualShippingAdapter


_ADAPTERS: Dict[str, ShippingMethodAdapter] = {
    "manual_shipping": ManualShippingAdapter(),
    "free_shipping": FreeShippingAdapter(),
    "local_pickup": LocalPickupAdapter(),
    "bobgo": BobGoShippingAdapter(),
    "group_delivery": GroupDeliveryAdapter(),
}


def get_shipping_method_adapter(key: str) -> ShippingMethodAdapter:
    adapter = _ADAPTERS.get(key)
    if not adapter:
        raise KeyError(f"Unknown shipping method adapter: {key}")
    return adapter


def registered_shipping_method_adapters() -> Dict[str, ShippingMethodAdapter]:
    return dict(_ADAPTERS)
