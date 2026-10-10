import uuid

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import BillCreate, BillOut, BillUpdate
from app.schemas.ocr import OcrDraft
from app.services import bills, bill_detail
from app.services.ocr.engine import MAX_UPLOAD_BYTES, UnreadableImage, extract_text
from app.services.ocr.parser import parse_bill_text
from app.schemas.bill_detail import BillItemsOut, BillItemsReplace, BillAssessment, BillValidationRequest
from app.services.errors import InvalidInput
from app.services.transactions import require_home
from fastapi import UploadFile, File

router = APIRouter(prefix="/homes/{home_id}/bills", tags=["bills"])


@router.post("/ocr", response_model=OcrDraft)
async def ocr_bill_photo(home_id: uuid.UUID, db: Session = Depends(get_db), file: UploadFile = File(...)):
    """ERD-OCR-01/02: lee una foto de factura y devuelve un BORRADOR para que la persona lo confirme
    o corrija. Nunca crea ni modifica una factura: el único camino real a la base de datos sigue
    siendo POST /homes/{home_id}/bills (ya validado), llamado después de que alguien confirme."""
    require_home(db, home_id)
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise InvalidInput("La imagen supera el máximo de 10MB")
    try:
        text = extract_text(content)
    except UnreadableImage as exc:
        raise InvalidInput(str(exc)) from exc
    return parse_bill_text(text)


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


@router.put("/{bill_id}", response_model=BillOut)
def update_bill(home_id: uuid.UUID, bill_id: uuid.UUID, payload: BillUpdate, db: Session = Depends(get_db)):
    return bills.update_bill(db, home_id, bill_id, payload)


@router.delete("/{bill_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bill(home_id: uuid.UUID, bill_id: uuid.UUID, db: Session = Depends(get_db)):
    bills.delete_bill(db, home_id, bill_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
