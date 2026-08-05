import unittest

from puff_htv_colour_seed import (
    PUFF_HTV_COLOUR_IDS,
    PUFF_HTV_COLOURS,
    PUFF_MIRROR_COLOUR_IDS,
    PUFF_STANDARD_COLOUR_IDS,
    assign_puff_profile_colours,
    merge_colour_pool,
)


class PuffHtvColourSeedTests(unittest.TestCase):
    def test_supplier_chart_contains_16_unique_colours(self):
        self.assertEqual(len(PUFF_HTV_COLOURS), 16)
        self.assertEqual(len(set(PUFF_HTV_COLOUR_IDS)), 16)
        self.assertEqual(len(PUFF_STANDARD_COLOUR_IDS), 9)
        self.assertEqual(len(PUFF_MIRROR_COLOUR_IDS), 7)

    def test_normal_and_mirror_colours_remain_distinct(self):
        self.assertIn("black", PUFF_HTV_COLOUR_IDS)
        self.assertIn("mirror_black", PUFF_HTV_COLOUR_IDS)
        self.assertIn("red", PUFF_HTV_COLOUR_IDS)
        self.assertIn("mirror_red", PUFF_HTV_COLOUR_IDS)
        self.assertNotEqual("black", "mirror_black")
        self.assertNotEqual("red", "mirror_red")

    def test_merge_preserves_existing_shared_colours_and_custom_entries(self):
        merged = merge_colour_pool([
            {"id": "black", "name": "Black", "hex": "#000000", "aliases": ["legacy black"]},
            {"id": "custom_teal", "name": "Custom Teal", "hex": "#008080", "active": True},
        ])
        by_id = {row["id"]: row for row in merged}
        self.assertEqual(by_id["black"]["name"], "Black")
        self.assertIn("legacy black", by_id["black"]["aliases"])
        self.assertEqual(by_id["mirror_black"]["name"], "Mirror Black")
        self.assertEqual(by_id["custom_teal"]["name"], "Custom Teal")
        self.assertEqual(len(merged), 17)

    def test_puff_profile_is_restricted_without_changing_other_profiles(self):
        method = {
            "method_key": "htv",
            "supported_colours": {
                "mode": "restricted_library",
                "colours": [{"id": "black", "name": "Black", "hex": "#000000"}],
            },
            "costing_profiles": [
                {
                    "id": "profile:htv:puff_htv",
                    "display_name": "Puff HTV",
                    "outsourced_rate_profile_key": "puff_htv",
                    "status": "active",
                },
                {
                    "id": "profile:htv:metallic_htv",
                    "display_name": "Metallic HTV",
                    "outsourced_rate_profile_key": "metallic_htv",
                    "status": "active",
                    "supported_colour_ids": ["gold", "silver"],
                },
            ],
        }
        updated, matched = assign_puff_profile_colours(method)
        self.assertTrue(matched)
        puff, metallic = updated["costing_profiles"]
        self.assertEqual(puff["colour_selection_mode"], "restricted")
        self.assertEqual(tuple(puff["supported_colour_ids"]), PUFF_HTV_COLOUR_IDS)
        self.assertEqual(metallic["supported_colour_ids"], ["gold", "silver"])
        pool_ids = {row["id"] for row in updated["supported_colours"]["colours"]}
        self.assertTrue(set(PUFF_HTV_COLOUR_IDS).issubset(pool_ids))


if __name__ == "__main__":
    unittest.main()
