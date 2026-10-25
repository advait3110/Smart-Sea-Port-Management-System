from fastapi import APIRouter, Depends, Query
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
