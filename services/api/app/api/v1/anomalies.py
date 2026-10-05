import uuid
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.anomaly import AnomalyRecord
from app.services.anomaly_api import list_anomalies

router = APIRouter(prefix="/homes/{home_id}", tags=["anomalies"])


@router.get("/anomalies", response_model=list[AnomalyRecord])
def get_anomalies(
    home_id: uuid.UUID,
    granularity: Literal["day", "month"] = Query("month"),
    warning_delta_pct: Decimal = Query(Decimal("50"), gt=0, le=1000),
    critical_delta_pct: Decimal = Query(Decimal("100"), gt=0, le=1000),
    db: Session = Depends(get_db),
):
    """Detecta solo el último período comparable; no crea alertas persistentes."""
    if critical_delta_pct < warning_delta_pct:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="critical_delta_pct debe ser >= warning_delta_pct")
    return list_anomalies(db, home_id, granularity, warning_delta_pct=warning_delta_pct,
                          critical_delta_pct=critical_delta_pct)
