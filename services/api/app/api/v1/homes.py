import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_home_or_404
from app.database import get_db
from app.models import Home
from app.schemas import HomeCreate, HomeOut, HomeUpdate

router = APIRouter(prefix="/homes", tags=["homes"])


@router.get("", response_model=list[HomeOut])
def list_homes(db: Session = Depends(get_db)):
    return list(db.scalars(select(Home).order_by(Home.code, Home.created_at)))


@router.post("", response_model=HomeOut, status_code=status.HTTP_201_CREATED)
def create_home(payload: HomeCreate, db: Session = Depends(get_db)):
    home = Home(**payload.model_dump())
    db.add(home)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Ya existe una vivienda con ese código")
    return home


@router.get("/{home_id}", response_model=HomeOut)
def get_home(home_id: uuid.UUID, db: Session = Depends(get_db)):
    return get_home_or_404(db, home_id)


@router.patch("/{home_id}", response_model=HomeOut)
def update_home(home_id: uuid.UUID, payload: HomeUpdate, db: Session = Depends(get_db)):
    home = get_home_or_404(db, home_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is None:
        raise HTTPException(status_code=422, detail="name no puede ser null")
    if "distributor" in data and data["distributor"] is None:
        raise HTTPException(status_code=422, detail="distributor no puede ser null")
    for k, v in data.items():
        setattr(home, k, v)
    db.commit()
    return home


@router.delete("/{home_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_home(home_id: uuid.UUID, db: Session = Depends(get_db)):
    db.delete(get_home_or_404(db, home_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
