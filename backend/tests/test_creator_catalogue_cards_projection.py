"""Contract tests for the creator catalogue's lightweight projection.

These guard pricing/readiness input parity without relying on a live MongoDB.
"""
import inspect

import routes_main


def test_creator_cards_route_registered_before_template_detail_route():
    routes = [getattr(route, "path", "") for route in routes_main.product_templates_router.routes]
    assert "/product-templates/catalogue-cards" in routes
    assert "/product-templates/{template_id}" in routes
    assert routes.index("/product-templates/catalogue-cards") < routes.index("/product-templates/{template_id}")


def test_creator_cards_reuse_summary_projection():
    source = inspect.getsource(routes_main.creator_catalogue_cards)
    assert "dict(PRODUCT_TEMPLATE_LIST_PROJECTION)" in source
    assert "_creator_safe_product_template_doc" in source

    fields = routes_main.PRODUCT_TEMPLATE_LIST_PROJECTION
    # These fields impact variant-specific print coverage and pricing.
    for field in (
        "variations.print_area_overrides",
        "variations.print_area_override",
        "variations.mockup_screen_overrides",
        "variations.view_overrides",
        "variation_production_rules",
        "production_rules",
        "print_options",
        "print_option_ids",
        "print_areas",
        "template_gallery",
        "mockup_screens.image_url",
    ):
        assert fields[field] == 1


def test_creator_sanitizer_strips_internal_cost_fields():
    template = {
        "id": "template-test",
        "name": "Example",
        "creator_visible": True,
        "admin_visible": True,
        "creator_blank_price": 100,
        "base_blank_cost": 70,
        "variations": [{
            "id": "var-test",
            "creator_blank_price": 125,
            "base_blank_cost": 85,
            "print_area_overrides": {
                "__production_configuration__": {"print_areas": [{"id": "front"}]}
            },
        }],
    }
    safe = routes_main._creator_safe_product_template_doc(template)
    assert "base_blank_cost" not in safe
    assert "creator_visible" not in safe
    assert "admin_visible" not in safe
    assert safe["creator_blank_price"] == 100
    assert safe["variations"][0]["creator_blank_price"] == 125
    assert safe["variations"][0]["print_area_overrides"] == template["variations"][0]["print_area_overrides"]
    assert "base_blank_cost" not in safe["variations"][0]
