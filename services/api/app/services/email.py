"""Envío de correo detrás de una interfaz (ERD-AUTH-05). Sin FastAPI.

- `console`: SOLO desarrollo. No registra el token ni el enlace; guarda el mensaje en `DEV_OUTBOX`
  (memoria, usado por los tests) y opcionalmente lo agrega a `EMAIL_DEV_OUTBOX` (JSON por línea).
- `resend`: POST https://api.resend.com/emails con `Authorization: Bearer RESEND_API_KEY`.

`send()` nunca lanza: un fallo se registra sin secretos (sin clave, destinatario, token ni cuerpo
de la respuesta) y devuelve False. El llamador no cambia su respuesta HTTP por ello.
"""
import html
import json
import logging
from collections import deque
from dataclasses import asdict, dataclass
from typing import Protocol

import httpx

from app.config import settings

logger = logging.getLogger("energyrd.api")
RESEND_URL = "https://api.resend.com/emails"
DEV_OUTBOX: deque["EmailMessage"] = deque(maxlen=100)


@dataclass(frozen=True)
class EmailMessage:
    to: str
    subject: str
    text: str
    html: str


class EmailSender(Protocol):
    def send(self, message: EmailMessage) -> bool: ...


def _failed(kind):
    logger.warning("email_delivery_failed", extra={"extra_fields": {"event": "password_reset_email_failed",
                                                                    "reason": kind}})


class ConsoleEmailSender:
    def __init__(self, outbox_path: str | None = None):
        self.outbox_path = outbox_path or None

    def send(self, message: EmailMessage) -> bool:
        DEV_OUTBOX.append(message)
        if self.outbox_path:
            try:
                with open(self.outbox_path, "a", encoding="utf-8") as handle:
                    handle.write(json.dumps(asdict(message), ensure_ascii=False) + "\n")
            except OSError:
                _failed("dev_outbox_unwritable")
                return False
        logger.info("email_queued_dev_outbox", extra={"extra_fields": {"backend": "console"}})
        return True


class ResendEmailSender:
    def __init__(self, api_key: str, sender: str, *, timeout: float = 10.0,
                 transport: httpx.BaseTransport | None = None):
        self._api_key = api_key
        self.sender = sender
        self.timeout = timeout
        self._transport = transport

    def __repr__(self):
        return f"ResendEmailSender(sender={self.sender!r}, timeout={self.timeout})"

    def send(self, message: EmailMessage) -> bool:
        payload = {"from": self.sender, "to": [message.to], "subject": message.subject,
                   "text": message.text, "html": message.html}
        try:
            with httpx.Client(timeout=self.timeout, transport=self._transport) as client:
                response = client.post(RESEND_URL, json=payload,
                                       headers={"Authorization": f"Bearer {self._api_key}"})
        except httpx.TimeoutException:
            _failed("timeout")
            return False
        except httpx.HTTPError:
            _failed("transport_error")
            return False
        if not response.is_success:
            # Solo el código: el cuerpo de error puede repetir datos del envío.
            _failed(f"http_{response.status_code}")
            return False
        return True


def get_email_sender() -> EmailSender:
    if settings.EMAIL_BACKEND == "resend":
        return ResendEmailSender(settings.RESEND_API_KEY, settings.EMAIL_FROM)
    return ConsoleEmailSender(settings.EMAIL_DEV_OUTBOX)


def deliver(message: EmailMessage) -> None:
    """Punto de entrada para tareas en segundo plano: jamás propaga una excepción."""
    try:
        get_email_sender().send(message)
    except Exception:  # noqa: BLE001 - un fallo de correo no puede alterar la respuesta 202
        _failed("sender_error")


def build_reset_link(base_url: str, token: str) -> str:
    # Fragmento: el navegador no lo envía al servidor ni queda en logs de acceso/Referer.
    return f"{base_url}#token={token}"


def password_reset_message(to: str, base_url: str, token: str, ttl_minutes: int) -> EmailMessage:
    link = build_reset_link(base_url, token)
    subject = "Restablece tu contraseña de Energy RD"
    text = (
        "Hola:\n\n"
        "Recibimos una solicitud para restablecer la contraseña de tu cuenta de Energy RD.\n"
        f"Abre este enlace para elegir una nueva contraseña (caduca en {ttl_minutes} minutos y solo "
        "puede usarse una vez):\n\n"
        f"{link}\n\n"
        "Si no solicitaste este cambio, ignora este correo: tu contraseña actual seguirá funcionando.\n\n"
        "Energy RD\n"
    )
    safe = html.escape(link, quote=True)
    body = (
        '<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;color:#1f2937">'
        "<p>Hola:</p>"
        "<p>Recibimos una solicitud para restablecer la contraseña de tu cuenta de Energy RD.</p>"
        f'<p><a href="{safe}">Elegir una nueva contraseña</a></p>'
        f"<p>El enlace caduca en {ttl_minutes} minutos y solo puede usarse una vez. "
        f"Si el botón no funciona, copia esta dirección en tu navegador:<br>{safe}</p>"
        "<p>Si no solicitaste este cambio, ignora este correo: tu contraseña actual seguirá funcionando.</p>"
        "<p>Energy RD</p></body></html>"
    )
    return EmailMessage(to=to, subject=subject, text=text, html=body)


def invitation_message(to: str, base_url: str, token: str, ttl_days: int, home_name: str) -> EmailMessage:
    """ERD-SHARE-01. No incluye el correo de quien invita; el nombre de la vivienda es texto del propietario (escapado)."""
    link = build_reset_link(base_url, token)
    subject = "Te invitaron a una vivienda en Energy RD"
    text = (
        "Hola:\n\n"
        f"El propietario de la vivienda «{home_name}» te invitó a verla en Energy RD.\n"
        f"Abre este enlace con la cuenta de este correo para aceptar (caduca en {ttl_days} días y solo puede usarse una vez):\n\n"
        f"{link}\n\n"
        "Si no esperabas esta invitación, ignora este correo: no se compartirá nada.\n\n"
        "Energy RD\n"
    )
    safe, name = html.escape(link, quote=True), html.escape(home_name)
    body = (
        '<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;color:#1f2937">'
        "<p>Hola:</p>"
        f"<p>El propietario de la vivienda «{name}» te invitó a verla en Energy RD.</p>"
        f'<p><a href="{safe}">Aceptar la invitación</a></p>'
        f"<p>Abre el enlace con la cuenta de este correo. Caduca en {ttl_days} días y solo puede usarse una vez. "
        f"Si el botón no funciona, copia esta dirección en tu navegador:<br>{safe}</p>"
        "<p>Si no esperabas esta invitación, ignora este correo: no se compartirá nada.</p>"
        "<p>Energy RD</p></body></html>"
    )
    return EmailMessage(to=to, subject=subject, text=text, html=body)
