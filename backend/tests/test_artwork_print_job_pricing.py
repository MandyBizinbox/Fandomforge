import unittest

from artwork_print_job_pricing import aggregate_artwork_print_jobs


class ArtworkPrintJobPricingTests(unittest.TestCase):
    def layer(self, layer_id, *, area_cm2, area_id="front-area", profile_id="dtf-transfer", method_key="dtf", calculated_cost=50):
        return {
            "id": layer_id,
            "screen_id": "front-screen",
            "print_area_id": area_id,
            "print_option_id": profile_id,
            "method_key": method_key,
            "original_url": f"/{layer_id}.png",
            "calculation_type": "area_fixed_rate",
            "area_cm2": area_cm2,
            "cost_per_cm2": 0.06,
            "minimum_print_cost": 50,
            "waste_percentage": 0,
            "markup_percentage": 0,
            "calculated_print_cost": calculated_cost,
            "platform_print_cost": calculated_cost,
            "creator_print_price": calculated_cost,
        }

    def test_sums_overlapping_layer_areas(self):
        groups = [{"id": "default-all", "artworks": [
            self.layer("first", area_cm2=875, calculated_cost=52.5),
            self.layer("second", area_cm2=875, calculated_cost=52.5),
        ]}]
        lines = aggregate_artwork_print_jobs(groups)
        self.assertEqual(len(lines), 1)
        self.assertTrue(lines[0]["combined"])
        self.assertEqual(lines[0]["layer_count"], 2)
        self.assertEqual(lines[0]["combined_area_cm2"], 1750)
        self.assertEqual(lines[0]["creator_print_price"], 105)
        self.assertEqual(lines[0]["platform_print_cost"], 105)

    def test_applies_minimum_once(self):
        groups = [{"id": "default-all", "artworks": [
            self.layer("first", area_cm2=35),
            self.layer("second", area_cm2=35),
        ]}]
        lines = aggregate_artwork_print_jobs(groups)
        self.assertEqual(len(lines), 1)
        self.assertEqual(lines[0]["combined_area_cm2"], 70)
        self.assertEqual(lines[0]["creator_print_price"], 50)
        self.assertTrue(lines[0]["costing"]["minimum_print_cost_applied"])

    def test_different_print_areas_remain_separate(self):
        groups = [{"id": "default-all", "artworks": [
            self.layer("front", area_cm2=35, area_id="front-area"),
            self.layer("back", area_cm2=35, area_id="back-area"),
        ]}]
        lines = aggregate_artwork_print_jobs(groups)
        self.assertEqual(len(lines), 2)
        self.assertEqual(sum(line["creator_print_price"] for line in lines), 100)

    def test_different_profiles_remain_separate(self):
        groups = [{"id": "default-all", "artworks": [
            self.layer("standard", area_cm2=35, profile_id="dtf-standard"),
            self.layer("premium", area_cm2=35, profile_id="dtf-premium"),
        ]}]
        self.assertEqual(len(aggregate_artwork_print_jobs(groups)), 2)


if __name__ == "__main__":
    unittest.main()
