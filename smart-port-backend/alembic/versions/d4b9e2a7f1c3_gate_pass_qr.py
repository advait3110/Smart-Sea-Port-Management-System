"""QR gate passes

Creates the gate_passes table and links trucks to the pass that
admitted them (trucks.gate_pass_id, unique = one pass, one visit).

Run order: c3a8f1d2e5b7 (gate audit fields) -> this revision.
If you merged the two migrations into one, set down_revision to
whatever `alembic heads` shows instead.
"""

from alembic import op
import sqlalchemy as sa


revision = "d4b9e2a7f1c3"
down_revision = "c3a8f1d2e5b7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "gate_passes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("pass_code", sa.String(length=32), nullable=False),
        sa.Column(
            "vehicle_number", sa.String(length=30), nullable=False
        ),
        sa.Column(
            "driver_name", sa.String(length=120), nullable=False
        ),
        sa.Column(
            "driver_phone", sa.String(length=20), nullable=True
        ),
        sa.Column(
            "transport_company",
            sa.String(length=120),
            nullable=True,
        ),
        sa.Column("cargo_id", sa.Integer(), nullable=True),
        sa.Column("cargo_weight_tonnes", sa.Float(), nullable=True),
        sa.Column("purpose", sa.String(length=200), nullable=True),
        sa.Column(
            "valid_from", sa.DateTime(timezone=True), nullable=False
        ),
        sa.Column(
            "valid_until", sa.DateTime(timezone=True), nullable=False
        ),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="issued",
        ),
        sa.Column("issued_by_id", sa.Integer(), nullable=True),
        sa.Column(
            "used_at", sa.DateTime(timezone=True), nullable=True
        ),
        sa.Column(
            "cancelled_at", sa.DateTime(timezone=True), nullable=True
        ),
        sa.Column("cancelled_by_id", sa.Integer(), nullable=True),
        sa.Column("cancel_reason", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["cargo_id"],
            ["cargo.id"],
            name="fk_gate_passes_cargo_id_cargo",
        ),
        sa.ForeignKeyConstraint(
            ["issued_by_id"],
            ["users.id"],
            name="fk_gate_passes_issued_by_id_users",
        ),
        sa.ForeignKeyConstraint(
            ["cancelled_by_id"],
            ["users.id"],
            name="fk_gate_passes_cancelled_by_id_users",
        ),
        sa.CheckConstraint(
            "status IN ('issued', 'used', 'cancelled')",
            name="ck_gate_passes_status",
        ),
        sa.CheckConstraint(
            "valid_until > valid_from",
            name="ck_gate_passes_window",
        ),
    )

    op.create_index(
        "ix_gate_passes_pass_code",
        "gate_passes",
        ["pass_code"],
        unique=True,
    )
    op.create_index(
        "ix_gate_passes_vehicle_number",
        "gate_passes",
        ["vehicle_number"],
    )
    op.create_index("ix_gate_passes_cargo_id", "gate_passes", ["cargo_id"])
    op.create_index("ix_gate_passes_status", "gate_passes", ["status"])
    op.create_index(
        "ix_gate_passes_issued_by_id", "gate_passes", ["issued_by_id"]
    )

    op.add_column(
        "trucks",
        sa.Column("gate_pass_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_trucks_gate_pass_id_gate_passes",
        "trucks",
        "gate_passes",
        ["gate_pass_id"],
        ["id"],
    )
    op.create_index(
        "uq_trucks_gate_pass_id",
        "trucks",
        ["gate_pass_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_trucks_gate_pass_id", table_name="trucks")
    op.drop_constraint(
        "fk_trucks_gate_pass_id_gate_passes",
        "trucks",
        type_="foreignkey",
    )
    op.drop_column("trucks", "gate_pass_id")

    op.drop_index("ix_gate_passes_issued_by_id", table_name="gate_passes")
    op.drop_index("ix_gate_passes_status", table_name="gate_passes")
    op.drop_index("ix_gate_passes_cargo_id", table_name="gate_passes")
    op.drop_index(
        "ix_gate_passes_vehicle_number", table_name="gate_passes"
    )
    op.drop_index("ix_gate_passes_pass_code", table_name="gate_passes")
    op.drop_table("gate_passes")
