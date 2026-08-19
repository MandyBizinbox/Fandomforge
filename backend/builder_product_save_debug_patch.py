"""Defensive diagnostics and save normalization for the Product Builder V3 save route."""
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


def _clean_payload(data: dict) -> dict:
    payload = deepcopy(data or {})
    payload["variations"] = [
        row for row in (_clean_variation(value) for value in payload.get("variations") or [])
        if row
    ]
    return payload


def install_builder_product_save_debug_patch(routes_main_module) -> None:
    if getattr(routes_main_module, "_builder_product_save_debug_patch_installed", False):
        return

    for route in getattr(routes_main_module, "admin_router", None).routes or []:
        if getattr(route, "path", "") != "/admin/products":
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
                clean = _clean_payload(payload_data)
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
        # FastAPI/Starlette already created the dependant callable around the
        # original endpoint, so rebuild the dependant after replacing it.
        from fastapi.dependencies.utils import get_dependant
        route.dependant = get_dependant(path=route.path_format, call=wrapped_endpoint)
        route.body_field = None
        try:
            route.body_field = route.dependant.body_params[0] if route.dependant.body_params else None
        except Exception:
            pass
        break

    routes_main_module._builder_product_save_debug_patch_installed = True
