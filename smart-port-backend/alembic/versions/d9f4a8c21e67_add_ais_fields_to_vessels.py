"""add AIS fields to vessels

Revision ID: d9f4a8c21e67
Revises: b7c91e4a2d10
Create Date: 2026-10-05
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# =========================================================
# REVISION IDENTIFIERS
# =========================================================

revision: str = "d9f4a8c21e67"

down_revision: Union[str, Sequence[str], None] = "b7c91e4a2d10"

branch_labels: Union[str, Sequence[str], None] = None

depends_on: Union[str, Sequence[str], None] = None


# =========================================================
# UPGRADE
# =========================================================

def upgrade() -> None:
    # -----------------------------------------------------
    # AIS POSITION
    # -----------------------------------------------------

    op.add_column(
        "vessels",
        sa.Column(
            "latitude",
            sa.Float(),
            nullable=True,
        ),
    )

    op.add_column(
        "vessels",
        sa.Column(
            "longitude",
            sa.Float(),
            nullable=True,
        ),
    )

    # -----------------------------------------------------
    # AIS MOVEMENT
    # -----------------------------------------------------

    op.add_column(
        "vessels",
        sa.Column(
            "speed_knots",
            sa.Float(),
            nullable=True,
        ),
    )

    op.add_column(
        "vessels",
        sa.Column(
            "course_deg",
            sa.Float(),
            nullable=True,
        ),
    )

    op.add_column(
        "vessels",
        sa.Column(
            "heading_deg",
            sa.Float(),
            nullable=True,
        ),
    )

    # -----------------------------------------------------
    # AIS NAVIGATION INFORMATION
    # -----------------------------------------------------

    op.add_column(
        "vessels",
        sa.Column(
            "ais_navigation_status",
            sa.String(length=50),
            nullable=True,
        ),
    )

    op.add_column(
        "vessels",
        sa.Column(
            "destination",
            sa.String(length=120),
            nullable=True,
        ),
    )

    # -----------------------------------------------------
    # AIS ETA
    # -----------------------------------------------------

    op.add_column(
        "vessels",
        sa.Column(
            "eta",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )

    # -----------------------------------------------------
    # AIS DATA SOURCE / TIMESTAMP
    # -----------------------------------------------------

    op.add_column(
        "vessels",
        sa.Column(
            "ais_source",
            sa.String(length=100),
            nullable=True,
        ),
    )

    op.add_column(
        "vessels",
        sa.Column(
            "ais_last_updated_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )

    # -----------------------------------------------------
    # INDEXES
    # -----------------------------------------------------

    op.create_index(
        "ix_vessels_latitude",
        "vessels",
        ["latitude"],
        unique=False,
    )

    op.create_index(
        "ix_vessels_longitude",
        "vessels",
        ["longitude"],
        unique=False,
    )

    op.create_index(
        "ix_vessels_ais_last_updated_at",
        "vessels",
        ["ais_last_updated_at"],
        unique=False,
    )


# =========================================================
# DOWNGRADE
# =========================================================

def downgrade() -> None:
    # -----------------------------------------------------
    # DROP INDEXES
    # -----------------------------------------------------

    op.drop_index(
        "ix_vessels_ais_last_updated_at",
        table_name="vessels",
    )

    op.drop_index(
        "ix_vessels_longitude",
        table_name="vessels",
    )

    op.drop_index(
        "ix_vessels_latitude",
        table_name="vessels",
    )

    # -----------------------------------------------------
    # DROP AIS COLUMNS
    # -----------------------------------------------------

    op.drop_column(
        "vessels",
        "ais_last_updated_at",
    )

    op.drop_column(
        "vessels",
        "ais_source",
    )

    op.drop_column(
        "vessels",
        "eta",
    )

    op.drop_column(
        "vessels",
        "destination",
    )

    op.drop_column(
        "vessels",
        "ais_navigation_status",
    )

    op.drop_column(
        "vessels",
        "heading_deg",
    )

    op.drop_column(
        "vessels",
        "course_deg",
    )

    op.drop_column(
        "vessels",
        "speed_knots",
    )

    op.drop_column(
        "vessels",
        "longitude",
    )

    op.drop_column(
        "vessels",
        "latitude",
    )