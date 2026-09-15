from product_normalization_service import (
    SERVER_OWNED_PRODUCT_FIELDS, sanitise_product_payload,
    strip_server_owned_product_fields, copy_production_snapshot,
)


def test_server_owned_product_fields_are_removed_before_product_construction():
    payload = {"band_id":"creator-123","slug":"bad","assigned_printer_id":"printer-1","created_by_user_id":"admin-1","created_by_role":"super_admin","created_at":"x","updated_at":"y","title":"Test","template_id":"template-1"}
    cleaned = strip_server_owned_product_fields(payload)
    assert cleaned == {"title":"Test","template_id":"template-1"}
    assert set(SERVER_OWNED_PRODUCT_FIELDS) == {"band_id","slug","assigned_printer_id","created_by_user_id","created_by_role","created_at","updated_at"}


def test_product_payload_sanitization_is_non_mutating_and_removes_variation_mockups():
    payload = {"title":"Test","variations":[{"size":"M","mockup_images":["x"],"price":299}]}
    cleaned = sanitise_product_payload(payload)
    assert payload["variations"][0]["mockup_images"] == ["x"]
    assert cleaned["variations"] == [{"size":"M","price":299}]


def test_production_snapshot_copies_manufacturing_decisions_and_validation():
    product = {"production_rule_version":"v2","minimum_selling_price":199,"costing_breakdown":{"manufacturing":42},"production_validation":{"status":"valid","errors":[],"warnings":["note"]}}
    snapshot = copy_production_snapshot(product, {"costing_breakdown":{"blank":50}})
    assert snapshot["production_rule_version"] == "v2"
    assert snapshot["minimum_selling_price"] == 199
    assert snapshot["costing_breakdown"] == {"blank":50,"manufacturing":42}
    assert snapshot["validation_status"] == "valid"
    assert snapshot["validation_warnings"] == ["note"]
