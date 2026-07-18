from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from launch_integrity.audit import _redact
from launch_integrity.design import canonical_design_spec, product_integrity_fields, typed_text_layer
from launch_integrity.entitlements import FEATURE_REGISTRY
from launch_integrity.permissions import require_manager_permission, require_owner, role_home
from launch_integrity.pricing import allocate_cents, replay_matches, stable_hash
from launch_integrity.settings import DEFAULT_ENTITLEMENT_MODULES, LaunchIntegritySettings


def test_literal_owner_is_first_class_platform_owner():
    owner = SimpleNamespace(id="owner-1", role="owner", manager_permissions={})
    assert require_owner(owner) is owner
    assert require_manager_permission(owner, "manage_payouts") is owner
    assert role_home("owner") == "/admin"


def test_admin_is_not_owner_for_owner_only_settings():
    with pytest.raises(HTTPException) as exc:
        require_owner(SimpleNamespace(id="admin-1", role="admin"))
    assert exc.value.status_code == 403


def test_manager_permission_allowed_and_denied():
    allowed = SimpleNamespace(id="m1", role="manager", manager_permissions={"manage_orders": True})
    denied = SimpleNamespace(id="m2", role="manager", manager_permissions={"manage_orders": False})
    assert require_manager_permission(allowed, "manage_orders") is allowed
    with pytest.raises(HTTPException) as exc:
        require_manager_permission(denied, "manage_orders")
    assert exc.value.status_code == 403
    assert exc.value.detail["permission"] == "manage_orders"


def test_platform_and_entitlement_layers_are_separate():
    assert DEFAULT_ENTITLEMENT_MODULES["checkout_enabled"] == "public_shop_enabled"
    assert "checkout_enabled" in FEATURE_REGISTRY
    assert LaunchIntegritySettings().tax.enabled is False


def test_text_layer_contract_is_typed():
    layer = typed_text_layer({
        "text_layer": True,
        "text_content": "FORGE",
        "text_font_family": "Arial",
        "text_font_size": 42,
        "text_color": "#ff6600",
        "text_alignment": "center",
        "sort_order": 3,
        "print_area_id": "front",
        "placement": {"rotation": 12, "scale": 0.8},
        "original_url": "/api/uploads/text/abc.svg",
    })
    assert layer["contract_version"] == "text_layer_v1"
    assert layer["text"] == "FORGE"
    assert layer["font_identifier"] == "Arial"
    assert layer["production_render_url"].endswith("abc.svg")


def test_product_design_snapshot_has_versions_and_hash():
    product = {
        "id": "product-1",
        "band_id": "creator-1",
        "template_id": "template-1",
        "artworks": [{
            "id": "art-1",
            "original_url": "/api/uploads/immutable/example.png",
            "mime_type": "image/png",
            "print_area_id": "front",
            "placement": {"x": 10, "y": 20, "width": 40, "height": 50},
        }],
    }
    actor = SimpleNamespace(id="creator-user", role="creator")
    fields = product_integrity_fields(product, {"id": "creator-1"}, actor)
    assert fields["product_version"] == 1
    assert fields["ownership_locked"] is True
    assert fields["canonical_design_spec"]["design_sha256"]
    assert fields["artwork_asset_versions"][0]["asset_version_id"].startswith("asset-")
    second = canonical_design_spec({**product, **fields}, 1)
    assert second["design_sha256"] == fields["canonical_design_spec"]["design_sha256"]


def test_currency_cent_allocation_is_deterministic_and_reconciles():
    allocations = allocate_cents("10.00", [1, 1, 1])
    assert sum(allocations) == 10
    assert [str(value) for value in allocations] == ["3.34", "3.33", "3.33"]


def test_pricing_replay_hash():
    snapshot = {"calculation_version": "pricing_v1", "currency": "ZAR", "customer_selling_price": 200.0}
    snapshot["calculation_sha256"] = stable_hash(snapshot)
    assert replay_matches(snapshot) is True
    snapshot["customer_selling_price"] = 201.0
    assert replay_matches(snapshot) is False


def test_audit_redacts_financial_credentials():
    redacted = _redact({
        "account_number": "123456789",
        "paystack_secret_key": "sk_live_secret",
        "safe": {"amount": 100, "token": "abc"},
    })
    assert redacted["account_number"] == "[REDACTED]"
    assert redacted["paystack_secret_key"] == "[REDACTED]"
    assert redacted["safe"]["token"] == "[REDACTED]"
    assert redacted["safe"]["amount"] == 100
