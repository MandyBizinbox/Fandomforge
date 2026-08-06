import unittest
from types import SimpleNamespace

import production_method_profiles
import unified_manufacturing_costing
from classic_htv_colour_seed import CLASSIC_HTV_COLOUR_IDS
from glow_htv_colour_seed import GLOW_ACTIVE_COLOUR_IDS, GLOW_HTV_COLOUR_IDS
from metallic_htv_colour_seed import METALLIC_HTV_COLOUR_IDS
from profile_colour_projection_repair import install_profile_colour_projection_repair
from profile_stocked_colours_patch import (
    install_profile_stocked_colours_patch,
    profile_stocked_colours,
)
from puff_htv_colour_seed import PUFF_HTV_COLOUR_IDS


class ProfileStockedColourTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        install_profile_stocked_colours_patch(install_validation=False)
        cls.route_bindings = SimpleNamespace(
            canonical_profiles_for_method=unified_manufacturing_costing.canonical_profiles_for_method,
            method_with_unified_profiles=unified_manufacturing_costing.method_with_unified_profiles,
        )
        install_profile_colour_projection_repair(cls.route_bindings)

    def setUp(self):
        self.method = {
            "method_key": "htv",
            "display_name": "HTV",
            "supported_colours": {
                "mode": "restricted_library",
                "colours": [
                    {"id": "black", "name": "Black", "hex": "#000000", "active": True},
                    {"id": "white", "name": "White", "hex": "#ffffff", "active": True},
                    {"id": "rose_gold", "name": "Rose Gold", "hex": "#b76e79", "active": True},
                ],
            },
            "costing_profiles": [],
        }

    def test_profile_normalisation_persists_restricted_colour_ids(self):
        profile = unified_manufacturing_costing.normalize_costing_profile({
            "id": "profile:htv:metallic_htv",
            "display_name": "Metallic HTV",
            "status": "active",
            "colour_selection_mode": "restricted",
            "supported_colour_ids": ["rose_gold", "white"],
        }, "htv")
        self.assertEqual(profile["colour_selection_mode"], "restricted")
        self.assertEqual(profile["supported_colour_ids"], ["rose_gold", "white"])
        self.assertEqual(profile["available_colour_ids"], ["rose_gold", "white"])

    def test_restricted_profile_filters_method_colour_pool(self):
        profile = {
            "id": "profile:htv:metallic_htv",
            "display_name": "Metallic HTV",
            "colour_selection_mode": "restricted",
            "supported_colour_ids": ["rose_gold"],
        }
        colours = profile_stocked_colours(self.method, profile)
        self.assertEqual([colour["id"] for colour in colours], ["rose_gold"])

    def test_current_availability_not_supported_range_drives_creator_colours(self):
        profile = {
            "id": "profile:htv:glow_htv",
            "display_name": "Glow HTV",
            "colour_selection_mode": "restricted",
            "supported_colour_ids": ["black", "white"],
            "available_colour_ids": ["black"],
        }
        colours = profile_stocked_colours(self.method, profile)
        self.assertEqual([colour["id"] for colour in colours], ["black"])

    def test_inherited_profile_receives_every_method_colour(self):
        profile = {
            "id": "profile:htv:custom_htv",
            "display_name": "Custom HTV",
            "colour_selection_mode": "inherit_method",
        }
        colours = profile_stocked_colours(self.method, profile)
        self.assertEqual([colour["id"] for colour in colours], ["black", "white", "rose_gold"])

    def test_builder_projection_exposes_only_currently_available_profile_colours(self):
        profile = {
            "id": "profile:htv:metallic_htv",
            "display_name": "Metallic HTV",
            "status": "active",
            "colour_selection_mode": "restricted",
            "supported_colour_ids": ["rose_gold", "white"],
            "available_colour_ids": ["rose_gold"],
        }
        row = production_method_profiles.production_method_profile_to_print_option(self.method, profile)
        self.assertEqual(row["colour_selection_mode"], "restricted")
        self.assertEqual(row["supported_colour_ids"], ["rose_gold", "white"])
        self.assertEqual(row["available_colour_ids"], ["rose_gold"])
        self.assertEqual([colour["id"] for colour in row["approved_stocked_colours"]], ["rose_gold"])

    def test_canonical_merge_does_not_erase_restricted_profile_with_legacy_alias(self):
        method = {
            **self.method,
            "default_costing_profile_id": "profile:htv:glow_htv",
            "costing_profiles": [
                {
                    "id": "profile:htv:glow_htv",
                    "display_name": "Glow HTV",
                    "status": "active",
                    "is_default": False,
                    "outsourced_rate_profile_key": "glow_htv",
                    "colour_selection_mode": "restricted",
                    "supported_colour_ids": list(GLOW_HTV_COLOUR_IDS),
                    "available_colour_ids": list(GLOW_ACTIVE_COLOUR_IDS),
                },
            ],
            "legacy_print_option_costing_profiles": [
                {
                    "id": "legacy-glow",
                    "manufacturing_profile_id": "profile:htv:glow_htv",
                    "display_name": "Glow HTV",
                    "status": "active",
                    "is_default": True,
                    "outsourced_rate_profile_key": "glow_htv",
                },
            ],
        }

        profiles = unified_manufacturing_costing.canonical_profiles_for_method(method)
        self.assertEqual(len(profiles), 1)
        profile = profiles[0]
        self.assertEqual(profile["colour_selection_mode"], "restricted")
        self.assertEqual(tuple(profile["supported_colour_ids"]), GLOW_HTV_COLOUR_IDS)
        self.assertEqual(tuple(profile["available_colour_ids"]), GLOW_ACTIVE_COLOUR_IDS)

    def test_route_binding_derives_completed_ranges_when_live_document_has_no_colour_fields(self):
        method = {
            **self.method,
            "active": True,
            "costing_profiles": [
                {"id": "profile:htv:puff_htv", "display_name": "Puff HTV", "status": "active"},
                {"id": "profile:htv:classic_htv", "display_name": "Classic HTV", "status": "active"},
                {"id": "profile:htv:glitter_htv", "display_name": "Glitter HTV", "status": "active"},
                {"id": "profile:htv:glow_htv", "display_name": "Glow HTV", "status": "active"},
                {"id": "profile:htv:metallic_htv", "display_name": "Metallic HTV", "status": "active"},
            ],
        }

        projected = self.route_bindings.method_with_unified_profiles(method)
        profiles = {profile["display_name"]: profile for profile in projected["costing_profiles"]}

        self.assertEqual(profiles["Classic HTV"]["colour_selection_mode"], "restricted")
        self.assertEqual(tuple(profiles["Classic HTV"]["supported_colour_ids"]), CLASSIC_HTV_COLOUR_IDS)
        self.assertEqual(tuple(profiles["Puff HTV"]["supported_colour_ids"]), PUFF_HTV_COLOUR_IDS)
        self.assertEqual(tuple(profiles["Metallic HTV"]["supported_colour_ids"]), METALLIC_HTV_COLOUR_IDS)
        self.assertEqual(tuple(profiles["Glow HTV"]["supported_colour_ids"]), GLOW_HTV_COLOUR_IDS)
        self.assertEqual(tuple(profiles["Glow HTV"]["available_colour_ids"]), GLOW_ACTIVE_COLOUR_IDS)
        self.assertEqual(profiles["Glitter HTV"]["colour_selection_mode"], "inherit_method")
        self.assertEqual(profiles["Glitter HTV"]["supported_colour_ids"], [])
        self.assertIs(
            self.route_bindings.method_with_unified_profiles,
            unified_manufacturing_costing.method_with_unified_profiles,
        )


if __name__ == "__main__":
    unittest.main()
