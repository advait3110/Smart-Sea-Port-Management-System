"""
Document Management routes.

The feature check ("documents") for every endpoint here is done in
app/main.py (module_guard). Who may see or change a single document
is decided in app/services/document_service.py.

  GET    /documents                      the library + the form options
  POST   /documents                      upload a new document
  POST   /documents/reports              make a PDF report (day or period)
  GET    /documents/{id}                 one document with its versions
  GET    /documents/{id}/file            the file (base64), recorded
  POST   /documents/{id}/versions        upload a newer file
  POST   /documents/{id}/edit            change the details
  DELETE /documents/{id}                 delete the document
"""

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db
from app.models.user import User
from app.services import document_service, report_service


router = APIRouter(
    prefix="/documents",
    tags=["Documents"],
)


class DocumentForm(BaseModel):
    """What the upload and edit windows send."""

    title: str | None = None
    category: str | None = None
    description: str | None = None
    expires_on: str | None = None
    link_type: str | None = None
    link_label: str | None = None
    visibility: str | None = "all"
    allowed_roles: list[str] | None = None
    file_name: str | None = None
    file_data: str | None = None


class VersionForm(BaseModel):
    file_name: str | None = None
    file_data: str | None = None
    note: str | None = None


class ReportForm(BaseModel):
    start_date: str | None = None
    end_date: str | None = None


@router.get("")
def list_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return document_service.list_documents(db, current_user)


@router.post("")
def upload_document(
    form: DocumentForm,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return document_service.create_document(
        db, current_user, form.model_dump(), request
    )


@router.post("/reports")
def make_report(
    form: ReportForm,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return report_service.generate_report(
        db,
        current_user,
        form.start_date,
        form.end_date,
        request,
    )


@router.get("/{document_id}")
def read_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return document_service.get_document(db, current_user, document_id)


@router.get("/{document_id}/file")
def read_document_file(
    document_id: int,
    request: Request,
    version: int | None = Query(None, ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return document_service.read_file(
        db, current_user, document_id, version, request
    )


@router.post("/{document_id}/versions")
def upload_new_version(
    document_id: int,
    form: VersionForm,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return document_service.add_version(
        db, current_user, document_id, form.model_dump(), request
    )


@router.post("/{document_id}/edit")
def edit_document_details(
    document_id: int,
    form: DocumentForm,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return document_service.edit_document(
        db, current_user, document_id, form.model_dump(), request
    )


@router.delete("/{document_id}")
def delete_document(
    document_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return document_service.delete_document(
        db, current_user, document_id, request
    )