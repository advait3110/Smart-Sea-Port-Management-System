"""
Audit Log routes (read only).

Nobody can add, change or delete a row through the API. Rows are
written by the system itself (see app/services/audit_service.py).

Only the Port Administrator and the Port Executive may read the log.
Every endpoint here checks that itself (require_oversight), whatever
features a role has been given. The page shows port activity only.

  GET /audit           the entries, newest first (filters + paging)
  GET /audit/summary   the number cards and the filter lists
  GET /audit/export    the filtered entries as CSV text
"""

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db
from app.models.user import User
from app.services import audit_service


router = APIRouter(
    prefix="/audit",
    tags=["Audit Log"],
)


@router.get("")
def read_audit_log(
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    user_id: int | None = Query(None),
    module: str | None = Query(None),
    category: str | None = Query(None),
    result: str | None = Query(None),
    q: str | None = Query(None),
    limit: int = Query(audit_service.DEFAULT_LIMIT, ge=1, le=audit_service.MAX_LIMIT),
    before_id: int | None = Query(None, ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The entries, newest first. Dates are Singapore dates (YYYY-MM-DD)."""

    audit_service.require_oversight(current_user)

    return audit_service.list_entries(
        db,
        start_date=start_date,
        end_date=end_date,
        user_id=user_id,
        module=module,
        category=category,
        result=result,
        q=q,
        limit=limit,
        before_id=before_id,
    )


@router.get("/summary")
def read_audit_summary(
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The numbers for the cards and the lists for the filters."""

    audit_service.require_oversight(current_user)

    return audit_service.summary(
        db,
        start_date=start_date,
        end_date=end_date,
    )


@router.get("/export")
def export_audit_log(
    request: Request,
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    user_id: int | None = Query(None),
    module: str | None = Query(None),
    category: str | None = Query(None),
    result: str | None = Query(None),
    q: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The filtered entries as CSV text. The export itself is recorded."""

    audit_service.require_oversight(current_user)

    return audit_service.export_csv(
        db,
        start_date=start_date,
        end_date=end_date,
        user_id=user_id,
        module=module,
        category=category,
        result=result,
        q=q,
        user=current_user,
        request=request,
    )