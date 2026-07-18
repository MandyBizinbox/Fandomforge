"""Strictly isolated registration of the in-process mock checkout provider."""
from __future__ import annotations

import os
from typing import Any


MOCK_GATEWAY = {
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


def _e2e_enabled() -> bool:
    return (
        os.environ.get("E2E_TEST_MODE") == "1"
        and os.environ.get("ENVIRONMENT", "development").lower() != "production"
        and os.environ.get("DB_NAME", "").startswith("fandomforge_e2e_")
    )


def install_e2e_mock_gateway(core: Any) -> None:
    if not _e2e_enabled():
        raise RuntimeError("Refusing to register mock checkout gateway outside isolated E2E mode")
    if getattr(core, "_e2e_mock_gateway_installed", False):
        return
    original = core._default_payment_gateways

    def defaults_with_mock():
        return {**original(), "mock": dict(MOCK_GATEWAY)}

    core._default_payment_gateways = defaults_with_mock
    core._e2e_mock_gateway_installed = True
