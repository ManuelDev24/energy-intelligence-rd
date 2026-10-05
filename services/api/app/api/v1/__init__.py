from fastapi import APIRouter, Depends
from app.api.auth_deps import authorize_home

from app.api.v1 import alerts, auth, bills, consumption, dashboard, equipment, goals, homes, legal, readings, tariffs

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(homes.router, dependencies=[Depends(authorize_home)])
api_router.include_router(bills.router, dependencies=[Depends(authorize_home)])
api_router.include_router(dashboard.router, dependencies=[Depends(authorize_home)])
api_router.include_router(equipment.router, dependencies=[Depends(authorize_home)])
api_router.include_router(alerts.router, dependencies=[Depends(authorize_home)])
api_router.include_router(readings.router, dependencies=[Depends(authorize_home)])
api_router.include_router(consumption.router, dependencies=[Depends(authorize_home)])
api_router.include_router(goals.router, dependencies=[Depends(authorize_home)])
# Público a propósito: datos regulatorios publicados (ver PHASE2_IMPLEMENTATION.md).
api_router.include_router(tariffs.router)
# Público a propósito: versiones legales vigentes (ERD-AUTH-03).
api_router.include_router(legal.router)
