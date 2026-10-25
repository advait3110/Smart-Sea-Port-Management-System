"""gate manual entry/exit audit fields

Adds officer attribution and remarks to trucks, a status CHECK,
and (if missing) the one-open-visit-per-vehicle unique index.

Before running:
  Existing rows: if two rows share a vehicle_number with
  status 'inside_port', creating the unique index fails.
  Fix or clear those rows first.
"""

from alembic import op
import sqlalchemy as sa


revision = "c3a8f1d2e5b7"
down_revision = "df5f775eca19"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "trucks",
        sa.Column("recorded_by_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "trucks",
        sa.Column("exit_recorded_by_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "trucks",
        sa.Column("entry_remarks", sa.Text(), nullable=True),
    )
    op.add_column(
        "trucks",
        sa.Column("exit_remarks", sa.Text(), nullable=True),
    )

    # The model has updated_at. Add it only if the table lacks it.
    op.execute(
        "ALTER TABLE trucks ADD COLUMN IF NOT EXISTS updated_at "
        "TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()"
    )

    op.create_foreign_key(
        "fk_trucks_recorded_by_id_users",
        "trucks",
        "users",
        ["recorded_by_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_trucks_exit_recorded_by_id_users",
        "trucks",
        "users",
        ["exit_recorded_by_id"],
        ["id"],
    )

    op.create_index(
        "ix_trucks_recorded_by_id", "trucks", ["recorded_by_id"]
    )
    op.create_index(
        "ix_trucks_exit_recorded_by_id",
        "trucks",
        ["exit_recorded_by_id"],
    )

    # NOT VALID: protects every NEW row without scanning or
    # failing on legacy rows that may hold other status text.
    op.execute(
        "ALTER TABLE trucks ADD CONSTRAINT ck_trucks_status "
        "CHECK (status IN ('inside_port', 'exited')) NOT VALID"
    )

    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_trucks_active_vehicle "
        "ON trucks (vehicle_number) WHERE status = 'inside_port'"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_trucks_active_vehicle")
    op.execute(
        "ALTER TABLE trucks DROP CONSTRAINT IF EXISTS ck_trucks_status"
    )
    op.drop_index("ix_trucks_exit_recorded_by_id", table_name="trucks")
    op.drop_index("ix_trucks_recorded_by_id", table_name="trucks")
    op.drop_constraint(
        "fk_trucks_exit_recorded_by_id_users", "trucks", type_="foreignkey"
    )
    op.drop_constraint(
        "fk_trucks_recorded_by_id_users", "trucks", type_="foreignkey"
    )
    op.drop_column("trucks", "exit_remarks")
    op.drop_column("trucks", "entry_remarks")
    op.drop_column("trucks", "exit_recorded_by_id")
    op.drop_column("trucks", "recorded_by_id")
    # updated_at is intentionally not dropped: it may have existed
    # before this migration.