"""Legacy callbacks cannot bypass the authenticated gateway payment handler."""
import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from starlette.requests import Request
from test_payment_confirmation import database, request_for
import routes_main as core


@pytest.mark.parametrize('provider', ['', 'mock', 'typo'])
def test_legacy_mock_or_unknown_provider_cannot_complete_real_payment(monkeypatch, provider):
    db = database()
    request = request_for(db, {'reference': 'REF1', 'payment_status': 'COMPLETE', 'amount_gross': '285.00'})
    request.scope['path'] = '/api/payments/webhook'
    request.scope['query_string'] = f'provider={provider}'.encode() if provider else b''
    async def no_external_side_effects(*args, **kwargs):
        return None
    for name in ('ensure_wallet_transactions_for_order', 'add_order_event', 'queue_customer_order_email'):
        monkeypatch.setattr(core, name, no_external_side_effects)
    with pytest.raises(HTTPException) as error:
        asyncio.run(core.payment_webhook(request))
    assert error.value.status_code == 410
    assert db.payments.document['status'] == 'pending'
    assert db.orders.document['payment_status'] == 'pending'


def test_legacy_payfast_requires_current_gateway_authentication(monkeypatch):
    db = database()
    request = request_for(db, {'reference': 'REF1', 'payment_status': 'COMPLETE', 'amount_gross': '285.00'})
    request.scope['path'] = '/api/payments/webhook'
    request.scope['query_string'] = b'provider=payfast'
    # Old provider abstraction must not decide authenticity anymore.
    monkeypatch.setattr(core, 'get_provider', lambda key: SimpleNamespace(verify_webhook=lambda payload: True))
    async def authenticated_handler(key, actual_request):
        raise HTTPException(status_code=403, detail='Invalid PayFast ITN signature.')
    monkeypatch.setattr(core, 'gateway_payment_webhook', authenticated_handler)
    with pytest.raises(HTTPException) as error:
        asyncio.run(core.payment_webhook(request))
    assert error.value.status_code == 403
    assert db.payments.document['status'] == 'pending'
