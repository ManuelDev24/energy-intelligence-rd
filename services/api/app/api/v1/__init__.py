from fastapi import APIRouter

from app.api.v1 import alerts, bills, dashboard, equipment, homes

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(homes.router)
api_router.include_router(bills.router)
api_router.include_router(dashboard.router)
api_router.include_router(equipment.router)
api_router.include_router(alerts.router)
