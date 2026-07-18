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

    checkout = first[("/api/orders/checkout", "POST")]
    assert checkout.endpoint.__module__ == "launch_integrity.routes"

    payout = first[("/api/admin/payout-batches/{batch_id}/send-paystack", "POST")]
    assert payout.endpoint.__module__ == "payout_launch_routes"

    creator_profile = first[("/api/creator-payouts/profile", "GET")]
    assert creator_profile.endpoint.__module__ == "payout_launch_routes"

    integrity_health = first[("/api/integrity/health", "GET")]
    assert integrity_health.endpoint.__module__ == "launch_integrity.routes"

    production_jobs = first[("/api/production-jobs", "GET")]
    assert production_jobs.endpoint.__module__ == "launch_integrity.printer_ops"


def test_literal_owner_is_in_frontend_route_source():
    source = open(
        os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "src", "App.js"),
        encoding="utf-8",
    ).read()
    assert '["owner", "super_admin", "admin"]' in source
    assert 'includes(role)' in source
    assert 'path="/admin/*"' in source
    assert 'path="/account/plans"' in source
