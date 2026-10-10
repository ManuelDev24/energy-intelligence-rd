"""ERD-ANOM-01-COMPLETE: escaneo, persistencia y estados de anomalías por vivienda. Sin FastAPI.

`scan_home` es idempotente: vuelve a calcular todo dentro del horizonte y concilia con lo guardado por `dedupe_key`
(crea lo nuevo, actualiza lo vigente, reabre lo que reaparece, pasa a `resolved` lo que dejó de detectarse y respeta lo
descartado). Se invoca en línea tras escribir lecturas/facturas (dentro de un SAVEPOINT: un fallo del motor nunca
deshace la escritura del usuario), desde el trabajo `anomalies.scan_home` y desde el programador diario.
"""
import logging
from calendar import monthrange
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Anomaly, Bill, MeterReading
from app.services import anomaly_engine as engine
from app.services import consumption_calc as cc
from app.services.errors import ApplicationError, InvalidInput, NotFound
from app.services.transactions import require_home, write_transaction

log = logging.getLogger("energyrd.anomalies")
ACTIVE = ("open", "acknowledged")
USER_STATUSES = ("open", "acknowledged", "dismissed")
HISTORY_DAYS = 800  # lecturas que se cargan: horizonte + historial para la línea base
BILL_HORIZON_DAYS = 730


@dataclass
class ScanResult:
    created: list[Anomaly] = field(default_factory=list)
    updated: int = 0
    reopened: int = 0
    resolved: int = 0

    def as_dict(self) -> dict:
        return {"created": len(self.created), "updated": self.updated, "reopened": self.reopened, "resolved": self.resolved}


def _today(now: datetime | None) -> date:
    return (now or datetime.now(timezone.utc)).astimezone(cc.SANTO_DOMINGO).date()


def _months_back(day: date, months: int) -> date:
    index = day.year * 12 + day.month - 1 - months
    return date(index // 12, index % 12 + 1, 1)


def _month_end(day: date) -> date:
    return day.replace(day=monthrange(day.year, day.month)[1])


def compute_findings(db: Session, home_id, today: date, th: engine.Thresholds) -> tuple[list[engine.Finding], dict[str, date]]:
    """Todos los hallazgos del horizonte y, por granularidad, desde cuándo se evaluó (para saber qué se puede resolver)."""
    day_since = today - timedelta(days=settings.ANOMALY_HORIZON_DAYS)
    month_since = _months_back(today, settings.ANOMALY_HORIZON_MONTHS)
    bill_since = today - timedelta(days=BILL_HORIZON_DAYS)
    scope = {"day": day_since, "month": month_since, "billing": bill_since}
    findings: list[engine.Finding] = []

    cutoff = datetime.combine(today - timedelta(days=HISTORY_DAYS), datetime.min.time(), cc.SANTO_DOMINGO)
    readings = list(db.scalars(select(MeterReading).where(MeterReading.home_id == home_id, MeterReading.read_at >= cutoff)
                               .order_by(MeterReading.read_at, MeterReading.id)))
    if len(readings) >= 2:
        try:
            intervals = cc.intervals_from_readings([cc.MeterPoint(r.read_at, r.reading_kwh) for r in readings])
        except ValueError:  # lecturas inconsistentes (no debería pasar): no se inventa nada con ellas
            log.warning("anomaly scan skipped readings", extra={"home_id": str(home_id)})
            intervals = []
        if intervals:
            first = min(r.read_at.astimezone(cc.SANTO_DOMINGO).date() for r in readings)
            days = cc.allocate(intervals, cc.calendar_buckets("day", max(first, day_since - timedelta(days=engine.HISTORY_WINDOW * 2)), today))
            findings += engine.detect_shifts(engine.periods_from_buckets(days), source="readings", granularity="day", th=th, since=day_since)
            months = cc.allocate(intervals, cc.calendar_buckets("month", max(first.replace(day=1), _months_back(today, settings.ANOMALY_HORIZON_MONTHS + 7)), today))
            findings += engine.detect_shifts(engine.periods_from_buckets(months), source="readings", granularity="month", th=th, since=month_since)
            findings += engine.detect_night(intervals, th=th, since=day_since, reference_since=today - timedelta(days=30))

    bills = list(db.scalars(select(Bill).where(Bill.home_id == home_id, Bill.period_end >= bill_since - timedelta(days=BILL_HORIZON_DAYS))
                            .order_by(Bill.period_start, Bill.period_end)))
    findings += engine.detect_shifts(engine.periods_from_bills(bills), source="bills", granularity="billing", th=th, since=bill_since)
    return engine.drop_overlaps(findings), scope


def scan_home(db: Session, home_id, *, now: datetime | None = None, commit: bool = True, thresholds: engine.Thresholds | None = None) -> ScanResult:
    """Concilia los hallazgos actuales con lo guardado. `commit=False` deja el commit al llamador (misma transacción)."""
    current = now or datetime.now(timezone.utc)
    th = thresholds or engine.Thresholds.from_settings(settings)

    def run() -> ScanResult:
        require_home(db, home_id)
        findings, scope = compute_findings(db, home_id, _today(current), th)
        found = {f.dedupe_key: f for f in findings}
        stored = {a.dedupe_key: a for a in db.scalars(select(Anomaly).where(Anomaly.home_id == home_id).with_for_update()
                                                      .execution_options(populate_existing=True))}
        result = ScanResult()
        for key, f in found.items():
            row = stored.get(key)
            if row is None:
                row = Anomaly(home_id=home_id, bill_id=f.bill_id, kind=f.kind, source=f.source, granularity=f.granularity, severity=f.severity,
                              confidence=f.confidence, status="open", period_start=f.period_start, period_end=f.period_end,
                              observed_kwh=f.observed_kwh, baseline_kwh=f.baseline_kwh, delta_pct=f.delta_pct, days=f.days,
                              explanation=f.explanation, evidence=f.evidence, dedupe_key=key, detected_at=current,
                              last_seen_at=current, status_changed_at=current)
                db.add(row)
                result.created.append(row)
                continue
            if row.status == "dismissed":
                continue  # lo descartado por la persona no reaparece ni se modifica
            if row.status == "resolved":
                row.status, row.status_changed_at = "open", current
                result.reopened += 1
            for attr, value in (("severity", f.severity), ("confidence", f.confidence), ("observed_kwh", f.observed_kwh),
                                ("baseline_kwh", f.baseline_kwh), ("delta_pct", f.delta_pct), ("days", f.days),
                                ("explanation", f.explanation), ("evidence", f.evidence), ("bill_id", f.bill_id)):
                if getattr(row, attr) != value:
                    setattr(row, attr, value)
                    result.updated += 1
            row.last_seen_at = current
        for key, row in stored.items():
            if key in found or row.status not in ACTIVE:
                continue
            if row.period_end >= scope[row.granularity]:  # dentro de lo evaluado y ya no se detecta: se resuelve
                row.status, row.status_changed_at = "resolved", current
                result.resolved += 1
        db.flush()
        return result

    if not commit:
        return run()
    with write_transaction(db):
        return run()


def scan_after_write(db: Session, home_id) -> None:
    """Para los servicios de escritura: escanea dentro de la misma transacción y NUNCA hace fallar la escritura."""
    try:
        with db.begin_nested():
            scan_home(db, home_id, commit=False)
    except Exception:  # noqa: BLE001 — el escaneo diario lo reintenta; el dato del usuario ya es válido
        log.exception("anomaly scan failed after write", extra={"home_id": str(home_id)})


def list_anomalies(db: Session, home_id, *, status: str = "active", granularity: str | None = None, kind: str | None = None,
                   limit: int = 50) -> list[Anomaly]:
    require_home(db, home_id)
    query = select(Anomaly).where(Anomaly.home_id == home_id)
    if status == "active":
        query = query.where(Anomaly.status.in_(ACTIVE))
    elif status != "all":
        query = query.where(Anomaly.status == status)
    if granularity:
        query = query.where(Anomaly.granularity == granularity)
    if kind:
        query = query.where(Anomaly.kind == kind)
    return list(db.scalars(query.order_by(Anomaly.period_end.desc(), Anomaly.detected_at.desc(), Anomaly.id).limit(limit)
                           .execution_options(populate_existing=True)))


def set_status(db: Session, home_id, anomaly_id, status: str, *, now: datetime | None = None) -> Anomaly:
    if status not in USER_STATUSES:
        raise InvalidInput("Estado no válido")
    with write_transaction(db):
        row = db.scalar(select(Anomaly).where(Anomaly.id == anomaly_id, Anomaly.home_id == home_id).with_for_update()
                        .execution_options(populate_existing=True))
        if row is None:
            raise NotFound("Anomalía no encontrada")
        if row.status == "resolved":
            raise ApplicationError("Esta anomalía ya no se detecta; no se puede cambiar su estado")
        if row.status != status:
            row.status, row.status_changed_at = status, now or datetime.now(timezone.utc)
    return row


def homes_with_recent_data(db: Session, today: date) -> list:
    """Viviendas a escanear a diario: con lecturas del horizonte o facturas de los últimos 24 meses."""
    since = datetime.combine(today - timedelta(days=settings.ANOMALY_HORIZON_DAYS + 30), datetime.min.time(), cc.SANTO_DOMINGO)
    readings = select(MeterReading.home_id).where(MeterReading.read_at >= since)
    bills = select(Bill.home_id).where(Bill.period_end >= today - timedelta(days=BILL_HORIZON_DAYS))
    return sorted(set(db.scalars(readings)) | set(db.scalars(bills)), key=str)
