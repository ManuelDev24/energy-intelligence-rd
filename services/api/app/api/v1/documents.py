import uuid
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, Query, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.api.auth_deps import current_user
from app.config import settings
from app.database import get_db
from app.schemas.documents import DocumentOut, DownloadUrlOut
from app.services import document_storage, documents
from app.services.errors import InvalidInput
from app.services.storage import get_store

router = APIRouter(prefix="/homes/{home_id}/documents", tags=["documents"])
download_router = APIRouter(prefix="/documents", tags=["documents"])
_NO_STORE = {"Cache-Control": "no-store"}


@router.post("", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document(home_id: uuid.UUID, response: Response, file: UploadFile = File(...),
                          source: Literal["web", "mobile", "api"] = Form("api"), db: Session = Depends(get_db),
                          user=Depends(current_user)):
    """Guarda el original (foto o PDF) cifrado en el almacenamiento privado. El tipo se decide por los bytes."""
    get_store()
    limit = max(settings.DOCUMENT_MAX_PDF_BYTES, settings.DOCUMENT_MAX_PHOTO_BYTES)
    content = await file.read(limit + 1)  # nunca se lee más de lo que podría aceptarse
    if len(content) > limit:
        raise InvalidInput("El archivo supera el tamaño máximo permitido")
    response.headers.update(_NO_STORE)
    return document_storage.upload_document(db, home_id, user.id if user else None, content, uploaded_via=source)


@router.get("", response_model=list[DocumentOut])
def list_documents(home_id: uuid.UUID, bill_id: uuid.UUID | None = Query(None), db: Session = Depends(get_db)):
    return documents.list_documents(db, home_id, bill_id)


@router.get("/{document_id}", response_model=DocumentOut)
def get_document(home_id: uuid.UUID, document_id: uuid.UUID, db: Session = Depends(get_db)):
    return documents.get_document(db, home_id, document_id)


@router.post("/{document_id}/download-url", response_model=DownloadUrlOut)
def create_download_url(home_id: uuid.UUID, document_id: uuid.UUID, response: Response, db: Session = Depends(get_db),
                        user=Depends(current_user)):
    response.headers.update(_NO_STORE)
    url, expires = document_storage.issue_download_url(db, home_id, user.id if user else None, document_id)
    return DownloadUrlOut(url=url, expires_at=expires)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(home_id: uuid.UUID, document_id: uuid.UUID, db: Session = Depends(get_db)):
    """Borra la fila y encola el objeto; el worker lo elimina del almacenamiento."""
    documents.delete_document(db, home_id, document_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@download_router.get("/download", include_in_schema=False)
def download(token: str = Query(..., min_length=20, max_length=600), db: Session = Depends(get_db)):
    """Canjea un enlace firmado. No lleva Authorization: la firma y la membresía vigente sustituyen a la sesión."""
    document, content = document_storage.redeem_download(db, token)
    extension = document_storage.EXTENSIONS[document.content_type]
    return Response(content, media_type=document.content_type, headers={
        "Content-Disposition": f'attachment; filename="factura-{document.id}.{extension}"',
        "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": "default-src 'none'; sandbox",
    })
