import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_home_or_404
from app.database import get_db
from app.schemas.alert import AlertRecord, AlertSettingsIn, AlertSettingsOut, AlertStatusUpdate
from app.services.alerts import list_alert_records, thresholds, update_settings as save_settings, update_status

router = APIRouter(prefix="/homes/{home_id}", tags=["alerts"])


@router.get("/alerts", response_model=list[AlertRecord])
def list_alerts(home_id: uuid.UUID, status: Literal["unread", "read", "dismissed"] | None = Query(default=None),
                include_dismissed: bool = False, limit: int = Query(100, ge=1, le=500),
                offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    """Por defecto oculta las descartadas; `status` filtra por un estado concreto."""
    get_home_or_404(db, home_id)
    return list_alert_records(db, home_id, status, include_dismissed, limit, offset)


@router.patch("/alerts/{alert_id}", response_model=AlertRecord)
def update_alert_status(home_id: uuid.UUID, alert_id: uuid.UUID, payload: AlertStatusUpdate,
                        db: Session = Depends(get_db)):
    return update_status(db, home_id, alert_id, payload)


@router.get("/alert-settings", response_model=AlertSettingsOut)
def read_settings(home_id: uuid.UUID, db: Session = Depends(get_db)):
    get_home_or_404(db, home_id)
    warning_pct, critical_pct = thresholds(db, home_id)
    return AlertSettingsOut(home_id=home_id, warning_pct=warning_pct, critical_pct=critical_pct)


@router.put("/alert-settings", response_model=AlertSettingsOut)
def update_settings(home_id: uuid.UUID, payload: AlertSettingsIn, db: Session = Depends(get_db)):
    return save_settings(db, home_id, payload)
