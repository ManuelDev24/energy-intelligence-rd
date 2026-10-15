import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import rls
from app.api.auth_deps import current_user
from app.database import get_db
from app.models import HomeMember
from app.schemas.documents import DownloadUrlOut
from app.schemas.report import EnergyReportOut
from app.services import report_link, report_pdf, reports
from app.services.errors import NotFound
from app.services.transactions import require_home

router = APIRouter(prefix="/homes/{home_id}/reports", tags=["reports"])
download_router = APIRouter(prefix="/reports", tags=["reports"])
_PDF_HEADERS = {"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
                "Content-Security-Policy": "default-src 'none'; sandbox"}


def _pdf_response(report: EnergyReportOut) -> Response:
    name = f"informe-energetico-{report.period.period_from}-{report.period.period_to}.pdf"
    return Response(report_pdf.render_energy_report(report), media_type="application/pdf", headers={**_PDF_HEADERS, "Content-Disposition": f'attachment; filename="{name}"'})


@router.get("/energy", response_model=EnergyReportOut)
def energy_report(home_id: uuid.UUID, response: Response, period_from: date | None = Query(None, alias="from"),
                  period_to: date | None = Query(None, alias="to"), db: Session = Depends(get_db)):
    """Informe energético del período (por defecto, los últimos 365 días hasta hoy en America/Santo_Domingo). Solo lectura."""
    response.headers["Cache-Control"] = "no-store"
    return reports.build_energy_report(db, require_home(db, home_id), period_from, period_to)


@router.get("/energy.pdf", include_in_schema=True)
def energy_report_pdf(home_id: uuid.UUID, period_from: date | None = Query(None, alias="from"), period_to: date | None = Query(None, alias="to"),
                      db: Session = Depends(get_db)):
    """El mismo informe como PDF descargable (con sesión)."""
    return _pdf_response(reports.build_energy_report(db, require_home(db, home_id), period_from, period_to))


@router.post("/energy/pdf-link", response_model=DownloadUrlOut)
def energy_report_pdf_link(home_id: uuid.UUID, response: Response, period_from: date | None = Query(None, alias="from"),
                           period_to: date | None = Query(None, alias="to"), db: Session = Depends(get_db), user=Depends(current_user)):
    """Enlace firmado de 2 minutos para abrir el PDF en el navegador o el visor del teléfono (que no pueden enviar Authorization)."""
    response.headers["Cache-Control"] = "no-store"
    require_home(db, home_id)
    start, end = reports.resolve_period(period_from, period_to)
    token, expires = report_link.sign_report(home_id, user.id if user else None, start, end)
    return DownloadUrlOut(url=f"/api/v1/reports/download?token={token}", expires_at=expires)


@download_router.get("/download", include_in_schema=False)
def download(token: str = Query(..., min_length=20, max_length=600), db: Session = Depends(get_db)):
    """Canjea el enlace firmado. La firma sustituye a la sesión; la membresía vigente se revalida."""
    claim = report_link.verify_report(token)
    rls.set_context(db, user_id=claim.user_id, home_id=claim.home_id)
    if claim.user_id is not None and db.scalar(select(HomeMember.user_id).where(HomeMember.home_id == claim.home_id, HomeMember.user_id == claim.user_id)) is None:
        raise NotFound("Enlace de descarga no válido o vencido")
    return _pdf_response(reports.build_energy_report(db, require_home(db, claim.home_id), claim.period_from, claim.period_to))
