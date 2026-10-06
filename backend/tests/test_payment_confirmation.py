"""Real handler regressions for authenticated but financially invalid ITNs."""
import asyncio
from copy import deepcopy
from types import SimpleNamespace
from urllib.parse import urlencode

import pytest
from fastapi import HTTPException
from starlette.requests import Request
import routes_main as core


class Collection:
    def __init__(self, document):
        self.document = deepcopy(document)

    async def find_one(self, query, projection=None, **kwargs):
        if all(self.document.get(key) == value for key, value in query.items()):
            return deepcopy(self.document)
        return None

    async def update_one(self, query, update):
        if all(self.document.get(key) == value for key, value in query.items()):
            self.document.update(deepcopy(update.get('$set', {})))


def database(provider='payfast'):
    return SimpleNamespace(
        payments=Collection({'id': 'payment-1', 'provider': provider, 'provider_reference': 'REF1',
                             'order_id': 'order-1', 'amount': 285.0, 'currency': 'ZAR', 'status': 'pending'}),
        orders=Collection({'id': 'order-1', 'total': 285.0, 'currency': 'ZAR',
                           'payment_status': 'pending', 'status': 'pending_payment'}),
    )


def request_for(db, payload):
    body = urlencode(payload).encode()
    async def receive():
        return {'type': 'http.request', 'body': body, 'more_body': False}
    return Request({'type': 'http', 'method': 'POST', 'path': '/api/payments/webhooks/payfast',
                    'headers': [(b'content-type', b'application/x-www-form-urlencoded')],
                    'scheme': 'https', 'server': ('fandomforge.test', 443),
                    'query_string': b'', 'app': SimpleNamespace(state=SimpleNamespace(db=db))}, receive)


@pytest.fixture
def authenticated_gateway(monkeypatch):
    # Replace external verification only; keep local payment handlers real.
    class Gateway:
        async def handle_webhook(self, payload, headers, config, raw_body):
            return {'paid': True, 'status': 'completed', 'reference': 'REF1',
                    'payment_id': 'PF1', 'raw': payload, 'event': 'payfast.complete'}
    async def config(*args, **kwargs):
        return {'key': 'payfast'}
    async def no_external_side_effects(*args, **kwargs):
        return None
    monkeypatch.setattr(core, '_get_gateway_config', config)
    monkeypatch.setattr(core, 'get_payment_gateway_adapter', lambda key: Gateway())
    for name in ('ensure_wallet_transactions_for_order', 'add_order_event', 'queue_customer_order_email'):
        monkeypatch.setattr(core, name, no_external_side_effects)


@pytest.mark.parametrize('amount', ['5.00', '284.99', '285.01', '', 'NaN', 'Infinity', '-285', 'garbage', '1e100', '1e999999'])
def test_payfast_webhook_rejects_invalid_amount_without_financial_writes(authenticated_gateway, amount):
    db = database()
    before_payment = deepcopy(db.payments.document)
    before_order = deepcopy(db.orders.document)
    with pytest.raises(HTTPException) as error:
        asyncio.run(core.gateway_payment_webhook('payfast', request_for(db, {
            'm_payment_id': 'REF1', 'payment_status': 'COMPLETE', 'amount_gross': amount})))
    assert error.value.status_code == 409
    assert db.payments.document == before_payment
    assert db.orders.document == before_order


def test_payfast_webhook_rejects_other_provider_payment(authenticated_gateway):
    db = database(provider='paystack')
    with pytest.raises(HTTPException):
        asyncio.run(core.gateway_payment_webhook('payfast', request_for(db, {
            'm_payment_id': 'REF1', 'payment_status': 'COMPLETE', 'amount_gross': '285.00'})))
    assert db.payments.document['status'] == 'pending'
    assert db.orders.document['payment_status'] == 'pending'


def test_matching_payfast_webhook_marks_order_paid(authenticated_gateway):
    db = database()
    result = asyncio.run(core.gateway_payment_webhook('payfast', request_for(db, {
        'm_payment_id': 'REF1', 'payment_status': 'COMPLETE', 'amount_gross': '285.00'})))
    assert result['processed'] is True
    assert db.payments.document['status'] == 'completed'
    assert db.orders.document['payment_status'] == 'paid'


def test_payfast_verified_underpayment_cannot_mark_order_paid(authenticated_gateway):
    db = database()
    with pytest.raises(HTTPException):
        asyncio.run(core._mark_order_paid_from_payment(db, db.payments.document,
                    {'paid': True, 'amount_gross': 5.0, 'raw': {'amount_gross': '5.00'}}))
    assert db.payments.document['status'] == 'pending'
    assert db.orders.document['payment_status'] == 'pending'


@pytest.mark.parametrize('field,value', [('total', 284.0), ('currency', 'USD')])
def test_payfast_rejects_inconsistent_order_snapshot(authenticated_gateway, field, value):
    db = database()
    db.orders.document[field] = value
    with pytest.raises(HTTPException):
        asyncio.run(core.gateway_payment_webhook('payfast', request_for(db, {
            'm_payment_id': 'REF1', 'payment_status': 'COMPLETE', 'amount_gross': '285.00'})))
    assert db.payments.document['status'] == 'pending'
    assert db.orders.document['payment_status'] == 'pending'


def test_matching_verified_payfast_payment_remains_idempotent(authenticated_gateway):
    db = database()
    payload = {'paid': True, 'amount_gross': 285.0, 'raw': {'Gross': '285.00'}}
    asyncio.run(core._mark_order_paid_from_payment(db, db.payments.document, payload))
    stored = deepcopy(db.orders.document)
    asyncio.run(core._mark_order_paid_from_payment(db, db.payments.document, payload))
    assert db.orders.document['payment_status'] == stored['payment_status'] == 'paid'
    assert db.orders.document['updated_at'] == stored['updated_at']
    assert db.payments.document['status'] == 'completed'


@pytest.mark.parametrize('missing', ['order_id', 'order'])
def test_payfast_verify_cannot_report_paid_without_matching_order(authenticated_gateway, monkeypatch, missing):
    db = database()
    if missing == 'order_id':
        db.payments.document.pop('order_id')
    else:
        db.orders.document['id'] = 'another-order'
    class Gateway:
        async def verify_payment(self, reference, config):
            return {'paid': True, 'amount_gross': 285.0, 'raw': {'Gross': '285.00'}}
    monkeypatch.setattr(core, 'get_payment_gateway_adapter', lambda key: Gateway())
    with pytest.raises(HTTPException) as error:
        asyncio.run(core.verify_payment('REF1', request_for(db, {})))
    assert error.value.status_code == 409
    assert db.payments.document['status'] == 'pending'
    assert db.orders.document['payment_status'] == 'pending'


def test_payfast_verification_uses_original_decimal_evidence(authenticated_gateway):
    db = database()
    with pytest.raises(HTTPException):
        asyncio.run(core._mark_order_paid_from_payment(db, db.payments.document,
                    {'paid': True, 'amount_gross': 285.0, 'raw': {'Gross': '285.000000000000001'}}))
    assert db.payments.document['status'] == 'pending'


@pytest.mark.parametrize('gross', ['285.000000000000001', '1e100', 'garbage'])
def test_real_payfast_history_adapter_cannot_verify_invalid_gross(authenticated_gateway, monkeypatch, gross):
    from payment_gateways.payfast import PayFastPaymentGateway
    db = database()
    class Response:
        status_code = 200
        text = ('Date,Type,Sign,Gross,M Payment ID,PF Payment ID\n'
                f'2026-10-06,FUNDS_RECEIVED,CREDIT,{gross},REF1,PF1\n')
        def json(self):
            raise ValueError('CSV response')
    async def gateway_config(*args, **kwargs):
        return {'mode': 'live', 'settings': {'merchant_id': '10000100', 'merchant_key': 'test', 'passphrase': 'test'}}
    monkeypatch.setattr(core, '_get_gateway_config', gateway_config)
    monkeypatch.setattr(core, 'get_payment_gateway_adapter', lambda key: PayFastPaymentGateway())
    monkeypatch.setattr('payment_gateways.payfast.requests.get', lambda *args, **kwargs: Response())
    with pytest.raises(HTTPException) as error:
        asyncio.run(core.verify_payment('REF1', request_for(db, {})))
    assert error.value.status_code == 409
    assert db.payments.document['status'] == 'pending'
    assert db.orders.document['payment_status'] == 'pending'
