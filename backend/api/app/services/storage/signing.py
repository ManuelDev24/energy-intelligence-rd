"""URLs de descarga firmadas y de vida corta. HMAC-SHA256 con una clave propia (no la de los tokens de sesión).

El token liga: documento, vivienda, persona que lo pidió y vencimiento. Quien lo canjea sigue sujeto a la regla de
membresía: si la persona dejó la vivienda entre pedir y usar el enlace, deja de servir.
"""
import base64
import hashlib
import hmac
import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from app.config import settings
from app.services.errors import NotFound

_VERSION = "v1"


@dataclass(frozen=True)
class DownloadClaim:
    document_id: uuid.UUID
    home_id: uuid.UUID
    user_id: uuid.UUID | None
    expires_at: datetime


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _mac(payload: str) -> str:
    key = settings.STORAGE_URL_SIGNING_KEY.encode()
    return _b64(hmac.new(key, f"{_VERSION}.{payload}".encode(), hashlib.sha256).digest())


def sign_download(document_id, home_id, user_id, *, now=None, ttl_seconds=None) -> tuple[str, datetime]:
    expires = (now or datetime.now(timezone.utc)) + timedelta(seconds=ttl_seconds or settings.STORAGE_URL_TTL_SECONDS)
    body = json.dumps({"d": str(document_id), "h": str(home_id), "u": str(user_id) if user_id else None,
                       "e": int(expires.timestamp())}, separators=(",", ":"))
    payload = _b64(body.encode())
    return f"{_VERSION}.{payload}.{_mac(payload)}", expires


def verify_download(token: str, *, now=None) -> DownloadClaim:
    """Cualquier defecto (formato, firma, vencimiento) es el mismo `NotFound`: no se distingue qué falló."""
    try:
        version, payload, mac = token.split(".")
        if version != _VERSION or not hmac.compare_digest(mac, _mac(payload)):
            raise ValueError
        data = json.loads(_unb64(payload))
        expires = datetime.fromtimestamp(int(data["e"]), timezone.utc)
        if (now or datetime.now(timezone.utc)) >= expires:
            raise ValueError
        return DownloadClaim(uuid.UUID(data["d"]), uuid.UUID(data["h"]), uuid.UUID(data["u"]) if data["u"] else None, expires)
    except (ValueError, KeyError, TypeError, AttributeError):
        raise NotFound("Enlace de descarga no válido o vencido") from None
