"""Observabilidad: request-id en cada respuesta, log JSON por petición y 500 sin detalles internos."""
import json
import logging

from fastapi.testclient import TestClient

from app.main import app


def test_response_carries_generated_request_id(client):
    r = client.get("/api/v1/homes")
    assert r.status_code == 200
    rid = r.headers.get("x-request-id")
    assert rid and len(rid) == 32


def test_valid_incoming_request_id_is_propagated_and_garbage_is_replaced(client):
    assert client.get("/api/v1/homes", headers={"X-Request-ID": "abc12345-xyz"}).headers["x-request-id"] == "abc12345-xyz"
    bad = client.get("/api/v1/homes", headers={"X-Request-ID": "<script>"}).headers["x-request-id"]
    assert bad != "<script>" and len(bad) == 32


def test_request_is_logged_as_json(client, caplog):
    caplog.set_level(logging.INFO, logger="energyrd.api")
    logger = logging.getLogger("energyrd.api")
    logger.addHandler(caplog.handler)
    try:
        r = client.get("/api/v1/homes")
    finally:
        logger.removeHandler(caplog.handler)
    rec = next(rec for rec in caplog.records if rec.getMessage() == "request")
    fields = rec.extra_fields
    assert fields["status"] == 200 and fields["path"] == "/api/v1/homes"
    assert fields["request_id"] == r.headers["x-request-id"]
    assert isinstance(fields["duration_ms"], float)
    from app.observability import JsonFormatter
    assert json.loads(JsonFormatter().format(rec))["status"] == 200


def test_unhandled_error_returns_generic_500_with_request_id():
    @app.get("/__boom_for_test")
    def boom():
        raise RuntimeError("secret internal detail")

    try:
        with TestClient(app, raise_server_exceptions=False) as c:
            r = c.get("/__boom_for_test")
        assert r.status_code == 500
        body = r.json()
        assert body["detail"] == "Error interno del servidor"
        assert "secret" not in r.text
        assert body["request_id"] == r.headers["x-request-id"]
    finally:
        app.router.routes = [rt for rt in app.router.routes if getattr(rt, "path", "") != "/__boom_for_test"]


def test_cors_exposes_request_id_and_limits_headers(client):
    r = client.options(
        "/api/v1/homes",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "X-Request-ID",
        },
    )
    assert r.status_code == 200
    assert "x-request-id" in r.headers.get("access-control-allow-headers", "").lower()
    bad = client.options(
        "/api/v1/homes",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "X-Evil",
        },
    )
    assert bad.status_code == 400
