"""Envío de notificaciones push mediante el servicio de Expo. Sin FastAPI.

- Un fallo del servicio (red, 5xx, 429) lanza `PushUnavailable`: el trabajo reintenta.
- `DeviceNotRegistered` (la app se desinstaló o el token caducó) no es un error: el token se devuelve en `invalid` y se borra.
- Nunca se registran tokens, títulos ni cuerpos.
Requiere que la app móvil tenga permiso de notificaciones y credenciales FCM/APNs configuradas en EAS (cuenta del dueño):
SIN VERIFICAR con un dispositivo real.
"""
import logging
from dataclasses import dataclass, field
from typing import Protocol, Sequence

import httpx

from app.config import settings

logger = logging.getLogger("energyrd.push")
EXPO_URL = "https://exp.host/--/api/v2/push/send"
MAX_BATCH = 100


class PushUnavailable(Exception):
    """El servicio no respondió bien; reintentar más tarde."""


@dataclass(frozen=True)
class PushResult:
    delivered: int = 0
    invalid: list[str] = field(default_factory=list)


class PushSender(Protocol):
    def send(self, tokens: Sequence[str], *, title: str, body: str, data: dict) -> PushResult: ...


class ExpoPushSender:
    def __init__(self, access_token: str = "", *, timeout: float = 10.0, transport: httpx.BaseTransport | None = None):
        self._access_token, self.timeout, self._transport = access_token, timeout, transport

    def __repr__(self):
        return f"ExpoPushSender(timeout={self.timeout})"

    def send(self, tokens: Sequence[str], *, title: str, body: str, data: dict) -> PushResult:
        delivered, invalid = 0, []
        headers = {"Accept": "application/json", "Content-Type": "application/json"}
        if self._access_token:
            headers["Authorization"] = f"Bearer {self._access_token}"
        for start in range(0, len(tokens), MAX_BATCH):
            batch = list(tokens[start:start + MAX_BATCH])
            messages = [{"to": t, "title": title, "body": body, "data": data, "sound": "default", "priority": "high"} for t in batch]
            try:
                with httpx.Client(timeout=self.timeout, transport=self._transport) as client:
                    response = client.post(EXPO_URL, json=messages, headers=headers)
            except httpx.HTTPError as exc:
                raise PushUnavailable("transport") from exc
            if response.status_code == 429 or response.status_code >= 500:
                raise PushUnavailable(f"http_{response.status_code}")
            if not response.is_success:
                logger.warning("push rejected", extra={"status": response.status_code})
                continue  # petición mal formada: reintentar no la arregla
            try:
                tickets = response.json().get("data", [])
            except ValueError as exc:
                raise PushUnavailable("bad_body") from exc
            for token, ticket in zip(batch, tickets):
                if ticket.get("status") == "ok":
                    delivered += 1
                elif (ticket.get("details") or {}).get("error") == "DeviceNotRegistered":
                    invalid.append(token)
        return PushResult(delivered, invalid)


def get_push_sender() -> PushSender:
    return ExpoPushSender(settings.EXPO_ACCESS_TOKEN)
