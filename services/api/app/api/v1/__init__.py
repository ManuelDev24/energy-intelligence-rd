from fastapi import APIRouter, Depends
from app.api.auth_deps import authorize_home

from app.api.v1 import admin, alerts, anomalies, auth, bills, consumption, copilot, dashboard, documents, energy_score, equipment, goals, homes, legal, outages, readings, recommendations, reports, sharing, tariffs

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(admin.router)
api_router.include_router(homes.router, dependencies=[Depends(authorize_home)])
api_router.include_router(bills.router, dependencies=[Depends(authorize_home)])
api_router.include_router(dashboard.router, dependencies=[Depends(authorize_home)])
api_router.include_router(equipment.router, dependencies=[Depends(authorize_home)])
api_router.include_router(alerts.router, dependencies=[Depends(authorize_home)])
api_router.include_router(anomalies.router, dependencies=[Depends(authorize_home)])
api_router.include_router(outages.router, dependencies=[Depends(authorize_home)])
api_router.include_router(energy_score.router, dependencies=[Depends(authorize_home)])
api_router.include_router(recommendations.router, dependencies=[Depends(authorize_home)])
api_router.include_router(readings.router, dependencies=[Depends(authorize_home)])
api_router.include_router(consumption.router, dependencies=[Depends(authorize_home)])
api_router.include_router(goals.router, dependencies=[Depends(authorize_home)])
api_router.include_router(sharing.router, dependencies=[Depends(authorize_home)])
api_router.include_router(documents.router, dependencies=[Depends(authorize_home)])
api_router.include_router(copilot.router, dependencies=[Depends(authorize_home)])
api_router.include_router(reports.router, dependencies=[Depends(authorize_home)])
# El enlace firmado de corta vida sustituye a la sesión; la ruta revalida la membresía (ERD-STORE-01).
api_router.include_router(documents.download_router)
# Requiere sesión pero no pertenencia previa: el token de invitación es lo que da acceso.
api_router.include_router(sharing.invitations_router)
# Público a propósito: datos regulatorios publicados (ver PHASE2_IMPLEMENTATION.md).
api_router.include_router(tariffs.router)
# Público a propósito: versiones legales vigentes (ERD-AUTH-03).
api_router.include_router(legal.router)
