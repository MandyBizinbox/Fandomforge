"""Product-template lifecycle preflight routes.

The existing DELETE /admin/product-templates/{template_id} endpoint already
archives templates that still have linked product records. This module exposes a
read-only impact endpoint so the admin UI can warn before invoking that action.
"""
from __future__ import annotations

from fastapi import Depends, HTTPException, Request

from auth import get_current_user
from template_lifecycle import template_delete_impact_payload


def install_template_lifecycle_routes(routes_main_module) -> None:
    if getattr(routes_main_module, "_template_lifecycle_routes_installed", False):
        return

    admin_router = routes_main_module.admin_router
    require_permission = routes_main_module._require_manager_permission

    @admin_router.get("/product-templates/{template_id}/delete-impact")
    async def product_template_delete_impact(
        template_id: str,
        request: Request,
        user=Depends(get_current_user),
    ):
        require_permission(user, "manage_product_templates")
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

    routes_main_module._template_lifecycle_routes_installed = True
