"""ERD-SCORE-01: arma los hechos de una vivienda, aplica la fórmula pura (`energy_score_engine`) y devuelve el resultado.
Sin FastAPI. Solo lectura: el puntaje se deriva cada vez de los datos actuales (no se guarda), así que no puede quedar
desfasado ni contradecir a las pantallas de origen."""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Anomaly, Bill, MeterReading, Recommendation
from app.schemas.energy_score import EnergyScoreOut, ScoreComponentOut
from app.services import consumption_calc as cc
from app.services import energy_score_engine as engine
from app.services import recommendation_engine as reco_engine
from app.services import recommendations
from app.services.transactions import require_home

FROZEN = recommendations.FROZEN


def gather_facts(db: Session, home_id, today: date) -> engine.ScoreFacts:
    reco = recommendations.gather_facts(db, home_id)
    decided = set(db.scalars(select(Recommendation.dedupe_key).where(Recommendation.home_id == home_id, Recommendation.status.in_(FROZEN))))
    candidates = [c for c in reco_engine.evaluate(reco) if c.category == "equipment" and c.dedupe_key not in decided]
    potential = sum((c.savings_kwh or Decimal(0) for c in candidates), Decimal(0))

    bills = list(db.scalars(select(Bill).where(Bill.home_id == home_id).order_by(Bill.period_start, Bill.period_end)))
    last_read, count = db.execute(select(func.max(MeterReading.read_at), func.count()).where(MeterReading.home_id == home_id)).one()
    since = datetime.combine(today - timedelta(days=90), datetime.min.time(), cc.SANTO_DOMINGO)
    count_90 = db.scalar(select(func.count()).where(MeterReading.home_id == home_id, MeterReading.read_at >= since)) or 0
    anomalies = [
        engine.AnomalyFact(severity=a.severity, status=a.status, period_end=a.period_end)
        for a in db.scalars(select(Anomaly).where(Anomaly.home_id == home_id, Anomaly.status.in_(("open", "acknowledged")),
                                                  Anomaly.period_end >= today - timedelta(days=engine.ANOMALY_WINDOW_DAYS)))
    ]
    return engine.ScoreFacts(
        today=today,
        bills=[engine.BillFact(b.period_start, b.period_end, b.days, b.kwh, b.due_date, b.paid_at is not None) for b in bills],
        goal_kwh=reco.goal_kwh, projected_kwh=reco.projected_kwh,
        equipment_count=len(reco.equipment), equipment_monthly_kwh=sum((e.monthly_kwh for e in reco.equipment), Decimal(0)),
        potential_savings_kwh=potential,
        readings_count=count or 0,
        last_reading_days_ago=None if last_read is None else max((today - last_read.astimezone(cc.SANTO_DOMINGO).date()).days, 0),
        readings_count_90d=count_90, anomalies=anomalies,
    )


def build_score(db: Session, home_id, *, now: datetime | None = None) -> EnergyScoreOut:
    require_home(db, home_id)
    today = (now or datetime.now(timezone.utc)).astimezone(cc.SANTO_DOMINGO).date()
    result = engine.evaluate(gather_facts(db, home_id, today))
    return EnergyScoreOut(
        home_id=home_id, score_version=engine.SCORE_VERSION, as_of=today, status="ok" if result.score is not None else "insufficient_data",
        score=result.score, band=result.band, band_label=result.band_label, quality="INFERRED", coverage_pct=result.coverage_pct,
        components=[ScoreComponentOut(key=c.key, label=c.label, weight=c.weight, score=c.score, available=c.available,
                                      summary=engine.SUMMARY[c.key], detail=c.detail, inputs=c.inputs, reasons=list(c.reasons),
                                      next_step=engine.NEXT_STEP[c.key]) for c in result.components],
        reasons=list(result.reasons), method=engine.METHOD, note=engine.NOTE,
    )
