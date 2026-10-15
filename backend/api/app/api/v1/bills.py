import uuid

from fastapi import APIRouter, Depends, Form, Query, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import BillCreate, BillOut, BillUpdate
from app.schemas.bill import BillPaymentIn
from app.schemas.ocr import OcrJobOut
from app.api.auth_deps import current_user
from app.config import settings
from app.services import bills, bill_detail
from app.services.ocr import jobs as ocr_jobs
from app.services.storage import get_store
from typing import Literal
from app.schemas.bill_detail import BillItemsOut, BillItemsReplace, BillAssessment, BillValidationRequest
from app.services.errors import InvalidInput
from app.services.transactions import require_home
from fastapi import UploadFile, File

router = APIRouter(prefix="/homes/{home_id}/bills", tags=["bills"])


def _ocr_out(db, home_id, document_id):
    state, effective, code = ocr_jobs.get_state(db, home_id, document_id)
    return ocr_jobs.to_out(state, effective, code)


@router.post("/ocr-jobs", response_model=OcrJobOut, status_code=status.HTTP_202_ACCEPTED)
def start_ocr_job(home_id: uuid.UUID, response: Response, file: UploadFile = File(...),
                  source: Literal["web", "mobile", "api"] = Form("api"), db: Session = Depends(get_db),
                  user=Depends(current_user)):
    """ERD-OCR-PROD: guarda el original (foto o PDF, cifrado) y lo lee en segundo plano. Responde 202 de inmediato;
    consulte `GET /bills/ocr-jobs/{document_id}`. Nunca crea una factura: solo deja un BORRADOR."""
    get_store()
    limit = max(settings.DOCUMENT_MAX_PDF_BYTES, settings.DOCUMENT_MAX_PHOTO_BYTES)
    content = file.file.read(limit + 1)
    if len(content) > limit:
        raise InvalidInput("El archivo supera el tamaño máximo permitido")
    state = ocr_jobs.submit(db, home_id, user.id if user else None, content, uploaded_via=source)
    response.headers.update({"Cache-Control": "no-store", "Retry-After": "2"})
    return _ocr_out(db, home_id, state.document_id)


@router.get("/ocr-jobs/{document_id}", response_model=OcrJobOut)
def get_ocr_job(home_id: uuid.UUID, document_id: uuid.UUID, response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    return _ocr_out(db, home_id, document_id)


@router.post("/ocr-jobs/{document_id}/retry", response_model=OcrJobOut, status_code=status.HTTP_202_ACCEPTED)
def retry_ocr_job(home_id: uuid.UUID, document_id: uuid.UUID, response: Response, db: Session = Depends(get_db)):
    response.headers.update({"Cache-Control": "no-store", "Retry-After": "2"})
    ocr_jobs.retry(db, home_id, document_id)
    return _ocr_out(db, home_id, document_id)


@router.get("", response_model=list[BillOut])
def list_bills(home_id: uuid.UUID, limit: int = Query(100, ge=1, le=500),
               offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    return bills.list_bills(db, home_id, limit=limit, offset=offset)


@router.post("", response_model=BillOut, status_code=status.HTTP_201_CREATED)
def create_bill(home_id: uuid.UUID, payload: BillCreate, db: Session = Depends(get_db)):
    return bills.create_bill(db, home_id, payload)


@router.post("/{bill_id}/validate", response_model=BillAssessment)
def validate_bill(home_id: uuid.UUID, bill_id: uuid.UUID, payload: BillValidationRequest = BillValidationRequest(),
                  db: Session = Depends(get_db)):
    return bill_detail.assess_bill(db, home_id, bill_id)


@router.put("/{bill_id}/items", response_model=BillItemsOut)
def replace_items(home_id: uuid.UUID, bill_id: uuid.UUID, payload: BillItemsReplace, db: Session = Depends(get_db)):
    return bill_detail.replace_items(db, home_id, bill_id, payload)


@router.get("/{bill_id}/items", response_model=BillItemsOut)
def get_items(home_id: uuid.UUID, bill_id: uuid.UUID, db: Session = Depends(get_db)):
    return bill_detail.get_items(db, home_id, bill_id)


@router.get("/{bill_id}", response_model=BillOut)
def get_bill(home_id: uuid.UUID, bill_id: uuid.UUID, db: Session = Depends(get_db)):
    require_home(db, home_id)
    return bills.get_bill(db, home_id, bill_id)


@router.put("/{bill_id}/payment", response_model=BillOut)
def set_bill_payment(home_id: uuid.UUID, bill_id: uuid.UUID, payload: BillPaymentIn, db: Session = Depends(get_db)):
    """ERD-ALERT-02: marcar pagada (`paid: true`) o pendiente (`false`)."""
    return bills.set_payment(db, home_id, bill_id, payload.paid)


@router.put("/{bill_id}", response_model=BillOut)
def update_bill(home_id: uuid.UUID, bill_id: uuid.UUID, payload: BillUpdate, db: Session = Depends(get_db)):
    return bills.update_bill(db, home_id, bill_id, payload)


@router.delete("/{bill_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bill(home_id: uuid.UUID, bill_id: uuid.UUID, db: Session = Depends(get_db)):
    bills.delete_bill(db, home_id, bill_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
