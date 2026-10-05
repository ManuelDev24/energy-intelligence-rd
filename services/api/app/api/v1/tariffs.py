from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.home import Distributor
from app.schemas.tariff import TariffOut
from app.services import tariffs

# Público: pliegos tarifarios publicados por la SIE; no contiene datos de usuarios ni de viviendas.
router = APIRouter(prefix="/tariffs", tags=["tariffs"])


@router.get("", response_model=list[TariffOut])
def list_tariffs(distributor: Distributor | None = None, on: date | None = None,
                 limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0),
                 db: Session = Depends(get_db)):
    """Tarifas publicadas; `on` filtra la versión vigente en esa fecha. Lista vacía si no hay datos cargados."""
    return tariffs.list_tariffs(db, distributor, on, limit, offset)
