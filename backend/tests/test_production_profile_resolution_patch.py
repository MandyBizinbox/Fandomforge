from __future__ import annotations

import production_operation_pricing as pricing_runtime

from production_profile_resolution_patch import (
    install_production_profile_resolution_patch,
    resolve_method_profile_for_slot,
)


def _method_rule():
    return {
        "method_key": "htv",
        "legacy_print_option_costing_profiles": [
            {
                "print_option_id": "print_method_htv_3d_puff",
                "rule_name": "HTV 3D Puff",
                "print_method": "HTV 3D Puff - Cost Per cm²",
                "standard_print_size_key": "dynamic_area_cm2",
                "print_size": "Dynamic area cm²",
                "cost_per_cm2": 0.60,
                "minimum_print_cost": 25,
            },
            {
                "print_option_id": "print_method_htv_classic",
                "rule_name": "HTV Classic",
                "print_method": "HTV Classic",
                "standard_print_size_key": "dynamic_area_cm2",
                "print_size": "Dynamic area cm²",
                "cost_per_cm2": 0.08,
                "minimum_print_cost": 15,
            },
        ],
    }


def test_exact_print_option_id_wins_before_shared_standard_key():
    profile = resolve_method_profile_for_slot(
        _method_rule(),
        {
            "id": "print_method_htv_classic",
            "standard_print_size_key": "dynamic_area_cm2",
        },
        {
            "print_option_id": "print_method_htv_classic",
            "standard_print_size_key": "dynamic_area_cm2",
        },
    )

    assert profile["print_option_id"] == "print_method_htv_classic"
    assert profile["cost_per_cm2"] == 0.08


def test_slot_print_option_id_is_used_when_option_id_is_absent():
    profile = resolve_method_profile_for_slot(
        _method_rule(),
        {"standard_print_size_key": "dynamic_area_cm2"},
        {
            "print_option_id": "print_method_htv_classic",
            "standard_print_size_key": "dynamic_area_cm2",
        },
    )

    assert profile["print_option_id"] == "print_method_htv_classic"


def test_shared_standard_key_remains_a_fallback_without_exact_identity():
    profile = resolve_method_profile_for_slot(
        _method_rule(),
        {
            "id": "missing-option",
            "standard_print_size_key": "dynamic_area_cm2",
        },
        {
            "print_option_id": "missing-option",
            "standard_print_size_key": "dynamic_area_cm2",
        },
    )

    assert profile["print_option_id"] == "print_method_htv_3d_puff"


def test_pricing_fields_use_the_exact_profile_after_install():
    install_production_profile_resolution_patch()

    fields = pricing_runtime._pricing_fields_from_method(
        {
            **_method_rule(),
            "cost_calculation_model": {
                "raw_cost_source": "production_method",
                "cost_per_cm2": 1.25,
            },
        },
        {
            "id": "print_method_htv_classic",
            "standard_print_size_key": "dynamic_area_cm2",
        },
        {
            "print_option_id": "print_method_htv_classic",
            "standard_print_size_key": "dynamic_area_cm2",
        },
    )

    assert fields["legacy_print_option_profile_id"] == "print_method_htv_classic"
    assert fields["cost_per_cm2"] == 0.08
    assert fields["minimum_print_cost"] == 15


def test_install_is_idempotent():
    install_production_profile_resolution_patch()
    first_resolver = pricing_runtime._method_profile_for_slot

    install_production_profile_resolution_patch()

    assert pricing_runtime._method_profile_for_slot is first_resolver
