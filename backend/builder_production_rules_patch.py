"""Runtime integration for the Builder V2 manufacturing rules engine.

The core product builder already normalises templates, artwork slots, pricing and
production operations inside routes_main. This patch runs after those launch-week
normalisers so production-method rules become the final server-authoritative gate
before products are saved or published.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from production_rules_engine import apply_production_rules


SNAPSHOT_KEYS = (
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


def _copy_production_snapshot(product: Dict[str, Any], snapshot: Dict[str, Any]) -> Dict[str, Any]:
    product = product or {}
    snapshot = dict(snapshot or {})

    for key in SNAPSHOT_KEYS:
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


def install_builder_production_rules_patch(routes_main_module: Any) -> None:
    """Patch Builder normalisation and order snapshots exactly once."""
    if getattr(routes_main_module, "_builder_production_rules_patch_installed", False):
        return

    original_normalize = routes_main_module.normalize_template_product_payload

    async def wrapped_normalize_template_product_payload(*, db, data, creator, user, allow_admin_publish=False):
        product_data = await original_normalize(
            db=db,
            data=data,
            creator=creator,
            user=user,
            allow_admin_publish=allow_admin_publish,
        )

        template: Optional[dict] = None
        if product_data.get("template_id"):
            template = await db.product_templates.find_one({"id": product_data.get("template_id")}, {"_id": 0})

        global_print_options = await db.print_options.find({}, {"_id": 0}).to_list(500)
        publishing = _bool((data or {}).get("published")) or _bool(product_data.get("published"))

        return await apply_production_rules(
            db,
            product_data,
            template=template,
            global_print_options=global_print_options,
            publishing=publishing,
        )

    routes_main_module._production_rules_base_normalize_template_product_payload = original_normalize
    routes_main_module.normalize_template_product_payload = wrapped_normalize_template_product_payload

    original_snapshot = getattr(routes_main_module, "_build_production_snapshot", None)
    if callable(original_snapshot):
        def wrapped_build_production_snapshot(product: dict, template: Optional[dict], product_variation: Optional[dict], quantity: int) -> dict:
            snapshot = original_snapshot(product, template, product_variation, quantity)
            return _copy_production_snapshot(product or {}, snapshot)

        routes_main_module._production_rules_base_build_production_snapshot = original_snapshot
        routes_main_module._build_production_snapshot = wrapped_build_production_snapshot

    routes_main_module._builder_production_rules_patch_installed = True
