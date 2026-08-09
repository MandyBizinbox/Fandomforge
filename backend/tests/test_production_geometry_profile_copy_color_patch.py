import unittest

from product_template_geometry_csv_patch import PRODUCTION_CONFIG_KEY
from production_geometry_profile_copy_color_patch import (
    apply_import_plan_to_documents,
    build_import_plan,
)
from production_geometry_profile_copy_patch import (
    PROFILE_COPY_FILENAME,
    parse_product_template_import,
    production_profile_copy_rows,
)
from test_production_geometry_profile_copy_patch import (
    csv_bytes,
    template_document,
)


def color_profile(colour):
    return {
        "attribute_value": colour,
        "configuration": {
            "version": 3,
            "screens": [
                {
                    "id": f"{colour}-profile-front",
                    "view_key": "front",
                    "view": "front",
                    "image_url": f"/{colour}/front.png",
                },
                {
                    "id": f"{colour}-profile-back",
                    "view_key": "back",
                    "view": "back",
                    "image_url": f"/{colour}/back.png",
                },
                {
                    "id": f"{colour}-profile-left",
                    "view_key": "left_sleeve",
                    "view": "left_sleeve",
                    "image_url": f"/{colour}/left.png",
                },
                {
                    "id": f"{colour}-profile-right",
                    "view_key": "right_sleeve",
                    "view": "right_sleeve",
                    "image_url": f"/{colour}/right.png",
                },
            ],
            "print_areas": [],
            "print_option_ids": [],
            "print_options": [],
        },
    }


def stale_target_template():
    template = template_document()
    template["attribute_image_profiles"] = {
        "white": color_profile("white"),
        "black": color_profile("black"),
    }

    # Reproduce the live failure: exact adult variations still have only the
    # legacy Front screen even though their Color profiles own all four images.
    for variation in template["variations"]:
        config = variation["print_area_overrides"][PRODUCTION_CONFIG_KEY]
        config["screens"] = [
            screen for screen in config["screens"]
            if screen["view_key"] == "front"
        ]
    return template


class ProductionGeometryProfileCopyColorPatchTests(unittest.TestCase):
    def test_stale_variation_screens_are_hydrated_from_color_profiles(self):
        template = stale_target_template()
        target_row = next(
            row for row in production_profile_copy_rows([template])
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
        self.assertEqual(
            plan["summary"]["production_profile_copy_updates"],
            1,
        )

        applied = apply_import_plan_to_documents(
            [template],
            plan,
            "2026-08-07T12:30:00+00:00",
        )
        updated = applied["documents"][template["id"]]

        for variation in updated["variations"]:
            config = variation["print_area_overrides"][PRODUCTION_CONFIG_KEY]
            self.assertEqual(
                [screen["view_key"] for screen in config["screens"]],
                ["front", "back", "left_sleeve", "right_sleeve"],
            )
            self.assertEqual(len(config["print_areas"]), 4)

            colour = variation["attributes"]["Colour"]
            self.assertEqual(
                [screen["image_url"] for screen in config["screens"]],
                [
                    f"/{colour}/front.png",
                    f"/{colour}/back.png",
                    f"/{colour}/left.png",
                    f"/{colour}/right.png",
                ],
            )
            self.assertEqual(
                [area["width_mm"] for area in config["print_areas"]],
                [482.0, 482.0, 100.0, 100.0],
            )
            self.assertEqual(
                [area["height_mm"] for area in config["print_areas"]],
                [550.0, 550.0, 150.0, 150.0],
            )

    def test_missing_view_on_authoritative_color_profile_still_blocks_copy(self):
        template = stale_target_template()
        white_screens = template["attribute_image_profiles"]["white"]["configuration"]["screens"]
        template["attribute_image_profiles"]["white"]["configuration"]["screens"] = [
            screen for screen in white_screens
            if screen["view_key"] != "back"
        ]

        target_row = next(
            row for row in production_profile_copy_rows([template])
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

        self.assertFalse(plan["can_apply"])
        self.assertEqual(plan["summary"]["error_count"], 1)
        self.assertIn(
            "missing Color-owned editor views",
            plan["errors"][0]["message"],
        )


if __name__ == "__main__":
    unittest.main()
