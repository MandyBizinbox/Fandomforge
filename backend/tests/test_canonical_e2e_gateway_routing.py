"""Regressions for canonical isolated E2E payment-gateway routing."""

from pathlib import Path

import e2e_runtime
import e2e_support
import routes_main


BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _set_isolated_e2e(monkeypatch):
    monkeypatch.setenv("E2E_TEST_MODE", "1")
    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.setenv("DB_NAME", "fandomforge_e2e_gateway_test")


def test_e2e_support_uses_canonical_runtime_predicate():
    assert e2e_support.e2e_enabled is e2e_runtime.e2e_enabled


def test_mock_gateway_is_included_only_for_isolated_e2e(monkeypatch):
    _set_isolated_e2e(monkeypatch)
    gateways = routes_main._default_payment_gateways()

    assert gateways["mock"] == e2e_runtime.MOCK_PAYMENT_GATEWAY
    assert gateways["mock"] is not e2e_runtime.MOCK_PAYMENT_GATEWAY


def test_mock_gateway_is_absent_without_e2e_flag(monkeypatch):
    monkeypatch.delenv("E2E_TEST_MODE", raising=False)
    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.setenv("DB_NAME", "fandomforge_e2e_gateway_test")

    assert "mock" not in routes_main._default_payment_gateways()


def test_mock_gateway_is_refused_in_production(monkeypatch):
    monkeypatch.setenv("E2E_TEST_MODE", "1")
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("DB_NAME", "fandomforge_e2e_gateway_test")

    assert "mock" not in routes_main._default_payment_gateways()


def test_mock_gateway_requires_disposable_e2e_database(monkeypatch):
    monkeypatch.setenv("E2E_TEST_MODE", "1")
    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.setenv("DB_NAME", "fandomforge")

    assert "mock" not in routes_main._default_payment_gateways()


def test_runtime_gateway_patch_is_gone():
    assert not (BACKEND_ROOT / "e2e_gateway_patch.py").exists()

    server_source = (BACKEND_ROOT / "server.py").read_text(encoding="utf-8")
    assert "e2e_gateway_patch" not in server_source
    assert "install_e2e_mock_gateway" not in server_source
