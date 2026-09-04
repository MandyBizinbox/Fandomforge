import unittest

from template_lifecycle import template_delete_impact_payload


class TemplateLifecycleImpactTests(unittest.TestCase):
    def test_unlinked_template_can_be_hard_deleted(self):
        impact = template_delete_impact_payload(
            {"id": "template-1", "name": "Blank Tee", "status": "draft"},
            linked_products=0,
            sellable_products=0,
        )
        self.assertEqual(impact["action"], "delete")
        self.assertTrue(impact["can_hard_delete"])
        self.assertFalse(impact["will_archive"])
        self.assertEqual(impact["linked_products"], 0)

    def test_linked_sellable_product_forces_archive(self):
        impact = template_delete_impact_payload(
            {"id": "template-2", "name": "Classic Tee", "status": "active"},
            linked_products=4,
            sellable_products=3,
        )
        self.assertEqual(impact["action"], "archive")
        self.assertFalse(impact["can_hard_delete"])
        self.assertTrue(impact["will_archive"])
        self.assertEqual(impact["sellable_products"], 3)
        self.assertEqual(impact["unpublished_products"], 1)

    def test_any_linked_product_preserves_template_history(self):
        impact = template_delete_impact_payload(
            {"id": "template-3", "name": "Draft Product Blank"},
            linked_products=2,
            sellable_products=0,
        )
        self.assertEqual(impact["action"], "archive")
        self.assertEqual(impact["unpublished_products"], 2)


if __name__ == "__main__":
    unittest.main()
