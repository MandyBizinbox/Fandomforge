"""Role-safe order response middleware.

Business rule:
- Creators may see production cost, creator markup, platform fee, selling prices,
  total markup and total payout.
- Creators must not see printer payout, supplier/internal costs or platform profit.
- Printers may see their own fulfilment/job payout and production data.
- Printers must not see creator payout/markup or platform fees/margins/profits.
- Anonymous/buyer order responses must not expose internal finance.

This middleware sanitizes JSON order responses from legacy endpoints that still
return the full Order model.
"""
from __future__ import annotations

import json
from typing import Any, Optional

from fastapi import Response
from starlette.responses import StreamingResponse

from auth import decode_token


ORDER_FINANCE_PATH_PREFIXES = (
    "/api/orders/creator",
    "/api/orders/mine",
)

ORDER_DETAIL_PREFIX = "/api/orders/"
ORDER_DETAIL_EXCLUDE_PREFIXES = (
    "/api/orders/checkout",
    "/api/orders/tracking/",
)
ORDER_DETAIL_EXCLUDE_SUFFIXES = (
    "/status",
    "/assign-printer",
    "/timeline",
    "/notes",
    "/mock-complete",
)


def _money(value: Any) -> float:
    try:
        return round(float(value or 0), 2)
    except Exception:
        return 0.0


def _request_role(request) -> Optional[str]:
    auth = request.headers.get("authorization") or request.headers.get("Authorization") or ""
    if not auth.lower().startswith("bearer "):
        return None
    token = auth.split(" ", 1)[1].strip()
    if not token:
        return None
    try:
        payload = decode_token(token)
    except Exception:
        return None
    return payload.get("role")


def _is_order_payload_path(path: str) -> bool:
    if path.startswith(ORDER_FINANCE_PATH_PREFIXES):
        return True
    if not path.startswith(ORDER_DETAIL_PREFIX):
        return False
    if path.startswith(ORDER_DETAIL_EXCLUDE_PREFIXES):
        return False
    if any(path.endswith(suffix) for suffix in ORDER_DETAIL_EXCLUDE_SUFFIXES):
        return False
    return True


def _strip_keys(row: dict, keys: set[str]) -> dict:
    for key in keys:
        row.pop(key, None)
    return row


def _safe_snapshot_for_creator(snapshot: dict) -> dict:
    snap = dict(snapshot or {})
    breakdown = snap.get("costing_breakdown") or {}
    if isinstance(breakdown, dict):
        snap["costing_breakdown"] = {
            "creator_product_cost": breakdown.get("creator_product_cost"),
            "minimum_selling_price": breakdown.get("minimum_selling_price"),
            "creator_visible_production_cost_unit": breakdown.get("creator_visible_production_cost_unit"),
            "creator_visible_production_cost_total": breakdown.get("creator_visible_production_cost_total"),
        }
    else:
        snap.pop("costing_breakdown", None)

    snap = _strip_keys(snap, {
        "printer_payout",
        "platform_blank_profit",
        "platform_print_profit",
        "estimated_platform_profit",
    })

    variation = dict(snap.get("variation") or {})
    snap["variation"] = _strip_keys(variation, {
        "blank_supplier_cost",
        "platform_blank_cost",
        "platform_blank_profit",
        "blank_cost",
        "blank_payout_unit",
    })

    print_option = dict(snap.get("print_option") or {})
    snap["print_option"] = _strip_keys(print_option, {
        "platform_print_cost",
        "platform_print_profit",
        "printer_print_price",
        "printer_price_id",
    })

    artwork = dict(snap.get("artwork") or {})
    snap["artwork"] = _strip_keys(artwork, {
        "platform_print_cost",
        "platform_print_profit",
    })

    safe_artworks = []
    for artwork_row in snap.get("artworks") or []:
        if isinstance(artwork_row, dict):
            safe_artworks.append(_strip_keys(dict(artwork_row), {
                "platform_print_cost",
                "platform_print_profit",
            }))
    snap["artworks"] = safe_artworks

    return snap


def _safe_snapshot_for_printer(snapshot: dict) -> dict:
    snap = dict(snapshot or {})
    snap = _strip_keys(snap, {
        "creator_profit",
        "platform_commission",
        "platform_blank_profit",
        "platform_print_profit",
        "estimated_platform_profit",
        "creator_product_cost",
    })

    breakdown = snap.get("costing_breakdown") or {}
    if isinstance(breakdown, dict):
        snap["costing_breakdown"] = {
            "production_unit_cost": breakdown.get("production_unit_cost"),
            "blank_payout_unit": breakdown.get("blank_payout_unit"),
            "print_payout_unit": breakdown.get("print_payout_unit"),
        }
    else:
        snap.pop("costing_breakdown", None)

    variation = dict(snap.get("variation") or {})
    snap["variation"] = _strip_keys(variation, {
        "blank_supplier_cost",
        "platform_blank_cost",
        "creator_blank_price",
        "platform_blank_profit",
    })

    print_option = dict(snap.get("print_option") or {})
    snap["print_option"] = _strip_keys(print_option, {
        "platform_print_cost",
        "creator_print_price",
        "platform_print_profit",
    })

    artwork = dict(snap.get("artwork") or {})
    snap["artwork"] = _strip_keys(artwork, {
        "platform_print_cost",
        "creator_print_price",
        "platform_print_profit",
    })

    safe_artworks = []
    for artwork_row in snap.get("artworks") or []:
        if isinstance(artwork_row, dict):
            safe_artworks.append(_strip_keys(dict(artwork_row), {
                "platform_print_cost",
                "creator_print_price",
                "platform_print_profit",
            }))
    snap["artworks"] = safe_artworks

    return snap


def _safe_snapshot_for_buyer(snapshot: dict) -> dict:
    snap = dict(snapshot or {})
    keep = {
        "template_name",
        "template_category",
        "product_image_url",
        "mockup_image_url",
        "variation",
        "print_area",
        "artwork",
        "artworks",
        "placement",
        "assigned_printer",
    }
    snap = {key: value for key, value in snap.items() if key in keep}
    if isinstance(snap.get("variation"), dict):
        snap["variation"] = _strip_keys(dict(snap["variation"]), {
            "blank_supplier_cost",
            "platform_blank_cost",
            "creator_blank_price",
            "platform_blank_profit",
            "blank_cost",
            "blank_payout_unit",
        })
    if isinstance(snap.get("artwork"), dict):
        snap["artwork"] = _strip_keys(dict(snap["artwork"]), {
            "platform_print_cost",
            "creator_print_price",
            "platform_print_profit",
        })
    safe_artworks = []
    for artwork_row in snap.get("artworks") or []:
        if isinstance(artwork_row, dict):
            safe_artworks.append(_strip_keys(dict(artwork_row), {
                "platform_print_cost",
                "creator_print_price",
                "platform_print_profit",
            }))
    snap["artworks"] = safe_artworks
    return snap


def _creator_finance(item: dict) -> dict:
    qty = max(int(item.get("quantity") or 1), 1)
    selling_unit = _money(item.get("unit_price"))
    production_unit = _money(item.get("print_cost_unit"))
    platform_fee_total = _money(item.get("commission_amount"))
    creator_markup_total = _money(item.get("band_earnings"))
    return {
        "selling_price_unit": selling_unit,
        "selling_price_total": _money(selling_unit * qty),
        "production_cost_unit": production_unit,
        "production_cost_total": _money(production_unit * qty),
        "platform_fee_total": platform_fee_total,
        "platform_fee_unit": _money(platform_fee_total / qty),
        "creator_markup_total": creator_markup_total,
        "creator_markup_unit": _money(creator_markup_total / qty),
        "creator_payout_total": creator_markup_total,
    }


def _sanitize_order_item(item: dict, role: Optional[str]) -> dict:
    row = dict(item or {})
    snapshot = row.get("production_snapshot") or {}

    if role in {"super_admin", "owner", "admin", "manager"}:
        return row

    if role in {"creator", "band"}:
        row["creator_finance"] = _creator_finance(row)
        row["production_snapshot"] = _safe_snapshot_for_creator(snapshot)
        return _strip_keys(row, {
            "printer_payout",
        })

    if role == "printer":
        row["printer_finance"] = {
            "printer_payout_total": _money(row.get("printer_payout")),
            "printer_payout_unit": _money(row.get("printer_payout")) / max(int(row.get("quantity") or 1), 1),
        }
        row["production_snapshot"] = _safe_snapshot_for_printer(snapshot)
        return _strip_keys(row, {
            "commission_rate",
            "commission_amount",
            "band_earnings",
            "print_cost_unit",
        })

    row["production_snapshot"] = _safe_snapshot_for_buyer(snapshot)
    return _strip_keys(row, {
        "printer_id",
        "print_cost_unit",
        "commission_rate",
        "commission_amount",
        "band_earnings",
        "printer_payout",
    })


def _order_creator_summary(order: dict) -> dict:
    totals = {
        "selling_total": 0.0,
        "production_cost_total": 0.0,
        "platform_fee_total": 0.0,
        "creator_markup_total": 0.0,
        "creator_payout_total": 0.0,
    }
    for item in order.get("items") or []:
        finance = item.get("creator_finance") or _creator_finance(item)
        totals["selling_total"] += _money(finance.get("selling_price_total"))
        totals["production_cost_total"] += _money(finance.get("production_cost_total"))
        totals["platform_fee_total"] += _money(finance.get("platform_fee_total"))
        totals["creator_markup_total"] += _money(finance.get("creator_markup_total"))
        totals["creator_payout_total"] += _money(finance.get("creator_payout_total"))
    return {key: _money(value) for key, value in totals.items()}


def _sanitize_order(order: Any, role: Optional[str]) -> Any:
    if not isinstance(order, dict):
        return order
    row = dict(order)
    row["items"] = [_sanitize_order_item(item, role) for item in row.get("items") or []]
    if role in {"creator", "band"}:
        row["creator_finance_summary"] = _order_creator_summary(row)
    return row


def _sanitize_payload(payload: Any, role: Optional[str]) -> Any:
    if isinstance(payload, list):
        return [_sanitize_order(row, role) for row in payload]
    if isinstance(payload, dict):
        if "items" in payload and "order_number" in payload:
            return _sanitize_order(payload, role)
    return payload


async def _response_body(response) -> bytes:
    body = b""
    async for chunk in response.body_iterator:
        body += chunk
    return body


def install_order_visibility_middleware(app):
    @app.middleware("http")
    async def order_visibility_middleware(request, call_next):
        response = await call_next(request)
        path = request.url.path
        if not _is_order_payload_path(path):
            return response

        content_type = response.headers.get("content-type", "")
        if "application/json" not in content_type.lower():
            return response

        body = await _response_body(response)
        if not body:
            return Response(content=body, status_code=response.status_code, headers=dict(response.headers), media_type=response.media_type)

        try:
            payload = json.loads(body.decode("utf-8"))
        except Exception:
            return Response(content=body, status_code=response.status_code, headers=dict(response.headers), media_type=response.media_type)

        role = _request_role(request)
        safe_payload = _sanitize_payload(payload, role)
        safe_body = json.dumps(safe_payload, default=str).encode("utf-8")

        headers = dict(response.headers)
        headers.pop("content-length", None)
        return Response(content=safe_body, status_code=response.status_code, headers=headers, media_type="application/json")
