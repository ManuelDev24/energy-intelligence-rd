from fastapi import APIRouter, Response

from app.schemas.auth import LegalOut
from app.services.legal import legal_versions

# Público a propósito: solo versiones de los documentos legales (borrador); sin datos de usuarios.
router = APIRouter(prefix="/legal", tags=["legal"])


@router.get("", response_model=LegalOut)
def get_legal(response: Response):
    response.headers["Cache-Control"] = "no-cache"
    return legal_versions()
