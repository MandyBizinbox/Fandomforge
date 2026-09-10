import unittest

from classic_htv_colour_seed import (
    CLASSIC_HTV_COLOUR_IDS,
    CLASSIC_HTV_COLOURS,
    assign_classic_profile_colours,
    merge_colour_pool,
)


class ClassicHtvColourSeedTests(unittest.TestCase):
    def test_supplier_chart_contains_33_unique_colours(self):
        self.assertEqual(len(CLASSIC_HTV_COLOURS), 33)
        self.assertEqual(len(set(CLASSIC_HTV_COLOUR_IDS)), 33)
        self.assertIn("black", CLASSIC_HTV_COLOUR_IDS)
        self.assertIn("rose_gold", CLASSIC_HTV_COLOUR_IDS)
        self.assertIn("yellow_neon", CLASSIC_HTV_COLOUR_IDS)

    def test_merge_preserves_custom_colours_and_updates_existing_ids(self):
        merged = merge_colour_pool([
            {"id": "black", "name": "Old Black", "hex": "#111111", "aliases": ["legacy black"]},
            {"id": "custom_teal", "name": "Custom Teal", "hex": "#008080", "active": True},
        ])
        by_id = {row["id"]: row for row in merged}
        self.assertEqual(by_id["black"]["name"], "Black")
        self.assertEqual(by_id["black"]["hex"], "#000000")
        self.assertIn("legacy black", by_id["black"]["aliases"])
        self.assertEqual(by_id["custom_teal"]["name"], "Custom Teal")
        self.assertEqual(len(merged), 34)

    def test_classic_profile_is_restricted_without_changing_specialist_profiles(self):
        method = {
            "method_key": "htv",
            "supported_colours": {"mode": "restricted_library", "colours": []},
            "costing_profiles": [
                {
                    "id": "profile:htv:classic_htv",
                    "display_name": "Classic HTV",
                    "outsourced_rate_profile_key": "classic_htv",
                    "status": "active",
                },
                {
                    "id": "profile:htv:glitter_htv",
                    "display_name": "Glitter HTV",
                    "outsourced_rate_profile_key": "glitter_htv",
                    "status": "active",
                    "supported_colour_ids": ["silver"],
                },
            ],
        }
        updated, matched = assign_classic_profile_colours(method)
        self.assertTrue(matched)
        classic, glitter = updated["costing_profiles"]
        self.assertEqual(classic["colour_selection_mode"], "restricted")
        self.assertEqual(tuple(classic["supported_colour_ids"]), CLASSIC_HTV_COLOUR_IDS)
        self.assertEqual(glitter["supported_colour_ids"], ["silver"])
        self.assertEqual(len(updated["supported_colours"]["colours"]), 33)


if __name__ == "__main__":
    unittest.main()
