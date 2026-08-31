"""Builder product-save compatibility layer.

Keeps the new scoped-pricing builder payload lean and server-authoritative:
- variation mockup records live on artwork groups, not every generated variation;
- variation pricing mode survives normalization;
- per-variation price overrides remain intact;
- save failures expose a useful API error instead of an opaque 500;
- server-owned Product fields cannot collide with explicit Product(...) fields;
- the admin creator-product route is guarded so the sanitization wrapper is
  active at request time, even if a later compatibility layer replaces the
  module-level normalizer reference;
- the admin product update route accepts PUT as a compatibility alias for the
  existing PATCH handler used by the current Product Builder edit-save flow.
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
# template normalization. If the normalizer returns any of them, passing
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
            row
            for row in (
                _sanitise_variation_payload(value)
                for value in (payload.get("variations") or [])
            )
            if row
        ]
    return payload


def _strip_server_owned_product_fields(data: dict) -> dict:
    """Remove fields that the Product route supplies explicitly."""
    cleaned = dict(data or {})
    for key in SERVER_OWNED_PRODUCT_FIELDS:
        cleaned.pop(key, None)
    return cleaned


def _find_admin_product_create_route(routes_main_module):
    """Find the admin POST /products route before router inclusion."""
    admin_router = getattr(routes_main_module, "admin_router", None)
    for route in getattr(admin_router, "routes", []) or []:
        path = getattr(route, "path", "")
        methods = getattr(route, "methods", set()) or set()
        if path in {"/products", "/admin/products"} and "POST" in methods:
            return route
    return None


def _install_admin_product_update_put_alias(routes_main_module) -> None:
    """Expose PUT /products/{product_id} using the existing admin PATCH handler.

    Product Builder V4 currently sends a full edit payload with PUT while the
    backend's canonical admin update endpoint is registered as PATCH. Reusing the
    same endpoint keeps one update implementation and avoids a 405 without
    changing existing PATCH callers.
    """
    admin_router = getattr(routes_main_module, "admin_router", None)
    routes = getattr(admin_router, "routes", []) or []

    for route in routes:
        path = getattr(route, "path", "")
        methods = getattr(route, "methods", set()) or set()
        if path == "/products/{product_id}" and "PUT" in methods:
            return

    patch_route = None
    for route in routes:
        path = getattr(route, "path", "")
        methods = getattr(route, "methods", set()) or set()
        if path == "/products/{product_id}" and "PATCH" in methods:
            patch_route = route
            break

    if patch_route is None:
        logger.warning(
            "Could not locate admin PATCH /products/{product_id} route for PUT compatibility"
        )
        return

    admin_router.add_api_route(
        "/products/{product_id}",
        patch_route.endpoint,
        methods=["PUT"],
        response_model=getattr(patch_route, "response_model", None),
        name="admin_update_product_put_compat",
    )
    logger.info("Installed Product Builder admin PUT /products/{product_id} compatibility route")


def _install_admin_product_route_guard(routes_main_module, normalized_normalizer) -> None:
    """Force the server-owned-field sanitizer at the actual admin route boundary.

    The normalizer is patched at module level below, but this second guard is
    intentionally attached to the route endpoint itself. That protects the
    admin creator-product path from any later compatibility layer that might
    replace ``routes_main_module.normalize_template_product_payload`` after
    this patch has installed it.
    """
    if getattr(routes_main_module, "_builder_product_save_route_guard_installed", False):
        return

    route = _find_admin_product_create_route(routes_main_module)
    if route is None:
        logger.warning(
            "Could not locate admin POST /products route for Product Builder save guard"
        )
        return

    original_endpoint = route.endpoint

    async def guarded_endpoint(*args, __original=original_endpoint, **kwargs):
        previous_normalize = routes_main_module.normalize_template_product_payload
        routes_main_module.normalize_template_product_payload = normalized_normalizer
        try:
            return await __original(*args, **kwargs)
        finally:
            routes_main_module.normalize_template_product_payload = previous_normalize

    route.endpoint = guarded_endpoint

    # FastAPI has already created a dependant for the original endpoint. Rebuild
    # it so dependency injection continues to work after replacing endpoint.
    from fastapi.dependencies.utils import get_dependant

    route.dependant = get_dependant(
        path=route.path_format,
        call=guarded_endpoint,
    )
    routes_main_module._builder_product_save_route_guard_installed = True
    logger.info(
        "Installed Product Builder admin creator-product save guard on %s",
        getattr(route, "path", "/products"),
    )


def install_builder_product_save_patch(routes_main_module) -> None:
    """Install the save-payload compatibility wrapper exactly once.

    The PUT compatibility route is always ensured first. This matters because
    the main sanitizer may already have been installed by an earlier startup
    layer; repeated calls must still repair missing HTTP method aliases.
    """
    _install_admin_product_update_put_alias(routes_main_module)

    if getattr(routes_main_module, "_builder_product_save_patch_installed", False):
        return

    original_normalize = routes_main_module.normalize_template_product_payload

    async def wrapped_normalize_template_product_payload(
        *, db, data, creator, user, allow_admin_publish=False
    ):
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
        normalized["variation_pricing_mode"] = (
            clean_input.get("variation_pricing_mode")
            or normalized.get("variation_pricing_mode")
            or "by_attribute"
        )
        if clean_input.get("pricing_attribute"):
            normalized["pricing_attribute"] = clean_input.get("pricing_attribute")

        return normalized

    routes_main_module._builder_product_save_base_normalize = original_normalize
    routes_main_module.normalize_template_product_payload = wrapped_normalize_template_product_payload
    routes_main_module._builder_product_save_patch_installed = True

    # The route-level guard makes the admin creator path deterministic: it
    # temporarily restores this exact sanitized normalizer for the duration of
    # the request, so server-owned fields cannot reach Product(...) even when
    # another compatibility layer changes the module-level symbol later.
    _install_admin_product_route_guard(
        routes_main_module,
        wrapped_normalize_template_product_payload,
    )

    # The normalization wrapper cannot see failures that happen later while
    # constructing the Product model or inserting into Mongo. Install a route
    # guard as well so the next failing save reports the real exception instead
    # of another opaque Cloudflare 500.
    try:
        from builder_product_save_debug_patch import install_builder_product_save_debug_patch
        install_builder_product_save_debug_patch(routes_main_module)
    except Exception:
        logger.exception("Could not install Product Builder save diagnostics")
