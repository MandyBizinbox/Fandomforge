"""Defensive diagnostics for the Product Builder V3 admin save route."""
from __future__ import annotations

import logging
from copy import deepcopy
from typing import Any

from fastapi import HTTPException

logger = logging.getLogger("fandomforge.builder_product_save_debug")

MOCKUP_KEYS = {
    "variation_mockups",
    "mockup_images",
    "mockup_image_url",
    "primary_mockup_image_url",
    "mockup_url",
}


def _clean_variation(row: Any) -> dict:
    if hasattr(row, "model_dump"):
        row = row.model_dump()
    if not isinstance(row, dict):
        return {}
    cleaned = deepcopy(row)
    for key in MOCKUP_KEYS:
        cleaned.pop(key, None)
    return cleaned


def install_builder_product_save_debug_patch(routes_main_module) -> None:
    if getattr(routes_main_module, "_builder_product_save_debug_patch_installed", False):
        return

    admin_router = getattr(routes_main_module, "admin_router", None)
    for route in getattr(admin_router, "routes", []) or []:
        if getattr(route, "path", "") != "/products":
            continue
        if "POST" not in (getattr(route, "methods", set()) or set()):
            continue

        original_endpoint = route.endpoint

        async def wrapped_endpoint(*args, __original=original_endpoint, **kwargs):
            try:
                return await __original(*args, **kwargs)
            except HTTPException:
                raise
            except Exception as exc:
                payload = kwargs.get("payload")
                payload_data = payload.model_dump() if hasattr(payload, "model_dump") else {}
                clean = deepcopy(payload_data)
                clean["variations"] = [
                    _clean_variation(value)
                    for value in clean.get("variations") or []
                    if _clean_variation(value)
                ]
                logger.exception(
                    "Product Builder save failed after route dispatch: template_id=%s variations=%s payload_bytes=%s",
                    clean.get("template_id"),
                    len(clean.get("variations") or []),
                    len(str(clean).encode("utf-8")),
                )
                raise HTTPException(
                    status_code=500,
                    detail={
                        "message": "Product save failed on the server.",
                        "error": str(exc),
                        "exception_type": type(exc).__name__,
                        "template_id": clean.get("template_id"),
                        "variation_count": len(clean.get("variations") or []),
                    },
                ) from exc

        route.endpoint = wrapped_endpoint
        from fastapi.dependencies.utils import get_dependant
        route.dependant = get_dependant(path=route.path_format, call=wrapped_endpoint)
        routes_main_module._builder_product_save_debug_patch_installed = True
        logger.info("Installed Product Builder admin save diagnostics on %s", route.path)
        return

    logger.warning("Could not locate POST /products admin Product Builder route for diagnostics")
    routes_main_module._builder_product_save_debug_patch_installed = True
