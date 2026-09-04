from htv_profile_colour_assignment import HTV_PROFILE_COLOUR_ASSIGNMENT_VERSION
from unified_manufacturing_costing import (
    UNIFIED_COSTING_ENGINE_VERSION,
    _apply_approved_rate,
    canonical_profiles_for_method,
)


def test_canonical_profile_saved_rate_is_not_replaced_by_legacy_defaults():
    profile = {
        "id": "profile:dtf:standard_dtf",
        "profile_id": "profile:dtf:standard_dtf",
        "costing_engine_version": UNIFIED_COSTING_ENGINE_VERSION,
        "cost_per_cm2": 9.99,
        "calculation_type": "area_fixed_rate",
    }
    result = _apply_approved_rate(profile, "dtf")
    assert result["cost_per_cm2"] == 9.99


def _canonical_htv_profile(profile):
    method = {
        "method_key": "htv",
        "display_name": "HTV",
        "costing_profiles": [profile],
        "default_costing_profile_id": profile["id"],
    }
    profiles = canonical_profiles_for_method(method)
    assert len(profiles) == 1
    return profiles[0]


def test_canonical_htv_profile_preserves_admin_restricted_colour_selection():
    profile = _canonical_htv_profile({
        "id": "profile:htv:glow_htv",
        "display_name": "Glow HTV",
        "status": "active",
        "colour_selection_mode": "restricted",
        "color_selection_mode": "restricted",
        "supported_colour_ids": ["admin_override_colour"],
        "available_colour_ids": ["admin_override_colour"],
    })

    assert profile["colour_selection_mode"] == "restricted"
    assert profile["supported_colour_ids"] == ["admin_override_colour"]
    assert profile["available_colour_ids"] == ["admin_override_colour"]


def test_canonical_htv_profile_preserves_admin_inherit_choice_after_seed():
    profile = _canonical_htv_profile({
        "id": "profile:htv:classic_htv",
        "display_name": "Classic HTV",
        "status": "active",
        "colour_selection_mode": "inherit_method",
        "color_selection_mode": "inherit_method",
        "supported_colour_ids": [],
        "available_colour_ids": [],
        "stocked_colour_assignment_version": HTV_PROFILE_COLOUR_ASSIGNMENT_VERSION,
    })

    assert profile["colour_selection_mode"] == "inherit_method"
    assert profile["supported_colour_ids"] == []
    assert profile["available_colour_ids"] == []
