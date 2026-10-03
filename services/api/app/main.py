from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.v1 import api_router
from app.config import settings
from app.database import engine

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="API para Energy RD - Plataforma de Inteligencia Energética",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(api_router)


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
