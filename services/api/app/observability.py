"""Observabilidad mínima: request-id, log estructurado por petición y 500 sin filtrar detalles.

- Cada respuesta lleva `X-Request-ID` (se respeta el que envía el cliente si es razonable).
- Una línea JSON por petición: método, ruta, estado, duración, request_id.
- Las excepciones no controladas se registran con traza y devuelven un 500 genérico con el
  request_id, para poder correlacionar el reporte del usuario con el log.
"""
import json
import logging
import re
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.config import settings
from app.telemetry import capture_unhandled

logger = logging.getLogger("energyrd.api")
_VALID_ID = re.compile(r"^[A-Za-z0-9._-]{8,64}$")


# Auditoría C-07: la API solo habla JSON (y descargas con sus propias cabeceras): nada debe renderizarse ni incrustarse.
_API_DOC_PATHS = {"/docs", "/redoc", "/openapi.json", "/docs/oauth2-redirect"}
_STATIC_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}


def security_headers(environment: str, path: str) -> dict[str, str]:
    """Cabeceras de seguridad por defecto de toda respuesta. Una ruta que ya fije una (p. ej. la descarga de documentos) conserva la suya."""
    headers = dict(_STATIC_SECURITY_HEADERS)
    if not (environment.lower() == "development" and path in _API_DOC_PATHS):  # Swagger UI (solo en development) necesita scripts
        headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    if environment.lower() != "development":  # HSTS solo tiene sentido tras TLS; en local por http://localhost sería ruido
        headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return headers


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {"level": record.levelname, "logger": record.name, "msg": record.getMessage()}
        payload.update(getattr(record, "extra_fields", {}))
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def configure_logging(level: str = "INFO") -> None:
    if any(isinstance(h.formatter, JsonFormatter) for h in logger.handlers):
        return
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    logger.addHandler(handler)
    logger.setLevel(level)
    logger.propagate = False


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        incoming = request.headers.get("x-request-id", "")
        request_id = incoming if _VALID_ID.match(incoming) else uuid.uuid4().hex
        request.state.request_id = request_id
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception as exc:
            capture_unhandled(exc, request_id)
            logger.exception(
                "unhandled error",
                extra={"extra_fields": {"request_id": request_id, "method": request.method, "path": request.url.path}},
            )
            response = JSONResponse(
                {"detail": "Error interno del servidor", "request_id": request_id}, status_code=500
            )
        duration_ms = round((time.perf_counter() - start) * 1000, 1)
        response.headers["X-Request-ID"] = request_id
        for name, value in security_headers(settings.ENVIRONMENT, request.url.path).items():
            response.headers.setdefault(name, value)
        if request.url.path != "/health":  # el healthcheck de Docker generaría ruido cada 5 s
            logger.info(
                "request",
                extra={
                    "extra_fields": {
                        "request_id": request_id,
                        "method": request.method,
                        "path": request.url.path,
                        "status": response.status_code,
                        "duration_ms": duration_ms,
                    }
                },
            )
        return response
