from __future__ import annotations

import asyncio

import pytest

from payment_gateways.base import PaymentGatewayError
from payment_gateways.payfast import PayFastPaymentGateway


def config(mode="live"):
    return {
        "mode": mode,
        "settings": {
            "merchant_id": "10000100",
            "merchant_key": "merchant-key",
            "passphrase": "secret-passphrase",
        },
    }


def test_internal_route_metadata_is_excluded_from_itn_signature():
    adapter = PayFastPaymentGateway()
    payload = {
        "m_payment_id": "REF123",
        "pf_payment_id": "9988",
        "payment_status": "COMPLETE",
        "amount_gross": "100.00",
        "merchant_id": "10000100",
    }
    payload["signature"] = adapter._signature(payload, "secret-passphrase")
    payload["__request_url"] = "https://fandomforge.co.za/api/payments/webhooks/payfast"

    assert adapter._verify_signature(payload, config()) is True


def test_handle_webhook_requires_server_confirmation(monkeypatch):
    adapter = PayFastPaymentGateway()
    payload = {
        "m_payment_id": "REF123",
        "pf_payment_id": "9988",
        "payment_status": "COMPLETE",
        "amount_gross": "100.00",
        "merchant_id": "10000100",
    }
    payload["signature"] = adapter._signature(payload, "secret-passphrase")
    payload["__request_url"] = "https://fandomforge.co.za/api/payments/webhooks/payfast"

    class Response:
        status_code = 200
        text = "VALID"

    monkeypatch.setattr("payment_gateways.payfast.requests.post", lambda *args, **kwargs: Response())

    result = asyncio.run(adapter.handle_webhook(payload, {}, config()))
    assert result["paid"] is True
    assert result["status"] == "completed"
    assert result["payment_id"] == "9988"
    assert result["amount_gross"] == 100.0


def test_handle_webhook_rejects_failed_server_confirmation(monkeypatch):
    adapter = PayFastPaymentGateway()
    payload = {
        "m_payment_id": "REF123",
        "pf_payment_id": "9988",
        "payment_status": "COMPLETE",
        "amount_gross": "100.00",
        "merchant_id": "10000100",
    }
    payload["signature"] = adapter._signature(payload, "secret-passphrase")

    class Response:
        status_code = 200
        text = "INVALID"

    monkeypatch.setattr("payment_gateways.payfast.requests.post", lambda *args, **kwargs: Response())

    with pytest.raises(PaymentGatewayError, match="rejected the ITN"):
        asyncio.run(adapter.handle_webhook(payload, {}, config()))


def test_verify_payment_reconciles_from_transaction_history(monkeypatch):
    adapter = PayFastPaymentGateway()

    class Response:
        status_code = 200

        def json(self):
            return {
                "response": (
                    "Date,Type,Sign,Gross,M Payment ID,PF Payment ID\n"
                    "2026-08-09 12:00:00,FUNDS_RECEIVED,CREDIT,100.00,REF123,9988\n"
                )
            }

    monkeypatch.setattr("payment_gateways.payfast.requests.get", lambda *args, **kwargs: Response())

    result = asyncio.run(adapter.verify_payment("REF123", config()))
    assert result["paid"] is True
    assert result["status"] == "completed"
    assert result["payment_id"] == "9988"
    assert result["amount_gross"] == 100.0


def test_verify_payment_reconciles_from_raw_csv_transaction_history(monkeypatch):
    adapter = PayFastPaymentGateway()

    class Response:
        status_code = 200
        text = (
            'Date,Type,Sign,Gross,"M Payment ID","PF Payment ID","custom str1"\n'
            '"2026-08-10 12:29:57",FUNDS_RECEIVED,CREDIT,695.00,'
            'mf_e1b87d12-106,320524817,28c2dd69-de2b-4219-9e22-1b8ccdc42380\n'
        )

        def json(self):
            raise ValueError("raw CSV response")

    monkeypatch.setattr("payment_gateways.payfast.requests.get", lambda *args, **kwargs: Response())

    result = asyncio.run(adapter.verify_payment("mf_e1b87d12-106", config()))
    assert result["paid"] is True
    assert result["status"] == "completed"
    assert result["payment_id"] == "320524817"
    assert result["amount_gross"] == 695.0
    assert result["raw"]["custom str1"] == "28c2dd69-de2b-4219-9e22-1b8ccdc42380"


def test_verify_payment_stays_pending_when_reference_is_absent(monkeypatch):
    adapter = PayFastPaymentGateway()

    class Response:
        status_code = 200

        def json(self):
            return {
                "response": (
                    "Date,Type,Sign,Gross,M Payment ID,PF Payment ID\n"
                    "2026-08-09 12:00:00,FUNDS_RECEIVED,CREDIT,100.00,OTHER,9988\n"
                )
            }

    monkeypatch.setattr("payment_gateways.payfast.requests.get", lambda *args, **kwargs: Response())

    result = asyncio.run(adapter.verify_payment("REF123", config()))
    assert result["paid"] is False
    assert result["status"] == "pending"


def test_api_signature_excludes_testing_parameter():
    adapter = PayFastPaymentGateway()
    cfg = config(mode="test")
    values = {
        "merchant-id": "10000100",
        "version": "v1",
        "timestamp": "2026-08-09T12:00:00+02:00",
        "from": "2026-08-01",
        "to": "2026-08-09",
        "testing": "true",
    }

    with_testing = adapter._api_signature(values, cfg)
    without_testing = adapter._api_signature({k: v for k, v in values.items() if k != "testing"}, cfg)
    assert with_testing == without_testing


def test_itn_signature_includes_blank_fields_in_original_order():
    """PayFast signs blank ITN fields; checkout signing still omits them."""
    adapter = PayFastPaymentGateway()
    payload = {
        "m_payment_id": "MF123",
        "pf_payment_id": "123456",
        "payment_status": "COMPLETE",
        "item_name": "FandomForge Tee",
        "item_description": "",
        "amount_gross": "145.00",
        "amount_fee": "-3.00",
        "custom_str1": "",
        "custom_str2": "MF123",
        "name_first": "",
        "name_last": "",
        "merchant_id": "10000100",
    }
    import hashlib
    from urllib.parse import quote_plus
    canonical = "&".join(
        f"{key}={quote_plus(value)}" for key, value in payload.items()
    ) + "&passphrase=secret-passphrase"
    payload["signature"] = hashlib.md5(canonical.encode("utf-8")).hexdigest()
    payload["__request_url"] = "https://fandomforge.co.za/api/payments/webhooks/payfast"

    assert adapter._verify_signature(payload, config()) is True
    assert "item_description=&" in adapter._itn_payload_string(payload)
    assert "name_first=&" in adapter._itn_payload_string(payload)
    assert "__request_url" not in adapter._itn_payload_string(payload)
    assert adapter._signature(payload, "secret-passphrase") != payload["signature"]


def test_itn_rejects_tampered_blank_field_signature():
    adapter = PayFastPaymentGateway()
    payload = {"m_payment_id": "MF123", "custom_str1": "", "merchant_id": "10000100"}
    payload["signature"] = adapter._itn_signature(payload, "secret-passphrase")
    assert adapter._verify_signature(payload, config()) is True
    payload["custom_str1"] = "altered"
    assert adapter._verify_signature(payload, config()) is False
