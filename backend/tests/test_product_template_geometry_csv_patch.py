import csv
import io
import json
import unittest
import zipfile

from product_template_geometry_csv_patch import (
    PRODUCTION_CONFIG_KEY,
    PRODUCTION_GEOMETRY_COLUMNS,
    PRODUCTION_GEOMETRY_FILENAME,
    apply_import_plan_to_documents,
    build_import_plan,
    export_product_template_zip,
    parse_product_template_import,
    production_geometry_rows,
)


SOURCE_TIME = "2026-08-07T08:00:00+00:00"


def make_area(area_id, *, x=10, y=20, width=30, height=40, width_mm=210, height_mm=297):
    return {
        "id": area_id,
        "name": "Front Full",
        "area_key": "front_full",
        "view_key": "front",
        "screen_view": "front",
        "screen_id": "screen-front",
        "geometry_type": "rectangle",
        "shape_type": "rectangle",
        "x": x,
        "y": y,
        "width": width,
        "height": height,
        "x_pct": x,
        "y_pct": y,
        "width_pct": width,
        "height_pct": height,
        "width_mm": width_mm,
        "height_mm": height_mm,
        "bleed_mm": 0,
        "safe_margin_mm": 0,
        "rotation_deg": 0,
        "dpi": 300,
        "fit_mode": "contain",
        "pricing_area_mode": "bounding_box",
        "required": True,
        "allowed_print_option_ids": ["dtf"],
        "standard_print_size_key": "a4_portrait",
        "print_size": "a4_portrait",
        "status": "active",
    }


def make_config(area_id, **area_kwargs):
    area = make_area(area_id, **area_kwargs)
    return {
        "version": 3,
        "screens": [
            {
                "id": "screen-front",
                "name": "Front",
                "view": "front",
                "view_key": "front",
                "image_url": "/api/uploads/front.png",
                "status": "active",
            }
        ],
        "print_areas": [area],
        "print_option_ids": ["dtf"],
        "print_options": [{"id": "dtf", "status": "active"}],
        "configured_at": SOURCE_TIME,
    }


def compiled_variation(variation_id, size, colour, *, x, width_mm):
    config = make_config(
        f"vp-area-{variation_id}",
        x=x,
        width=42,
        height=48,
        width_mm=width_mm,
        height_mm=300,
    )
    config["screens"][0]["id"] = f"vp-screen-{variation_id}"
    config["print_areas"][0]["screen_id"] = f"vp-screen-{variation_id}"
    area = config["print_areas"][0]
    return {
        "id": variation_id,
        "enabled": True,
        "status": "active",
        "attributes": {"Size": size, "Colour": colour},
        "image_url": f"/api/uploads/{colour.lower()}.png",
        "print_area_overrides": {
            PRODUCTION_CONFIG_KEY: config,
            area["id"]: dict(area),
        },
    }


def attribute_owned_template():
    small_config = make_config("profile-area-small", x=11, width=41, height=47, width_mm=180, height_mm=260)
    large_config = make_config("profile-area-large", x=7, width=48, height=52, width_mm=240, height_mm=340)
    return {
        "id": "template-shirt",
        "name": "Attribute Shirt",
        "category": "shirts",
        "status": "active",
        "creator_visible": True,
        "admin_visible": True,
        "updated_at": SOURCE_TIME,
        "product_image_url": "/api/uploads/shirt.png",
        "print_option_ids": ["dtf"],
        "print_options": [{"id": "dtf", "status": "active"}],
        "mockup_screens": [
            {
                "id": "anchor-screen-front",
                "name": "Front",
                "view": "front",
                "view_key": "front",
                "image_url": "/api/uploads/shirt.png",
                "status": "active",
            }
        ],
        "print_areas": [
            {
                **make_area("anchor-area-front", x=11, width=41, height=47, width_mm=180, height_mm=260),
                "screen_id": "anchor-screen-front",
            }
        ],
        "variation_inheritance": {
            "mode": "attribute",
            "image_attribute": "Colour",
            "production_attribute": "Size",
        },
        "attribute_image_profiles": {},
        "attribute_production_profiles": {
            "small": {
                "attribute_value": "Small",
                "configuration": small_config,
                "updated_at": SOURCE_TIME,
            },
            "large": {
                "attribute_value": "Large",
                "configuration": large_config,
                "updated_at": SOURCE_TIME,
            },
        },
        "variations": [
            compiled_variation("small-white", "Small", "White", x=11, width_mm=180),
            compiled_variation("small-black", "Small", "Black", x=11, width_mm=180),
            compiled_variation("large-white", "Large", "White", x=7, width_mm=240),
            compiled_variation("large-black", "Large", "Black", x=7, width_mm=240),
        ],
    }


def individual_template():
    first = compiled_variation("red-small", "Small", "Red", x=10, width_mm=180)
    second = compiled_variation("blue-small", "Small", "Blue", x=20, width_mm=190)
    return {
        "id": "template-individual",
        "name": "Individual Shirt",
        "category": "shirts",
        "status": "active",
        "updated_at": SOURCE_TIME,
        "product_image_url": "/api/uploads/shirt.png",
        "print_option_ids": ["dtf"],
        "mockup_screens": [],
        "print_areas": [],
        "variation_inheritance": {"mode": "individual"},
        "variations": [first, second],
    }


def make_geometry_csv(row):
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=PRODUCTION_GEOMETRY_COLUMNS, lineterminator="\n")
    writer.writeheader()
    writer.writerow({column: row.get(column, "") for column in PRODUCTION_GEOMETRY_COLUMNS})
    return buffer.getvalue().encode("utf-8")


class ProductTemplateGeometryCsvTests(unittest.TestCase):
    def test_attribute_export_is_one_geometry_set_per_size_not_size_colour(self):
        template = attribute_owned_template()
        rows = production_geometry_rows([template])

        self.assertEqual(len(rows), 2)
        self.assertEqual({row["production_value"] for row in rows}, {"Small", "Large"})
        self.assertTrue(all(row["geometry_scope"] == "attribute_profile" for row in rows))
        self.assertTrue(all(not row["variation_id"] for row in rows))

        payload = export_product_template_zip([template])
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            self.assertIn(PRODUCTION_GEOMETRY_FILENAME, archive.namelist())
            geometry = list(csv.DictReader(io.StringIO(archive.read(PRODUCTION_GEOMETRY_FILENAME).decode("utf-8-sig"))))
            self.assertEqual(len(geometry), 2)
            self.assertIn("Canonical V3 variable-product print geometry", archive.read("README.txt").decode("utf-8"))

        package = parse_product_template_import("templates.zip", payload)
        self.assertEqual(len(package["production_geometry"]), 2)
        plan = build_import_plan([template], package)
        self.assertEqual(plan["errors"], [])
        self.assertEqual(plan["summary"]["changed_cells"], 0)
        self.assertFalse(plan["can_apply"])

    def test_attribute_profile_import_updates_profile_and_all_matching_compiled_variations(self):
        template = attribute_owned_template()
        row = next(row for row in production_geometry_rows([template]) if row["production_value"] == "Small")
        row.update({
            "x_pct": 15,
            "width_pct": 44,
            "width_mm": 205,
            "height_mm": 285,
            "bleed_mm": 2,
            "safe_margin_mm": 3,
            "rotation_deg": 1,
            "allowed_print_option_ids_json": json.dumps(["dtf", "htv"]),
            "standard_print_size_key": "custom",
        })

        package = parse_product_template_import(PRODUCTION_GEOMETRY_FILENAME, make_geometry_csv(row))
        plan = build_import_plan([template], package)

        self.assertEqual(plan["errors"], [])
        self.assertTrue(plan["can_apply"])
        self.assertEqual(plan["summary"]["production_geometry_updates"], 1)
        self.assertGreaterEqual(plan["summary"]["changed_cells"], 8)

        result = apply_import_plan_to_documents([template], plan, "2026-08-07T09:00:00+00:00")
        updated = result["documents"][template["id"]]

        profile_area = updated["attribute_production_profiles"]["small"]["configuration"]["print_areas"][0]
        self.assertEqual(profile_area["x_pct"], 15.0)
        self.assertEqual(profile_area["x"], 15.0)
        self.assertEqual(profile_area["width_pct"], 44.0)
        self.assertEqual(profile_area["width_mm"], 205.0)
        self.assertEqual(profile_area["height_mm"], 285.0)
        self.assertEqual(profile_area["bleed_mm"], 2.0)
        self.assertEqual(profile_area["safe_margin_mm"], 3.0)
        self.assertEqual(profile_area["allowed_print_option_ids"], ["dtf", "htv"])
        self.assertEqual(updated["attribute_production_profiles"]["small"]["configuration"]["print_option_ids"], ["dtf", "htv"])

        by_id = {variation["id"]: variation for variation in updated["variations"]}
        for variation_id in ("small-white", "small-black"):
            config = by_id[variation_id]["print_area_overrides"][PRODUCTION_CONFIG_KEY]
            area = config["print_areas"][0]
            self.assertEqual(area["x_pct"], 15.0)
            self.assertEqual(area["width_mm"], 205.0)
            self.assertEqual(area["allowed_print_option_ids"], ["dtf", "htv"])
            direct = by_id[variation_id]["print_area_overrides"][area["id"]]
            self.assertEqual(direct["x_pct"], 15.0)
            self.assertEqual(direct["width_mm"], 205.0)

        for variation_id in ("large-white", "large-black"):
            area = by_id[variation_id]["print_area_overrides"][PRODUCTION_CONFIG_KEY]["print_areas"][0]
            self.assertEqual(area["x_pct"], 7)
            self.assertEqual(area["width_mm"], 240)

    def test_individual_mode_exports_and_updates_only_exact_variation(self):
        template = individual_template()
        rows = production_geometry_rows([template])
        self.assertEqual(len(rows), 2)
        self.assertEqual({row["variation_id"] for row in rows}, {"red-small", "blue-small"})
        self.assertTrue(all(row["geometry_scope"] == "variation" for row in rows))

        row = next(row for row in rows if row["variation_id"] == "red-small")
        row["x_pct"] = 33
        row["geometry_type"] = "circle"
        row["pricing_area_mode"] = "shape"

        plan = build_import_plan(
            [template],
            parse_product_template_import(PRODUCTION_GEOMETRY_FILENAME, make_geometry_csv(row)),
        )
        self.assertEqual(plan["errors"], [])
        applied = apply_import_plan_to_documents([template], plan, "2026-08-07T09:15:00+00:00")
        updated = applied["documents"][template["id"]]
        by_id = {variation["id"]: variation for variation in updated["variations"]}

        red_area = by_id["red-small"]["print_area_overrides"][PRODUCTION_CONFIG_KEY]["print_areas"][0]
        blue_area = by_id["blue-small"]["print_area_overrides"][PRODUCTION_CONFIG_KEY]["print_areas"][0]
        self.assertEqual(red_area["x_pct"], 33.0)
        self.assertEqual(red_area["x"], 33.0)
        self.assertEqual(red_area["geometry_type"], "circle")
        self.assertEqual(red_area["shape_type"], "circle")
        self.assertEqual(red_area["pricing_area_mode"], "shape")
        self.assertEqual(blue_area["x_pct"], 20)
        self.assertEqual(blue_area["geometry_type"], "rectangle")

    def test_empty_geometry_cells_are_noop(self):
        template = attribute_owned_template()
        row = next(row for row in production_geometry_rows([template]) if row["production_value"] == "Small")
        row["x_pct"] = ""
        row["width_mm"] = ""
        row["notes"] = "CSV note"

        plan = build_import_plan(
            [template],
            parse_product_template_import(PRODUCTION_GEOMETRY_FILENAME, make_geometry_csv(row)),
        )
        self.assertEqual(plan["errors"], [])
        changes = plan["production_geometry_updates"][0]["changes"]
        self.assertEqual(set(changes), {"notes"})

    def test_stale_geometry_export_is_rejected(self):
        template = attribute_owned_template()
        row = next(row for row in production_geometry_rows([template]) if row["production_value"] == "Small")
        row["source_updated_at"] = "2026-08-01T00:00:00+00:00"
        row["x_pct"] = 20

        plan = build_import_plan(
            [template],
            parse_product_template_import(PRODUCTION_GEOMETRY_FILENAME, make_geometry_csv(row)),
        )
        self.assertFalse(plan["can_apply"])
        self.assertEqual(plan["summary"]["error_count"], 1)
        self.assertIn("changed after", plan["errors"][0]["message"])

    def test_geometry_slot_change_is_rejected_as_stale_structure(self):
        template = attribute_owned_template()
        row = next(row for row in production_geometry_rows([template]) if row["production_value"] == "Small")
        row["geometry_slot"] = "front::different-area::0"
        row["x_pct"] = 20

        plan = build_import_plan(
            [template],
            parse_product_template_import(PRODUCTION_GEOMETRY_FILENAME, make_geometry_csv(row)),
        )
        self.assertFalse(plan["can_apply"])
        self.assertEqual(plan["summary"]["error_count"], 1)
        self.assertIn("geometry_slot", plan["errors"][0]["message"])

    def test_invalid_geometry_values_are_rejected(self):
        template = individual_template()
        row = production_geometry_rows([template])[0]
        row["geometry_type"] = "triangle"
        row["width_pct"] = 150
        row["width_mm"] = -10
        row["fit_mode"] = "squash"

        plan = build_import_plan(
            [template],
            parse_product_template_import(PRODUCTION_GEOMETRY_FILENAME, make_geometry_csv(row)),
        )
        self.assertFalse(plan["can_apply"])
        columns = {error.get("column") for error in plan["errors"]}
        self.assertTrue({"geometry_type", "width_pct", "width_mm", "fit_mode"}.issubset(columns))


if __name__ == "__main__":
    unittest.main()
