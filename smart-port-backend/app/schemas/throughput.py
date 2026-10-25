import re
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
