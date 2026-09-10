import unittest

from unified_manufacturing_costing import (
    UNIFIED_COSTING_ENGINE_VERSION,
    canonical_profiles_for_method,
    method_with_unified_profiles,
    canonical_print_option_projection,
    profile_alias_map,
    profile_to_print_option,
    rewrite_profile_references,
)


class UnifiedManufacturingCostingTests(unittest.TestCase):
    def test_collapses_duplicate_dtf_profiles_and_preserves_aliases(self):
        method = {
            "method_key": "dtf",
            "display_name": "DTF Transfer",
            "legacy_print_option_costing_profiles": [
                {
                    "print_option_id": "print_method_dtf_transfers",
                    "rule_name": "DTF Transfers",
                    "status": "active",
                    "calculation_type": "area_fixed_rate",
                    "cost_per_cm2": 0.07,
                    "minimum_print_cost": 50,
                },
                {
                    "print_option_id": "old-dtf-area",
                    "rule_name": "DTF - Area Fixed Rate",
                    "status": "archived",
                    "cost_per_cm2": 0.09,
                    "minimum_print_cost": 25,
                },
            ],
        }
        profiles = canonical_profiles_for_method(method)
        self.assertEqual(len(profiles), 1)
        profile = profiles[0]
        self.assertEqual(profile["id"], "profile:dtf:standard_dtf")
        self.assertEqual(profile["cost_per_cm2"], 0.07)
        self.assertEqual(profile["minimum_area_cm2"], 100)
        self.assertEqual(profile["application_cost"], 7.5)
        self.assertEqual(profile["minimum_print_cost"], 0)
        self.assertTrue(profile["is_default"])
        self.assertIn("print_method_dtf_transfers", profile["legacy_print_option_ids"])
        self.assertIn("old-dtf-area", profile["legacy_print_option_ids"])

    def test_keeps_distinct_htv_material_profiles(self):
        method = {
            "method_key": "htv",
            "legacy_print_option_costing_profiles": [
                {"print_option_id": "htv-classic", "rule_name": "HTV Classic", "status": "active"},
                {"print_option_id": "htv-glitter", "rule_name": "HTV Glitter", "status": "active"},
                {"print_option_id": "htv-puff", "rule_name": "HTV Puff", "status": "active"},
            ],
        }
        profiles = canonical_profiles_for_method(method)
        self.assertEqual([profile["id"] for profile in profiles], [
            "profile:htv:classic_htv",
            "profile:htv:glitter_htv",
            "profile:htv:puff_htv",
        ])
        self.assertTrue(profiles[0]["is_default"])
        self.assertEqual(profiles[1]["cost_per_cm2"], round(125 / 2200, 6))

    def test_method_projection_uses_one_canonical_profile_collection(self):
        method = {
            "method_key": "sublimation",
            "display_name": "Sublimation",
            "cost_calculation_model": {
                "calculation_type": "area_fixed_rate",
                "cost_per_cm2": 0.056,
                "minimum_area_cm2": 100,
                "application_cost": 7.5,
            },
        }
        projected = method_with_unified_profiles(method)
        self.assertEqual(projected["costing_engine_version"], UNIFIED_COSTING_ENGINE_VERSION)
        self.assertEqual(len(projected["costing_profiles"]), 1)
        self.assertEqual(projected["default_costing_profile_id"], projected["costing_profiles"][0]["id"])

    def test_alias_map_and_reference_backfill(self):
        methods = [{
            "method_key": "dtf",
            "costing_profiles": [{
                "id": "profile:dtf:standard_dtf",
                "display_name": "Standard DTF",
                "legacy_print_option_ids": ["legacy-dtf"],
                "status": "active",
                "is_default": True,
            }],
        }]
        aliases, conflicts = profile_alias_map(methods)
        self.assertFalse(conflicts)
        self.assertEqual(aliases["legacy-dtf"], "profile:dtf:standard_dtf")
        rewritten, count = rewrite_profile_references({
            "selected_print_option_id": "legacy-dtf",
            "print_areas": [{"allowed_print_option_ids": ["legacy-dtf"]}],
            "artworks": [{"print_option_id": "legacy-dtf"}],
        }, aliases)
        self.assertGreaterEqual(count, 3)
        self.assertEqual(rewritten["selected_print_option_id"], "profile:dtf:standard_dtf")
        self.assertEqual(rewritten["print_areas"][0]["allowed_print_option_ids"], ["profile:dtf:standard_dtf"])
        self.assertEqual(rewritten["artworks"][0]["manufacturing_profile_id"], "profile:dtf:standard_dtf")

    def test_builder_compatibility_row_exposes_alias_before_migration(self):
        method = {
            "method_key": "dtf",
            "display_name": "DTF Transfer",
            "legacy_print_option_costing_profiles": [{
                "print_option_id": "legacy-dtf",
                "rule_name": "DTF Transfers",
                "status": "active",
            }],
        }
        profile = canonical_profiles_for_method(method)[0]
        row = profile_to_print_option(method, profile)
        self.assertEqual(row["id"], "legacy-dtf")
        self.assertEqual(row["manufacturing_profile_id"], "profile:dtf:standard_dtf")

    def test_canonical_print_option_projection_uses_canonical_id(self):
        method = {
            "method_key": "dtf",
            "display_name": "DTF Transfer",
            "costing_profiles": [{
                "id": "profile:dtf:standard_dtf",
                "display_name": "Standard DTF",
                "status": "active",
                "is_default": True,
                "legacy_print_option_ids": ["legacy-dtf"],
            }],
        }
        profile = canonical_profiles_for_method(method)[0]
        projection = canonical_print_option_projection(method, profile)
        self.assertEqual(projection["id"], "profile:dtf:standard_dtf")
        self.assertTrue(projection["canonical_profile_projection"])
        self.assertFalse(projection["legacy_alias_only"])


if __name__ == "__main__":
    unittest.main()
