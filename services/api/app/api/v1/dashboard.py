import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_home_or_404
from app.database import get_db
from app.schemas import DashboardOut
from app.services.dashboard import build_dashboard

router = APIRouter(prefix="/homes/{home_id}/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardOut)
def get_dashboard(home_id: uuid.UUID, bill_id: uuid.UUID | None = None, db: Session = Depends(get_db)):
    return build_dashboard(db, get_home_or_404(db, home_id), bill_id)
