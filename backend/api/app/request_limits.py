"""Tope del cuerpo de las peticiones (auditoría C-08), como middleware ASGI puro.

Antes de leer nada se mira `Content-Length` (413 inmediato) y, si el cliente miente o envía por trozos (`Transfer-Encoding: chunked`),
se cuentan los bytes a medida que llegan y se corta al pasar el tope. Así un cuerpo enorme, incluso sin autenticar, nunca se
carga completo en memoria ni se vuelca a disco.
"""
import json
import re

from fastapi import HTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.config import settings

# Las únicas rutas que reciben archivos (multipart). El resto es JSON pequeño.
_UPLOAD_PATHS = (
    re.compile(r"^/api/v1/homes/[^/]+/documents/?$"),
    re.compile(r"^/api/v1/homes/[^/]+/bills/ocr-jobs/?$"),
)


_MESSAGE = "La solicitud es demasiado grande."


def body_limit_for(method: str, path: str) -> int:
    if method == "POST" and any(pattern.match(path) for pattern in _UPLOAD_PATHS):
        return settings.max_upload_request_bytes
    return settings.MAX_REQUEST_BODY_BYTES


class _BodyTooLarge(HTTPException):
    """HTTPException para que FastAPI la deje pasar (cualquier otra excepción al leer el cuerpo se convertiría en un 400)."""

    def __init__(self) -> None:
        super().__init__(status_code=413, detail=_MESSAGE)


class BodyLimitMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] in {"GET", "HEAD", "OPTIONS"}:
            await self.app(scope, receive, send)
            return
        limit = body_limit_for(scope["method"], scope["path"])
        declared = dict(scope["headers"]).get(b"content-length")
        if declared is not None:
            try:
                too_large = int(declared) > limit
            except ValueError:
                too_large = True
            if too_large:
                await self._reject(scope, send)
                return
        received = 0
        started = False

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    raise _BodyTooLarge
            return message

        async def tracking_send(message: Message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, tracking_send)
        except _BodyTooLarge:
            if not started:
                await self._reject(scope, send)

    @staticmethod
    async def _reject(scope: Scope, send: Send) -> None:
        body = json.dumps({"detail": _MESSAGE, "code": "http_413"}).encode()
        await send({"type": "http.response.start", "status": 413, "headers": [
            (b"content-type", b"application/json"), (b"content-length", str(len(body)).encode()),
            (b"cache-control", b"no-store"), (b"connection", b"close")]})
        await send({"type": "http.response.body", "body": body})
