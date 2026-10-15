"""Enlace firmado y de vida corta para descargar el PDF del informe sin cabecera Authorization (lo abre el navegador o el visor del teléfono).

Misma idea que las descargas de documentos (`storage/signing.py`) pero con su propio prefijo de versión: un token de documento no sirve aquí ni al revés.
Liga persona, vivienda y período; quien lo canjea sigue sujeto a la membresía vigente.
"""
import base64
import hashlib
import hmac
import json
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from app.config import settings
from app.services.errors import NotFound

_VERSION = "rpt1"
TTL_SECONDS = 120


@dataclass(frozen=True)
class ReportClaim:
    home_id: uuid.UUID
    user_id: uuid.UUID | None
    period_from: date
    period_to: date
    expires_at: datetime


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _mac(payload: str) -> str:
    return _b64(hmac.new(settings.STORAGE_URL_SIGNING_KEY.encode(), f"{_VERSION}.{payload}".encode(), hashlib.sha256).digest())


def sign_report(home_id, user_id, period_from: date, period_to: date, *, now=None) -> tuple[str, datetime]:
    expires = (now or datetime.now(timezone.utc)) + timedelta(seconds=TTL_SECONDS)
    body = json.dumps({"h": str(home_id), "u": str(user_id) if user_id else None, "f": period_from.isoformat(), "t": period_to.isoformat(),
                       "e": int(expires.timestamp())}, separators=(",", ":"))
    payload = _b64(body.encode())
    return f"{_VERSION}.{payload}.{_mac(payload)}", expires


def verify_report(token: str, *, now=None) -> ReportClaim:
    """Cualquier defecto (formato, firma, vencimiento) es el mismo `NotFound`."""
    try:
        version, payload, mac = token.split(".")
        if version != _VERSION or not hmac.compare_digest(mac, _mac(payload)):
            raise ValueError
        data = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        expires = datetime.fromtimestamp(int(data["e"]), timezone.utc)
        if (now or datetime.now(timezone.utc)) >= expires:
            raise ValueError
        return ReportClaim(uuid.UUID(data["h"]), uuid.UUID(data["u"]) if data["u"] else None, date.fromisoformat(data["f"]), date.fromisoformat(data["t"]), expires)
    except (ValueError, KeyError, TypeError, AttributeError):
        raise NotFound("Enlace de descarga no válido o vencido") from None
