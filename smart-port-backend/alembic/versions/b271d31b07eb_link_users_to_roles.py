"""link users to roles

Revision ID: b271d31b07eb
Revises: ae705d017777
Create Date: 2026-09-25 18:15:19.270182
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b271d31b07eb"
down_revision: Union[str, Sequence[str], None] = "ae705d017777"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Link users to the roles table."""

    # 1. Add the new foreign-key column temporarily as nullable.
    op.add_column(
        "users",
        sa.Column(
            "role_id",
            sa.Integer(),
            nullable=True,
        ),
    )

    # 2. Create a named foreign-key constraint.
    op.create_foreign_key(
        "fk_users_role_id_roles",
        "users",
        "roles",
        ["role_id"],
        ["id"],
    )

    # 3. Preserve existing role assignments.
    #
    #    Old:
    #        users.role = "port_manager"
    #
    #    New:
    #        users.role_id = roles.id
    #
    op.execute(
        sa.text(
            """
            UPDATE users
            SET role_id = roles.id
            FROM roles
            WHERE users.role = roles.name
            """
        )
    )

    # 4. Remove the old free-text role column.
    op.drop_column("users", "role")

    # 5. role_id must now always point to a real role.
    op.alter_column(
        "users",
        "role_id",
        nullable=False,
    )


def downgrade() -> None:
    """Restore the previous role column."""

    # 1. Recreate the old role column temporarily as nullable.
    op.add_column(
        "users",
        sa.Column(
            "role",
            sa.String(length=50),
            nullable=True,
        ),
    )

    # 2. Restore the role name from the roles table.
    op.execute(
        sa.text(
            """
            UPDATE users
            SET role = roles.name
            FROM roles
            WHERE users.role_id = roles.id
            """
        )
    )

    # 3. Remove the foreign-key constraint.
    op.drop_constraint(
        "fk_users_role_id_roles",
        "users",
        type_="foreignkey",
    )

    # 4. Remove role_id.
    op.drop_column(
        "users",
        "role_id",
    )

    # 5. Restore the original NOT NULL requirement.
    op.alter_column(
        "users",
        "role",
        nullable=False,
    )