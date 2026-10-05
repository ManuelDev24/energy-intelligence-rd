"""ERD-SEC-PROXY-01: firma HMAC del BFF para la IP real del navegador.

Pure functions, sin FastAPI: app/services debe permanecer libre de ese import
(scripts/check_architecture.py). La validez de la firma es el único trust
boundary entre el BFF y la API para este header; nunca se confía sin verificar.
"""
from app.services.client_ip import sign_client_ip, verify_signed_client_ip

SECRET = "x" * 48
NOW = 1_700_000_000


def test_valid_signature_round_trips():
    header = sign_client_ip("203.0.113.5", SECRET, now=NOW)
    assert verify_signed_client_ip(header, SECRET, now=NOW + 30) == "203.0.113.5"


def test_ipv4_dotted_address_round_trips():
    header = sign_client_ip("10.0.0.1", SECRET, now=NOW)
    assert verify_signed_client_ip(header, SECRET, now=NOW) == "10.0.0.1"


def test_signature_rejects_wrong_secret():
    header = sign_client_ip("203.0.113.5", SECRET, now=NOW)
    assert verify_signed_client_ip(header, "y" * 48, now=NOW) is None


def test_rejects_stale_timestamp_beyond_window():
    header = sign_client_ip("203.0.113.5", SECRET, now=NOW)
    assert verify_signed_client_ip(header, SECRET, now=NOW + 61, window_seconds=60) is None


def test_rejects_future_timestamp_beyond_window():
    header = sign_client_ip("203.0.113.5", SECRET, now=NOW)
    assert verify_signed_client_ip(header, SECRET, now=NOW - 61, window_seconds=60) is None


def test_accepts_boundary_of_window():
    header = sign_client_ip("203.0.113.5", SECRET, now=NOW)
    assert verify_signed_client_ip(header, SECRET, now=NOW + 60, window_seconds=60) == "203.0.113.5"


def test_rejects_malformed_or_empty_header():
    assert verify_signed_client_ip("not-a-valid-header", SECRET, now=NOW) is None
    assert verify_signed_client_ip("", SECRET, now=NOW) is None
    assert verify_signed_client_ip("a.b", SECRET, now=NOW) is None


def test_rejects_when_secret_missing():
    header = sign_client_ip("203.0.113.5", SECRET, now=NOW)
    assert verify_signed_client_ip(header, "", now=NOW) is None


def test_tampered_ip_is_rejected():
    header = sign_client_ip("203.0.113.5", SECRET, now=NOW)
    ip, ts, mac = header.rsplit(".", 2)
    tampered = f"203.0.113.6.{ts}.{mac}"
    assert verify_signed_client_ip(tampered, SECRET, now=NOW) is None
