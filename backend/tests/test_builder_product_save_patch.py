from builder_product_save_patch import (
    SERVER_OWNED_PRODUCT_FIELDS,
    _sanitise_product_payload,
    _strip_server_owned_product_fields,
)


def test_server_owned_product_fields_are_removed_before_product_construction():
    payload = {
        "band_id": "creator-123",
        "slug": "should-not-survive",
        "assigned_printer_id": "printer-123",
        "created_by_user_id": "admin-123",
        "created_by_role": "super_admin",
        "created_at": "2026-08-21T10:00:00+00:00",
        "updated_at": "2026-08-21T10:00:00+00:00",
        "title": "Test Product",
        "template_id": "template-123",
    }

    cleaned = _strip_server_owned_product_fields(payload)

    assert cleaned == {
        "title": "Test Product",
        "template_id": "template-123",
    }
    assert set(SERVER_OWNED_PRODUCT_FIELDS) == {
        "band_id",
        "slug",
        "assigned_printer_id",
        "created_by_user_id",
        "created_by_role",
        "created_at",
        "updated_at",
    }


def test_product_payload_sanitization_does_not_mutate_input_and_cleans_variation_mockups():
    payload = {
        "title": "Test Product",
        "variations": [
            {
                "size": "M",
                "color": "Black",
                "mockup_images": ["https://example.test/mockup.png"],
                "price": 299,
            }
        ],
    }

    cleaned = _sanitise_product_payload(payload)

    assert payload["variations"][0]["mockup_images"] == [
        "https://example.test/mockup.png"
    ]
    assert cleaned["variations"] == [
        {
            "size": "M",
            "color": "Black",
            "price": 299,
        }
    ]
