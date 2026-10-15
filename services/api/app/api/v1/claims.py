import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.auth_deps import current_user
from app.database import get_db
from app.schemas.claim import ClaimCloseIn, ClaimDetailOut, ClaimIn, ClaimNoteIn, ClaimOut, ClaimReferenceIn
from app.services import claims

router = APIRouter(prefix="/homes/{home_id}/claims", tags=["claims"])


@router.post("", response_model=ClaimDetailOut, status_code=status.HTTP_201_CREATED)
def create_claim(home_id: uuid.UUID, payload: ClaimIn, db: Session = Depends(get_db), user=Depends(current_user)):
    """Crea el caso con un resumen NEUTRAL de tus datos. No presenta nada ante la distribuidora ni afirma que haya un error."""
    try:
        claim = claims.create_claim(db, home_id, payload, user_id=user.id if user else None)
    except IntegrityError as error:  # carrera: dos envíos a la vez; el índice parcial gana
        db.rollback()
        raise claims.delete_integrity_error(error) from error
    return claims.claim_detail(db, home_id, claim.id)


@router.get("", response_model=list[ClaimOut])
def list_claims(home_id: uuid.UUID, claim_status: Literal["open", "in_review", "resolved", "closed"] | None = Query(None, alias="status"),
                limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    return claims.list_claims(db, home_id, status=claim_status, limit=limit, offset=offset)


@router.get("/{claim_id}", response_model=ClaimDetailOut)
def get_claim(home_id: uuid.UUID, claim_id: uuid.UUID, response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    return claims.claim_detail(db, home_id, claim_id)


@router.post("/{claim_id}/notes", response_model=ClaimDetailOut, status_code=status.HTTP_201_CREATED)
def add_note(home_id: uuid.UUID, claim_id: uuid.UUID, payload: ClaimNoteIn, db: Session = Depends(get_db)):
    claims.add_note(db, home_id, claim_id, payload.note)
    return claims.claim_detail(db, home_id, claim_id)


@router.put("/{claim_id}/reference", response_model=ClaimDetailOut)
def set_reference(home_id: uuid.UUID, claim_id: uuid.UUID, payload: ClaimReferenceIn, db: Session = Depends(get_db)):
    claims.set_reference(db, home_id, claim_id, payload.reference_number)
    return claims.claim_detail(db, home_id, claim_id)


@router.post("/{claim_id}/close", response_model=ClaimDetailOut)
def close_claim(home_id: uuid.UUID, claim_id: uuid.UUID, db: Session = Depends(get_db), payload: ClaimCloseIn | None = None):
    claims.close_claim(db, home_id, claim_id, payload.note if payload else None)
    return claims.claim_detail(db, home_id, claim_id)
