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


# --- Auditoría C-07 / C-09 ---------------------------------------------------------------------------------------------
def test_responses_carry_security_headers(client):
    r = client.get("/api/v1/homes")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["referrer-policy"] == "no-referrer"
    assert r.headers["x-frame-options"] == "DENY"
    assert r.headers["content-security-policy"] == "default-src 'none'; frame-ancestors 'none'"
    assert "camera=()" in r.headers["permissions-policy"]
    assert "strict-transport-security" not in r.headers  # development (http local)


def test_security_headers_also_cover_errors_and_hsts_outside_development():
    from app.observability import security_headers

    prod = security_headers("production", "/api/v1/homes")
    assert prod["Strict-Transport-Security"].startswith("max-age=31536000")
    assert "Strict-Transport-Security" not in security_headers("development", "/api/v1/homes")
    assert "Content-Security-Policy" not in security_headers("development", "/docs")  # Swagger UI necesita scripts
    assert "Content-Security-Policy" in security_headers("production", "/docs")


def test_error_responses_keep_security_headers(client):
    r = client.get("/api/v1/homes/not-a-uuid/bills")
    assert r.status_code in (404, 422)
    assert r.headers["x-content-type-options"] == "nosniff"


def test_api_documentation_is_published_only_in_development():
    from app.main import documentation_urls

    assert documentation_urls("development")["openapi_url"] == "/openapi.json"
    for environment in ("staging", "production", "Production"):
        assert documentation_urls(environment) == {"docs_url": None, "redoc_url": None, "openapi_url": None}


def test_uvicorn_runs_without_access_log_and_server_header():
    """El log de acceso de uvicorn registra la query completa (token firmado de descarga): debe estar apagado."""
    from pathlib import Path
    entrypoint = (Path(__file__).resolve().parents[1] / "docker-entrypoint.sh").read_text()
    assert "--no-access-log" in entrypoint and "--no-server-header" in entrypoint
