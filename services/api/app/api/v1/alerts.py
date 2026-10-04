import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, select
from sqlalchemy.orm import Session

from app.api.deps import get_home_or_404
from app.database import get_db
from app.models import Alert
from app.schemas.equipment import AlertOut, AlertSettingsIn, AlertSettingsOut, AlertStatusUpdate
from app.services.alerts import get_settings, recompute_alerts

router = APIRouter(prefix="/homes/{home_id}", tags=["alerts"])


@router.get("/alerts", response_model=list[AlertOut])
def list_alerts(home_id: uuid.UUID, status: Literal["unread", "read", "dismissed"] | None = Query(default=None),
                include_dismissed: bool = False, db: Session = Depends(get_db)):
    """Por defecto oculta las descartadas; `status` filtra por un estado concreto."""
    get_home_or_404(db, home_id)
    q = select(Alert).where(Alert.home_id == home_id)
    if status is not None:
        q = q.where(Alert.status == status)
    elif not include_dismissed:
        q = q.where(Alert.status != "dismissed")
    unread_first = case((Alert.status == "unread", 0), else_=1)
    return list(db.scalars(q.order_by(unread_first, Alert.basis_period_end.desc(), Alert.created_at.desc())))


@router.patch("/alerts/{alert_id}", response_model=AlertOut)
def update_alert_status(home_id: uuid.UUID, alert_id: uuid.UUID, payload: AlertStatusUpdate,
                        db: Session = Depends(get_db)):
    get_home_or_404(db, home_id)
    alert = db.get(Alert, alert_id)
    if alert is None or alert.home_id != home_id:
        raise HTTPException(status_code=404, detail="Alerta no encontrada para esta vivienda")
    alert.status = payload.status
    db.commit()
    return alert


@router.get("/alert-settings", response_model=AlertSettingsOut)
def read_settings(home_id: uuid.UUID, db: Session = Depends(get_db)):
    get_home_or_404(db, home_id)
    s = get_settings(db, home_id)
    db.commit()
    return s


@router.put("/alert-settings", response_model=AlertSettingsOut)
def update_settings(home_id: uuid.UUID, payload: AlertSettingsIn, db: Session = Depends(get_db)):
    get_home_or_404(db, home_id)
    s = get_settings(db, home_id)
    s.warning_pct, s.critical_pct = payload.warning_pct, payload.critical_pct
    db.flush()
    recompute_alerts(db, home_id)  # los umbrales nuevos aplican a todo el historial
    db.commit()
    return s
