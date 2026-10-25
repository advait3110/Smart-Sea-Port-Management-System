from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UserCreate(BaseModel):
    name: str = Field(
        min_length=2,
        max_length=120,
    )

    admin_id: str = Field(
        min_length=3,
        max_length=50,
    )

    password: str = Field(
        min_length=6,
        max_length=128,
    )

    role: str = Field(
        min_length=2,
        max_length=80,
    )


class UserUpdate(BaseModel):
    name: str | None = None

    admin_id: str | None = Field(
        default=None,
        min_length=3,
        max_length=50,
    )

    password: str | None = Field(
        default=None,
        min_length=6,
        max_length=128,
    )

    role: str | None = Field(
        default=None,
        min_length=2,
        max_length=80,
    )

    is_active: bool | None = None


class UserCredentialsUpdate(BaseModel):
    """
    Used by any authenticated user to change their own
    Admin ID and/or password.

    The current password is required so that possession
    of an active JWT alone is not enough to change credentials.
    """

    current_password: str = Field(
        min_length=1,
        max_length=128,
    )

    admin_id: str | None = Field(
        default=None,
        min_length=3,
        max_length=50,
    )

    new_password: str | None = Field(
        default=None,
        min_length=6,
        max_length=128,
    )


class UserResponse(BaseModel):
    id: int
    name: str
    admin_id: str
    role: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
    )