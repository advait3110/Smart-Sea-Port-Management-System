from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ============================================================
# USER REGISTRATION
# ============================================================


class UserRegister(BaseModel):
    username: str = Field(
        min_length=3,
        max_length=50,
    )

    email: EmailStr

    password: str = Field(
        min_length=8,
        max_length=128,
    )

    full_name: str = Field(
        min_length=2,
        max_length=120,
    )


# ============================================================
# USER LOGIN
# ============================================================


class UserLogin(BaseModel):
    username: str = Field(
        min_length=3,
        max_length=50,
    )

    password: str = Field(
        min_length=8,
        max_length=128,
    )


# ============================================================
# USER RESPONSE
# ============================================================


class UserResponse(BaseModel):
    """
    Authenticated employee information returned by the API.

    The permissions list contains the actual permissions
    assigned to the employee's database role.

    Example:

    {
        "id": 4,
        "username": "cargo",
        "email": "cargo@karwarport.local",
        "full_name": "Cargo Officer",
        "role": "Cargo Officer",
        "is_active": true,
        "permissions": [
            "dashboard.view",
            "cargo.view",
            "cargo.create",
            "port_communication.view",
            "notifications.view"
        ]
    }
    """

    id: int

    username: str

    email: EmailStr

    full_name: str

    role: str

    is_active: bool

    permissions: list[str] = Field(
        default_factory=list,
    )

    model_config = ConfigDict(
        from_attributes=True,
    )


# ============================================================
# TOKEN RESPONSE
# ============================================================


class TokenResponse(BaseModel):
    access_token: str

    token_type: str