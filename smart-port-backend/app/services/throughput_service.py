from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.throughput import PortThroughput
from app.schemas.throughput import (
    UNITS,
    ThroughputImport,
    ThroughputImportResult,
    ThroughputResponse,
)

# Two figures closer than this count as the same number.
_SAME_VALUE = 1e-9


def _key(period: str, primary: str, secondary: str) -> tuple[str, str, str]:
    return (period, primary, secondary)


def plan_import(
    existing: dict[tuple[str, str, str], float],
    incoming: list[tuple[tuple[str, str, str], float]],
):
    """
    Pure helper (no database): decides what an import does.

    existing: key -> value already stored
    incoming: [(key, value)], a key repeated in the file counts once and
              the last value wins.

    Returns (to_add, to_update, unchanged) where the first two are
    {key: value} dictionaries.
    """
    latest: dict[tuple[str, str, str], float] = {}

    for key, value in incoming:
        latest[key] = value

    to_add: dict[tuple[str, str, str], float] = {}
    to_update: dict[tuple[str, str, str], float] = {}
    unchanged = 0

    for key, value in latest.items():
        if key not in existing:
            to_add[key] = value
        elif abs(existing[key] - value) > _SAME_VALUE:
            to_update[key] = value
        else:
            unchanged += 1

    return to_add, to_update, unchanged


def import_throughput(
    db: Session,
    data: ThroughputImport,
) -> ThroughputImportResult:
    """Adds new figures and updates changed ones. Nothing is deleted."""

    rows = list(
        db.scalars(
            select(PortThroughput).where(PortThroughput.metric == data.metric)
        )
    )

    by_key = {
        _key(row.period, row.category_primary, row.category_secondary): row
        for row in rows
    }

    existing = {key: row.value for key, row in by_key.items()}

    incoming = [
        (
            _key(row.period, row.category_primary, row.category_secondary),
            row.value,
        )
        for row in data.rows
    ]

    to_add, to_update, unchanged = plan_import(existing, incoming)

    for key, value in to_update.items():
        by_key[key].value = value

    for (period, primary, secondary), value in to_add.items():
        db.add(
            PortThroughput(
                metric=data.metric,
                period=period,
                category_primary=primary,
                category_secondary=secondary,
                value=value,
            )
        )

    db.commit()

    return ThroughputImportResult(
        metric=data.metric,
        added=len(to_add),
        updated=len(to_update),
        unchanged=unchanged,
    )


def list_throughput(db: Session, metric: str) -> list[ThroughputResponse]:
    rows = db.scalars(
        select(PortThroughput)
        .where(PortThroughput.metric == metric)
        .order_by(
            PortThroughput.period,
            PortThroughput.category_primary,
            PortThroughput.category_secondary,
        )
    )

    unit = UNITS.get(metric, "")

    return [
        ThroughputResponse.model_validate(row).model_copy(update={"unit": unit})
        for row in rows
    ]


def clear_throughput(db: Session, metric: str) -> int:
    result = db.execute(
        delete(PortThroughput).where(PortThroughput.metric == metric)
    )

    db.commit()

    return result.rowcount or 0
