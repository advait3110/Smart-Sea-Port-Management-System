"""port_throughput: yearly cargo and monthly container throughput

Stores the figures the Cargo Throughput page shows.

BEFORE RUNNING: set down_revision below to the output of
    alembic heads
Uses IF NOT EXISTS, so it is safe to run twice.
"""

from alembic import op


revision = "c7e2a9d4f1b3"
down_revision = "b5d1c7a3e9f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS port_throughput (
            id SERIAL PRIMARY KEY,
            metric VARCHAR(20) NOT NULL,
            period VARCHAR(7) NOT NULL,
            category_primary VARCHAR(50) NOT NULL DEFAULT '',
            category_secondary VARCHAR(50) NOT NULL DEFAULT '',
            value DOUBLE PRECISION NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_port_throughput_key UNIQUE (
                metric, period, category_primary, category_secondary
            )
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_port_throughput_metric "
        "ON port_throughput (metric)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_port_throughput_period "
        "ON port_throughput (period)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS port_throughput")
