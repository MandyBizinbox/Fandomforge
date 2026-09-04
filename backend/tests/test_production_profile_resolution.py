from __future__ import annotations

import unittest

import production_operation_pricing as pricing_runtime

from unified_manufacturing_costing import resolve_costing_profile


def method_rule():
    return {
        "method_key": "htv",
        "default_costing_profile_id": "profile:htv:classic_htv",
        "costing_profiles": [
            {
                "id": "profile:htv:puff_htv",
                "display_name": "Puff HTV",
                "legacy_print_option_ids": ["print_method_htv_3d_puff"],
                "status": "active",
                "calculation_type": "area_fixed_rate",
                "cost_per_cm2": 0.056818,
                "minimum_area_cm2": 100,
                "application_cost": 7.5,
                "markup_percentage": 5,
            },
            {
                "id": "profile:htv:classic_htv",
                "display_name": "Classic HTV",
                "legacy_print_option_ids": ["print_method_htv_classic"],
                "status": "active",
                "is_default": True,
                "calculation_type": "area_fixed_rate",
                "cost_per_cm2": 0.028409,
                "minimum_area_cm2": 100,
                "application_cost": 7.5,
                "markup_percentage": 5,
            },
        ],
    }


class ProductionProfileResolutionTests(unittest.TestCase):
    def test_exact_legacy_alias_resolves_to_canonical_profile(self):
        profile = resolve_costing_profile(method_rule(), "print_method_htv_classic", option={"id":"print_method_htv_classic"}, slot={"print_option_id":"print_method_htv_classic"})
        self.assertEqual(profile["id"], "profile:htv:classic_htv")
        self.assertEqual(profile["cost_per_cm2"], 0.028409)

    def test_canonical_manufacturing_profile_id_is_authoritative(self):
        profile = resolve_costing_profile(method_rule(), None, option={"id":"print_method_htv_3d_puff"}, slot={"print_option_id":"print_method_htv_3d_puff","manufacturing_profile_id":"profile:htv:classic_htv"})
        self.assertEqual(profile["id"], "profile:htv:classic_htv")

    def test_missing_identity_falls_back_to_default_profile(self):
        profile = resolve_costing_profile(method_rule(), "missing-option", option={"id":"missing-option"}, slot={"print_option_id":"missing-option"})
        self.assertEqual(profile["id"], "profile:htv:classic_htv")

    def test_pricing_fields_use_canonical_profile_directly(self):
        fields = pricing_runtime._pricing_fields_from_method(
            {
                **method_rule(),
                "cost_calculation_model": {
                    "raw_cost_source": "production_method",
                    "cost_per_cm2": 1.25,
                },
            },
            {"id": "print_method_htv_classic"},
            {
                "print_option_id": "print_method_htv_classic",
                "manufacturing_profile_id": "profile:htv:classic_htv",
            },
        )
        self.assertEqual(fields["cost_per_cm2"], 0.028409)
        self.assertEqual(fields["minimum_area_cm2"], 100)
        self.assertEqual(fields["application_cost"], 7.5)



if __name__ == "__main__":
    unittest.main()
