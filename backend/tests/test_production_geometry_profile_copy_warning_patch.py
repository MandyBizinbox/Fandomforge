import unittest

from product_template_geometry_csv_patch import PRODUCTION_CONFIG_KEY
from production_geometry_profile_copy_patch import (
    PROFILE_COPY_FILENAME,
    parse_product_template_import,
    production_profile_copy_rows,
)
from production_geometry_profile_copy_warning_patch import (
    apply_import_plan_to_documents,
    build_import_plan,
)
from test_production_geometry_profile_copy_color_patch import stale_target_template
from test_production_geometry_profile_copy_patch import csv_bytes


class ProductionGeometryProfileCopyWarningPatchTests(unittest.TestCase):
    def test_missing_color_view_is_warning_not_blocker(self):
        template = stale_target_template()
        white_profile = template["attribute_image_profiles"]["white"]["configuration"]
        white_profile["screens"] = [
            screen
            for screen in white_profile["screens"]
            if screen["view_key"] != "back"
        ]

        target_row = next(
            row
            for row in production_profile_copy_rows([template])
            if row["production_value"] == "7/8 yrs"
        )
        target_row["copy_from_production_value"] = "3/4 yrs"
        target_row["area_overrides_json"] = (
            '{'
            '"front::front::0":{"width_mm":482,"height_mm":550},'
            '"back::back-full::0":{"width_mm":482,"height_mm":550},'
            '"left-sleeve::left-sleeve::0":{"width_mm":100,"height_mm":150},'
            '"right-sleeve::right-sleeve::0":{"width_mm":100,"height_mm":150}'
            '}'
        )

        package = parse_product_template_import(
            PROFILE_COPY_FILENAME,
            csv_bytes(target_row),
        )
        plan = build_import_plan([template], package)

        self.assertEqual(plan["errors"], [])
        self.assertTrue(plan["can_apply"])
        self.assertEqual(plan["summary"]["production_profile_copy_updates"], 1)
        self.assertGreaterEqual(plan["summary"]["warning_count"], 1)
        self.assertIn(
            "Size geometry will be copied",
            plan["warnings"][0]["message"],
        )
        self.assertIn("back", plan["warnings"][0].get("missing_views", []))

        applied = apply_import_plan_to_documents(
            [template],
            plan,
            "2026-08-11T10:00:00+00:00",
        )
        updated = applied["documents"][template["id"]]

        profile_config = updated["attribute_production_profiles"]["7-8-yrs"]["configuration"]
        self.assertEqual(
            [area["name"] for area in profile_config["print_areas"]],
            ["Front", "Back Full Print", "Left Sleeve", "Right Sleeve"],
        )
        self.assertEqual(
            [area["width_mm"] for area in profile_config["print_areas"]],
            [482.0, 482.0, 100.0, 100.0],
        )

        by_colour = {
            variation["attributes"]["Colour"]: variation
            for variation in updated["variations"]
        }
        white_config = by_colour["white"]["print_area_overrides"][PRODUCTION_CONFIG_KEY]
        black_config = by_colour["black"]["print_area_overrides"][PRODUCTION_CONFIG_KEY]

        self.assertEqual(
            [screen["view_key"] for screen in white_config["screens"]],
            ["front", "left_sleeve", "right_sleeve"],
        )
        self.assertEqual(len(white_config["print_areas"]), 3)
        self.assertNotIn("Back Full Print", [area["name"] for area in white_config["print_areas"]])

        self.assertEqual(
            [screen["view_key"] for screen in black_config["screens"]],
            ["front", "back", "left_sleeve", "right_sleeve"],
        )
        self.assertEqual(len(black_config["print_areas"]), 4)

    def test_complete_color_profiles_have_no_missing_view_warning(self):
        template = stale_target_template()
        target_row = next(
            row
            for row in production_profile_copy_rows([template])
            if row["production_value"] == "7/8 yrs"
        )
        target_row["copy_from_production_value"] = "3/4 yrs"

        plan = build_import_plan(
            [template],
            parse_product_template_import(
                PROFILE_COPY_FILENAME,
                csv_bytes(target_row),
            ),
        )

        self.assertEqual(plan["errors"], [])
        self.assertTrue(plan["can_apply"])
        messages = [warning.get("message", "") for warning in plan.get("warnings", [])]
        self.assertFalse(any("missing editor views" in message for message in messages))


if __name__ == "__main__":
    unittest.main()
