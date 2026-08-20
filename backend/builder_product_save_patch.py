"""Builder product-save compatibility layer.

Keeps the new scoped-pricing builder payload lean and server-authoritative:
- variation mockup records live on artwork groups, not every generated variation;
- variation pricing mode survives normalization;
- per-variation price overrides remain intact;
- save failures expose a useful API error instead of an opaque 500;
- server-owned Product fields cannot collide with explicit Product(...) fields.
"""
from __future__ import annotations

import logging
from copy import deepcopy
from typing import Any

from fastapi import HTTPException

logger = logging.getLogger("fandomforge.builder_product_save")


VARIATION_MOCKUP_KEYS = {
    "variation_mockups",
    "mockup_images",
    "mockup_image_url",
    "primary_mockup_image_url",
}

# These fields are supplied explicitly by the create/update route after
# template normalization.  If the normalizer returns any of them, passing
# both **data and an explicit keyword into Product(...) raises Python's
# "multiple values for keyword argument" TypeError.
SERVER_OWNED_PRODUCT_FIELDS = {
    "band_id",
    "slug",
    "assigned_printer_id",
    "created_by_user_id",
    "created_by_role",
    "created_at",
    "updated_at",
}


def _sanitise_variation_payload(row: Any) -> dict:
    if hasattr(row, "model_dump"):
        row = row.model_dump()
    if not isinstance(row, dict):
        return {}

    cleaned = deepcopy(row)
    for key in VARIATION_MOCKUP_KEYS:
        cleaned.pop(key, None)
    return cleaned


def _sanitise_product_payload(data: dict) -> dict:
    payload = deepcopy(data or {})
    if "variations" in payload:
        payload["variations"] = [
            row for row in (_sanitise_variation_payload(value) for value in (payload.get("variations") or []))
            if row
        ]
    return payload


def _strip_server_owned_product_fields(data: dict) -> dict:
    """Remove fields that the Product route supplies explicitly."""
    cleaned = dict(data or {})
    for key in SERVER_OWNED_PRODUCT_FIELDS:
        cleaned.pop(key, None)
    return cleaned


def install_builder_product_save_patch(routes_main_module) -> None:
    """Install the save-payload compatibility wrapper exactly once."""
    if getattr(routes_main_module, "_builder_product_save_patch_installed", False):
        return

    original_normalize = routes_main_module.normalize_template_product_payload

    async def wrapped_normalize_template_product_payload(*, db, data, creator, user, allow_admin_publish=False):
        clean_input = _sanitise_product_payload(data)
        try:
            normalized = await original_normalize(
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
                "Product builder normalization failed: template_id=%s variation_count=%s",
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

        normalized = _strip_server_owned_product_fields(normalized)
        normalized["variation_pricing_mode"] = clean_input.get("variation_pricing_mode") or normalized.get("variation_pricing_mode") or "by_attribute"
        if clean_input.get("pricing_attribute"):
            normalized["pricing_attribute"] = clean_input.get("pricing_attribute")

        return normalized

    routes_main_module._builder_product_save_base_normalize = original_normalize
    routes_main_module.normalize_template_product_payload = wrapped_normalize_template_product_payload
    routes_main_module._builder_product_save_patch_installed = True

    # The normalization wrapper cannot see failures that happen later while
    # constructing the Product model or inserting into Mongo. Install a route
    # guard as well so the next failing save reports the real exception instead
    # of another opaque Cloudflare 500.
    try:
        from builder_product_save_debug_patch import install_builder_product_save_debug_patch
        install_builder_product_save_debug_patch(routes_main_module)
    except Exception:
        logger.exception("Could not install Product Builder save diagnostics")
