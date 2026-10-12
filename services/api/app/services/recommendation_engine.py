"""ERD-SAVE-01: motor de recomendaciones de ahorro. Puro: sin HTTP, ORM ni base de datos.

Cada regla tiene `id` y `version`; el conjunto tiene `RULESET_VERSION`. Subir la versión de una regla actualiza las
recomendaciones vigentes que la usan; lo aplicado o descartado por la persona no se toca.

Reglas de honestidad:
- Todo ahorro es una ESTIMACIÓN con sus supuestos escritos en la propia recomendación (potencia nominal declarada,
  horas declaradas, 30 días por mes). Nunca se presenta como medición ni como garantía.
- Un equipo recibe como máximo UNA recomendación (la regla específica de su tipo o, si no hay, «mayor consumidor»),
  así que los ahorros por equipo se pueden sumar sin contar dos veces lo mismo.
- Las recomendaciones de meta, anomalía y datos no llevan ahorro: orientan, no prometen.
- Los RD$ salen del precio medio de las últimas facturas (incluye cargos fijos e impuestos); sin facturas, solo kWh.
"""
from dataclasses import dataclass, field
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Callable, Sequence
from uuid import UUID

RULESET_VERSION = 1
DAYS_PER_MONTH = Decimal(30)
MIN_SAVING_KWH = Decimal(1)          # por debajo de esto no vale la pena mostrar nada
TOP_CONSUMER_SHARE = Decimal(40)     # % del consumo estimado de los equipos declarados
TOP_CONSUMER_REDUCTION = Decimal("0.10")
ACTIVE_ANOMALY_SEVERITIES = ("warning", "critical")
SAVINGS_NOTE = ("Ahorro ESTIMADO: potencia nominal × horas declaradas × 30 días. No es una medición ni una garantía; "
                "depende de cómo uses el equipo.")


def q2(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class EquipmentFact:
    id: UUID
    name: str
    kind: str
    power_w: Decimal
    hours_per_day: Decimal
    share_pct: Decimal
    monthly_kwh: Decimal


@dataclass(frozen=True)
class AnomalyFact:
    id: UUID
    kind: str
    severity: str
    period_start: date
    period_end: date
    delta_pct: Decimal | None


@dataclass(frozen=True)
class Facts:
    equipment: Sequence[EquipmentFact] = ()
    price_per_kwh: Decimal | None = None       # RD$/kWh medio de las últimas facturas (ESTIMATED)
    bills_count: int = 0
    goal_kwh: Decimal | None = None
    goal_amount_dop: Decimal | None = None
    projected_kwh: Decimal | None = None
    projected_amount_dop: Decimal | None = None
    anomalies: Sequence[AnomalyFact] = ()


@dataclass(frozen=True)
class Candidate:
    rule_id: str
    rule_version: int
    dedupe_key: str
    category: str
    title: str
    summary: str
    action: str
    confidence: str
    savings_kwh: Decimal | None = None
    savings_dop: Decimal | None = None
    equipment_id: UUID | None = None
    anomaly_id: UUID | None = None
    assumptions: tuple[str, ...] = ()
    evidence: dict = field(default_factory=dict)


# ---------- Reglas por tipo de equipo ----------
def _kwh(power_w: Decimal, hours: Decimal) -> Decimal:
    return power_w * hours / 1000 * DAYS_PER_MONTH


@dataclass(frozen=True)
class EquipmentRule:
    rule_id: str
    version: int
    kinds: tuple[str, ...]
    title: str
    action: str
    confidence: str
    assumption: str
    saved_kwh: Callable[[EquipmentFact], Decimal | None]   # None = la regla no aplica a este equipo


RULES: tuple[EquipmentRule, ...] = (
    EquipmentRule(
        "ac-one-hour", 1, ("air_conditioner",), "Una hora menos de aire acondicionado al día",
        "Sube el termostato a 24–25 °C, cierra puertas y ventanas, limpia los filtros y apaga el equipo al salir. "
        "Un ventilador puede cubrir parte de esas horas.", "medium",
        "Se supone que el compresor trabaja a la potencia nominal declarada durante cada hora.",
        lambda e: _kwh(e.power_w, Decimal(1)) if e.hours_per_day >= 4 else None),
    EquipmentRule(
        "water-heater-half-hour", 1, ("water_heater",), "Media hora menos de calentador al día",
        "Enciéndelo solo cuando lo necesites, baja el termostato y apágalo después de usarlo.", "medium",
        "Se supone que el calentador consume su potencia nominal durante cada hora declarada.",
        lambda e: _kwh(e.power_w, Decimal("0.5")) if e.hours_per_day >= 1 else None),
    EquipmentRule(
        "pool-pump-six-hours", 1, ("pool_pump",), "Filtrar la piscina 6 horas al día basta en la mayoría de los casos",
        "Programa la bomba en 6 horas diarias (mejor de día) y revisa que el filtro esté limpio.", "medium",
        "Se supone que 6 horas bastan para el volumen de la piscina; confírmalo con quien la mantiene.",
        lambda e: _kwh(e.power_w, e.hours_per_day - 6) if e.hours_per_day > 6 else None),
    EquipmentRule(
        "lighting-led", 1, ("lighting",), "Pasar la iluminación a LED",
        "Cambia las lámparas incandescentes o fluorescentes más usadas por LED de potencia equivalente.", "low",
        "Se supone un ahorro del 60 % frente a lámparas no LED; si ya son LED, no habrá ahorro.",
        lambda e: e.monthly_kwh * Decimal("0.6") if e.monthly_kwh >= 5 else None),
    EquipmentRule(
        "always-on-two-hours", 1, ("tv", "computer", "fan"), "Dos horas menos de uso o de espera al día",
        "Apágalo del todo (no en espera) cuando nadie lo usa y desenchúfalo si pasa horas sin servir.", "medium",
        "Se supone que durante esas dos horas el equipo consume su potencia nominal declarada.",
        lambda e: _kwh(e.power_w, Decimal(2)) if e.hours_per_day >= 12 else None),
    EquipmentRule(
        "fridge-care", 1, ("refrigerator",), "Cuidar la nevera: sellos, temperatura y ubicación",
        "Revisa que la puerta selle bien, ajusta la temperatura a 3–5 °C (nevera) y −18 °C (congelador) y deja espacio para ventilar.",
        "low", "Se supone un ahorro del 5 % del consumo estimado de la nevera con mejores hábitos de uso.",
        lambda e: e.monthly_kwh * Decimal("0.05") if e.share_pct >= 20 else None),
)
RULE_BY_KIND = {kind: rule for rule in RULES for kind in rule.kinds}


def _money(kwh: Decimal | None, price: Decimal | None) -> Decimal | None:
    return None if kwh is None or price is None else q2(kwh * price)


def _equipment_candidate(e: EquipmentFact, facts: Facts) -> Candidate | None:
    rule = RULE_BY_KIND.get(e.kind)
    saved = rule.saved_kwh(e) if rule is not None else None
    if rule is not None and saved is not None and q2(saved) >= MIN_SAVING_KWH:
        kwh = q2(saved)
        return Candidate(
            rule_id=rule.rule_id, rule_version=rule.version, dedupe_key=f"{rule.rule_id}:{e.id}", category="equipment",
            title=f"{rule.title} ({e.name})", confidence=rule.confidence, equipment_id=e.id, savings_kwh=kwh,
            savings_dop=_money(kwh, facts.price_per_kwh), action=rule.action,
            summary=(f"{e.name} usa unas {q2(e.hours_per_day)} h al día y es {q2(e.share_pct)} % del consumo estimado de tus equipos "
                     f"(≈ {q2(e.monthly_kwh)} kWh al mes)."),
            assumptions=(rule.assumption, "Un mes tiene 30 días.",
                         *(() if facts.price_per_kwh is None else ("Los RD$ usan el precio medio de tus últimas facturas.",))),
            evidence={"equipment": e.name, "kind": e.kind, "power_w": str(e.power_w), "hours_per_day": str(e.hours_per_day),
                      "share_pct": str(q2(e.share_pct)), "monthly_kwh": str(q2(e.monthly_kwh)),
                      **({"price_per_kwh": str(q2(facts.price_per_kwh))} if facts.price_per_kwh is not None else {})},
        )
    if e.share_pct >= TOP_CONSUMER_SHARE:
        kwh = q2(e.monthly_kwh * TOP_CONSUMER_REDUCTION)
        if kwh < MIN_SAVING_KWH:
            return None
        return Candidate(
            rule_id="top-consumer", rule_version=1, dedupe_key=f"top-consumer:{e.id}", category="equipment",
            title=f"Revisa cómo usas {e.name}: es tu mayor consumidor", confidence="low", equipment_id=e.id,
            savings_kwh=kwh, savings_dop=_money(kwh, facts.price_per_kwh),
            summary=f"{e.name} concentra {q2(e.share_pct)} % del consumo estimado de tus equipos (≈ {q2(e.monthly_kwh)} kWh al mes).",
            action="Revisa cuántas horas lo usas de verdad, apágalo cuando no haga falta y mira si hay un modo de ahorro.",
            assumptions=("Se supone que un uso más atento reduce el consumo de este equipo un 10 %.", "Un mes tiene 30 días.",
                         *(() if facts.price_per_kwh is None else ("Los RD$ usan el precio medio de tus últimas facturas.",))),
            evidence={"equipment": e.name, "kind": e.kind, "share_pct": str(q2(e.share_pct)), "monthly_kwh": str(q2(e.monthly_kwh))},
        )
    return None


def _goal_candidate(facts: Facts, covered_kwh: Decimal) -> Candidate | None:
    if facts.goal_kwh is not None and facts.projected_kwh is not None and facts.projected_kwh > facts.goal_kwh:
        gap = q2(facts.projected_kwh - facts.goal_kwh)
        covers = f" Las recomendaciones de equipos podrían cubrir ≈ {q2(covered_kwh)} kWh." if covered_kwh > 0 else ""
        return Candidate(
            rule_id="goal-gap", rule_version=1, dedupe_key="goal-gap", category="goal", confidence="medium",
            title="La próxima factura superaría tu meta de consumo",
            summary=(f"La proyección de la próxima factura es {q2(facts.projected_kwh)} kWh y tu meta mensual es {q2(facts.goal_kwh)} kWh: "
                     f"faltan {gap} kWh por recortar.{covers}"),
            action="Empieza por las recomendaciones de equipos con más ahorro y registra tus lecturas para ver el avance dentro del mes.",
            assumptions=("La proyección es una tendencia lineal de tus últimas facturas; no incluye cambios de tarifa.",),
            evidence={"projected_kwh": str(q2(facts.projected_kwh)), "goal_kwh": str(q2(facts.goal_kwh)), "gap_kwh": str(gap),
                      "covered_by_recommendations_kwh": str(q2(covered_kwh))},
        )
    if facts.goal_kwh is None and facts.goal_amount_dop is not None and facts.projected_amount_dop is not None \
            and facts.projected_amount_dop > facts.goal_amount_dop:
        gap = q2(facts.projected_amount_dop - facts.goal_amount_dop)
        return Candidate(
            rule_id="goal-gap", rule_version=1, dedupe_key="goal-gap", category="goal", confidence="medium",
            title="La próxima factura superaría tu meta de gasto",
            summary=(f"La proyección de la próxima factura es RD$ {q2(facts.projected_amount_dop)} y tu meta mensual es "
                     f"RD$ {q2(facts.goal_amount_dop)}: faltan RD$ {gap} por recortar."),
            action="Empieza por las recomendaciones de equipos con más ahorro y registra tus lecturas para ver el avance dentro del mes.",
            assumptions=("La proyección es una tendencia lineal de tus últimas facturas; no incluye cambios de tarifa.",),
            evidence={"projected_amount_dop": str(q2(facts.projected_amount_dop)), "goal_amount_dop": str(q2(facts.goal_amount_dop)),
                      "gap_dop": str(gap)},
        )
    return None


ANOMALY_TITLES = {
    "increase": "Tu consumo subió más de lo normal: revisa qué cambió",
    "peak": "Hubo un día con un consumo muy alto: revisa qué se usó ese día",
    "night": "El medidor avanzó de noche: revisa equipos que quedan encendidos",
}


def _anomaly_candidates(facts: Facts) -> list[Candidate]:
    out = []
    for a in facts.anomalies:
        if a.severity not in ACTIVE_ANOMALY_SEVERITIES or a.kind not in ANOMALY_TITLES:
            continue
        pct = "" if a.delta_pct is None else f" ({q2(a.delta_pct)} % sobre lo habitual)"
        out.append(Candidate(
            rule_id=f"anomaly-{a.kind}", rule_version=1, dedupe_key=f"anomaly:{a.id}", category="anomaly", confidence="medium",
            anomaly_id=a.id, title=ANOMALY_TITLES[a.kind],
            summary=f"Se detectó una desviación del {a.period_start.isoformat()} al {a.period_end.isoformat()}{pct}.",
            action="Compara con tu rutina de esas fechas: visitas, equipos nuevos, aire acondicionado o algo que quedó encendido. "
                   "Si ya lo explicaste, marca la anomalía como revisada en Alertas.",
            assumptions=("La anomalía compara con tu historial; no identifica qué equipo la causó.",),
            evidence={"anomaly_kind": a.kind, "severity": a.severity, "period_start": a.period_start.isoformat(),
                      "period_end": a.period_end.isoformat(), **({"delta_pct": str(q2(a.delta_pct))} if a.delta_pct is not None else {})},
        ))
    return out


def evaluate(facts: Facts) -> list[Candidate]:
    """Todas las recomendaciones que hoy aplican, ordenadas de más a menos útiles (ahorro kWh, luego categoría)."""
    equipment = [c for e in facts.equipment if (c := _equipment_candidate(e, facts)) is not None]
    covered = sum((c.savings_kwh or Decimal(0) for c in equipment), Decimal(0))
    out = list(equipment)
    if (goal := _goal_candidate(facts, covered)) is not None:
        out.append(goal)
    out += _anomaly_candidates(facts)
    if not facts.equipment and facts.bills_count >= 1:
        out.append(Candidate(
            rule_id="declare-equipment", rule_version=1, dedupe_key="declare-equipment", category="data", confidence="high",
            title="Declara tus equipos para recibir recomendaciones de ahorro concretas",
            summary="Aún no hay equipos declarados, así que no se puede estimar cuánto consume cada uno ni dónde ahorrar.",
            action="Entra a Equipos y registra al menos el aire acondicionado, la nevera y el calentador con su potencia y horas de uso.",
            evidence={"equipment_count": "0", "bills_count": str(facts.bills_count)},
        ))
    order = {"equipment": 0, "goal": 1, "anomaly": 2, "data": 3}
    out.sort(key=lambda c: (order[c.category], -(c.savings_kwh or Decimal(-1)), c.dedupe_key))
    return out


def totals(candidates: Sequence[Candidate]) -> tuple[Decimal | None, Decimal | None]:
    """Suma de ahorros (kWh, RD$); None si no hay ninguno. Seguro de sumar: un equipo, una recomendación."""
    kwh = [c.savings_kwh for c in candidates if c.savings_kwh is not None]
    dop = [c.savings_dop for c in candidates if c.savings_dop is not None]
    return (q2(sum(kwh, Decimal(0))) if kwh else None, q2(sum(dop, Decimal(0))) if dop else None)
