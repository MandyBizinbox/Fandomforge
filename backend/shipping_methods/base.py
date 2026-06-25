"""Shipping method adapter interface for FandomForge/FandomForge.

Adapters keep courier-specific behaviour isolated from routes_main.py. A new
courier should be added as a small module that implements this interface and is
then registered in shipping_methods/registry.py.
"""
from __future__ import annotations

from abc import ABC
from typing import Any, Dict, List, Optional


def _float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _int(value: Any, default: int = 100) -> int:
    try:
        if value is None or value == "":
            return default
        return int(value)
    except (TypeError, ValueError):
        return default


def _country(address: Optional[Dict[str, Any]]) -> str:
    return str((address or {}).get("country") or "ZA").strip().upper()


def method_matches_zone(config: Dict[str, Any], address: Optional[Dict[str, Any]]) -> bool:
    zones = [str(z).strip().upper() for z in (config.get("zones") or []) if str(z).strip()]
    return not zones or _country(address) in zones


class ShippingMethodAdapter(ABC):
    key: str = "base"
    display_name: str = "Base Shipping Method"
    description: str = "Base shipping adapter."
    method_type: str = "manual"
    sort_order: int = 100
    supports_live_rates: bool = False
    supports_waybills: bool = False
    supports_tracking: bool = False
    supports_pickup: bool = False
    settings_schema: List[Dict[str, Any]] = []
    public_config_schema: List[Dict[str, Any]] = []

    def default_config(self) -> Dict[str, Any]:
        return {
            "key": self.key,
            "adapter_key": self.key,
            "enabled": False,
            "display_name": self.display_name,
            "description": self.description,
            "method_type": self.method_type,
            "sort_order": self.sort_order,
            "rate": 0,
            "free_shipping_threshold": None,
            "zones": ["ZA"],
            "public_config": {},
            "settings": {},
        }

    def definition(self) -> Dict[str, Any]:
        return {
            "key": self.key,
            "display_name": self.display_name,
            "description": self.description,
            "method_type": self.method_type,
            "supports_live_rates": self.supports_live_rates,
            "supports_waybills": self.supports_waybills,
            "supports_tracking": self.supports_tracking,
            "supports_pickup": self.supports_pickup,
            "settings_schema": list(self.settings_schema or []),
            "public_config_schema": list(self.public_config_schema or []),
        }

    def validate_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        cleaned = dict(config or {})
        cleaned["key"] = cleaned.get("key") or self.key
        cleaned["adapter_key"] = cleaned.get("adapter_key") or self.key
        cleaned["display_name"] = cleaned.get("display_name") or self.display_name
        cleaned["description"] = cleaned.get("description") if cleaned.get("description") is not None else self.description
        cleaned["method_type"] = cleaned.get("method_type") or self.method_type
        cleaned["sort_order"] = _int(cleaned.get("sort_order"), self.sort_order)
        cleaned["rate"] = _float(cleaned.get("rate"), 0)
        threshold = cleaned.get("free_shipping_threshold")
        cleaned["free_shipping_threshold"] = None if threshold in (None, "") else _float(threshold, 0)
        cleaned["zones"] = [str(z).strip().upper() for z in (cleaned.get("zones") or []) if str(z).strip()]
        cleaned["public_config"] = dict(cleaned.get("public_config") or {})
        cleaned["settings"] = dict(cleaned.get("settings") or {})
        return cleaned

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

        base_rate = _float(config.get("rate"), 0)
        amount = base_rate
        threshold = config.get("free_shipping_threshold")
        label = config.get("display_name") or self.display_name
        if threshold is not None and float(threshold or 0) > 0 and float(subtotal or 0) >= float(threshold):
            amount = 0
            label = f"{label} · free over R {float(threshold):.2f}"

        public_config = dict(config.get("public_config") or {})
        return {
            "key": config.get("key") or self.key,
            "adapter_key": config.get("adapter_key") or self.key,
            "enabled": True,
            "display_name": config.get("display_name") or self.display_name,
            "description": config.get("description") or self.description,
            "method_type": config.get("method_type") or self.method_type,
            "sort_order": _int(config.get("sort_order"), self.sort_order),
            "rate": base_rate,
            "amount": round(float(amount or 0), 2),
            "label": label,
            "tracking_url_template": public_config.get("tracking_url_template") or "",
            "public_config": public_config,
        }

    async def create_shipment(self, *, order: Dict[str, Any], config: Dict[str, Any]) -> Dict[str, Any]:
        return {"ok": False, "status": "not_implemented", "provider": self.key, "order_id": order.get("id")}

    async def get_tracking(self, *, tracking_number: str, config: Dict[str, Any]) -> Dict[str, Any]:
        return {"ok": False, "status": "not_implemented", "provider": self.key, "tracking_number": tracking_number}

    async def cancel_shipment(self, *, shipment_reference: str, config: Dict[str, Any]) -> Dict[str, Any]:
        return {"ok": False, "status": "not_implemented", "provider": self.key, "shipment_reference": shipment_reference}
