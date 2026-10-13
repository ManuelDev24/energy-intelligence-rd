import uuid
from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.api.auth_deps import current_user, require_home_owner
from app.schemas import HomeCreate, HomeOut, HomeUpdate
from app.services import homes, contracts
from app.schemas.contract import ContractIn, ContractOut
from app.services.transactions import require_home

router = APIRouter(prefix="/homes", tags=["homes"])

@router.get("", response_model=list[HomeOut])
def list_homes(limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0), db: Session = Depends(get_db), user=Depends(current_user)):
    return homes.list_homes(db, limit, offset, user_id=user.id if user else None)

@router.post("", response_model=HomeOut, status_code=status.HTTP_201_CREATED)
def create_home(payload: HomeCreate, db: Session = Depends(get_db), user=Depends(current_user)):
    return homes.create_home(db, payload, owner_id=user.id if user else None)

@router.get("/{home_id}", response_model=HomeOut)
def get_home(home_id: uuid.UUID, db: Session = Depends(get_db)):
    return require_home(db, home_id)

@router.patch("/{home_id}", response_model=HomeOut)
def update_home(home_id: uuid.UUID, payload: HomeUpdate, db: Session = Depends(get_db)):
    return homes.update_home(db, home_id, payload)

@router.get("/{home_id}/contract", response_model=ContractOut)
def get_contract(home_id: uuid.UUID, db: Session = Depends(get_db)):
    return contracts.get_contract(db, home_id)

@router.put("/{home_id}/contract", response_model=ContractOut)
def put_contract(home_id: uuid.UUID, payload: ContractIn, db: Session = Depends(get_db)):
    return contracts.put_contract(db, home_id, payload)

@router.delete("/{home_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_home_owner)])
def delete_home(home_id: uuid.UUID, db: Session = Depends(get_db)):
    homes.delete_home(db, home_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
