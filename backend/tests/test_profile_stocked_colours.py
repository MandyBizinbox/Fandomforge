import unittest

import production_method_profiles
import unified_manufacturing_costing
from profile_stocked_colours_patch import (
    install_profile_stocked_colours_patch,
    profile_stocked_colours,
)


class ProfileStockedColourTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        install_profile_stocked_colours_patch(install_validation=False)

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

    def test_inherited_profile_receives_every_method_colour(self):
        profile = {
            "id": "profile:htv:classic_htv",
            "display_name": "Classic HTV",
            "colour_selection_mode": "inherit_method",
        }
        colours = profile_stocked_colours(self.method, profile)
        self.assertEqual([colour["id"] for colour in colours], ["black", "white", "rose_gold"])

    def test_builder_projection_exposes_only_profile_colours(self):
        profile = {
            "id": "profile:htv:metallic_htv",
            "display_name": "Metallic HTV",
            "status": "active",
            "colour_selection_mode": "restricted",
            "supported_colour_ids": ["rose_gold"],
        }
        row = production_method_profiles.production_method_profile_to_print_option(self.method, profile)
        self.assertEqual(row["colour_selection_mode"], "restricted")
        self.assertEqual(row["supported_colour_ids"], ["rose_gold"])
        self.assertEqual([colour["id"] for colour in row["approved_stocked_colours"]], ["rose_gold"])


if __name__ == "__main__":
    unittest.main()
