import csv
import io
import zipfile

from product_template_csv import (
    ALLOWED_STATUSES,
    CLEAR_TOKEN,
    apply_change_map,
    build_import_plan,
    export_product_template_zip,
    parse_product_template_import,
)


def template_document():
    return {
        "id": "template-1",
        "name": "Example Shirt",
        "description": "Existing description",
        "status": "active",
        "creator_visible": True,
        "platform_blank_cost": 100.0,
        "creator_blank_price": 110.0,
        "updated_at": "2026-08-03T05:00:00+00:00",
        "product_image_url": "/api/uploads/shirt.png",
        "print_option_ids": ["dtf"],
        "mockup_screens": [
            {
                "id": "screen-front",
                "image_url": "/api/uploads/front.png",
                "status": "active",
            }
        ],
        "variations": [
            {
                "id": "variation-red-small",
                "enabled": True,
                "status": "active",
                "sku": "",
                "attributes": {
                    "Colour": "Red",
                    "Size": "Small",
                },
                "platform_blank_cost": 100.0,
                "creator_blank_price": 110.0,
                "image_url": "/api/uploads/red.png",
            }
        ],
        "print_areas": [
            {
                "id": "area-front",
                "name": "Front",
                "view_key": "front",
                "width_mm": 280.0,
                "height_mm": 350.0,
                "allowed_print_option_ids": ["dtf"],
                "required": True,
                "status": "active",
            }
        ],
    }


def make_csv(headers, rows):
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(
        buffer,
        fieldnames=headers,
        lineterminator="\n",
    )
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue().encode("utf-8")


def test_export_contains_three_round_trippable_csv_files():
    document = template_document()
    payload = export_product_template_zip([document])

    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        assert set(archive.namelist()) == {
            "templates.csv",
            "variations.csv",
            "print_areas.csv",
            "README.txt",
        }

    package = parse_product_template_import(
        "templates.zip",
        payload,
    )

    assert len(package["templates"]) == 1
    assert len(package["variations"]) == 1
    assert len(package["print_areas"]) == 1

    plan = build_import_plan([document], package)

    assert plan["errors"] == []
    assert plan["summary"]["changed_cells"] == 0
    assert plan["can_apply"] is False


def test_builds_template_variation_and_print_area_updates():
    document = template_document()
    source_time = document["updated_at"]

    package = {
        "templates": [
            {
                "_source_file": "templates.csv",
                "_row_number": 2,
                "template_id": "template-1",
                "source_updated_at": source_time,
                "description": "Updated description",
                "creator_blank_price": "125.50",
            }
        ],
        "variations": [
            {
                "_source_file": "variations.csv",
                "_row_number": 2,
                "template_id": "template-1",
                "source_updated_at": source_time,
                "variation_id": "variation-red-small",
                "sku": "SHIRT-RED-S",
                "creator_blank_price": "130",
            }
        ],
        "print_areas": [
            {
                "_source_file": "print_areas.csv",
                "_row_number": 2,
                "template_id": "template-1",
                "source_updated_at": source_time,
                "print_area_id": "area-front",
                "width_mm": "300",
                "allowed_print_option_ids_json":
                    '["dtf","htv"]',
            }
        ],
    }

    plan = build_import_plan([document], package)

    assert plan["errors"] == []
    assert plan["can_apply"] is True
    assert plan["summary"] == {
        "template_rows": 1,
        "variation_rows": 1,
        "print_area_rows": 1,
        "template_updates": 1,
        "variation_updates": 1,
        "print_area_updates": 1,
        "changed_cells": 6,
        "touched_templates": 1,
        "error_count": 0,
        "warning_count": 0,
    }


def test_empty_cells_are_noop_and_clear_token_unsets():
    document = template_document()

    package = {
        "templates": [
            {
                "_source_file": "templates.csv",
                "_row_number": 2,
                "template_id": "template-1",
                "source_updated_at": document["updated_at"],
                "name": "",
                "description": CLEAR_TOKEN,
                "creator_visible": "false",
            }
        ],
        "variations": [],
        "print_areas": [],
    }

    plan = build_import_plan([document], package)

    assert plan["errors"] == []
    assert plan["summary"]["changed_cells"] == 2

    changes = plan["template_updates"][0]["changes"]

    assert "name" not in changes
    assert changes["description"] == {
        "action": "unset",
    }
    assert changes["creator_visible"] == {
        "action": "set",
        "value": False,
    }

    updated = dict(document)
    apply_change_map(updated, changes)

    assert "description" not in updated
    assert updated["creator_visible"] is False
    assert updated["name"] == "Example Shirt"


def test_rejects_stale_and_unknown_records():
    document = template_document()

    package = {
        "templates": [
            {
                "_source_file": "templates.csv",
                "_row_number": 2,
                "template_id": "template-1",
                "source_updated_at":
                    "2026-08-01T00:00:00+00:00",
                "description": "Stale change",
            },
            {
                "_source_file": "templates.csv",
                "_row_number": 3,
                "template_id": "missing-template",
                "description": "Unknown change",
            },
        ],
        "variations": [],
        "print_areas": [],
    }

    plan = build_import_plan([document], package)

    assert plan["can_apply"] is False
    assert plan["summary"]["error_count"] == 2
    assert "changed after" in plan["errors"][0]["message"]
    assert "cannot create templates" in plan["errors"][1]["message"]


def test_individual_variation_csv_is_detected():
    content = make_csv(
        [
            "template_id",
            "variation_id",
            "sku",
        ],
        [
            {
                "template_id": "template-1",
                "variation_id": "variation-red-small",
                "sku": "SHIRT-RED-S",
            }
        ],
    )

    package = parse_product_template_import(
        "variations.csv",
        content,
    )

    assert package["templates"] == []
    assert package["print_areas"] == []
    assert len(package["variations"]) == 1


def test_applies_validated_plan_to_nested_document_copies():
    from product_template_csv import (
        apply_import_plan_to_documents,
    )

    document = template_document()

    package = {
        "templates": [
            {
                "_source_file": "templates.csv",
                "_row_number": 2,
                "template_id": "template-1",
                "source_updated_at": document["updated_at"],
                "description": CLEAR_TOKEN,
            }
        ],
        "variations": [
            {
                "_source_file": "variations.csv",
                "_row_number": 2,
                "template_id": "template-1",
                "source_updated_at": document["updated_at"],
                "variation_id": "variation-red-small",
                "sku": "SHIRT-RED-S",
            }
        ],
        "print_areas": [
            {
                "_source_file": "print_areas.csv",
                "_row_number": 2,
                "template_id": "template-1",
                "source_updated_at": document["updated_at"],
                "print_area_id": "area-front",
                "width_mm": "300",
            }
        ],
    }

    plan = build_import_plan([document], package)

    applied = apply_import_plan_to_documents(
        [document],
        plan,
        "2026-08-03T06:30:00+00:00",
    )

    updated = applied["documents"]["template-1"]

    assert "description" not in updated
    assert updated["variations"][0]["sku"] == "SHIRT-RED-S"
    assert updated["print_areas"][0]["width_mm"] == 300.0
    assert updated["updated_at"] == "2026-08-03T06:30:00+00:00"
    assert applied["top_level_unsets"]["template-1"] == [
        "description"
    ]

    # Original source document remains unchanged.
    assert document["description"] == "Existing description"
    assert document["variations"][0]["sku"] == ""
    assert document["print_areas"][0]["width_mm"] == 280.0



def test_required_category_cannot_be_cleared():
    document = template_document()
    document["category"] = "t-shirt"

    package = {
        "templates": [
            {
                "_source_file": "templates.csv",
                "_row_number": 2,
                "template_id": "template-1",
                "source_updated_at": document["updated_at"],
                "category": CLEAR_TOKEN,
            }
        ],
        "variations": [],
        "print_areas": [],
    }

    plan = build_import_plan([document], package)

    assert plan["can_apply"] is False
    assert plan["summary"]["error_count"] == 1
    assert plan["errors"][0]["column"] == "category"
    assert "may not be cleared" in plan["errors"][0]["message"]


def test_remove_unset_fields_prevents_mongo_update_conflicts():
    from product_template_csv import remove_unset_fields

    source = {
        "id": "template-1",
        "description": "",
        "category": "t-shirt",
        "creator_visible": True,
    }

    cleaned = remove_unset_fields(
        source,
        [
            "description",
            "creator_visible",
        ],
    )

    assert cleaned == {
        "id": "template-1",
        "category": "t-shirt",
    }

    assert source["description"] == ""
    assert source["creator_visible"] is True



def test_csv_status_contract_matches_product_template_model():
    assert ALLOWED_STATUSES == {
        "active",
        "draft",
        "archived",
    }

    for invalid_status in (
        "inactive",
        "launch_ready",
    ):
        document = template_document()

        package = {
            "templates": [
                {
                    "_source_file": "templates.csv",
                    "_row_number": 2,
                    "template_id": "template-1",
                    "source_updated_at":
                        document["updated_at"],
                    "status": invalid_status,
                }
            ],
            "variations": [],
            "print_areas": [],
        }

        plan = build_import_plan(
            [document],
            package,
        )

        assert plan["can_apply"] is False
        assert plan["summary"]["error_count"] == 1
        assert plan["errors"][0]["column"] == "status"
        assert "unsupported status" in (
            plan["errors"][0]["message"]
        )



def test_visibility_controls_cannot_be_cleared():
    for field in (
        "creator_visible",
        "admin_visible",
    ):
        document = template_document()
        document[field] = False

        package = {
            "templates": [
                {
                    "_source_file": "templates.csv",
                    "_row_number": 2,
                    "template_id": document["id"],
                    "source_updated_at":
                        document["updated_at"],
                    field: CLEAR_TOKEN,
                }
            ],
            "variations": [],
            "print_areas": [],
        }

        plan = build_import_plan(
            [document],
            package,
        )

        assert plan["can_apply"] is False
        assert plan["summary"]["error_count"] == 1
        assert plan["errors"][0]["column"] == field
        assert "may not be cleared" in (
            plan["errors"][0]["message"]
        )


def test_normalised_nested_fields_cannot_be_cleared():
    document = template_document()

    cases = [
        (
            "variations",
            {
                "_source_file": "variations.csv",
                "_row_number": 2,
                "template_id": document["id"],
                "source_updated_at":
                    document["updated_at"],
                "variation_id":
                    "variation-red-small",
                "platform_blank_cost":
                    CLEAR_TOKEN,
            },
            "platform_blank_cost",
        ),
        (
            "print_areas",
            {
                "_source_file": "print_areas.csv",
                "_row_number": 2,
                "template_id": document["id"],
                "source_updated_at":
                    document["updated_at"],
                "print_area_id": "area-front",
                "view_key": CLEAR_TOKEN,
            },
            "view_key",
        ),
    ]

    for group, row, column in cases:
        package = {
            "templates": [],
            "variations": [],
            "print_areas": [],
        }

        package[group] = [row]

        plan = build_import_plan(
            [document],
            package,
        )

        assert plan["can_apply"] is False
        assert plan["summary"]["error_count"] == 1
        assert plan["errors"][0]["column"] == column
        assert "may not be cleared" in (
            plan["errors"][0]["message"]
        )


def test_source_updated_at_is_required_for_versioned_templates():
    document = template_document()

    package = {
        "templates": [
            {
                "_source_file": "templates.csv",
                "_row_number": 2,
                "template_id": document["id"],
                "description":
                    "Change without a timestamp",
            }
        ],
        "variations": [],
        "print_areas": [],
    }

    plan = build_import_plan(
        [document],
        package,
    )

    assert plan["can_apply"] is False
    assert plan["summary"]["error_count"] == 1
    assert "source_updated_at is required" in (
        plan["errors"][0]["message"]
    )


def test_unversioned_legacy_template_can_still_be_updated():
    document = template_document()
    document.pop("updated_at")

    package = {
        "templates": [
            {
                "_source_file": "templates.csv",
                "_row_number": 2,
                "template_id": document["id"],
                "description":
                    "Updated legacy description",
            }
        ],
        "variations": [],
        "print_areas": [],
    }

    plan = build_import_plan(
        [document],
        package,
    )

    assert plan["errors"] == []
    assert plan["can_apply"] is True
