"""ERD-OCR-01: borrador de factura leído por OCR. Nunca se guarda en BD sin confirmación humana."""
import uuid
from datetime import datetime
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


class OcrJobOut(BaseModel):
    """ERD-OCR-PROD: estado de la lectura asíncrona de un original. `draft` solo existe en `done` y hasta que se confirma
    la factura; es un BORRADOR (nunca una factura)."""
    document_id: uuid.UUID
    status: Literal["pending", "processing", "done", "failed"]
    attempts: int
    method: Literal["text_layer", "ocr", "mixed"] | None
    pages_read: int | None
    pages_total: int | None
    draft: OcrDraft | None
    error_code: Literal["unreadable", "protected_pdf", "file_missing", "engine_error"] | None
    error_message: str | None
    created_at: datetime
    finished_at: datetime | None
