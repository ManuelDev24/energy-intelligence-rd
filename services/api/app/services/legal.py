"""Versiones legales vigentes (borrador). El texto final requiere revisión legal (Ley 172-13 RD)."""

LEGAL_TERMS_VERSION = "2026-10-draft"
LEGAL_PRIVACY_VERSION = "2026-10-draft"
LEGAL_STATUS = "draft"


def legal_versions():
    return {"terms_version": LEGAL_TERMS_VERSION, "privacy_version": LEGAL_PRIVACY_VERSION, "status": LEGAL_STATUS}


def require_final_legal(environment: str, allow_draft: bool) -> None:
    """Re-auditoría (C-04): en producción no se atiende a personas reales aceptando términos y privacidad en BORRADOR.
    `ALLOW_DRAFT_LEGAL=true` es una aceptación explícita y registrada del riesgo por parte de la persona responsable, no un valor por defecto."""
    if environment.lower() == "production" and LEGAL_STATUS != "final" and not allow_draft:
        raise RuntimeError(
            "Los textos legales están en borrador (status=draft): producción no arranca hasta que la revisión legal los apruebe "
            "(services/legal.py) o la persona responsable acepte el riesgo con ALLOW_DRAFT_LEGAL=true.")
