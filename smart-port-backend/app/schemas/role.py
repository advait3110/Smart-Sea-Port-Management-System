from pydantic import BaseModel, ConfigDict, Field, field_validator


# ============================================================
# PERMISSION SCHEMAS
# ============================================================


class PermissionResponse(BaseModel):
    id: int
    key: str
    name: str
    description: str | None = None

    model_config = ConfigDict(
        from_attributes=True,
    )


# ============================================================
# ROLE SCHEMAS
# ============================================================


class RoleCreate(BaseModel):
    name: str = Field(
        min_length=2,
        max_length=80,
    )

    description: str | None = Field(
        default=None,
        max_length=255,
    )

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        value = value.strip()

        if not value:
            raise ValueError(
                "Role name cannot be empty."
            )

        return value

    @field_validator("description")
    @classmethod
    def validate_description(
        cls,
        value: str | None,
    ) -> str | None:
        if value is None:
            return None

        value = value.strip()

        return value or None


class RoleUpdate(BaseModel):
    name: str | None = Field(
        default=None,
        min_length=2,
        max_length=80,
    )

    description: str | None = Field(
        default=None,
        max_length=255,
    )

    @field_validator("name")
    @classmethod
    def validate_name(
        cls,
        value: str | None,
    ) -> str | None:
        if value is None:
            return None

        value = value.strip()

        if not value:
            raise ValueError(
                "Role name cannot be empty."
            )

        return value

    @field_validator("description")
    @classmethod
    def validate_description(
        cls,
        value: str | None,
    ) -> str | None:
        if value is None:
            return None

        value = value.strip()

        return value or None


# ============================================================
# ROLE PERMISSION UPDATE
# ============================================================


class RolePermissionUpdate(BaseModel):
    """
    Complete feature-permission list for a role.

    The submitted list completely replaces the role's
    current permissions.

    Example:

    {
        "permissions": [
            "dashboard",
            "cargo",
            "analytics"
        ]
    }

    If the list is empty:

    {
        "permissions": []
    }

    the role receives zero feature permissions.

    Port Administrator is protected by the service layer
    and always retains all available permissions.
    """

    permissions: list[str] = Field(
        default_factory=list,
    )

    @field_validator("permissions")
    @classmethod
    def normalize_permissions(
        cls,
        values: list[str],
    ) -> list[str]:
        normalized = []
        seen = set()

        for value in values:
            if not isinstance(value, str):
                raise ValueError(
                    "Permission keys must be strings."
                )

            key = value.strip()

            if not key:
                continue

            if key not in seen:
                normalized.append(key)
                seen.add(key)

        return normalized


# ============================================================
# ROLE RESPONSE
# ============================================================


class RoleResponse(BaseModel):
    id: int
    name: str
    description: str | None = None

    permissions: list[PermissionResponse] = Field(
        default_factory=list,
    )

    model_config = ConfigDict(
        from_attributes=True,
    )


# ============================================================
# ROLE PERMISSION KEYS RESPONSE
# ============================================================


class RolePermissionKeysResponse(BaseModel):
    role_id: int
    role_name: str

    permissions: list[str] = Field(
        default_factory=list,
    )