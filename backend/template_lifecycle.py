"""Product-template lifecycle decisions shared by API routes and tests."""
from __future__ import annotations


def template_delete_impact_payload(
    template: dict,
    *,
    linked_products: int,
    sellable_products: int,
) -> dict:
    total_products = max(int(linked_products or 0), 0)
    published_products = max(min(int(sellable_products or 0), total_products), 0)
    unpublished_products = max(total_products - published_products, 0)
    action = "archive" if total_products > 0 else "delete"
    name = template.get("name") or "Product template"

    return {
        "template_id": template.get("id"),
        "template_name": name,
        "template_status": template.get("status") or "draft",
        "linked_products": total_products,
        "sellable_products": published_products,
        "unpublished_products": unpublished_products,
        "action": action,
        "can_hard_delete": total_products == 0,
        "will_archive": total_products > 0,
        "message": (
            f"This template is used by {total_products} product"
            f"{'s' if total_products != 1 else ''}. It will be archived instead of deleted."
            if total_products > 0
            else "This template has no linked products and can be permanently deleted."
        ),
    }
