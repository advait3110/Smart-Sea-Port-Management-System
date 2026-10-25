"""gate: manual entry/exit only (remove QR gate passes)

Drops the QR gate pass table and trucks.gate_pass_id, and adds a
CHECK so an exit can never be before its entry.

Run order: c3a8f1d2e5b7 -> d4b9e2a7f1c3 -> this revision.
Keep d4b9e2a7f1c3_gate_pass_qr.py in alembic/versions: your
database has already applied it, and this revision follows it.

Everything uses IF EXISTS, so it is safe whether or not the QR
objects are present.
"""

from alembic import op


revision = "e7f2a9c4b1d8"
down_revision = "d4b9e2a7f1c3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_trucks_gate_pass_id")
    op.execute(
        "ALTER TABLE trucks "
        "DROP CONSTRAINT IF EXISTS fk_trucks_gate_pass_id_gate_passes"
    )
    op.execute("ALTER TABLE trucks DROP COLUMN IF EXISTS gate_pass_id")
    op.execute("DROP TABLE IF EXISTS gate_passes")

    # NOT VALID: protects every NEW row without failing on old
    # test rows.
    op.execute(
        "ALTER TABLE trucks ADD CONSTRAINT ck_trucks_exit_after_entry "
        "CHECK (exit_time IS NULL OR exit_time >= entry_time) "
        "NOT VALID"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE trucks "
        "DROP CONSTRAINT IF EXISTS ck_trucks_exit_after_entry"
    )
    # The QR gate pass table is not recreated on downgrade. To get
    # it back, downgrade past d4b9e2a7f1c3 and upgrade again.