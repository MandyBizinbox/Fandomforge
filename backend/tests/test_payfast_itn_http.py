"""HTTP-level PayFast ITN regression, fully isolated from production.

Uses an in-memory ASGI application, a fake payment collection and a mocked
PayFast validation service. Never imports the production FastAPI server,
connects to MongoDB, calls PayFast, or sends email.
"""
from __future__ import annotations

import hashlib
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch
from urllib.parse import quote_plus, urlencode

import httpx
import pytest
from fastapi import FastAPI

import routes_main
from payment_gateways.payfast import PayFastPaymentGateway


@pytest.fixture
def anyio_backend():
    return "asyncio"


def _signed_itn():
    fields = [
        ("m_payment_id", "test-reference-001"),
        ("pf_payment_id", "test-provider-001"),
        ("payment_status", "COMPLETE"),
        ("item_name", "FandomForge test order"),
        ("item_description", ""),
        ("amount_gross", "145.00"),
        ("custom_str1", ""),
        ("custom_str2", "MF-TEST-001"),
        ("name_first", ""),
        ("name_last", ""),
        ("merchant_id", "10000100"),
    ]
    # Independent signature fixture: do not use the adapter under test to sign.
    canonical = "&".join(f"{key}={quote_plus(value)}" for key, value in fields)
    signature = hashlib.md5((canonical + "&passphrase=test-passphrase").encode()).hexdigest()
    return urlencode([*fields, ("signature", signature)]).encode()


@pytest.fixture
def isolated_app():
    app = FastAPI()
    app.include_router(routes_main.payments_router, prefix="/api")

    payments = SimpleNamespace(
        find_one=AsyncMock(return_value=None),
        update_one=AsyncMock(),
        insert_one=AsyncMock(),
    )
    app.state.db = SimpleNamespace(payments=payments)
    return app


@pytest.mark.anyio
async def test_valid_signed_blank_field_itn_reaches_http_endpoint_without_db_writes(isolated_app):
    config = {
        "mode": "live",
        "settings": {
            "merchant_id": "10000100",
            "merchant_key": "test-only-merchant-key",
            "passphrase": "test-passphrase",
        },
    }
    adapter = PayFastPaymentGateway()
    confirm = Mock(return_value=None)
    body = _signed_itn()

    with (
        patch.object(routes_main, "_get_gateway_config", new=AsyncMock(return_value=config)),
        patch.object(routes_main, "get_payment_gateway_adapter", return_value=adapter),
        patch.object(adapter, "_verify_server_confirmation", confirm),
    ):
        transport = httpx.ASGITransport(app=isolated_app)
        async with httpx.AsyncClient(transport=transport, base_url="http://isolated.invalid") as client:
            response = await client.post(
                "/api/payments/webhooks/payfast",
                content=body,
                headers={"content-type": "application/x-www-form-urlencoded"},
            )

    assert response.status_code == 200, response.text
    assert response.json()["status"] == "payment_not_found"
    confirm.assert_called_once()
    passed_payload = confirm.call_args.args[0]
    assert passed_payload["item_description"] == ""
    assert passed_payload["name_first"] == ""
    assert passed_payload["custom_str1"] == ""
    isolated_app.state.db.payments.update_one.assert_not_awaited()
    isolated_app.state.db.payments.insert_one.assert_not_awaited()


@pytest.mark.anyio
async def test_tampered_itn_gets_403_before_server_confirmation(isolated_app):
    config = {
        "mode": "live",
        "settings": {
            "merchant_id": "10000100",
            "merchant_key": "test-only-merchant-key",
            "passphrase": "test-passphrase",
        },
    }
    adapter = PayFastPaymentGateway()
    confirm = Mock(return_value=None)
    body = _signed_itn().replace(b"amount_gross=145.00", b"amount_gross=999.00")

    with (
        patch.object(routes_main, "_get_gateway_config", new=AsyncMock(return_value=config)),
        patch.object(routes_main, "get_payment_gateway_adapter", return_value=adapter),
        patch.object(adapter, "_verify_server_confirmation", confirm),
    ):
        transport = httpx.ASGITransport(app=isolated_app)
        async with httpx.AsyncClient(transport=transport, base_url="http://isolated.invalid") as client:
            response = await client.post(
                "/api/payments/webhooks/payfast",
                content=body,
                headers={"content-type": "application/x-www-form-urlencoded"},
            )

    assert response.status_code == 403
    confirm.assert_not_called()
    isolated_app.state.db.payments.update_one.assert_not_awaited()
    isolated_app.state.db.payments.insert_one.assert_not_awaited()
