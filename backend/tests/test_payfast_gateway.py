from __future__ import annotations

import asyncio
from urllib.parse import urlencode

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
    payload["signature"] = adapter._itn_signature(payload, "secret-passphrase")
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
    payload["signature"] = adapter._itn_signature(payload, "secret-passphrase")
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
    payload["signature"] = adapter._itn_signature(payload, "secret-passphrase")

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


def test_itn_raw_body_verification_preserves_order_and_encoding():
    adapter = PayFastPaymentGateway()
    data = {
        "m_payment_id": "REF123",
        "item_name": "A+B & C / limited",
        "empty_note": "",
        "payment_status": "COMPLETE",
        "amount_gross": "100.00",
        "merchant_id": "10000100",
    }
    signature = adapter._itn_signature(data, "secret-passphrase")
    raw_body = urlencode({**data, "signature": signature}).encode("utf-8")
    routed = {**data, "signature": signature, "__request_url": "https://fandomforge.co.za/api/payments/webhooks/payfast"}

    assert adapter._verify_signature(routed, config(), raw_body) is True


def test_itn_rejects_modified_fields_after_signature_verification():
    adapter = PayFastPaymentGateway()
    original = {"m_payment_id": "REF123", "amount_gross": "100.00"}
    signed = {**original, "signature": adapter._itn_signature(original, "secret-passphrase")}
    raw_body = urlencode(signed).encode("utf-8")
    mutated = {**signed, "amount_gross": "1.00"}

    assert adapter._verify_signature(mutated, config(), raw_body) is False


def test_itn_rejects_duplicate_signature_fields():
    adapter = PayFastPaymentGateway()
    payload = {"m_payment_id": "REF123", "amount_gross": "100.00"}
    signature = adapter._itn_signature(payload, "secret-passphrase")
    raw_body = (urlencode(payload) + "&signature=" + signature + "&signature=" + signature).encode("utf-8")

    with pytest.raises(PaymentGatewayError, match="form fields"):
        adapter._verify_signature({**payload, "signature": signature}, config(), raw_body)


def test_itn_rejects_invalid_form_encoding():
    adapter = PayFastPaymentGateway()
    with pytest.raises(PaymentGatewayError, match="form encoding"):
        adapter._verify_signature({}, config(), b"m_payment_id=%FF")


def test_itn_rejects_wrong_passphrase():
    adapter = PayFastPaymentGateway()
    payload = {"m_payment_id": "REF123", "amount_gross": "100.00"}
    signature = adapter._itn_signature(payload, "different-passphrase")
    data = {**payload, "signature": signature}
    assert adapter._verify_signature(data, config(), urlencode(data).encode("utf-8")) is False


def test_payfast_itn_includes_blank_values_in_original_field_order():
    adapter = PayFastPaymentGateway()
    fields = {
        "m_payment_id": "REF123",
        "name_first": "",
        "name_last": "",
        "item_name": "Meerkat Camp 2026",
        "payment_status": "COMPLETE",
        "merchant_id": "10000100",
        "amount_gross": "305.00",
    }
    assert "name_first=&name_last=" in adapter._itn_payload_string(fields)
    valid = adapter._itn_signature(fields, "secret-passphrase")
    raw = urlencode({**fields, "signature": valid}).encode("utf-8")
    assert adapter._verify_signature({**fields, "signature": valid}, config(), raw)
    # The old hosted checkout signature deliberately skips empty fields.
    assert valid != adapter._signature(fields, "secret-passphrase")


def test_payfast_itn_without_blank_fields_has_stable_hash():
    adapter = PayFastPaymentGateway()
    fields = {
        "m_payment_id": "REF123",
        "payment_status": "COMPLETE",
        "merchant_id": "10000100",
    }
    assert adapter._itn_signature(fields, "secret-passphrase") == adapter._signature(fields, "secret-passphrase")


def test_itn_rejects_fields_after_signature_and_forged_passphrase():
    adapter = PayFastPaymentGateway()
    fields = {"m_payment_id": "REF123", "merchant_id": "10000100"}
    valid = adapter._itn_signature(fields, "secret-passphrase")
    with pytest.raises(PaymentGatewayError, match="signature position"):
        adapter._verify_signature(
            {**fields, "signature": valid, "extra": "1"},
            config(),
            urlencode({**fields, "signature": valid, "extra": "1"}).encode(),
        )
    with pytest.raises(PaymentGatewayError, match="form fields"):
        adapter._verify_signature(
            {**fields, "passphrase": "attacker", "signature": valid},
            config(),
            urlencode({**fields, "passphrase": "attacker", "signature": valid}).encode(),
        )


def test_itn_confirmation_preserves_blank_fields(monkeypatch):
    adapter = PayFastPaymentGateway()
    fields = {
        "m_payment_id": "REF123",
        "name_first": "",
        "payment_status": "COMPLETE",
        "merchant_id": "10000100",
        "amount_gross": "100.00",
    }
    valid = adapter._itn_signature(fields, "secret-passphrase")
    captured = {}
    class Response:
        status_code = 200
        text = "VALID"
    def fake_post(url, **kwargs):
        captured.update(kwargs)
        return Response()
    monkeypatch.setattr("payment_gateways.payfast.requests.post", fake_post)
    result = asyncio.run(adapter.handle_webhook(
        {**fields, "signature": valid},
        {},
        config(),
        urlencode({**fields, "signature": valid}).encode(),
    ))
    assert result["paid"] is True
    assert "name_first=" in captured["data"]
    assert "signature" not in captured["data"]
