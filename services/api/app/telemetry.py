"""ERD-OBS-01: Sentry opcional con redacción de datos personales ANTES de salir del proceso. Sin FastAPI.

Qué nunca sale: cuerpos de petición, cookies, cabeceras (salvo User-Agent y X-Request-ID), query string, IP, usuario,
nombre del servidor, variables locales y líneas de código fuente de los frames, correos, JWT, `Bearer …`, tokens opacos de 43 caracteres,
ni valores bajo claves sensibles (password, token, email, cuenta, dirección, texto OCR…). Sentry no recibe nada si
`SENTRY_DSN` está vacío. El 500 lo captura `RequestContextMiddleware` de forma explícita (él se traga la excepción).
"""
import logging
import re
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import sentry_sdk
from sentry_sdk.integrations.logging import LoggingIntegration

logger = logging.getLogger("energyrd.api")

FILTERED = "[Filtered]"
_KEEP_HEADERS = {"user-agent", "x-request-id"}
_SENSITIVE_KEY = re.compile(
    r"pass(word|wd)|token|secret|authorization|cookie|api[-_]?key|dsn|signature|session|csrf|email|correo|"
    r"account_number|cuenta|nic\b|address|direccion|dirección|raw_text|excerpt|client[-_]?ip|ip_address", re.IGNORECASE)
_PATTERNS = (
    re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"),
    re.compile(r"\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*"),
    re.compile(r"\bbearer\s+[A-Za-z0-9._~+/=-]{8,}", re.IGNORECASE),
    re.compile(r"(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])"),
)
# Variables locales y líneas de código fuente de cada frame: pueden arrastrar valores o constantes; no hacen falta
# para diagnosticar (se conservan función, archivo y número de línea).
_DROPPED_KEYS = {"vars", "pre_context", "context_line", "post_context"}
_SCRUBBED_SECTIONS = ("message", "logentry", "exception", "breadcrumbs", "extra", "contexts", "tags", "spans", "measurements")


def _clean_text(value: str) -> str:
    for pattern in _PATTERNS:
        value = pattern.sub(FILTERED, value)
    return value


def _clean(value: Any) -> Any:
    if isinstance(value, str):
        return _clean_text(value)
    if isinstance(value, dict):
        return {key: (FILTERED if isinstance(key, str) and _SENSITIVE_KEY.search(key) else _clean(item))
                for key, item in value.items() if key not in _DROPPED_KEYS}
    if isinstance(value, (list, tuple)):
        return [_clean(item) for item in value]
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    return FILTERED  # objetos arbitrarios: no se serializan


def _clean_request(request: Any) -> dict:
    if not isinstance(request, dict):
        return {}
    clean = {}
    if isinstance(request.get("url"), str):
        parts = urlsplit(request["url"])
        clean["url"] = urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))
    if isinstance(request.get("method"), str):
        clean["method"] = request["method"]
    headers = request.get("headers")
    if isinstance(headers, dict):
        kept = {k: v for k, v in headers.items() if isinstance(k, str) and k.lower() in _KEEP_HEADERS}
        if kept:
            clean["headers"] = _clean(kept)
    return clean


def scrub_event(event: dict, hint: Any) -> dict:
    """before_send / before_send_transaction. Nunca lanza: ante un evento raro devuelve lo que pudo limpiar."""
    try:
        event.pop("user", None)
        event.pop("server_name", None)
        event["request"] = _clean_request(event.get("request"))
        if not event["request"]:
            event.pop("request")
        for section in _SCRUBBED_SECTIONS:
            if section in event:
                event[section] = _clean(event[section])
    except Exception:  # noqa: BLE001 - la telemetría no puede romper la respuesta ni filtrar por un fallo
        logger.warning("telemetry_scrub_failed")
        return {"message": "scrub_failed", "level": event.get("level", "error") if isinstance(event, dict) else "error"}
    return event


def scrub_breadcrumb(crumb: dict, hint: Any) -> dict | None:
    try:
        return _clean(crumb)
    except Exception:  # noqa: BLE001
        return None


def init_telemetry(settings, transport=None) -> bool:
    """Inicia Sentry si hay DSN. Devuelve si quedó activo. `transport` solo para pruebas."""
    if not settings.SENTRY_DSN:
        return False
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT.lower(),
        release=f"energy-api@{settings.VERSION}",
        send_default_pii=False,
        include_local_variables=False,
        max_request_body_size="never",
        traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
        before_send=scrub_event,
        before_send_transaction=scrub_event,
        before_breadcrumb=scrub_breadcrumb,
        # Los errores se reportan explícitamente; evita duplicar cada logger.exception como evento.
        integrations=[LoggingIntegration(level=None, event_level=None)],
        transport=transport,
    )
    return True


def capture_unhandled(exc: BaseException, request_id: str) -> None:
    """Reporta un 500 con su request_id para cruzarlo con el log. No-op si Sentry no está activo."""
    if not sentry_sdk.get_client().is_active():
        return
    with sentry_sdk.new_scope() as scope:
        scope.set_tag("request_id", request_id)
        sentry_sdk.capture_exception(exc)
