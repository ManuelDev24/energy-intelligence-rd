"""Verificación de la IP real del navegador firmada por el BFF (ERD-SEC-PROXY-01).

Funciones puras, sin FastAPI (ver scripts/check_architecture.py: app/services
nunca importa FastAPI). Esta firma es el ÚNICO trust boundary entre el BFF
(server-to-server) y la API para la IP del usuario: nunca se usa el valor sin
verificar la firma HMAC y la ventana de tiempo.

Formato del header `X-Forwarded-Client-Ip`: "<ip>.<unix-ts>.<hex-hmac-sha256>".
La IP puede contener puntos (IPv4) o dos puntos (IPv6); se separan los DOS
últimos segmentos con rsplit, nunca un split simple por punto.
"""
import hashlib
import hmac
import time

_DOMAIN = "energy-rd:client-ip:v1"


def _mac(ip: str, ts: int, secret: str) -> str:
    return hmac.new(secret.encode(), f"{_DOMAIN}:{ip}:{ts}".encode(), hashlib.sha256).hexdigest()


def sign_client_ip(ip: str, secret: str, now: float | None = None) -> str:
    ts = int(now if now is not None else time.time())
    return f"{ip}.{ts}.{_mac(ip, ts, secret)}"


def verify_signed_client_ip(
    header_value: str, secret: str, now: float | None = None, window_seconds: int = 60
) -> str | None:
    if not header_value or not secret:
        return None
    parts = header_value.rsplit(".", 2)
    if len(parts) != 3:
        return None
    ip, ts_text, mac = parts
    if not ip or not ts_text.isdigit() or len(mac) != 64:
        return None
    ts = int(ts_text)
    now_ts = now if now is not None else time.time()
    if abs(now_ts - ts) > window_seconds:
        return None
    if not hmac.compare_digest(mac, _mac(ip, ts, secret)):
        return None
    return ip
