"""Auditoría C-08: topes de cuerpo, tiempos de espera de la base, pool agotado → 503 y concurrencia de Argon2."""
import threading
import time

import pytest
from sqlalchemy.exc import OperationalError, TimeoutError as PoolTimeoutError

from app.config import settings


# ---------- tope del cuerpo ----------
def test_declared_oversized_json_is_rejected_before_reading(client):
    r = client.post("/api/v1/homes", content=b"x" * (settings.MAX_REQUEST_BODY_BYTES + 1), headers={"content-type": "application/json"})
    assert r.status_code == 413
    assert r.json()["code"] == "http_413"
    assert r.headers["x-request-id"] and r.headers["x-content-type-options"] == "nosniff"  # pasa por el contexto de la petición


def test_normal_json_still_works(client):
    assert client.post("/api/v1/homes", json={"name": "Casa", "distributor": "EDESUR", "code": "CAP-001"}).status_code in (201, 409, 422)


def test_oversized_body_without_content_length_is_cut_while_streaming(client):
    def chunks():
        for _ in range(settings.MAX_REQUEST_BODY_BYTES // 4096 + 4):
            yield b"x" * 4096
    r = client.post("/api/v1/homes", content=chunks(), headers={"content-type": "application/json"})
    assert r.status_code == 413
    assert r.json()["code"] == "http_413"


def test_upload_limit_is_larger_than_the_json_limit_and_covers_the_biggest_document():
    from app.request_limits import body_limit_for
    home = "11111111-1111-4111-8111-111111111111"
    assert body_limit_for("POST", f"/api/v1/homes/{home}/documents") == settings.max_upload_request_bytes
    assert body_limit_for("POST", f"/api/v1/homes/{home}/bills/ocr-jobs") == settings.max_upload_request_bytes
    assert body_limit_for("POST", f"/api/v1/homes/{home}/bills") == settings.MAX_REQUEST_BODY_BYTES
    assert body_limit_for("POST", "/api/v1/auth/login") == settings.MAX_REQUEST_BODY_BYTES
    assert settings.max_upload_request_bytes > max(settings.DOCUMENT_MAX_PDF_BYTES, settings.DOCUMENT_MAX_PHOTO_BYTES)
    assert settings.max_upload_request_bytes > settings.MAX_REQUEST_BODY_BYTES


def test_giant_unauthenticated_login_body_is_rejected_without_reading_it(client):
    r = client.post("/api/v1/auth/login", content=b"{" + b" " * (5 * 1024 * 1024) + b"}", headers={"content-type": "application/json"})
    assert r.status_code == 413


def test_get_requests_are_not_limited(client):
    assert client.get("/api/v1/homes").status_code == 200


# ---------- tiempos de espera de la base ----------
def test_session_timeouts_are_applied_to_every_new_connection(engine):
    from app.database import apply_session_timeouts
    raw = engine.raw_connection()
    try:
        apply_session_timeouts(raw.driver_connection)
        with raw.driver_connection.cursor() as cursor:
            cursor.execute("SHOW statement_timeout")
            assert cursor.fetchone()[0] == "30s"
            cursor.execute("SHOW lock_timeout")
            assert cursor.fetchone()[0] == "5s"
            cursor.execute("SHOW idle_in_transaction_session_timeout")
            assert cursor.fetchone()[0] == "1min"
        raw.driver_connection.rollback()
    finally:
        raw.close()


def test_a_blocked_lock_fails_fast_instead_of_hanging(engine):
    """Una transacción que retiene la fila de una vivienda no cuelga a la siguiente más de lock_timeout (aquí 300 ms)."""
    import psycopg
    with engine.begin() as connection:
        connection.exec_driver_sql("CREATE TABLE IF NOT EXISTS _c08_lock (id int primary key)")
        connection.exec_driver_sql("INSERT INTO _c08_lock VALUES (1) ON CONFLICT DO NOTHING")
    holder, waiter = engine.raw_connection(), engine.raw_connection()
    try:
        with holder.driver_connection.cursor() as cursor:
            cursor.execute("SELECT * FROM _c08_lock WHERE id = 1 FOR UPDATE")
        with waiter.driver_connection.cursor() as cursor:
            cursor.execute("SET lock_timeout = 300")
            started = time.perf_counter()
            with pytest.raises(psycopg.errors.LockNotAvailable):
                cursor.execute("SELECT * FROM _c08_lock WHERE id = 1 FOR UPDATE")
            assert time.perf_counter() - started < 3
    finally:
        holder.driver_connection.rollback()
        waiter.driver_connection.rollback()
        holder.close()
        waiter.close()
        with engine.begin() as connection:
            connection.exec_driver_sql("DROP TABLE IF EXISTS _c08_lock")


@pytest.mark.parametrize("error", [PoolTimeoutError("QueuePool limit of size 5 overflow 5 reached"),
                                   OperationalError("SELECT 1", {}, Exception("canceling statement due to statement timeout"))])
def test_pool_exhaustion_or_database_timeout_answers_503_with_retry_after(client, monkeypatch, error):
    from app.services import homes as homes_service

    def boom(*args, **kwargs):
        raise error
    monkeypatch.setattr(homes_service, "list_homes", boom)
    r = client.get("/api/v1/homes")
    assert r.status_code == 503
    assert r.json()["code"] == "service_busy"
    assert r.headers["retry-after"] == "2" and r.headers["cache-control"] == "no-store"
    assert "QueuePool" not in r.text and "statement timeout" not in r.text  # sin detalle interno


# ---------- Argon2 acotado ----------
def test_argon2_turns_are_bounded_and_a_waiting_caller_gets_503():
    from app.services.auth import BoundedPasswordHasher
    from app.services.errors import ServiceBusy
    hasher = BoundedPasswordHasher(time_cost=1, memory_cost=8, parallelism=1, concurrency=1, wait_seconds=0.2)
    hold = threading.Event()
    release = threading.Event()
    original = hasher.__class__.__mro__[1].hash

    def slow_hash(self, password, *a, **k):
        hold.set()
        release.wait(5)
        return original(self, password, *a, **k)

    outcome = {}
    try:
        hasher.__class__.__mro__[1].hash = slow_hash
        worker = threading.Thread(target=lambda: outcome.setdefault("first", hasher.hash("a-password-long-enough")))
        worker.start()
        assert hold.wait(2)
        with pytest.raises(ServiceBusy):
            hasher.hash("another-password")
    finally:
        hasher.__class__.__mro__[1].hash = original
        release.set()
        worker.join(5)
    assert outcome["first"].startswith("$argon2id$")
    assert hasher.hash("tercera-contraseña-larga").startswith("$argon2id$")  # el turno se libera: vuelve a funcionar


def test_default_hasher_uses_the_configured_concurrency():
    from app.services.auth import password_hasher
    assert password_hasher._turns._value == settings.AUTH_HASH_CONCURRENCY
