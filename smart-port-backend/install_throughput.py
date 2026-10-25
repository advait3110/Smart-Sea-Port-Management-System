"""
Installs the Cargo Throughput backend into your project.

HOW TO USE:
  1. Put this file in your backend folder (the folder that contains the
     "app" folder and the file "alembic.ini").
  2. Open a terminal in that folder (the same one you use to start the
     backend, with the same environment active).
  3. Run:   python install_throughput.py
  4. Stop the backend and start it again.

It is safe to run more than once.
"""

import os
import re
import subprocess
import sys

FILES = {
    "app/models/throughput.py": r'''from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PortThroughput(Base):
    """
    One published throughput figure of the port.

    metric = "cargo"     period "YYYY"     value in thousand tonnes
             (MPA "Cargo Throughput Breakdown", yearly)
    metric = "container" period "YYYY-MM"  value in thousand TEUs
             (MPA "Container Throughput", monthly)

    The categories are empty strings (not NULL) when a metric has none, so
    the unique constraint below also protects those rows from duplicates.
    """

    __tablename__ = "port_throughput"

    __table_args__ = (
        UniqueConstraint(
            "metric",
            "period",
            "category_primary",
            "category_secondary",
            name="uq_port_throughput_key",
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    metric: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        index=True,
    )

    period: Mapped[str] = mapped_column(
        String(7),
        nullable=False,
        index=True,
    )

    category_primary: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="",
    )

    category_secondary: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="",
    )

    value: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
''',
    "app/schemas/throughput.py": r'''import re
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

Metric = Literal["cargo", "container"]

# Units of the published figures.
UNITS = {
    "cargo": "thousand tonnes",
    "container": "thousand TEU",
}

_YEAR = re.compile(r"^\d{4}$")
_MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")

Category = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=50),
]


class ThroughputRow(BaseModel):
    period: str
    category_primary: Category = ""
    category_secondary: Category = ""
    value: float = Field(ge=0, lt=1e12)

    @field_validator("period")
    @classmethod
    def _period(cls, value: str) -> str:
        return value.strip()


class ThroughputImport(BaseModel):
    metric: Metric
    rows: list[ThroughputRow] = Field(min_length=1, max_length=2000)

    @model_validator(mode="after")
    def _check_rows(self):
        for index, row in enumerate(self.rows, start=1):
            if self.metric == "cargo":
                if not _YEAR.match(row.period):
                    raise ValueError(
                        f"Row {index}: cargo periods must be a year such as 2024."
                    )

                if not row.category_primary or not row.category_secondary:
                    raise ValueError(
                        f"Row {index}: cargo rows need both cargo types."
                    )
            else:
                if not _MONTH.match(row.period):
                    raise ValueError(
                        f"Row {index}: container periods must be a month such as 2024-05."
                    )

                if row.category_primary or row.category_secondary:
                    raise ValueError(
                        f"Row {index}: container rows have no cargo types."
                    )

        return self


class ThroughputResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    metric: str
    period: str
    category_primary: str
    category_secondary: str
    value: float
    unit: str = ""


class ThroughputImportResult(BaseModel):
    metric: Metric
    added: int
    updated: int
    unchanged: int
''',
    "app/services/throughput_service.py": r'''from sqlalchemy import delete, select
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
''',
    "app/api/routes/throughput.py": r'''from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db
from app.models.user import User
from app.schemas.throughput import (
    Metric,
    ThroughputImport,
    ThroughputImportResult,
    ThroughputResponse,
)
from app.services.throughput_service import (
    clear_throughput,
    import_throughput,
    list_throughput,
)


router = APIRouter(
    prefix="/throughput",
    tags=["Throughput"],
)


@router.get(
    "",
    response_model=list[ThroughputResponse],
)
def read_throughput(
    metric: Metric = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return list_throughput(db, metric)


@router.post(
    "/import",
    response_model=ThroughputImportResult,
)
def import_throughput_rows(
    data: ThroughputImport,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return import_throughput(db, data)


@router.delete("")
def delete_throughput(
    metric: Metric = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return {"deleted": clear_throughput(db, metric)}
''',
    "alembic/versions/c7e2a9d4f1b3_port_throughput_table.py": r'''"""port_throughput: yearly cargo and monthly container throughput

Stores the figures the Cargo Throughput page shows.

BEFORE RUNNING: set down_revision below to the output of
    alembic heads
Uses IF NOT EXISTS, so it is safe to run twice.
"""

from alembic import op


revision = "c7e2a9d4f1b3"
down_revision = "PUT_THE_OUTPUT_OF_alembic_heads_HERE"
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
''',
}

MIGRATION = "alembic/versions/c7e2a9d4f1b3_port_throughput_table.py"
MIGRATION_ID = "c7e2a9d4f1b3"
PLACEHOLDER = "PUT_THE_OUTPUT_OF_alembic_heads_HERE"


def say(text=""):
    print(text)


def stop(text):
    print("")
    print("STOPPED: " + text)
    sys.exit(1)


def unpack(path):
    return FILES[path]


def read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def write(path, text):
    folder = os.path.dirname(path)
    if folder:
        os.makedirs(folder, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)


def python_files():
    for folder, _dirs, names in os.walk("app"):
        if "__pycache__" in folder:
            continue
        for name in names:
            if name.endswith(".py"):
                yield os.path.join(folder, name)


def read_or_none(path):
    try:
        return read(path)
    except (UnicodeDecodeError, OSError):
        return None


# ---------------------------------------------------------------------------
# Router registration
# ---------------------------------------------------------------------------

BERTHS_NAME = re.compile(r"\bberths(?:\.router|_router)\b")


def statement_at(lines, start):
    """Returns the index of the last line of the call that starts at `start`."""
    depth = 0
    for index in range(start, min(start + 12, len(lines))):
        depth += lines[index].count("(") - lines[index].count(")")
        if depth <= 0:
            return index
    return None


def make_throughput_call(statement):
    """Copies the berths include_router call and points it at throughput."""
    text = BERTHS_NAME.sub("throughput_routes.router", statement)
    # The throughput router already has its own prefix and tag.
    text = re.sub(r",\s*prefix\s*=\s*[\"']/?berths/?[\"']", "", text)
    text = re.sub(r",\s*tags\s*=\s*\[[^\]]*\]", "", text)
    return text


def router_already_registered():
    for path in python_files():
        text = read_or_none(path)
        if text is None:
            continue
        if re.search(r"include_router\([^)]*throughput", text):
            return path
    return None


FIRST_ARGUMENT = re.compile(r"include_router\(\s*([A-Za-z_][\w.]*)")


def include_statements(lines):
    """Every include_router(...) call in a file: (first line, last line, text)."""
    found = []
    for start, line in enumerate(lines):
        if "include_router(" not in line or line.strip().startswith("#"):
            continue
        end = statement_at(lines, start)
        if end is None:
            continue
        found.append((start, end, "\n".join(lines[start : end + 1])))
    return found


def make_generic_call(statement, all_statements):
    """Copies any other include_router call (used when Berths is not found)."""
    match = FIRST_ARGUMENT.search(statement)
    text = (
        statement[: match.start(1)]
        + "throughput_routes.router"
        + statement[match.end(1) :]
    )
    text = re.sub(r",\s*tags\s*=\s*\[[^\]]*\]", "", text)

    prefix = re.search(r"prefix\s*=\s*([\"'][^\"']*[\"'])", text)
    if prefix:
        used = sum(1 for other in all_statements if prefix.group(1) in other)
        if used < 2:
            # A prefix used by this one router only: not a shared one.
            text = re.sub(r",\s*prefix\s*=\s*[\"'][^\"']*[\"']", "", text)
    return text


def insert_call(path, text, lines, start, end, new_call):
    indent = re.match(r"\s*", lines[start]).group(0)
    import_line = indent + "from app.api.routes import throughput as throughput_routes"
    lines[end + 1 : end + 1] = [import_line] + new_call.split("\n")
    write(path + ".bak", text)
    write(path, "\n".join(lines))
    say("     Registered in " + path + "  (backup: " + path + ".bak)")


def register_router():
    found = router_already_registered()
    if found:
        say("     Already registered in " + found)
        return True

    files = []
    for path in python_files():
        text = read_or_none(path)
        if text is None or "include_router" not in text:
            continue
        lines = text.split("\n")
        files.append((path, text, lines, include_statements(lines)))

    # First choice: copy the Berths line.
    for path, text, lines, statements in files:
        for start, end, statement in statements:
            if BERTHS_NAME.search(statement):
                insert_call(
                    path, text, lines, start, end, make_throughput_call(statement)
                )
                return True

    # Second choice: copy any other router line (prefer one without extras).
    for path, text, lines, statements in files:
        everything = [item[2] for item in statements]
        ordered = sorted(statements, key=lambda item: "dependencies" in item[2])
        for start, end, statement in ordered:
            if "dependencies" in statement or not FIRST_ARGUMENT.search(statement):
                continue
            insert_call(
                path, text, lines, start, end, make_generic_call(statement, everything)
            )
            return True

    return False


def show_throughput_addresses():
    """Starts nothing: just loads the app and lists the new addresses."""
    code = (
        "from app.main import app\n"
        "print(' '.join(sorted(r.path for r in app.routes "
        "if 'throughput' in getattr(r, 'path', ''))))\n"
    )
    try:
        result = subprocess.run(
            [sys.executable, "-c", code],
            capture_output=True,
            text=True,
            timeout=90,
        )
    except (OSError, subprocess.TimeoutExpired):
        say("     (Could not double-check the addresses. That is okay.)")
        return
    lines = [line for line in result.stdout.splitlines() if line.strip()]
    if result.returncode == 0 and lines and "/throughput" in lines[-1]:
        say("     Backend now has: " + lines[-1])
    elif result.returncode == 0:
        say("     WARNING: the backend app loads, but it does NOT list /throughput.")
        say("     Send me a screenshot of this window.")
    else:
        say("     (Could not double-check the addresses. That is okay.)")


# ---------------------------------------------------------------------------
# Alembic
# ---------------------------------------------------------------------------

def run_alembic(arguments):
    attempts = [[sys.executable, "-m", "alembic"], ["alembic"]]
    last = None
    for command in attempts:
        try:
            result = subprocess.run(
                command + arguments, capture_output=True, text=True
            )
        except OSError:
            continue
        last = result
        output = result.stdout + result.stderr
        if result.returncode == 0 or "No module named alembic" not in output:
            return result
    return last


def head_ids(output):
    ids = []
    for line in output.splitlines():
        if "(head)" in line:
            match = re.match(r"\s*([0-9a-zA-Z_]+)\b", line)
            if match:
                ids.append(match.group(1))
    return ids


def install_migration():
    """Writes the migration, based on whatever your newest revision is."""
    if os.path.exists(MIGRATION):
        text = read(MIGRATION)
        if PLACEHOLDER not in text:
            say("     Migration already in place.")
            return

        # Left over from an earlier attempt: remove it so alembic can run.
        os.remove(MIGRATION)

    result = run_alembic(["heads"])
    output = "" if result is None else (result.stdout + result.stderr).strip()
    ids = [value for value in head_ids(output) if value != MIGRATION_ID]

    if result is None or result.returncode != 0 or len(ids) != 1:
        stop(
            "Could not read your latest database revision.\n\n"
            + (output or "(alembic did not run)")
            + "\n\nSend me this text and I will fix it."
        )

    write(MIGRATION, unpack(MIGRATION).replace(PLACEHOLDER, ids[0]))
    say("     Based on your latest revision " + ids[0])


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    only_files = "--no-db" in sys.argv

    if not os.path.isdir("app") or not os.path.exists("app/api/dependencies.py"):
        stop(
            "This is not the backend folder. Put this file in the folder that\n"
            "contains the 'app' folder and 'alembic.ini', open a terminal\n"
            "there, and run it again."
        )

    say("1/5  Writing the backend files ...")
    for path in FILES:
        if path == MIGRATION:
            continue
        write(path, unpack(path))
        say("     " + path)

    say("2/5  Registering the router ...")
    registered = register_router()
    if not registered:
        say("     I could not find the line that registers the Berths router.")
        say("     Add these two lines next to it:")
        say("         from app.api.routes import throughput as throughput_routes")
        say("         app.include_router(throughput_routes.router)")
        say("     (or send me the file that has your include_router lines)")

    if only_files:
        say("Skipped the database steps (--no-db).")
        return

    if not os.path.exists("alembic.ini"):
        stop("alembic.ini not found. Run this from the backend folder.")

    say("3/5  Preparing the database change ...")
    install_migration()

    say("4/5  Creating the table in the database ...")
    result = run_alembic(["upgrade", "head"])
    output = "" if result is None else (result.stdout + result.stderr).strip()
    if output:
        say(output)
    if result is None or result.returncode != 0:
        stop("The database step failed. Send me the text above and I will fix it.")

    say("5/5  Checking the new files load ...")
    check = subprocess.run(
        [sys.executable, "-c", "import app.api.routes.throughput"],
        capture_output=True,
        text=True,
    )
    if check.returncode != 0:
        say("     Problem found:")
        say((check.stdout + check.stderr).strip())
        stop("The new files did not load. Send me the text above and I will fix it.")
    say("     OK")
    show_throughput_addresses()

    say("")
    if registered:
        say("ALL DONE.")
    else:
        say("Almost done: add the two lines shown in step 2, then continue.")
    say("Now stop the backend and start it again, then refresh the")
    say("Cargo Throughput page and press Import CSV.")


if __name__ == "__main__":
    main()