import uuid
from datetime import date
from typing import Literal

from pydantic import BaseModel


class ScoreComponentOut(BaseModel):
    """Un componente del Energy Score. `score` es nulo cuando faltan datos: no se rellena ni cuenta en el total."""
    key: Literal["consumption", "efficiency", "habits", "consistency"]
    label: str
    weight: int                      # peso nominal (suma 100); el efectivo se reparte entre los componentes disponibles
    score: int | None
    available: bool
    summary: str                     # qué mide
    detail: str                      # cuánto y por qué, con las cifras que lo motivaron
    inputs: dict[str, str]           # evidencia estructurada (texto, para no perder decimales)
    reasons: list[str]               # por qué no hay dato, si no lo hay
    next_step: str                   # qué hacer para mejorarlo


class EnergyScoreOut(BaseModel):
    """Energy Score 0–100 calculado por el backend (la fórmula vive solo allí). Indicador interno INFERIDO: orientativo."""
    home_id: uuid.UUID
    score_version: int
    as_of: date
    status: Literal["ok", "insufficient_data"]
    score: int | None
    band: Literal["good", "fair", "poor"] | None
    band_label: str | None
    quality: Literal["INFERRED"]
    coverage_pct: int                # % del peso total que tiene datos
    components: list[ScoreComponentOut]
    reasons: list[str]
    method: str
    note: str
