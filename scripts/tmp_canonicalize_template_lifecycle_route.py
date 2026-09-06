#!/usr/bin/env python3
"""Canonicalize the template delete-impact route without runtime registration.

Temporary deterministic migration helper. Remove before merging.
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
ROUTES_PATH = BACKEND / "routes_main.py"
SERVER_PATH = BACKEND / "server.py"
INSTALLER_PATH = BACKEND / "template_lifecycle_routes.py"
CI_PATH = ROOT / ".github" / "workflows" / "template-production-routing-v3-ci.yml"


def canonicalize_routes(source: str) -> str:
    lifecycle_import = "from template_lifecycle import template_delete_impact_payload\n"
    e2e_import = "from e2e_runtime import with_e2e_mock_gateway\n"
    if lifecycle_import not in source:
        if e2e_import not in source:
            raise RuntimeError("routes_main E2E import marker not found")
        source = source.replace(e2e_import, lifecycle_import + e2e_import, 1)

    route_marker = '@admin_router.get("/product-templates/{template_id}/delete-impact")\n'
    delete_marker = '@admin_router.delete("/product-templates/{template_id}")\n'
    route_block = '''@admin_router.get("/product-templates/{template_id}/delete-impact")
async def admin_product_template_delete_impact(
    template_id: str,
    request: Request,
    user: User = Depends(get_current_user),
):
    _require_manager_permission(user, "manage_product_templates")
    db = request.app.state.db

    template = await db.product_templates.find_one(
        {"id": template_id},
        {"_id": 0, "id": 1, "name": 1, "status": 1},
    )
    if not template:
        raise HTTPException(status_code=404, detail="Product template not found")

    total_products = await db.products.count_documents({"template_id": template_id})
    published_products = await db.products.count_documents({
        "template_id": template_id,
        "published": True,
    })

    return template_delete_impact_payload(
        template,
        linked_products=total_products,
        sellable_products=published_products,
    )


'''
    if route_marker not in source:
        if delete_marker not in source:
            raise RuntimeError("canonical product-template DELETE route marker not found")
        source = source.replace(delete_marker, route_block + delete_marker, 1)

    if source.count(route_marker) != 1:
        raise RuntimeError("delete-impact route must be registered exactly once")
    return source


def canonicalize_server(source: str) -> str:
    source = source.replace(
        "from template_lifecycle_routes import install_template_lifecycle_routes\n",
        "",
        1,
    )
    source = source.replace(
        "install_template_lifecycle_routes(routes_main_module)\n",
        "",
        1,
    )
    if "template_lifecycle_routes" in source or "install_template_lifecycle_routes" in source:
        raise RuntimeError("template lifecycle runtime installer still referenced by server.py")
    return source


def canonicalize_ci(source: str) -> str:
    compile_line = "          template_lifecycle_routes.py\n"
    if compile_line in source:
        source = source.replace(compile_line, "", 1)
    if compile_line in source:
        raise RuntimeError("template_lifecycle_routes.py remains in compile targets")
    return source


def main() -> None:
    ROUTES_PATH.write_text(
        canonicalize_routes(ROUTES_PATH.read_text(encoding="utf-8")),
        encoding="utf-8",
    )
    SERVER_PATH.write_text(
        canonicalize_server(SERVER_PATH.read_text(encoding="utf-8")),
        encoding="utf-8",
    )
    CI_PATH.write_text(
        canonicalize_ci(CI_PATH.read_text(encoding="utf-8")),
        encoding="utf-8",
    )
    if INSTALLER_PATH.exists():
        INSTALLER_PATH.unlink()

    if INSTALLER_PATH.exists():
        raise RuntimeError("template lifecycle installer file still exists")
    print("canonical-template-lifecycle-route-ok")


if __name__ == "__main__":
    main()
