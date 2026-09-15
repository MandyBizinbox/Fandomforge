import inspect

import routes_main


def test_template_list_summary_projection_is_curated():
    projection = routes_main.PRODUCT_TEMPLATE_LIST_PROJECTION

    assert projection["_id"] == 0
    for key in (
        "id",
        "name",
        "status",
        "product_type_id",
        "product_image_url",
        "template_gallery",
        "print_options",
        "print_option_ids",
        "print_areas",
        "variation_production_rules",
        "production_rules",
    ):
        assert projection.get(key) == 1

    # These editor-heavy payloads must never be pulled into the list response.
    for key in (
        "attribute_image_profiles",
        "attribute_production_profiles",
        "variation_inheritance",
        "default_variation_production_configuration",
    ):
        assert key not in projection

    assert projection.get("variations.print_area_overrides") == 1
    assert projection.get("variations.mockup_screen_overrides") == 1
    assert projection.get("mockup_screens.image_url") == 1


def test_template_summary_route_is_registered_without_replacing_full_editor_route():
    paths = {getattr(route, "path", "") for route in routes_main.admin_router.routes}

    assert "/admin/product-templates/summary" in paths
    assert "/admin/product-templates" in paths
    assert "/admin/product-templates/{template_id}" in paths


def test_summary_route_uses_projection_in_database_query():
    source = inspect.getsource(routes_main.admin_product_template_summaries)

    assert "PRODUCT_TEMPLATE_LIST_PROJECTION" in source
    assert ".to_list(1000)" in source
