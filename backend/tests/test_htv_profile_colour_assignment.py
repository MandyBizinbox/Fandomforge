import unittest

from classic_htv_colour_seed import CLASSIC_HTV_COLOUR_IDS
from glow_htv_colour_seed import GLOW_ACTIVE_COLOUR_IDS, GLOW_HTV_COLOUR_IDS
from htv_profile_colour_assignment import (
    PROFILE_RANGES,
    assign_authoritative_htv_profile_colours,
    find_htv_method,
    profile_range_key,
)
from metallic_htv_colour_seed import METALLIC_HTV_COLOUR_IDS
from puff_htv_colour_seed import PUFF_HTV_COLOUR_IDS


class HtvProfileColourAssignmentTests(unittest.TestCase):
    def test_finds_htv_method_case_insensitively(self):
        method = find_htv_method([
            {"method_key": "DTF"},
            {"method_key": "HTV", "display_name": "HTV"},
        ])
        self.assertIsNotNone(method)
        self.assertEqual(method["method_key"], "HTV")

    def test_resolves_canonical_legacy_and_display_profile_identities(self):
        self.assertEqual(
            profile_range_key({"id": "profile:htv:classic_htv"}),
            "classic_htv",
        )
        self.assertEqual(
            profile_range_key({"outsourced_rate_profile_key": "puff_htv"}),
            "puff_htv",
        )
        self.assertEqual(
            profile_range_key({"display_name": "HTV Metallic"}),
            "metallic_htv",
        )
        self.assertEqual(
            profile_range_key({"profile_name": "Glow in the Dark HTV"}),
            "glow_htv",
        )
        self.assertIsNone(profile_range_key({"display_name": "Glitter HTV"}))

    def test_assigns_four_completed_ranges_and_preserves_glitter(self):
        method = {
            "method_key": "HTV",
            "display_name": "HTV",
            "costing_profiles": [
                {"id": "profile:htv:classic_htv", "display_name": "Classic HTV"},
                {"id": "profile:htv:glitter_htv", "display_name": "Glitter HTV", "admin_note": "keep me"},
                {"id": "profile:htv:puff_htv", "display_name": "Puff HTV"},
                {"id": "profile:htv:metallic_htv", "display_name": "Metallic HTV"},
                {"id": "profile:htv:glow_htv", "display_name": "Glow HTV"},
            ],
        }
        updated, summary = assign_authoritative_htv_profile_colours(method)
        profiles = {profile["id"]: profile for profile in updated["costing_profiles"]}

        classic = profiles["profile:htv:classic_htv"]
        puff = profiles["profile:htv:puff_htv"]
        metallic = profiles["profile:htv:metallic_htv"]
        glow = profiles["profile:htv:glow_htv"]
        glitter = profiles["profile:htv:glitter_htv"]

        self.assertEqual(classic["colour_selection_mode"], "restricted")
        self.assertEqual(tuple(classic["supported_colour_ids"]), CLASSIC_HTV_COLOUR_IDS)
        self.assertEqual(tuple(puff["supported_colour_ids"]), PUFF_HTV_COLOUR_IDS)
        self.assertEqual(tuple(metallic["supported_colour_ids"]), METALLIC_HTV_COLOUR_IDS)
        self.assertEqual(tuple(glow["supported_colour_ids"]), GLOW_HTV_COLOUR_IDS)
        self.assertEqual(tuple(glow["available_colour_ids"]), GLOW_ACTIVE_COLOUR_IDS)
        self.assertNotIn("colour_selection_mode", glitter)
        self.assertEqual(glitter["admin_note"], "keep me")
        self.assertEqual(summary["restricted_profile_count"], 4)
        self.assertEqual(summary["missing"], [])
        self.assertEqual(summary["duplicates"], [])
        self.assertEqual(set(summary["matched"]), set(PROFILE_RANGES))

    def test_reports_missing_profiles_without_restricting_unknown_profiles(self):
        updated, summary = assign_authoritative_htv_profile_colours({
            "method_key": "htv",
            "costing_profiles": [
                {"id": "profile:htv:classic_htv", "display_name": "Classic HTV"},
                {"id": "profile:htv:glitter_htv", "display_name": "Glitter HTV"},
            ],
        })
        self.assertEqual(summary["restricted_profile_count"], 1)
        self.assertEqual(set(summary["missing"]), {"puff_htv", "metallic_htv", "glow_htv"})
        glitter = updated["costing_profiles"][1]
        self.assertNotIn("supported_colour_ids", glitter)


if __name__ == "__main__":
    unittest.main()
