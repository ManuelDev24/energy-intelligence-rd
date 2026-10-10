import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class DocumentOut(BaseModel):
    """Metadatos del original. La clave interna del objeto (`storage_key`) no se expone nunca."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    home_id: uuid.UUID
    bill_id: uuid.UUID | None
    kind: Literal["bill_photo", "bill_pdf"]
    content_type: str
    size_bytes: int
    sha256: str
    uploaded_via: Literal["web", "mobile", "api"]
    created_at: datetime
    retention_until: datetime | None


class DownloadUrlOut(BaseModel):
    """Enlace de un solo propósito y vida corta (60 s por defecto). No lo guarde ni lo comparta."""
    url: str
    expires_at: datetime
