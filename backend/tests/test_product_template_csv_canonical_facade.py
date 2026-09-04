import io
import zipfile

import product_template_csv as canonical_csv
import product_template_csv_base as base_csv
from product_template_geometry_csv_patch import (
    PRODUCTION_CONFIG_KEY,
    PRODUCTION_GEOMETRY_FILENAME,
)
from production_geometry_profile_copy_patch import (
    PROFILE_COPY_FILENAME,
    production_profile_copy_rows,
)
from test_production_geometry_profile_copy_color_patch import stale_target_template
from test_production_geometry_profile_copy_patch import csv_bytes


def _profile_copy_row(template):
    row = next(
        row
        for row in production_profile_copy_rows([template])
        if row["production_value"] == "7/8 yrs"
    )
    row["copy_from_production_value"] = "3/4 yrs"
    return row


def test_public_facade_composes_final_behaviour_without_installers():
    assert canonical_csv.remove_unset_fields is base_csv.remove_unset_fields
    assert canonical_csv.export_product_template_zip.__module__ == "production_geometry_profile_copy_patch"
    assert canonical_csv.parse_product_template_import.__module__ == "production_geometry_profile_copy_patch"
    assert canonical_csv.build_import_plan.__module__ == "production_geometry_profile_copy_warning_patch"
    assert canonical_csv.apply_import_plan_to_documents.__module__ == "production_geometry_profile_copy_warning_patch"


def test_public_export_contains_geometry_and_profile_copy_files():
    template = stale_target_template()
    payload = canonical_csv.export_product_template_zip([template])

    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        names = set(archive.namelist())

    assert PRODUCTION_GEOMETRY_FILENAME in names
    assert PROFILE_COPY_FILENAME in names


def test_public_import_keeps_missing_color_view_as_warning_and_applies_real_views():
    template = stale_target_template()
    white_profile = template["attribute_image_profiles"]["white"]["configuration"]
    white_profile["screens"] = [
        screen
        for screen in white_profile["screens"]
        if screen["view_key"] != "back"
    ]

    row = _profile_copy_row(template)
    package = canonical_csv.parse_product_template_import(
        PROFILE_COPY_FILENAME,
        csv_bytes(row),
    )
    plan = canonical_csv.build_import_plan([template], package)

    assert plan["errors"] == []
    assert plan["can_apply"] is True
    assert plan["summary"]["production_profile_copy_updates"] == 1
    assert plan["summary"]["warning_count"] >= 1
    assert "Size geometry will be copied" in plan["warnings"][0]["message"]
    assert "back" in plan["warnings"][0].get("missing_views", [])

    applied = canonical_csv.apply_import_plan_to_documents(
        [template],
        plan,
        "2026-09-04T09:45:00+00:00",
    )
    updated = applied["documents"][template["id"]]
    by_colour = {
        variation["attributes"]["Colour"]: variation
        for variation in updated["variations"]
    }

    white_config = by_colour["white"]["print_area_overrides"][PRODUCTION_CONFIG_KEY]
    black_config = by_colour["black"]["print_area_overrides"][PRODUCTION_CONFIG_KEY]

    assert [screen["view_key"] for screen in white_config["screens"]] == [
        "front",
        "left_sleeve",
        "right_sleeve",
    ]
    assert [screen["view_key"] for screen in black_config["screens"]] == [
        "front",
        "back",
        "left_sleeve",
        "right_sleeve",
    ]
