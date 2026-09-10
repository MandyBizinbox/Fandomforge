import csv
import io
import json
import unittest
import zipfile

from product_template_geometry_csv_patch import PRODUCTION_CONFIG_KEY
from production_geometry_profile_copy_patch import (
    PROFILE_COPY_COLUMNS,
    PROFILE_COPY_FILENAME,
    apply_import_plan_to_documents,
    build_import_plan,
    export_product_template_zip,
    parse_product_template_import,
    production_profile_copy_rows,
)


SOURCE_TIME = "2026-08-07T10:00:00+00:00"


def source_configuration():
    return {
        "version": 3,
        "screens": [
            {"id": "src-front", "view_key": "front", "view": "front", "image_url": ""},
            {"id": "src-back", "view_key": "back", "view": "back", "image_url": ""},
            {"id": "src-left", "view_key": "left_sleeve", "view": "left_sleeve", "image_url": ""},
            {"id": "src-right", "view_key": "right_sleeve", "view": "right_sleeve", "image_url": ""},
        ],
        "print_areas": [
            {
                "id": "src-area-front",
                "name": "Front",
                "area_key": "front",
                "view_key": "front",
                "screen_view": "front",
                "screen_id": "src-front",
                "geometry_type": "rectangle",
                "x": 27.0,
                "y": 11.7,
                "width": 44.4,
                "height": 81.3,
                "x_pct": 27.0,
                "y_pct": 11.7,
                "width_pct": 44.4,
                "height_pct": 81.3,
                "width_mm": 330,
                "height_mm": 320,
                "allowed_print_option_ids": ["dtf", "htv"],
                "status": "active",
            },
            {
                "id": "src-area-back",
                "name": "Back Full Print",
                "area_key": "back_full",
                "view_key": "back",
                "screen_view": "back",
                "screen_id": "src-back",
                "geometry_type": "rectangle",
                "x": 26.7,
                "y": 5.3,
                "width": 46.3,
                "height": 90.5,
                "x_pct": 26.7,
                "y_pct": 5.3,
                "width_pct": 46.3,
                "height_pct": 90.5,
                "width_mm": 330,
                "height_mm": 370,
                "allowed_print_option_ids": ["dtf", "htv"],
                "status": "active",
            },
            {
                "id": "src-area-left",
                "name": "Left Sleeve",
                "area_key": "left_sleeve",
                "view_key": "left_sleeve",
                "screen_view": "left_sleeve",
                "screen_id": "src-left",
                "geometry_type": "rectangle",
                "x": 37.9,
                "y": 15.4,
                "width": 19.0,
                "height": 27.3,
                "x_pct": 37.9,
                "y_pct": 15.4,
                "width_pct": 19.0,
                "height_pct": 27.3,
                "width_mm": 80,
                "height_mm": 120,
                "allowed_print_option_ids": ["htv"],
                "status": "active",
            },
            {
                "id": "src-area-right",
                "name": "Right Sleeve",
                "area_key": "right_sleeve",
                "view_key": "right_sleeve",
                "screen_view": "right_sleeve",
                "screen_id": "src-right",
                "geometry_type": "rectangle",
                "x": 43.1,
                "y": 15.1,
                "width": 18.1,
                "height": 28.9,
                "x_pct": 43.1,
                "y_pct": 15.1,
                "width_pct": 18.1,
                "height_pct": 28.9,
                "width_mm": 80,
                "height_mm": 120,
                "allowed_print_option_ids": ["htv"],
                "status": "active",
            },
        ],
        "print_option_ids": ["dtf", "htv"],
        "print_options": [{"id": "dtf"}, {"id": "htv"}],
        "configured_at": SOURCE_TIME,
    }


def old_target_configuration():
    return {
        "version": 3,
        "screens": [
            {"id": "old-front", "view_key": "front", "view": "front", "image_url": ""},
        ],
        "print_areas": [
            {
                "id": "old-a4-landscape",
                "name": "Front A4-Landscape",
                "area_key": "front",
                "view_key": "front",
                "screen_view": "front",
                "screen_id": "old-front",
                "geometry_type": "rectangle",
                "x_pct": 38,
                "y_pct": 24,
                "width_pct": 24,
                "height_pct": 18,
                "width_mm": 297,
                "height_mm": 210,
                "allowed_print_option_ids": ["dtf"],
                "status": "active",
            },
            {
                "id": "old-a4-portrait",
                "name": "Front - A4 P Print Area",
                "area_key": "front",
                "view_key": "front",
                "screen_view": "front",
                "screen_id": "old-front",
                "geometry_type": "rectangle",
                "x_pct": 40,
                "y_pct": 23,
                "width_pct": 20,
                "height_pct": 31,
                "width_mm": 210,
                "height_mm": 297,
                "allowed_print_option_ids": ["dtf"],
                "status": "active",
            },
        ],
        "print_option_ids": ["dtf"],
        "print_options": [{"id": "dtf"}],
        "configured_at": SOURCE_TIME,
    }


def compiled_variation(variation_id, size, colour):
    screens = [
        {"id": f"{variation_id}-front", "view_key": "front", "view": "front", "image_url": f"/{colour}/front.png"},
        {"id": f"{variation_id}-back", "view_key": "back", "view": "back", "image_url": f"/{colour}/back.png"},
        {"id": f"{variation_id}-left", "view_key": "left_sleeve", "view": "left_sleeve", "image_url": f"/{colour}/left.png"},
        {"id": f"{variation_id}-right", "view_key": "right_sleeve", "view": "right_sleeve", "image_url": f"/{colour}/right.png"},
    ]
    old_area = {
        "id": f"old-area-{variation_id}",
        "name": "Front A4-Landscape",
        "area_key": "front",
        "view_key": "front",
        "screen_view": "front",
        "screen_id": screens[0]["id"],
        "x_pct": 38,
        "y_pct": 24,
        "width_pct": 24,
        "height_pct": 18,
        "width_mm": 297,
        "height_mm": 210,
        "allowed_print_option_ids": ["dtf"],
        "status": "active",
    }
    config = {
        "version": 3,
        "screens": screens,
        "print_areas": [old_area],
        "print_option_ids": ["dtf"],
        "print_options": [{"id": "dtf"}],
        "configured_at": SOURCE_TIME,
    }
    return {
        "id": variation_id,
        "enabled": True,
        "status": "active",
        "attributes": {"Size": size, "Colour": colour},
        "print_area_overrides": {
            PRODUCTION_CONFIG_KEY: config,
            old_area["id"]: dict(old_area),
        },
    }


def template_document():
    return {
        "id": "template-kids",
        "name": "FWRD T-Shirt - 145gsm - Kids",
        "category": "shirts",
        "status": "active",
        "creator_visible": True,
        "admin_visible": True,
        "updated_at": SOURCE_TIME,
        "variation_inheritance": {
            "mode": "attribute",
            "image_attribute": "Colour",
            "production_attribute": "Size",
        },
        "attribute_production_profiles": {
            "3-4-yrs": {
                "attribute_value": "3/4 yrs",
                "configuration": source_configuration(),
                "updated_at": SOURCE_TIME,
            },
            "7-8-yrs": {
                "attribute_value": "7/8 yrs",
                "configuration": old_target_configuration(),
                "updated_at": SOURCE_TIME,
            },
        },
        "variations": [
            compiled_variation("v-white", "7/8 yrs", "white"),
            compiled_variation("v-black", "7/8 yrs", "black"),
        ],
        "mockup_screens": [],
        "print_areas": [],
        "print_option_ids": ["dtf", "htv"],
        "print_options": [{"id": "dtf"}, {"id": "htv"}],
    }


def csv_bytes(row):
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=PROFILE_COPY_COLUMNS, lineterminator="\n")
    writer.writeheader()
    writer.writerow({column: row.get(column, "") for column in PROFILE_COPY_COLUMNS})
    return buffer.getvalue().encode("utf-8")


class ProductionGeometryProfileCopyTests(unittest.TestCase):
    def test_export_contains_profile_copy_sheet(self):
        template = template_document()
        rows = production_profile_copy_rows([template])
        self.assertEqual(len(rows), 2)
        self.assertEqual({row["production_value"] for row in rows}, {"3/4 yrs", "7/8 yrs"})

        payload = export_product_template_zip([template])
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            self.assertIn(PROFILE_COPY_FILENAME, archive.namelist())
            exported = list(csv.DictReader(io.StringIO(archive.read(PROFILE_COPY_FILENAME).decode("utf-8-sig"))))
            self.assertEqual(len(exported), 2)
            self.assertIn("front::front::0", exported[0]["current_area_sizes_json"] + exported[1]["current_area_sizes_json"])

    def test_copy_replaces_old_target_structure_and_preserves_colour_images(self):
        template = template_document()
        target_row = next(row for row in production_profile_copy_rows([template]) if row["production_value"] == "7/8 yrs")
        target_row["copy_from_production_value"] = "3/4 yrs"
        target_row["area_overrides_json"] = json.dumps({
            "front::front::0": {"width_mm": 350, "height_mm": 400},
            "back::back-full::0": {"width_mm": 350, "height_mm": 420},
            "left-sleeve::left-sleeve::0": {"width_mm": 90, "height_mm": 140},
            "right-sleeve::right-sleeve::0": {"width_mm": 90, "height_mm": 140},
        })

        package = parse_product_template_import(PROFILE_COPY_FILENAME, csv_bytes(target_row))
        plan = build_import_plan([template], package)

        self.assertEqual(plan["errors"], [])
        self.assertTrue(plan["can_apply"])
        self.assertEqual(plan["summary"]["production_profile_copy_updates"], 1)

        applied = apply_import_plan_to_documents(
            [template],
            plan,
            "2026-08-07T11:00:00+00:00",
        )
        updated = applied["documents"][template["id"]]
        target_profile = updated["attribute_production_profiles"]["7-8-yrs"]
        areas = target_profile["configuration"]["print_areas"]

        self.assertEqual(
            [area["name"] for area in areas],
            ["Front", "Back Full Print", "Left Sleeve", "Right Sleeve"],
        )
        self.assertEqual([area["width_mm"] for area in areas], [350.0, 350.0, 90.0, 90.0])
        self.assertEqual([area["height_mm"] for area in areas], [400.0, 420.0, 140.0, 140.0])
        # Positions come directly from the 3/4 source.
        self.assertEqual(areas[0]["x_pct"], 27.0)
        self.assertEqual(areas[0]["y_pct"], 11.7)

        for variation in updated["variations"]:
            config = variation["print_area_overrides"][PRODUCTION_CONFIG_KEY]
            self.assertEqual(len(config["screens"]), 4)
            self.assertEqual(len(config["print_areas"]), 4)
            self.assertEqual(
                [area["name"] for area in config["print_areas"]],
                ["Front", "Back Full Print", "Left Sleeve", "Right Sleeve"],
            )
            self.assertEqual(config["print_areas"][0]["width_mm"], 350.0)
            # Existing Color-owned images are preserved, never copied from Size.
            expected_colour = "white" if variation["id"] == "v-white" else "black"
            self.assertEqual(config["screens"][0]["image_url"], f"/{expected_colour}/front.png")
            self.assertEqual(config["screens"][1]["image_url"], f"/{expected_colour}/back.png")
            old_keys = [key for key in variation["print_area_overrides"] if key.startswith("old-area-")]
            self.assertEqual(old_keys, [])

    def test_blank_copy_fields_are_noop(self):
        template = template_document()
        target_row = next(row for row in production_profile_copy_rows([template]) if row["production_value"] == "7/8 yrs")
        package = parse_product_template_import(PROFILE_COPY_FILENAME, csv_bytes(target_row))
        plan = build_import_plan([template], package)
        self.assertEqual(plan["errors"], [])
        self.assertFalse(plan["can_apply"])
        self.assertEqual(plan["summary"]["production_profile_copy_updates"], 0)

    def test_stale_profile_copy_is_rejected(self):
        template = template_document()
        target_row = next(row for row in production_profile_copy_rows([template]) if row["production_value"] == "7/8 yrs")
        target_row["source_updated_at"] = "2026-08-01T00:00:00+00:00"
        target_row["copy_from_production_value"] = "3/4 yrs"
        plan = build_import_plan(
            [template],
            parse_product_template_import(PROFILE_COPY_FILENAME, csv_bytes(target_row)),
        )
        self.assertFalse(plan["can_apply"])
        self.assertEqual(plan["summary"]["error_count"], 1)
        self.assertIn("changed after", plan["errors"][0]["message"])

    def test_missing_colour_owned_view_is_rejected_before_apply(self):
        template = template_document()
        config = template["variations"][0]["print_area_overrides"][PRODUCTION_CONFIG_KEY]
        config["screens"] = [screen for screen in config["screens"] if screen["view_key"] != "back"]
        target_row = next(row for row in production_profile_copy_rows([template]) if row["production_value"] == "7/8 yrs")
        target_row["copy_from_production_value"] = "3/4 yrs"

        plan = build_import_plan(
            [template],
            parse_product_template_import(PROFILE_COPY_FILENAME, csv_bytes(target_row)),
        )
        self.assertFalse(plan["can_apply"])
        self.assertEqual(plan["summary"]["error_count"], 1)
        self.assertIn("missing Color-owned editor views", plan["errors"][0]["message"])


if __name__ == "__main__":
    unittest.main()
