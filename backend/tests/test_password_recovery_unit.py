"""Security invariants for FandomForge password recovery."""
from datetime import timedelta

from password_recovery import TOKEN_LIFETIME, _digest, _password_valid


def test_reset_token_not_stored_plaintext():
    token = "random-secret-just-for-test"
    assert token != _digest(token)
    assert len(_digest(token)) == 64


def test_password_policy():
    assert _password_valid("CorrectHorse123")
    assert not _password_valid("short1")
    assert not _password_valid("letterswithoutnumbers")
    assert not _password_valid("123456789123456")
    assert not _password_valid("a" * 71 + "1" + "🎉")


def test_reset_lifetime():
    assert TOKEN_LIFETIME == timedelta(minutes=30)


def test_utf8_password_byte_limit():
    assert _password_valid("abc123456789")
    assert not _password_valid("abc123456789" + "🎉" * 16)


def test_token_hash_deterministic():
    assert _digest("one") == _digest("one")
    assert _digest("one") != _digest("two")


def test_auth_version_is_embedded_in_new_tokens():
    from auth import create_token, decode_token

    token = create_token("user-1", "test@example.com", "buyer", auth_version=3)
    payload = decode_token(token)
    assert payload["sub"] == "user-1"
    assert payload["auth_version"] == 3


def test_reset_invalidates_old_session_and_accepts_new_session():
    import asyncio
    from types import SimpleNamespace
    from unittest.mock import AsyncMock
    import pytest
    from fastapi import HTTPException
    from fastapi.security import HTTPAuthorizationCredentials
    from auth import create_token, get_current_user
    from models import User

    user = User(email="test@example.com", name="Password Reset Test", role="buyer")
    doc = user.model_dump()
    doc["auth_version"] = 1
    doc["password_hash"] = "irrelevant-test-only"
    db = SimpleNamespace(users=SimpleNamespace(find_one=AsyncMock(return_value=doc)))
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(db=db)), state=SimpleNamespace())

    async def validate(version):
        bearer = HTTPAuthorizationCredentials(
            scheme="Bearer",
            credentials=create_token(user.id, user.email, user.role, auth_version=version),
        )
        return await get_current_user(request, bearer)

    async def scenario():
        with pytest.raises(HTTPException) as old:
            await validate(0)
        assert old.value.status_code == 401
        assert "Session expired" in str(old.value.detail)
        current = await validate(1)
        assert current.id == user.id

    asyncio.run(scenario())


def test_client_ip_trusts_only_local_nginx_proxy_header():
    from types import SimpleNamespace
    from password_recovery import _client_ip

    def request(peer, claimed):
        return SimpleNamespace(
            client=SimpleNamespace(host=peer),
            headers={"x-real-ip": claimed},
        )

    assert _client_ip(request("127.0.0.1", "198.51.100.42")) == "198.51.100.42"
    assert _client_ip(request("::1", "2001:db8::42")) == "2001:db8::42"
    assert _client_ip(request("203.0.113.10", "198.51.100.42")) == "203.0.113.10"
    assert _client_ip(request("127.0.0.1", "not-an-ip")) == "127.0.0.1"
