import uuid
from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.equipment import EquipmentEstimateOut, EquipmentIn, EquipmentOut
from app.services import equipment
from app.services.transactions import require_home

router = APIRouter(prefix="/homes/{home_id}/equipment", tags=["equipment"])

@router.get("", response_model=list[EquipmentOut])
def list_equipment(home_id: uuid.UUID, limit: int = Query(100, ge=1, le=500),
                   offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    return equipment.list_equipment(db, home_id, limit, offset)

@router.get("/estimate", response_model=EquipmentEstimateOut)
def estimate(home_id: uuid.UUID, db: Session = Depends(get_db)):
    return equipment.build_estimate(db, require_home(db, home_id))

@router.post("", response_model=EquipmentOut, status_code=status.HTTP_201_CREATED)
def create_equipment(home_id: uuid.UUID, payload: EquipmentIn, db: Session = Depends(get_db)):
    return equipment.save_equipment(db, home_id, payload)

@router.get("/{equipment_id}", response_model=EquipmentOut)
def get_equipment(home_id: uuid.UUID, equipment_id: uuid.UUID, db: Session = Depends(get_db)):
    require_home(db, home_id)
    return equipment.get_equipment(db, home_id, equipment_id)

@router.put("/{equipment_id}", response_model=EquipmentOut)
def update_equipment(home_id: uuid.UUID, equipment_id: uuid.UUID, payload: EquipmentIn, db: Session = Depends(get_db)):
    return equipment.save_equipment(db, home_id, payload, equipment_id)

@router.delete("/{equipment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_equipment(home_id: uuid.UUID, equipment_id: uuid.UUID, db: Session = Depends(get_db)):
    equipment.delete_equipment(db, home_id, equipment_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
