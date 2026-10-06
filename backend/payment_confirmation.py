"""Validate PayFast financial evidence before order/payment state mutations."""
from decimal import Decimal, InvalidOperation

from fastapi import HTTPException


def _money(value):
    try:
        amount = Decimal(str(value))
        valid = amount.is_finite() and amount > 0 and amount == amount.quantize(Decimal('0.01'))
    except (InvalidOperation, TypeError, ValueError):
        raise HTTPException(status_code=409, detail='Invalid PayFast confirmation amount.')
    if not valid:
        raise HTTPException(status_code=409, detail='Invalid PayFast confirmation amount.')
    return amount


def validate_payment_confirmation(payment: dict, order: dict, provider_payload: dict) -> None:
    """Fail closed for PayFast; other gateways retain their existing behaviour.

    Webhooks supply amount_gross directly. Transaction-history verification
    returns it directly and retains the original provider row under raw.
    """
    if str(payment.get('provider') or '').lower() != 'payfast':
        return
    if not order or order.get('id') != payment.get('order_id'):
        raise HTTPException(status_code=409, detail='PayFast confirmation has no matching order.')
    payload = provider_payload if isinstance(provider_payload, dict) else {}
    raw = payload.get('raw') if isinstance(payload.get('raw'), dict) else {}
    # Preserve exact provider decimals before the adapter's float conversion.
    amount = raw.get('amount_gross')
    if amount is None:
        amount = raw.get('Gross')
        if isinstance(amount, str):
            amount = amount.replace(',', '')
    if amount is None:
        amount = payload.get('amount_gross')
    expected = _money(payment.get('amount'))
    if _money(amount) != expected or _money(order.get('total')) != expected:
        raise HTTPException(status_code=409, detail='PayFast paid amount does not match the order total.')
    # PayFast shop payments are ZAR. Reject inconsistent local financial data.
    for value in (payment.get('currency') or 'ZAR', order.get('currency') or 'ZAR',
                  (order.get('financial_snapshot') or {}).get('currency') or 'ZAR'):
        if str(value).upper() != 'ZAR':
            raise HTTPException(status_code=409, detail='PayFast confirmation currency does not match the order.')
