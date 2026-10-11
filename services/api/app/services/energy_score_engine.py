"""ERD-SCORE-01: Energy Score 0–100. Puro: sin HTTP, ORM ni base de datos. La fórmula vive SOLO aquí (el backend manda).

Cuatro componentes, cada uno de 0 a 100 y con su explicación. Si a un componente le faltan datos NO se rellena: queda
«sin datos» y su peso se reparte entre los demás. Con menos de dos componentes disponibles no hay puntaje.

| Componente   | Peso | Qué mide                                                        | De dónde sale                       |
|--------------|------|-----------------------------------------------------------------|-------------------------------------|
| Consumo      | 35   | proyección vs. meta mensual, o ritmo diario vs. historial       | meta + facturas                     |
| Eficiencia   | 25   | cuánto de lo que consumen tus equipos aún se podría ahorrar     | equipos + recomendaciones (SAVE-01) |
| Hábitos      | 15   | lecturas al día, factura reciente y pagos a tiempo              | lecturas + facturas                 |
| Consistencia | 25   | pocas desviaciones recientes y consumo estable entre facturas   | anomalías (ANOM-01) + facturas      |

El resultado es un indicador interno, INFERIDO a partir de otros datos: orientativo, no una medición. Subir la fórmula o
los pesos exige subir `SCORE_VERSION`.
"""
from dataclasses import dataclass, field
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from statistics import median
from typing import Literal, Sequence

SCORE_VERSION = 1
Key = Literal["consumption", "efficiency", "habits", "consistency"]
WEIGHTS: dict[str, int] = {"consumption": 35, "efficiency": 25, "habits": 15, "consistency": 25}
LABELS = {"consumption": "Consumo", "efficiency": "Eficiencia", "habits": "Hábitos", "consistency": "Consistencia"}
SUMMARY = {
    "consumption": "Si tu consumo va dentro de tu meta o de tu ritmo habitual.",
    "efficiency": "Cuánto de lo que consumen tus equipos aún se podría ahorrar con las recomendaciones.",
    "habits": "Si registras lecturas, mantienes las facturas al día y pagas a tiempo.",
    "consistency": "Si tu consumo es estable y sin desviaciones recientes.",
}
NEXT_STEP = {
    "consumption": "Define una meta mensual en kWh y registra tus facturas al cerrar cada ciclo.",
    "efficiency": "Declara tus equipos y aplica las recomendaciones de Ahorro.",
    "habits": "Registra una lectura del medidor cada semana y tus facturas cuando lleguen.",
    "consistency": "Revisa las desviaciones abiertas en Alertas y márcalas como revisadas.",
}
BANDS = (("good", "Bueno", 70), ("fair", "Regular", 40), ("poor", "Mejorable", 0))
MIN_COMPONENTS = 2
NOTE = ("Indicador interno INFERIDO a partir de tus facturas, lecturas, equipos y desviaciones. Es orientativo, no una medición, "
        "y los componentes sin datos no se rellenan.")
METHOD = ("Promedio ponderado de los componentes con datos (Consumo 35, Eficiencia 25, Hábitos 15, Consistencia 25), "
          "con los pesos repartidos entre los disponibles.")
ANOMALY_PENALTY = {"critical": 30, "warning": 15, "info": 5}
ANOMALY_WINDOW_DAYS = 90


def d(value) -> Decimal:
    return Decimal(str(value))


def clamp(value: Decimal) -> Decimal:
    return max(Decimal(0), min(Decimal(100), value))


def to_int(value: Decimal) -> int:
    return int(clamp(value).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def linear(value: Decimal, best: Decimal, worst: Decimal) -> Decimal:
    """100 en `best` o mejor, 0 en `worst` o peor, recta entre ambos (sirve con best < worst y con best > worst)."""
    if best == worst:
        return Decimal(100)
    return clamp((value - worst) / (best - worst) * 100)


@dataclass(frozen=True)
class BillFact:
    period_start: date
    period_end: date
    days: int
    kwh: Decimal
    due_date: date | None = None
    paid: bool = False

    @property
    def rate(self) -> Decimal | None:
        return self.kwh / self.days if self.days > 0 and self.kwh > 0 else None


@dataclass(frozen=True)
class AnomalyFact:
    severity: str            # info | warning | critical
    status: str              # open | acknowledged
    period_end: date


@dataclass(frozen=True)
class ScoreFacts:
    today: date
    bills: Sequence[BillFact] = ()                 # de la más antigua a la más reciente
    goal_kwh: Decimal | None = None
    projected_kwh: Decimal | None = None
    equipment_count: int = 0
    equipment_monthly_kwh: Decimal = Decimal(0)
    potential_savings_kwh: Decimal = Decimal(0)    # recomendaciones de equipos vigentes (sin aplicadas ni descartadas)
    readings_count: int = 0
    last_reading_days_ago: int | None = None
    readings_count_90d: int = 0
    anomalies: Sequence[AnomalyFact] = ()


@dataclass(frozen=True)
class Component:
    key: str
    weight: int
    score: int | None
    detail: str
    inputs: dict[str, str] = field(default_factory=dict)
    reasons: tuple[str, ...] = ()

    @property
    def label(self) -> str:
        return LABELS[self.key]

    @property
    def available(self) -> bool:
        return self.score is not None


@dataclass(frozen=True)
class ScoreResult:
    score: int | None
    band: str | None
    band_label: str | None
    coverage_pct: int
    components: tuple[Component, ...]
    reasons: tuple[str, ...]


def _none(key: str, *reasons: str) -> Component:
    return Component(key, WEIGHTS[key], None, "Sin datos suficientes para calcular este componente.", {}, tuple(reasons))


def consumption(f: ScoreFacts) -> Component:
    if f.goal_kwh is not None and f.projected_kwh is not None and f.goal_kwh > 0:
        ratio = f.projected_kwh / f.goal_kwh
        score = to_int(linear(ratio, Decimal(1), Decimal("1.5")))      # ≤ 100 % de la meta = 100; ≥ 150 % = 0
        return Component("consumption", WEIGHTS["consumption"], score,
                         f"La próxima factura se proyecta en {f.projected_kwh.quantize(Decimal('0.01'))} kWh frente a tu meta de "
                         f"{f.goal_kwh.quantize(Decimal('0.01'))} kWh ({(ratio * 100).quantize(Decimal('1'))} % de la meta).",
                         {"method": "goal", "projected_kwh": str(f.projected_kwh.quantize(Decimal("0.01"))),
                          "goal_kwh": str(f.goal_kwh.quantize(Decimal("0.01"))), "ratio_pct": str((ratio * 100).quantize(Decimal("0.1")))})
    rates = [r for b in f.bills if (r := b.rate) is not None]
    if len(rates) >= 4:
        latest, prior = rates[-1], rates[-7:-1]
        baseline = d(median(prior))
        change = (latest - baseline) / baseline * 100
        score = to_int(linear(change, Decimal(0), Decimal(50)))        # igual o menor que lo habitual = 100; +50 % = 0
        return Component("consumption", WEIGHTS["consumption"], score,
                         f"Tu última factura promedia {latest.quantize(Decimal('0.01'))} kWh/día frente a {baseline.quantize(Decimal('0.01'))} "
                         f"kWh/día de tus facturas anteriores ({change.quantize(Decimal('1'))} %).",
                         {"method": "history", "latest_kwh_per_day": str(latest.quantize(Decimal("0.01"))),
                          "baseline_kwh_per_day": str(baseline.quantize(Decimal("0.01"))), "change_pct": str(change.quantize(Decimal("0.1"))),
                          "bills_used": str(len(prior) + 1)})
    return _none("consumption", "Define una meta mensual en kWh (y registra ≥ 2 facturas) o registra al menos 4 facturas.")


def efficiency(f: ScoreFacts) -> Component:
    if f.equipment_count < 1 or f.equipment_monthly_kwh <= 0:
        return _none("efficiency", "Declara al menos un equipo con su potencia y horas de uso.")
    pct = f.potential_savings_kwh / f.equipment_monthly_kwh * 100
    score = to_int(linear(pct, Decimal(0), Decimal(50)))               # nada por ahorrar = 100; 50 % o más por ahorrar = 0
    return Component("efficiency", WEIGHTS["efficiency"], score,
                     f"Tus recomendaciones vigentes podrían ahorrar ≈ {f.potential_savings_kwh.quantize(Decimal('0.01'))} kWh de "
                     f"≈ {f.equipment_monthly_kwh.quantize(Decimal('0.01'))} kWh al mes que estiman tus equipos ({pct.quantize(Decimal('1'))} %).",
                     {"potential_savings_kwh": str(f.potential_savings_kwh.quantize(Decimal("0.01"))),
                      "equipment_monthly_kwh": str(f.equipment_monthly_kwh.quantize(Decimal("0.01"))), "potential_pct": str(pct.quantize(Decimal("0.1"))),
                      "equipment_count": str(f.equipment_count)})


def habits(f: ScoreFacts) -> Component:
    parts: list[tuple[str, Decimal, str]] = []
    if f.last_reading_days_ago is not None:
        s = linear(Decimal(f.last_reading_days_ago), Decimal(7), Decimal(30))     # ≤ 7 días = 100; ≥ 30 = 0
        parts.append(("lecturas", s, f"tu última lectura fue hace {f.last_reading_days_ago} días"))
    if f.bills:
        gap = (f.today - f.bills[-1].period_end).days
        s = linear(Decimal(max(gap, 0)), Decimal(35), Decimal(90))                # ≤ 35 días desde el cierre = 100; ≥ 90 = 0
        parts.append(("factura reciente", s, f"tu última factura cerró hace {max(gap, 0)} días"))
    due = [b for b in f.bills[-6:] if b.due_date is not None and (b.paid or b.due_date < f.today)]
    if due:
        ok = sum(1 for b in due if b.paid)
        parts.append(("pagos", Decimal(ok) / len(due) * 100, f"{ok} de {len(due)} facturas con fecha límite están pagadas"))
    if not parts:
        return _none("habits", "Registra una lectura del medidor o una factura.")
    score = to_int(sum((p[1] for p in parts), Decimal(0)) / len(parts))
    return Component("habits", WEIGHTS["habits"], score, "; ".join(p[2] for p in parts).capitalize() + ".",
                     {p[0]: str(to_int(p[1])) for p in parts})


def consistency(f: ScoreFacts) -> Component:
    parts: list[tuple[str, Decimal, str]] = []
    recent = [a for a in f.anomalies if a.status in ("open", "acknowledged") and (f.today - a.period_end).days <= ANOMALY_WINDOW_DAYS]
    if len(f.bills) >= 2 or f.readings_count_90d >= 2:
        penalty = sum((Decimal(ANOMALY_PENALTY.get(a.severity, 0)) * (Decimal("0.5") if a.status == "acknowledged" else 1) for a in recent), Decimal(0))
        parts.append(("desviaciones", clamp(100 - penalty), f"{len(recent)} desviaciones abiertas o revisadas en los últimos {ANOMALY_WINDOW_DAYS} días"))
    rates = [r for b in f.bills if (r := b.rate) is not None][-6:]
    if len(rates) >= 3:
        mean = sum(rates, Decimal(0)) / len(rates)
        variance = sum(((r - mean) ** 2 for r in rates), Decimal(0)) / len(rates)
        cv = variance.sqrt() / mean
        parts.append(("estabilidad", linear(cv, Decimal("0.10"), Decimal("0.50")), f"la variación entre tus últimas {len(rates)} facturas es de {(cv * 100).quantize(Decimal('1'))} %"))
    if not parts:
        return _none("consistency", "Registra al menos 2 facturas (o 2 lecturas) para comparar.")
    score = to_int(sum((p[1] for p in parts), Decimal(0)) / len(parts))
    return Component("consistency", WEIGHTS["consistency"], score, "; ".join(p[2] for p in parts).capitalize() + ".",
                     {p[0]: str(to_int(p[1])) for p in parts} | {"anomalies": str(len(recent))})


def band_for(score: int) -> tuple[str, str]:
    for key, label, minimum in BANDS:
        if score >= minimum:
            return key, label
    return BANDS[-1][0], BANDS[-1][1]


def evaluate(facts: ScoreFacts) -> ScoreResult:
    components = (consumption(facts), efficiency(facts), habits(facts), consistency(facts))
    available = [c for c in components if c.available]
    coverage = sum(c.weight for c in available)
    if len(available) < MIN_COMPONENTS:
        return ScoreResult(None, None, None, coverage, components,
                           (f"Hacen falta datos de al menos {MIN_COMPONENTS} componentes; hoy hay {len(available)}.",))
    total = sum((Decimal(c.score) * c.weight for c in available), Decimal(0)) / coverage
    score = to_int(total)
    band, label = band_for(score)
    return ScoreResult(score, band, label, coverage, components, ())
