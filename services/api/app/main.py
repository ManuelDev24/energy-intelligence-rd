from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.v1 import api_router
from app.config import settings
from app.database import engine
from app.observability import RequestContextMiddleware, configure_logging
from app.telemetry import init_telemetry
from app.services.errors import ApplicationError, ServiceBusy
from app.services.auth_abuse import RateLimited
from app.request_limits import BodyLimitMiddleware
from sqlalchemy.exc import OperationalError, TimeoutError as PoolTimeoutError
import logging

configure_logging()
init_telemetry(settings)



def documentation_urls(environment: str) -> dict[str, str | None]:
    """Auditoría C-07: Swagger/ReDoc/OpenAPI solo en desarrollo; en staging/producción no se publica el mapa completo de rutas.
    El contrato versionado vive en `packages/api-contracts/openapi.json` (lo genera `scripts/generate_contracts.py` sin servidor)."""
    if environment.lower() == "development":
        return {"docs_url": "/docs", "redoc_url": "/redoc", "openapi_url": "/openapi.json"}
    return {"docs_url": None, "redoc_url": None, "openapi_url": None}


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="API para Energy RD - Plataforma de Inteligencia Energética",
    **documentation_urls(settings.ENVIRONMENT),
)

# El último que se añade es el más externo: CORS → contexto de la petición (request-id, cabeceras, log) → tope del cuerpo → app.
# Así una respuesta 413 también lleva X-Request-ID, cabeceras de seguridad y CORS.
app.add_middleware(BodyLimitMiddleware)
app.add_middleware(RequestContextMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
    expose_headers=["X-Request-ID"],
)

app.include_router(api_router)


@app.exception_handler(ApplicationError)
async def application_error(request: Request, exc: ApplicationError):
    headers = {"WWW-Authenticate": "Bearer"} if exc.status_code == 401 else {}
    if exc.status_code in {429, 503} or getattr(exc, "no_store", False):
        headers["Cache-Control"] = "no-store"
    if isinstance(exc, (RateLimited, ServiceBusy)):
        headers["Retry-After"] = str(exc.retry_after)
    return JSONResponse({"detail": str(exc), "code": exc.code,
                         "request_id": getattr(request.state, "request_id", None)},
                        status_code=exc.status_code, headers=headers)


_busy_log = logging.getLogger("energyrd.api")


@app.exception_handler(PoolTimeoutError)
@app.exception_handler(OperationalError)
async def database_busy(request: Request, exc: Exception):
    """Auditoría C-08: pool agotado, tiempo de espera de la base (statement/lock_timeout), caída o reinicio de la base → 503 con
    Retry-After (reintentable) en vez de un 500. No se expone el motivo; queda en el log con el request_id."""
    _busy_log.warning("database busy or unavailable", extra={"extra_fields": {
        "request_id": getattr(request.state, "request_id", None), "path": request.url.path, "error": exc.__class__.__name__}})
    return await application_error(request, ServiceBusy())


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    return JSONResponse({"detail": exc.detail, "code": f"http_{exc.status_code}",
                         "request_id": getattr(request.state, "request_id", None)},
                        status_code=exc.status_code, headers=exc.headers)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    if request.url.path.startswith("/api/v1/auth/"):
        errors = [{k: v for k, v in error.items() if k not in {"input", "ctx"}} for error in errors]
    return JSONResponse({"detail": jsonable_encoder(errors, custom_encoder={ValueError: str}),
                         "code": "validation_error", "request_id": getattr(request.state, "request_id", None)},
                        status_code=422)


@app.get("/health/live")
def liveness():
    return {"status": "alive"}


@app.get("/")
def root():
    return {"message": "Energy RD API", "status": "ok"}


@app.get("/health")
def health():
    """Liveness + conectividad real con PostgreSQL (503 si la base no responde)."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        raise HTTPException(status_code=503, detail="database unavailable") from None
    return {"status": "healthy", "database": "ok"}
