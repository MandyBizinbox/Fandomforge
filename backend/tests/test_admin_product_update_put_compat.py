from types import SimpleNamespace

from fastapi import APIRouter

from builder_product_save_patch import _install_admin_product_update_put_alias


def test_admin_product_update_put_alias_reuses_patch_endpoint():
    router = APIRouter()

    @router.patch("/products/{product_id}")
    async def update_product(product_id: str):
        return {"id": product_id}

    module = SimpleNamespace(admin_router=router)
    _install_admin_product_update_put_alias(module)

    matching = [
        route
        for route in router.routes
        if getattr(route, "path", "") == "/products/{product_id}"
    ]

    assert any("PATCH" in (getattr(route, "methods", set()) or set()) for route in matching)
    assert any("PUT" in (getattr(route, "methods", set()) or set()) for route in matching)


def test_admin_product_update_put_alias_is_idempotent():
    router = APIRouter()

    @router.patch("/products/{product_id}")
    async def update_product(product_id: str):
        return {"id": product_id}

    module = SimpleNamespace(admin_router=router)
    _install_admin_product_update_put_alias(module)
    _install_admin_product_update_put_alias(module)

    put_routes = [
        route
        for route in router.routes
        if getattr(route, "path", "") == "/products/{product_id}"
        and "PUT" in (getattr(route, "methods", set()) or set())
    ]

    assert len(put_routes) == 1
