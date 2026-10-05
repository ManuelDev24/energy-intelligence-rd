"""ERD-OCR-01: borrador de factura leído por OCR. Nunca se guarda en BD sin confirmación humana."""
from typing import Literal

from pydantic import BaseModel

Confidence = Literal["high", "inferred", "none"]


class OcrField(BaseModel):
    value: str | None  # siempre texto (ISO date / decimal como string); el front decide el tipo
    confidence: Confidence


class OcrDraft(BaseModel):
    period_start: OcrField
    period_end: OcrField
    days: OcrField
    kwh: OcrField
    amount_dop: OcrField
    reading_previous: OcrField
    reading_current: OcrField
    warnings: list[str]
    raw_text_excerpt: str  # primeros ~500 caracteres, para que la persona confirme contra el original
