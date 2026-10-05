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

logger = logging.getLogger("energyrd.api")
_VALID_ID = re.compile(r"^[A-Za-z0-9._-]{8,64}$")


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
        except Exception:
            logger.exception(
                "unhandled error",
                extra={"extra_fields": {"request_id": request_id, "method": request.method, "path": request.url.path}},
            )
            response = JSONResponse(
                {"detail": "Error interno del servidor", "request_id": request_id}, status_code=500
            )
        duration_ms = round((time.perf_counter() - start) * 1000, 1)
        response.headers["X-Request-ID"] = request_id
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
