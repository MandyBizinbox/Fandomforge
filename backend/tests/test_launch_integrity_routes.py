import importlib
import os
import sys


def test_server_import_and_authoritative_route_precedence(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "fandomforge_test_import")
    monkeypatch.setenv("JWT_SECRET", "test-secret-that-is-long-enough-for-import-only")
    for name in ["server"]:
        sys.modules.pop(name, None)
    server = importlib.import_module("server")

    first = {}
    for route in server.app.routes:
        for method in getattr(route, "methods", set()):
            first.setdefault((route.path, method), route)

    assert first[("/api/orders/checkout", "POST")].endpoint.__module__ == "launch_integrity.routes"
    assert first[("/api/admin/payout-batches/{batch_id}/send-paystack", "POST")].endpoint.__module__ == "payout_launch_routes"
    assert first[("/api/creator-payouts/profile", "GET")].endpoint.__module__ == "payout_launch_routes"
    assert first[("/api/integrity/health", "GET")].endpoint.__module__ == "launch_integrity.routes"
    assert first[("/api/production-jobs", "GET")].endpoint.__module__ == "launch_integrity.printer_ops"
    assert first[("/api/production-jobs/assign", "POST")].endpoint.__module__ == "launch_integrity.printer_gate_routes"
    assert first[("/api/products", "POST")].endpoint.__module__ == "launch_integrity.safety_routes"
    assert first[("/api/admin/quick-products", "POST")].endpoint.__module__ == "launch_integrity.safety_routes"
    assert first[("/api/products/{product_id}", "DELETE")].endpoint.__module__ == "launch_integrity.safety_routes"
    assert first[("/api/admin/products/{product_id}", "DELETE")].endpoint.__module__ == "launch_integrity.safety_routes"
    assert first[("/api/artworks/upload", "POST")].endpoint.__module__ == "launch_integrity.safety_routes"
    assert first[("/api/admin/wallet-ledger/rebuild", "POST")].endpoint.__module__ == "launch_integrity.financial_gate_routes"
    assert first[("/api/admin/payouts/{payout_id}/paid", "PATCH")].endpoint.__module__ == "launch_integrity.financial_gate_routes"


def test_literal_owner_is_in_frontend_route_source():
    source = open(
        os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "src", "App.js"),
        encoding="utf-8",
    ).read()
    assert '["owner", "super_admin", "admin"]' in source
    assert "includes(role)" in source
    assert 'path="/admin/*"' in source
    assert 'path="/account/plans"' in source
    assert 'path="/admin/review/:ownerType/:ownerId"' in source
