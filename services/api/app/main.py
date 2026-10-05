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
from app.services.errors import ApplicationError
from app.services.auth_abuse import RateLimited

configure_logging()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="API para Energy RD - Plataforma de Inteligencia Energética",
)

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
    if isinstance(exc, RateLimited):
        headers["Retry-After"] = str(exc.retry_after)
    return JSONResponse({"detail": str(exc), "code": exc.code,
                         "request_id": getattr(request.state, "request_id", None)},
                        status_code=exc.status_code, headers=headers)


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
        raise HTTPException(status_code=503, detail="database unavailable")
    return {"status": "healthy", "database": "ok"}
