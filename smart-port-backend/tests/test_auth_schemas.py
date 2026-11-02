"""
Validation tests for the auth request schemas (app/schemas/auth.py).
These are pure Pydantic validation checks - no database, no network -
confirming the API actually rejects malformed input the way the
frontend and API consumers expect.
"""

import pytest
from pydantic import ValidationError

from app.schemas.auth import UserLogin, UserRegister


def test_user_login_accepts_valid_data():
    login = UserLogin(username="jdoe", password="correcthorsebatterystaple")
    assert login.username == "jdoe"


def test_user_login_rejects_short_username():
    # min_length=3 on username
    with pytest.raises(ValidationError):
        UserLogin(username="jd", password="correcthorsebatterystaple")


def test_user_login_rejects_short_password():
    # min_length=8 on password
    with pytest.raises(ValidationError):
        UserLogin(username="jdoe", password="short")


def test_user_register_rejects_invalid_email():
    with pytest.raises(ValidationError):
        UserRegister(
            username="jdoe",
            email="not-an-email",
            password="correcthorsebatterystaple",
            full_name="John Doe",
        )


def test_user_register_accepts_valid_data():
    user = UserRegister(
        username="jdoe",
        email="jdoe@example.com",
        password="correcthorsebatterystaple",
        full_name="John Doe",
    )
    assert user.email == "jdoe@example.com"


def test_user_register_rejects_short_full_name():
    # min_length=2 on full_name
    with pytest.raises(ValidationError):
        UserRegister(
            username="jdoe",
            email="jdoe@example.com",
            password="correcthorsebatterystaple",
            full_name="J",
        )
