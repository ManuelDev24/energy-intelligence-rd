import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.anomaly import AnomalyRecord, AnomalyStatusIn, ScanQueuedOut
from app.services import anomaly_scan, jobs
from app.services.transactions import require_home

router = APIRouter(prefix="/homes/{home_id}/anomalies", tags=["anomalies"])


@router.get("", response_model=list[AnomalyRecord])
def get_anomalies(
    home_id: uuid.UUID,
    status: Literal["active", "open", "acknowledged", "dismissed", "resolved", "all"] = Query("active"),
    granularity: Literal["day", "month", "billing"] | None = Query(None),
    kind: Literal["increase", "drop", "peak", "night"] | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Anomalías persistidas (por defecto las vigentes: abiertas o revisadas). Solo lectura: las crea el escaneo."""
    return anomaly_scan.list_anomalies(db, home_id, status=status, granularity=granularity, kind=kind, limit=limit)


@router.post("/scan", response_model=ScanQueuedOut, status_code=202)
def request_scan(home_id: uuid.UUID, response: Response, db: Session = Depends(get_db)):
    """Pide un escaneo en segundo plano (una solicitud por minuto y vivienda; las repetidas se funden en una)."""
    from datetime import datetime, timezone
    require_home(db, home_id)
    now = datetime.now(timezone.utc)
    jobs.enqueue(db, "anomalies.scan_home", {"home_id": str(home_id)}, idempotency_key=f"{home_id}:{int(now.timestamp() // 60)}", now=now)
    response.headers["Cache-Control"] = "no-store"
    return ScanQueuedOut(status="queued")


@router.patch("/{anomaly_id}", response_model=AnomalyRecord)
def update_anomaly(home_id: uuid.UUID, anomaly_id: uuid.UUID, payload: AnomalyStatusIn, db: Session = Depends(get_db)):
    """Marcar como revisada, descartar (no reaparece) o reabrir."""
    return anomaly_scan.set_status(db, home_id, anomaly_id, payload.status)
