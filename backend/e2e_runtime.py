"""Canonical non-production E2E runtime policy.

This module is dependency-neutral so server startup, route defaults and E2E-only
support code can share one isolation predicate without runtime monkey-patching.
"""
from __future__ import annotations

import os
from typing import Dict, Mapping


MOCK_PAYMENT_GATEWAY = {
    "key": "mock",
    "enabled": True,
    "display_name": "Mock Payment — E2E Only",
    "description": "Synthetic checkout provider for isolated browser acceptance.",
    "mode": "test",
    "sort_order": 1,
    "public_config": {},
    "settings": {},
    "secret_configured": False,
}


def e2e_enabled() -> bool:
    """Return true only for the isolated disposable E2E environment."""
    return (
        os.environ.get("E2E_TEST_MODE") == "1"
        and os.environ.get("ENVIRONMENT", "development").lower() != "production"
        and os.environ.get("DB_NAME", "").startswith("fandomforge_e2e_")
    )


def with_e2e_mock_gateway(defaults: Mapping[str, dict]) -> Dict[str, dict]:
    """Return payment defaults plus the synthetic gateway only in isolated E2E."""
    gateways = {key: dict(value) for key, value in defaults.items()}
    if e2e_enabled():
        gateways["mock"] = dict(MOCK_PAYMENT_GATEWAY)
    return gateways
