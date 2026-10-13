import uuid

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.reading import ReadingCreate, ReadingOut
from app.services import readings

router = APIRouter(prefix="/homes/{home_id}/readings", tags=["readings"])


@router.get("", response_model=list[ReadingOut])
def list_readings(home_id: uuid.UUID, limit: int = Query(100, ge=1, le=500),
                  offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    return readings.list_readings(db, home_id, limit=limit, offset=offset)


@router.post("", response_model=ReadingOut, status_code=status.HTTP_201_CREATED)
def create_reading(home_id: uuid.UUID, payload: ReadingCreate, db: Session = Depends(get_db)):
    return readings.create_reading(db, home_id, payload)


@router.delete("/{reading_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reading(home_id: uuid.UUID, reading_id: uuid.UUID, db: Session = Depends(get_db)):
    readings.delete_reading(db, home_id, reading_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
