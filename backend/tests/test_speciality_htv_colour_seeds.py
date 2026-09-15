import unittest

from metallic_htv_colour_seed import (
    METALLIC_HTV_COLOUR_IDS,
    METALLIC_HTV_COLOURS,
    assign_metallic_profile_colours,
    merge_colour_pool as merge_metallic_pool,
)
from glow_htv_colour_seed import (
    GLOW_ACTIVE_COLOUR_IDS,
    GLOW_HTV_COLOUR_IDS,
    GLOW_HTV_COLOURS,
    assign_glow_profile_colours,
    merge_colour_pool as merge_glow_pool,
)


class SpecialityHtvColourSeedTests(unittest.TestCase):
    def test_metallic_chart_contains_six_profile_specific_colours(self):
        self.assertEqual(len(METALLIC_HTV_COLOURS), 6)
        self.assertEqual(len(set(METALLIC_HTV_COLOUR_IDS)), 6)
        self.assertIn("metallic_red", METALLIC_HTV_COLOUR_IDS)
        self.assertIn("metallic_silver_chrome", METALLIC_HTV_COLOUR_IDS)
        self.assertNotIn("red", METALLIC_HTV_COLOUR_IDS)
        self.assertNotIn("silver", METALLIC_HTV_COLOUR_IDS)

    def test_metallic_profile_is_restricted_without_touching_puff(self):
        method = {
            "method_key": "htv",
            "supported_colours": {"mode": "restricted_library", "colours": []},
            "costing_profiles": [
                {
                    "id": "profile:htv:metallic_htv",
                    "display_name": "Metallic HTV",
                    "outsourced_rate_profile_key": "metallic_htv",
                    "status": "active",
                },
                {
                    "id": "profile:htv:puff_htv",
                    "display_name": "Puff HTV",
                    "outsourced_rate_profile_key": "puff_htv",
                    "status": "active",
                    "supported_colour_ids": ["black", "mirror_black"],
                },
            ],
        }
        updated, matched = assign_metallic_profile_colours(method)
        self.assertTrue(matched)
        metallic, puff = updated["costing_profiles"]
        self.assertEqual(tuple(metallic["supported_colour_ids"]), METALLIC_HTV_COLOUR_IDS)
        self.assertEqual(puff["supported_colour_ids"], ["black", "mirror_black"])

    def test_glow_chart_contains_six_colours_with_fluo_pink_sold_out(self):
        self.assertEqual(len(GLOW_HTV_COLOURS), 6)
        self.assertEqual(len(set(GLOW_HTV_COLOUR_IDS)), 6)
        self.assertEqual(len(GLOW_ACTIVE_COLOUR_IDS), 5)
        by_id = {row["id"]: row for row in GLOW_HTV_COLOURS}
        self.assertFalse(by_id["glow_fluo_pink"]["active"])
        self.assertEqual(by_id["glow_fluo_pink"]["availability_status"], "sold_out")
        self.assertNotIn("glow_fluo_pink", GLOW_ACTIVE_COLOUR_IDS)

    def test_glow_profile_tracks_supported_and_currently_available_colours(self):
        method = {
            "method_key": "htv",
            "supported_colours": {"mode": "restricted_library", "colours": []},
            "costing_profiles": [
                {
                    "id": "profile:htv:glow_htv",
                    "display_name": "Glow HTV",
                    "outsourced_rate_profile_key": "glow_htv",
                    "status": "active",
                },
                {
                    "id": "profile:htv:classic_htv",
                    "display_name": "Classic HTV",
                    "outsourced_rate_profile_key": "classic_htv",
                    "status": "active",
                    "supported_colour_ids": ["black", "white"],
                },
            ],
        }
        updated, matched = assign_glow_profile_colours(method)
        self.assertTrue(matched)
        glow, classic = updated["costing_profiles"]
        self.assertEqual(tuple(glow["supported_colour_ids"]), GLOW_HTV_COLOUR_IDS)
        self.assertEqual(tuple(glow["available_colour_ids"]), GLOW_ACTIVE_COLOUR_IDS)
        self.assertEqual(classic["supported_colour_ids"], ["black", "white"])

    def test_pool_merges_preserve_custom_entries(self):
        metallic = merge_metallic_pool([
            {"id": "custom_teal", "name": "Custom Teal", "hex": "#008080", "active": True},
        ])
        glow = merge_glow_pool(metallic)
        ids = {row["id"] for row in glow}
        self.assertIn("custom_teal", ids)
        self.assertTrue(set(METALLIC_HTV_COLOUR_IDS).issubset(ids))
        self.assertTrue(set(GLOW_HTV_COLOUR_IDS).issubset(ids))


if __name__ == "__main__":
    unittest.main()
