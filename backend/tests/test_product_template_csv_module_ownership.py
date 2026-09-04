"""Ownership regressions for canonical product-template CSV composition."""

import product_template_csv as csv_api
import product_template_geometry_csv as geometry_csv
import production_geometry_profile_copy as profile_copy
import production_geometry_profile_copy_color as color_composition
import production_geometry_profile_copy_warnings as warning_policy


def test_public_csv_api_uses_canonical_extension_modules():
    assert csv_api.export_product_template_zip is profile_copy.export_product_template_zip
    assert csv_api.parse_product_template_import is profile_copy.parse_product_template_import
    assert csv_api.build_import_plan is warning_policy.build_import_plan
    assert csv_api.apply_import_plan_to_documents is warning_policy.apply_import_plan_to_documents


def test_canonical_modules_expose_no_runtime_patch_installers():
    assert not hasattr(geometry_csv, "install_product_template_geometry_csv_patch")
    assert not hasattr(profile_copy, "install_production_geometry_profile_copy_patch")
    assert not hasattr(color_composition, "install_production_geometry_profile_copy_color_patch")
    assert not hasattr(warning_policy, "install_production_geometry_profile_copy_warning_patch")


def test_deprecated_patch_names_are_import_aliases_not_runtime_owners():
    import product_template_geometry_csv_patch as geometry_alias
    import production_geometry_profile_copy_patch as profile_alias
    import production_geometry_profile_copy_color_patch as color_alias
    import production_geometry_profile_copy_warning_patch as warning_alias

    assert geometry_alias.PRODUCTION_GEOMETRY_FILENAME == "production_geometry.csv"
    assert profile_alias.PROFILE_COPY_FILENAME == "production_profile_copies.csv"
    assert color_alias.build_import_plan.__module__ == "production_geometry_profile_copy_color"
    assert warning_alias.build_import_plan.__module__ == "production_geometry_profile_copy_warnings"
