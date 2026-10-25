from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.models.role import Role
from app.models.user import User
from app.schemas.auth import UserRegister


def create_user(
    db: Session,
    user_data: UserRegister,
) -> User:
    existing_user = db.scalar(
        select(User).where(
            (User.username == user_data.username)
            | (User.email == user_data.email)
        )
    )

    if existing_user:
        raise ValueError(
            "Username or email already exists."
        )

    # Default role for newly registered users
    default_role = db.scalar(
        select(Role).where(
            Role.name == "port_operations_officer"
        )
    )

    if default_role is None:
        raise ValueError(
            "Default user role is not configured."
        )

    user = User(
        username=user_data.username,
        email=user_data.email,
        password_hash=hash_password(
            user_data.password
        ),
        full_name=user_data.full_name,
        role_id=default_role.id,
        is_active=True,
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return user


def authenticate_user(
    db: Session,
    username: str,
    password: str,
) -> User | None:
    user = db.scalar(
        select(User).where(
            User.username == username
        )
    )

    if user is None:
        return None

    if not user.is_active:
        return None

    if not verify_password(
        password,
        user.password_hash,
    ):
        return None

    return user