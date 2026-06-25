"""Bob Go shipping adapter placeholder.

This adapter provides the stable integration seam for Bob Go. It deliberately
uses configured fallback pricing until live rate and waybill API behaviour is
confirmed with production credentials.
"""
from __future__ import annotations

from typing import Any, Dict

from .base import ShippingMethodAdapter


class BobGoShippingAdapter(ShippingMethodAdapter):
    key = "bobgo"
    display_name = "Bob Go Courier"
    description = "Bob Go courier adapter. Uses fallback pricing until live rates are enabled."
    method_type = "bobgo"
    sort_order = 40
    supports_live_rates = False
    supports_waybills = False
    supports_tracking = True
    public_config_schema = [
        {
            "key": "tracking_url_template",
            "type": "text",
            "label": "Tracking URL template",
            "help": "Use {tracking_number} or {waybill_number}. Replace this once Bob Go confirms the preferred tracking URL format.",
            "placeholder": "https://www.bobgo.co.za/tracking/{tracking_number}",
        }
    ]
    settings_schema = [
        {"key": "api_key", "type": "password", "label": "Bob Go API key", "help": "Stored server-side. Leave masked value unchanged when editing other fields."},
        {"key": "sender_address_id", "type": "text", "label": "Sender address ID"},
        {"key": "service_level", "type": "text", "label": "Service level", "placeholder": "cheapest"},
        {"key": "fallback_rate", "type": "number", "label": "Fallback checkout rate", "help": "Used until live Bob Go rates are enabled."},
        {"key": "live_rates_enabled", "type": "checkbox", "label": "Enable live rates", "help": "Keep off until the live API endpoint is implemented and tested."},
    ]

    def default_config(self) -> Dict[str, Any]:
        config = super().default_config()
        config.update(
            {
                "enabled": False,
                "rate": 0,
                "public_config": {"tracking_url_template": "https://www.bobgo.co.za/tracking/{tracking_number}"},
                "settings": {
                    "api_key": "",
                    "sender_address_id": "",
                    "service_level": "cheapest",
                    "fallback_rate": 0,
                    "live_rates_enabled": False,
                },
            }
        )
        return config

    def validate_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        cleaned = super().validate_config(config)
        settings = dict(cleaned.get("settings") or {})
        if str(settings.get("api_key") or "").strip() in {"********", "••••••••"}:
            # The route merges settings before validation, so a masked value here
            # means the existing value should remain hidden rather than be treated
            # as a real credential.
            settings["api_key"] = ""
        cleaned["settings"] = settings
        fallback = settings.get("fallback_rate")
        if fallback not in (None, ""):
            cleaned["rate"] = fallback
        return cleaned
