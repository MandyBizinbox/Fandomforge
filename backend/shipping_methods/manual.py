"""Manual/local shipping adapters."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from .base import ShippingMethodAdapter, _float, _int, method_matches_zone


class ManualShippingAdapter(ShippingMethodAdapter):
    key = "manual_shipping"
    display_name = "Standard Courier"
    description = "Courier delivery arranged by the fulfilment team."
    method_type = "flat_rate"
    sort_order = 10
    supports_tracking = True
    supports_waybills = True
    public_config_schema = [
        {
            "key": "tracking_url_template",
            "type": "text",
            "label": "Tracking URL template",
            "help": "Use {tracking_number} or {waybill_number} where the courier reference should be inserted.",
            "placeholder": "https://courier.example/track/{tracking_number}",
        }
    ]
    settings_schema = [
        {
            "key": "admin_notes",
            "type": "textarea",
            "label": "Admin notes",
            "help": "Internal notes for the fulfilment team. Not shown to buyers.",
        }
    ]

    def default_config(self) -> Dict[str, Any]:
        config = super().default_config()
        config.update(
            {
                "enabled": True,
                "rate": 99,
                "public_config": {"tracking_url_template": ""},
                "settings": {"admin_notes": "Manual courier booking. Add waybill and tracking after dispatch."},
            }
        )
        return config


class FreeShippingAdapter(ShippingMethodAdapter):
    key = "free_shipping"
    display_name = "Free Shipping"
    description = "Free courier delivery for orders above the configured threshold."
    method_type = "free_shipping"
    sort_order = 20
    supports_tracking = True
    supports_waybills = True
    settings_schema = [
        {
            "key": "admin_notes",
            "type": "textarea",
            "label": "Admin notes",
            "help": "Internal notes for how free-shipping orders should be fulfilled.",
        }
    ]

    def default_config(self) -> Dict[str, Any]:
        config = super().default_config()
        config.update({"enabled": False, "rate": 0, "free_shipping_threshold": 1000, "settings": {}})
        return config

    def quote(
        self,
        *,
        config: Dict[str, Any],
        subtotal: float,
        items: Optional[List[Dict[str, Any]]] = None,
        shipping_address: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        config = self.validate_config(config)
        if not config.get("enabled"):
            return None
        if not method_matches_zone(config, shipping_address):
            return None
        threshold = config.get("free_shipping_threshold")
        if threshold is not None and float(subtotal or 0) < float(threshold or 0):
            return None
        label = config.get("display_name") or self.display_name
        if threshold:
            label = f"{label} · orders over R {float(threshold):.2f}"
        return {
            "key": config.get("key") or self.key,
            "adapter_key": config.get("adapter_key") or self.key,
            "enabled": True,
            "display_name": config.get("display_name") or self.display_name,
            "description": config.get("description") or self.description,
            "method_type": config.get("method_type") or self.method_type,
            "sort_order": _int(config.get("sort_order"), self.sort_order),
            "rate": 0,
            "amount": 0,
            "label": label,
            "tracking_url_template": (config.get("public_config") or {}).get("tracking_url_template") or "",
            "public_config": dict(config.get("public_config") or {}),
        }


class LocalPickupAdapter(ShippingMethodAdapter):
    key = "local_pickup"
    display_name = "Local Pickup"
    description = "Collect from the seller or arranged pickup point."
    method_type = "local_pickup"
    sort_order = 30
    supports_pickup = True
    settings_schema = [
        {
            "key": "pickup_instructions",
            "type": "textarea",
            "label": "Pickup instructions",
            "help": "Shown internally and can be copied into buyer communication.",
        }
    ]

    def default_config(self) -> Dict[str, Any]:
        config = super().default_config()
        config.update(
            {
                "enabled": False,
                "rate": 0,
                "settings": {"pickup_instructions": "Collection details will be confirmed after checkout."},
            }
        )
        return config

    def quote(
        self,
        *,
        config: Dict[str, Any],
        subtotal: float,
        items: Optional[List[Dict[str, Any]]] = None,
        shipping_address: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        quote = super().quote(config=config, subtotal=subtotal, items=items, shipping_address=shipping_address)
        if quote:
            quote["amount"] = round(_float(config.get("rate"), 0), 2)
            quote["rate"] = quote["amount"]
        return quote
