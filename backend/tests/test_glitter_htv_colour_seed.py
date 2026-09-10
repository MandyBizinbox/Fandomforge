import unittest

from glitter_htv_colour_seed import (
    GLITTER_HTV_COLOUR_IDS,
    GLITTER_HTV_COLOURS,
    assign_glitter_profile_colours,
    merge_colour_pool,
)


class GlitterHtvColourSeedTests(unittest.TestCase):
    def test_supplier_chart_contains_22_unique_glitter_colours(self):
        self.assertEqual(len(GLITTER_HTV_COLOURS), 22)
        self.assertEqual(len(set(GLITTER_HTV_COLOUR_IDS)), 22)
        self.assertIn("glitter_aqua", GLITTER_HTV_COLOUR_IDS)
        self.assertIn("glitter_black", GLITTER_HTV_COLOUR_IDS)
        self.assertIn("glitter_blue_aqua", GLITTER_HTV_COLOUR_IDS)
        self.assertIn("glitter_white_stardust", GLITTER_HTV_COLOUR_IDS)

    def test_every_id_is_finish_specific(self):
        self.assertTrue(all(colour_id.startswith("glitter_") for colour_id in GLITTER_HTV_COLOUR_IDS))
        self.assertNotIn("black", GLITTER_HTV_COLOUR_IDS)
        self.assertNotIn("red", GLITTER_HTV_COLOUR_IDS)
        self.assertNotIn("gold", GLITTER_HTV_COLOUR_IDS)

    def test_merge_preserves_custom_and_existing_method_colours(self):
        merged = merge_colour_pool([
            {"id": "black", "name": "Black", "hex": "#000000", "active": True},
            {"id": "glitter_black", "name": "Old Glitter Black", "hex": "#222222", "aliases": ["legacy glitter black"]},
            {"id": "custom_glitter", "name": "Custom Glitter", "hex": "#123456", "active": True},
        ])
        by_id = {row["id"]: row for row in merged}
        self.assertEqual(by_id["black"]["name"], "Black")
        self.assertEqual(by_id["glitter_black"]["name"], "Glitter Black")
        self.assertEqual(by_id["glitter_black"]["hex"], "#111111")
        self.assertIn("legacy glitter black", by_id["glitter_black"]["aliases"])
        self.assertEqual(by_id["custom_glitter"]["name"], "Custom Glitter")
        self.assertEqual(len(merged), 24)

    def test_only_glitter_profile_receives_the_supplier_range(self):
        method = {
            "method_key": "HTV",
            "supported_colours": {"mode": "restricted_library", "colours": []},
            "costing_profiles": [
                {
                    "id": "profile:htv:classic_htv",
                    "display_name": "Classic HTV",
                    "supported_colour_ids": ["black"],
                },
                {
                    "id": "profile:htv:glitter_htv",
                    "display_name": "Glitter HTV",
                    "outsourced_rate_profile_key": "glitter_htv",
                },
            ],
        }
        updated, matched = assign_glitter_profile_colours(method)
        self.assertTrue(matched)
        classic, glitter = updated["costing_profiles"]
        self.assertEqual(classic["supported_colour_ids"], ["black"])
        self.assertEqual(glitter["colour_selection_mode"], "restricted")
        self.assertEqual(tuple(glitter["supported_colour_ids"]), GLITTER_HTV_COLOUR_IDS)
        self.assertEqual(tuple(glitter["available_colour_ids"]), GLITTER_HTV_COLOUR_IDS)
        self.assertEqual(len(updated["supported_colours"]["colours"]), 22)


if __name__ == "__main__":
    unittest.main()
