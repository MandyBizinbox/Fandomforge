import unittest
from pathlib import Path

import routes_main
from template_lifecycle import template_delete_impact_payload


BACKEND_ROOT = Path(__file__).resolve().parents[1]


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

    def test_delete_impact_route_is_registered_canonically(self):
        matches = [
            route
            for route in routes_main.admin_router.routes
            if getattr(route, "path", None) == "/admin/product-templates/{template_id}/delete-impact"
            and "GET" in (getattr(route, "methods", set()) or set())
        ]
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0].endpoint.__module__, "routes_main")

    def test_runtime_lifecycle_route_installer_is_gone(self):
        self.assertFalse((BACKEND_ROOT / "template_lifecycle_routes.py").exists())

        server_source = (BACKEND_ROOT / "server.py").read_text(encoding="utf-8")
        self.assertNotIn("template_lifecycle_routes", server_source)
        self.assertNotIn("install_template_lifecycle_routes", server_source)


if __name__ == "__main__":
    unittest.main()
