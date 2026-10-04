import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_home_or_404
from app.database import get_db
from app.models import Equipment
from app.schemas.equipment import EquipmentEstimateOut, EquipmentIn, EquipmentOut
from app.services.equipment import build_estimate

router = APIRouter(prefix="/homes/{home_id}/equipment", tags=["equipment"])


def _get_or_404(db: Session, home_id: uuid.UUID, equipment_id: uuid.UUID) -> Equipment:
    e = db.get(Equipment, equipment_id)
    if e is None or e.home_id != home_id:
        raise HTTPException(status_code=404, detail="Equipo no encontrado para esta vivienda")
    return e


@router.get("", response_model=list[EquipmentOut])
def list_equipment(home_id: uuid.UUID, db: Session = Depends(get_db)):
    get_home_or_404(db, home_id)
    return list(db.scalars(
        select(Equipment).where(Equipment.home_id == home_id).order_by(Equipment.room, Equipment.name)
    ))


# Declarada antes de /{equipment_id} para que "estimate" no se interprete como id.
@router.get("/estimate", response_model=EquipmentEstimateOut)
def estimate(home_id: uuid.UUID, db: Session = Depends(get_db)):
    return build_estimate(db, get_home_or_404(db, home_id))


@router.post("", response_model=EquipmentOut, status_code=status.HTTP_201_CREATED)
def create_equipment(home_id: uuid.UUID, payload: EquipmentIn, db: Session = Depends(get_db)):
    get_home_or_404(db, home_id)
    e = Equipment(home_id=home_id, **payload.model_dump())
    db.add(e)
    db.commit()
    return e


@router.get("/{equipment_id}", response_model=EquipmentOut)
def get_equipment(home_id: uuid.UUID, equipment_id: uuid.UUID, db: Session = Depends(get_db)):
    get_home_or_404(db, home_id)
    return _get_or_404(db, home_id, equipment_id)


@router.put("/{equipment_id}", response_model=EquipmentOut)
def update_equipment(home_id: uuid.UUID, equipment_id: uuid.UUID, payload: EquipmentIn,
                     db: Session = Depends(get_db)):
    get_home_or_404(db, home_id)
    e = _get_or_404(db, home_id, equipment_id)
    for k, v in payload.model_dump().items():
        setattr(e, k, v)
    db.commit()
    return e


@router.delete("/{equipment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_equipment(home_id: uuid.UUID, equipment_id: uuid.UUID, db: Session = Depends(get_db)):
    get_home_or_404(db, home_id)
    db.delete(_get_or_404(db, home_id, equipment_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
