"""
Smoke tests for app/core/security.py - password hashing and JWT creation.
These are pure functions (no database, no network), so they're a safe
starting point for the test suite.
"""

import jwt
import pytest

from app.core.config import settings
from app.core.security import create_access_token, hash_password, verify_password


def test_hash_password_returns_different_string_than_input():
    hashed = hash_password("my-secret-password")
    assert hashed != "my-secret-password"
    assert len(hashed) > 0


def test_verify_password_accepts_correct_password():
    hashed = hash_password("correct-horse-battery-staple")
    assert verify_password("correct-horse-battery-staple", hashed) is True


def test_verify_password_rejects_wrong_password():
    hashed = hash_password("correct-horse-battery-staple")
    assert verify_password("wrong-password", hashed) is False


def test_same_password_produces_different_hashes_each_time():
    # Argon2 salts each hash, so hashing the same password twice
    # should not give the same result (protects against rainbow tables).
    first = hash_password("same-password")
    second = hash_password("same-password")
    assert first != second


def test_create_access_token_contains_expected_claims():
    token = create_access_token(user_id=42, username="jdoe", role="Port Administrator")

    payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])

    assert payload["sub"] == "42"
    assert payload["username"] == "jdoe"
    assert payload["role"] == "Port Administrator"
    assert "exp" in payload


def test_create_access_token_rejects_tampered_signature():
    token = create_access_token(user_id=1, username="someone", role="Port Executive")
    tampered = token[:-1] + ("A" if token[-1] != "A" else "B")

    with pytest.raises(jwt.InvalidTokenError):
        jwt.decode(tampered, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
