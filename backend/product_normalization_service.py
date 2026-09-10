"""Canonical Product Builder save and manufacturing normalization.

This module owns the server-authoritative save boundary for creator/admin products.
It replaces the launch-era runtime monkey-patch chain that previously wrapped
``routes_main.normalize_template_product_payload`` several times at startup.
"""
from __future__ import annotations

import logging
from copy import deepcopy
from typing import Any, Awaitable, Callable, Dict, Optional

from fastapi import HTTPException

from production_rules_engine import apply_production_rules

logger = logging.getLogger("fandomforge.product_normalization")

VARIATION_MOCKUP_KEYS = {
    "variation_mockups",
    "mockup_images",
    "mockup_image_url",
    "primary_mockup_image_url",
}

SERVER_OWNED_PRODUCT_FIELDS = {
    "band_id",
    "slug",
    "assigned_printer_id",
    "created_by_user_id",
    "created_by_role",
    "created_at",
    "updated_at",
}

PRODUCTION_SNAPSHOT_KEYS = (
    "production_rule_version",
    "manufacturing_validation_status",
    "production_validation",
    "manufacturing_cost_breakdown",
    "minimum_selling_price",
    "platform_packaging_cost",
    "creator_packaging_price",
    "platform_additional_manufacturing_cost",
    "creator_additional_manufacturing_price",
    "platform_total_production_cost",
    "production_operation_cost",
    "platform_production_operation_cost",
    "production_operation_lines",
    "production_operation_method_keys",
    "estimated_operation_time",
)


def _bool(value: Any) -> bool:
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on", "publish", "published"}
    return bool(value)


def _sanitise_variation_payload(row: Any) -> dict:
    if hasattr(row, "model_dump"):
        row = row.model_dump()
    if not isinstance(row, dict):
        return {}
    cleaned = deepcopy(row)
    for key in VARIATION_MOCKUP_KEYS:
        cleaned.pop(key, None)
    return cleaned


def sanitise_product_payload(data: dict) -> dict:
    """Return a non-mutating Builder payload safe for canonical normalization."""
    payload = deepcopy(data or {})
    if "variations" in payload:
        payload["variations"] = [
            row
            for row in (
                _sanitise_variation_payload(value)
                for value in (payload.get("variations") or [])
            )
            if row
        ]
    return payload


def strip_server_owned_product_fields(data: dict) -> dict:
    """Remove fields supplied explicitly by create/update route ownership."""
    cleaned = dict(data or {})
    for key in SERVER_OWNED_PRODUCT_FIELDS:
        cleaned.pop(key, None)
    return cleaned


async def normalize_builder_product_payload(
    *,
    db,
    data: dict,
    creator: dict,
    user,
    allow_admin_publish: bool,
    core_normalizer: Callable[..., Awaitable[dict]],
) -> dict:
    """Run the canonical Builder save pipeline exactly once.

    Order matters and is explicit here:
    1. remove generated variation mockup payloads that belong to artwork groups;
    2. run the established template/product core normalizer;
    3. apply authoritative Manufacturing Rules;
    4. remove route-owned fields before Product model construction;
    5. preserve Builder pricing/edit state that must round-trip through Mongo.
    """
    clean_input = sanitise_product_payload(data)
    try:
        normalized = await core_normalizer(
            db=db,
            data=clean_input,
            creator=creator,
            user=user,
            allow_admin_publish=allow_admin_publish,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(
            "Product normalization failed: template_id=%s variation_count=%s",
            clean_input.get("template_id"),
            len(clean_input.get("variations") or []),
        )
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Product could not be normalized before saving.",
                "error": str(exc),
                "template_id": clean_input.get("template_id"),
            },
        ) from exc

    template: Optional[dict] = None
    if normalized.get("template_id"):
        template = await db.product_templates.find_one(
            {"id": normalized.get("template_id")},
            {"_id": 0},
        )
    global_print_options = await db.print_options.find({}, {"_id": 0}).to_list(500)
    publishing = _bool(clean_input.get("published")) or _bool(normalized.get("published"))
    normalized = await apply_production_rules(
        db,
        normalized,
        template=template,
        global_print_options=global_print_options,
        publishing=publishing,
    )

    normalized = strip_server_owned_product_fields(normalized)
    normalized["variation_pricing_mode"] = (
        clean_input.get("variation_pricing_mode")
        or normalized.get("variation_pricing_mode")
        or "by_attribute"
    )
    if clean_input.get("pricing_attribute"):
        normalized["pricing_attribute"] = clean_input.get("pricing_attribute")
    return normalized


def copy_production_snapshot(product: Dict[str, Any], snapshot: Dict[str, Any]) -> Dict[str, Any]:
    """Copy Manufacturing Rule decisions into the immutable order snapshot."""
    product = product or {}
    snapshot = dict(snapshot or {})
    for key in PRODUCTION_SNAPSHOT_KEYS:
        if product.get(key) is not None:
            snapshot[key] = product.get(key)

    costing = dict(snapshot.get("costing_breakdown") or {})
    costing.update(dict(product.get("costing_breakdown") or {}))
    if costing:
        snapshot["costing_breakdown"] = costing

    validation = product.get("production_validation") or {}
    if validation:
        snapshot["validation_status"] = validation.get("status")
        snapshot["validation_errors"] = validation.get("errors") or []
        snapshot["validation_warnings"] = validation.get("warnings") or []
    return snapshot


def product_save_http_exception(payload: Any, exc: Exception) -> HTTPException:
    """Convert unexpected admin save failures into useful API diagnostics."""
    payload_data = payload.model_dump() if hasattr(payload, "model_dump") else dict(payload or {})
    clean = sanitise_product_payload(payload_data)
    logger.exception(
        "Product save failed after route dispatch: template_id=%s variations=%s payload_bytes=%s",
        clean.get("template_id"),
        len(clean.get("variations") or []),
        len(str(clean).encode("utf-8")),
    )
    return HTTPException(
        status_code=500,
        detail={
            "message": "Product save failed on the server.",
            "error": str(exc),
            "exception_type": type(exc).__name__,
            "template_id": clean.get("template_id"),
            "variation_count": len(clean.get("variations") or []),
        },
    )
