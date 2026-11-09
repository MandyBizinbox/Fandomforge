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
