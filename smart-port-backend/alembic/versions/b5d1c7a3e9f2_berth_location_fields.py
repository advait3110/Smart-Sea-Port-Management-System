"""berths: add terminal, latitude and longitude

Live berth occupancy is detected from AIS by comparing each moored
vessel's position with the berth's coordinates, so berths need a
position. Terminal is a plain label.

Parent revision: e7f2a9c4b1d8 (gate manual only). If `alembic heads`
shows a different id before this file is added, change down_revision
below to that id.
Everything uses IF NOT EXISTS, so it is safe to run twice.
"""

from alembic import op


revision = "b5d1c7a3e9f2"
down_revision = "e7f2a9c4b1d8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE berths ADD COLUMN IF NOT EXISTS terminal VARCHAR(100)"
    )
    op.execute(
        "ALTER TABLE berths ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION"
    )
    op.execute(
        "ALTER TABLE berths ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE berths DROP COLUMN IF EXISTS longitude")
    op.execute("ALTER TABLE berths DROP COLUMN IF EXISTS latitude")
    op.execute("ALTER TABLE berths DROP COLUMN IF EXISTS terminal")