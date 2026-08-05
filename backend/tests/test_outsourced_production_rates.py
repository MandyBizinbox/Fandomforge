import unittest

# Applies financial half-up rounding and clears legacy fixed defaults before the
# pure costing functions are exercised, matching the live server import order.
import outsourced_rate_runtime_patch  # noqa: F401

from artwork_print_job_pricing import aggregate_artwork_print_jobs
from outsourced_production_rates import (
    EXPECTED_PROFILE_KEYS,
    RATE_SPECS,
    calculate_outsourced_area_cost,
    pricing_values_for_record,
    profile_key_for_record,
    rate_catalog,
)


class OutsourcedProductionRateTests(unittest.TestCase):
    def test_standard_dtf_screenshot_example(self):
        pricing = pricing_values_for_record({
            "method_key": "dtf",
            "rule_name": "Standard DTF",
        })
        result = calculate_outsourced_area_cost(618.3, pricing)

        self.assertEqual(result["actual_area_cm2"], 618.3)
        self.assertEqual(result["chargeable_area_cm2"], 618.3)
        self.assertEqual(result["material_cost"], 43.28)
        self.assertEqual(result["application_cost"], 7.5)
        self.assertEqual(result["production_subtotal_before_markup"], 50.78)
        self.assertEqual(result["markup_amount"], 2.54)
        self.assertEqual(result["calculated_print_cost"], 53.32)

    def test_uses_100_square_centimetre_minimum_area(self):
        pricing = pricing_values_for_record({
            "method_key": "dtf",
            "rule_name": "DTF Transfer",
        })
        result = calculate_outsourced_area_cost(50, pricing)

        self.assertTrue(result["minimum_area_applied"])
        self.assertEqual(result["chargeable_area_cm2"], 100)
        self.assertEqual(result["material_cost"], 7)
        self.assertEqual(result["application_cost"], 7.5)
        self.assertEqual(result["calculated_print_cost"], 15.23)

    def test_profile_matching_keeps_variants_separate(self):
        examples = {
            "UV DTF Transfer": "uv_dtf",
            "Mug Sublimation": "mug_sublimation",
            "Tumbler Sublimation": "tumbler_sublimation",
            "Flat Sublimation": "flat_sublimation",
            "HTV Glitter": "glitter_htv",
            "HTV 3D Puff": "puff_htv",
            "HTV Metallic": "metallic_htv",
            "HTV Glow in the Dark": "glow_htv",
            "HTV Classic": "classic_htv",
            "Classic Adhesive Vinyl": "classic_adhesive_vinyl",
        }
        methods = {
            "uv_dtf": "uv_dtf",
            "mug_sublimation": "sublimation",
            "tumbler_sublimation": "sublimation",
            "flat_sublimation": "sublimation",
            "glitter_htv": "htv",
            "puff_htv": "htv",
            "metallic_htv": "htv",
            "glow_htv": "htv",
            "classic_htv": "htv",
            "classic_adhesive_vinyl": "adhesive_vinyl",
        }
        for label, expected in examples.items():
            with self.subTest(label=label):
                method = methods[expected]
                self.assertEqual(
                    profile_key_for_record({
                        "method_key": method,
                        "rule_name": label,
                    }),
                    expected,
                )

        self.assertIsNone(profile_key_for_record({
            "method_key": "adhesive_vinyl",
            "rule_name": "Frosted Adhesive Vinyl",
        }))

    def test_catalog_has_every_approved_profile(self):
        catalog = rate_catalog()
        self.assertEqual(
            {row["profile_key"] for row in catalog},
            set(EXPECTED_PROFILE_KEYS),
        )
        self.assertEqual(RATE_SPECS["standard_dtf"]["cost_per_cm2"], 0.07)
        self.assertEqual(RATE_SPECS["uv_dtf"]["cost_per_cm2"], 0.077)

    def test_combined_job_applies_minimum_and_application_once(self):
        common = {
            "screen_id": "front-screen",
            "print_area_id": "front-area",
            "print_option_id": "dtf-standard",
            "method_key": "dtf",
            "calculation_type": "area_fixed_rate",
            "cost_per_cm2": 0.07,
            "minimum_area_cm2": 100,
            "application_cost": 7.5,
            "minimum_print_cost": 0,
            "waste_percentage": 0,
            "markup_percentage": 5,
        }
        groups = [{
            "id": "default-all",
            "artworks": [
                {**common, "id": "first", "original_url": "/first.png", "area_cm2": 40},
                {**common, "id": "second", "original_url": "/second.png", "area_cm2": 30},
            ],
        }]
        lines = aggregate_artwork_print_jobs(groups)

        self.assertEqual(len(lines), 1)
        self.assertTrue(lines[0]["combined"])
        self.assertEqual(lines[0]["combined_area_cm2"], 70)
        self.assertEqual(lines[0]["chargeable_area_cm2"], 100)
        self.assertEqual(lines[0]["application_cost"], 7.5)
        self.assertEqual(lines[0]["calculated_print_cost"], 15.23)

    def test_different_print_areas_receive_separate_application_costs(self):
        common = {
            "screen_id": "screen",
            "print_option_id": "dtf-standard",
            "method_key": "dtf",
            "calculation_type": "area_fixed_rate",
            "cost_per_cm2": 0.07,
            "minimum_area_cm2": 100,
            "application_cost": 7.5,
            "minimum_print_cost": 0,
            "markup_percentage": 5,
        }
        groups = [{
            "id": "default-all",
            "artworks": [
                {**common, "id": "front", "print_area_id": "front", "original_url": "/front.png", "area_cm2": 50},
                {**common, "id": "back", "print_area_id": "back", "original_url": "/back.png", "area_cm2": 50},
            ],
        }]
        lines = aggregate_artwork_print_jobs(groups)

        self.assertEqual(len(lines), 2)
        self.assertEqual(sum(line["application_cost"] for line in lines), 15)
        self.assertEqual(sum(line["calculated_print_cost"] for line in lines), 30.46)


if __name__ == "__main__":
    unittest.main()
