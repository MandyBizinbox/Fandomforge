import asyncio
import hashlib
import hmac
import re
from datetime import date

from payout_launch_routes import (
    _clean_account,
    _clean_bank_code,
    _friday_key,
    _profile_ready,
    _safe_reference,
    _verify_webhook,
)


def test_paystack_reference_is_safe_deterministic_and_attempt_specific():
    first = _safe_reference("batch-123", "item-456", 1)
    repeated = _safe_reference("batch-123", "item-456", 1)
    retry = _safe_reference("batch-123", "item-456", 2)

    assert first == repeated
    assert first != retry
    assert 16 <= len(first) <= 50
    assert re.fullmatch(r"[a-z0-9_-]+", first)


def test_friday_batch_key_is_stable_for_the_same_date():
    friday = date(2026, 7, 24)
    assert _friday_key(friday) == "creator-paystack-friday:2026-07-24"
    assert _friday_key(friday) == _friday_key(friday)


def test_profile_requires_verified_paystack_recipient():
    assert not _profile_ready(None)
    assert not _profile_ready({
        "provider": "paystack",
        "verification_status": "pending_verification",
        "paystack_recipient_code": "RCP_123",
    })
    assert not _profile_ready({
        "provider": "manual_eft",
        "verification_status": "verified",
        "paystack_recipient_code": "RCP_123",
    })
    assert _profile_ready({
        "provider": "paystack",
        "verification_status": "verified",
        "paystack_recipient_code": "RCP_123",
    })


def test_account_and_bank_values_are_normalized():
    assert _clean_account(" 123-456 789 ") == "123456789"
    assert _clean_bank_code(" 632-005 ") == "632005"


def test_paystack_webhook_signature_validation():
    body = b'{"event":"transfer.success"}'
    secret = "sk_test_example"
    signature = hmac.new(secret.encode("utf-8"), body, hashlib.sha512).hexdigest()

    assert asyncio.run(_verify_webhook(body, signature, secret)) is True
    assert asyncio.run(_verify_webhook(body, "invalid", secret)) is False
    assert asyncio.run(_verify_webhook(body, None, secret)) is False
