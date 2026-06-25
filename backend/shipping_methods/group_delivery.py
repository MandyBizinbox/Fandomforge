"""Creator-managed batched group delivery shipping adapter."""
from __future__ import annotations

from datetime import date, datetime, timedelta
from math import ceil
from typing import Any, Dict, List, Optional

from .base import ShippingMethodAdapter, _int, method_matches_zone


MINIMUM_GROUP_DELIVERY_INTERVAL_DAYS = 14


def _text(value: Any) -> str:
    return str(value or "").strip()


def _bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on", "enabled"}
    return bool(value)


def _parse_date(value: Any) -> Optional[date]:
    raw = _text(value)
    if not raw:
        return None
    try:
        return date.fromisoformat(raw[:10])
    except ValueError:
        return None


def _date_string(value: Optional[date]) -> str:
    return value.isoformat() if value else ""


def _next_batch_date(first_batch_date: date, interval_days: int, order_date: Optional[date] = None) -> date:
    interval = max(MINIMUM_GROUP_DELIVERY_INTERVAL_DAYS, int(interval_days or MINIMUM_GROUP_DELIVERY_INTERVAL_DAYS))
    anchor = first_batch_date
    checkout_date = order_date or date.today()
    minimum_batch_date = checkout_date + timedelta(days=MINIMUM_GROUP_DELIVERY_INTERVAL_DAYS)

    if anchor >= minimum_batch_date:
        return anchor

    days_after_anchor = (minimum_batch_date - anchor).days
    intervals_needed = int(ceil(days_after_anchor / interval))
    return anchor + timedelta(days=intervals_needed * interval)


class GroupDeliveryAdapter(ShippingMethodAdapter):
    key = "group_delivery"
    display_name = "Free Group Delivery"
    description = "Free creator-managed batched delivery to a group collection point."
    method_type = "batched_creator_delivery"
    sort_order = 4
    supports_pickup = True

    settings_schema = [
        {
            "key": "delivery_interval_days",
            "type": "number",
            "label": "Delivery interval days",
            "help": "Minimum 14 days. Orders are assigned to the next valid batch date.",
            "placeholder": "14",
        },
        {
            "key": "first_batch_date",
            "type": "text",
            "label": "First batch date",
            "help": "YYYY-MM-DD. This is the anchor date used to calculate future batches.",
            "placeholder": "2028-06-25",
        },
        {
            "key": "collection_point_name",
            "type": "text",
            "label": "Collection point name",
            "help": "Example: Group Hall.",
            "placeholder": "Group Hall",
        },
        {
            "key": "collection_address_line_1",
            "type": "text",
            "label": "Collection address line 1",
            "placeholder": "1 Main Road",
        },
        {
            "key": "collection_suburb",
            "type": "text",
            "label": "Collection suburb",
            "placeholder": "Durbanville",
        },
        {
            "key": "collection_town",
            "type": "text",
            "label": "Collection town",
            "placeholder": "Cape Town",
        },
        {
            "key": "collection_province",
            "type": "text",
            "label": "Collection province",
            "placeholder": "Western Cape",
        },
        {
            "key": "collection_postal_code",
            "type": "text",
            "label": "Collection postal code",
            "placeholder": "7550",
        },
        {
            "key": "customer_instructions",
            "type": "textarea",
            "label": "Customer instructions",
            "help": "Shown to buyers at checkout and on order confirmation.",
        },
        {
            "key": "internal_notes",
            "type": "textarea",
            "label": "Internal notes",
            "help": "Internal only. Not shown to buyers.",
        },
    ]

    def default_config(self) -> Dict[str, Any]:
        config = super().default_config()
        config.update(
            {
                "enabled": False,
                "rate": 0,
                "free_shipping_threshold": None,
                "sort_order": self.sort_order,
                "settings": {
                    "enabled": False,
                    "delivery_interval_days": MINIMUM_GROUP_DELIVERY_INTERVAL_DAYS,
                    "first_batch_date": "",
                    "collection_point_name": "",
                    "collection_address_line_1": "",
                    "collection_suburb": "",
                    "collection_town": "",
                    "collection_province": "",
                    "collection_postal_code": "",
                    "customer_instructions": "Orders are delivered in batches to the group collection point. You will be notified when your order is ready for collection.",
                    "internal_notes": "",
                },
            }
        )
        return config

    def validate_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        cleaned = super().validate_config(config)
        settings = dict(cleaned.get("settings") or {})

        for key in [
            "enabled",
            "delivery_interval_days",
            "first_batch_date",
            "collection_point_name",
            "collection_address_line_1",
            "collection_suburb",
            "collection_town",
            "collection_province",
            "collection_postal_code",
            "customer_instructions",
            "internal_notes",
        ]:
            if key in cleaned and key not in settings:
                settings[key] = cleaned.get(key)

        settings["enabled"] = _bool(settings.get("enabled", cleaned.get("enabled")))
        settings["delivery_interval_days"] = max(
            MINIMUM_GROUP_DELIVERY_INTERVAL_DAYS,
            _int(settings.get("delivery_interval_days"), MINIMUM_GROUP_DELIVERY_INTERVAL_DAYS),
        )

        for key in [
            "first_batch_date",
            "collection_point_name",
            "collection_address_line_1",
            "collection_suburb",
            "collection_town",
            "collection_province",
            "collection_postal_code",
            "customer_instructions",
            "internal_notes",
        ]:
            settings[key] = _text(settings.get(key))

        cleaned["enabled"] = bool(cleaned.get("enabled") or settings.get("enabled"))
        cleaned["display_name"] = cleaned.get("display_name") or self.display_name
        cleaned["description"] = cleaned.get("description") or self.description
        cleaned["method_type"] = self.method_type
        cleaned["rate"] = 0
        cleaned["settings"] = settings
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

        settings = dict(config.get("settings") or {})
        if not settings.get("enabled"):
            return None

        interval_days = max(
            MINIMUM_GROUP_DELIVERY_INTERVAL_DAYS,
            _int(settings.get("delivery_interval_days"), MINIMUM_GROUP_DELIVERY_INTERVAL_DAYS),
        )
        first_batch = _parse_date(settings.get("first_batch_date"))
        if not first_batch:
            return None

        collection_point_name = _text(settings.get("collection_point_name"))
        address_line_1 = _text(settings.get("collection_address_line_1"))
        suburb = _text(settings.get("collection_suburb"))
        town = _text(settings.get("collection_town"))

        if not collection_point_name or not address_line_1 or not suburb or not town:
            return None

        order_date = _parse_date(config.get("order_date"))
        batch_date = _next_batch_date(first_batch, interval_days, order_date=order_date)

        address_parts = [
            address_line_1,
            suburb,
            town,
            _text(settings.get("collection_province")),
            _text(settings.get("collection_postal_code")),
        ]
        address = ", ".join([part for part in address_parts if part])

        return {
            "key": self.key,
            "adapter_key": self.key,
            "enabled": True,
            "display_name": self.display_name,
            "description": "Your order will be included in the next group delivery batch.",
            "method_type": self.method_type,
            "sort_order": _int(config.get("sort_order"), self.sort_order),
            "rate": 0,
            "amount": 0,
            "label": self.display_name,
            "tracking_url_template": "",
            "public_config": {},
            "group_delivery_batch_date": _date_string(batch_date),
            "group_delivery_interval_days": interval_days,
            "group_delivery_point_name": collection_point_name,
            "group_delivery_address_line_1": address_line_1,
            "group_delivery_suburb": suburb,
            "group_delivery_town": town,
            "group_delivery_province": _text(settings.get("collection_province")),
            "group_delivery_postal_code": _text(settings.get("collection_postal_code")),
            "group_delivery_customer_instructions": _text(settings.get("customer_instructions")),
            "collection_location_name": collection_point_name,
            "collection_address": address,
            "collection_instructions": _text(settings.get("customer_instructions")),
        }
