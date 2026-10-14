from datetime import datetime
from typing import Literal
import uuid

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.orm import Session

from app.api.admin_deps import current_admin, require_scope
from app.database import get_db
from app.schemas.admin import (AdminOverviewOut, AdminOcrJobDetailOut, AdminOcrJobsPage, OcrOperationReason,
                               AuditEventOut, AuditEventsPage, MyAccessOut, RoleAssignmentsPage,
                               RoleAssignmentCreate, RoleAssignmentOut, RoleAssignmentRevoke, RoleOut, ScopeOut)
from app.services import admin as admin_service
from app.services import admin_ocr, admin_overview

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get('/overview', response_model=AdminOverviewOut, dependencies=[Depends(require_scope('admin.system.read'))])
def overview(response: Response, db: Session = Depends(get_db)):
    """Resumen operativo: solo agregados (números y series diarias), nunca datos de un hogar concreto."""
    response.headers["Cache-Control"] = "no-store"
    return admin_overview.build(db)


@router.get('/ocr/jobs', response_model=AdminOcrJobsPage,
            dependencies=[Depends(require_scope('admin.ocr.read'))])
def list_ocr_jobs(status: Literal['queued', 'processing', 'completed', 'failed_retryable',
                                  'failed_permanent', 'dead_letter', 'cancelled'] | None = None,
                  error_code: Literal['unreadable', 'protected_pdf', 'file_missing', 'engine_error'] | None = None,
                  min_attempts: int | None = Query(None, ge=0, le=100),
                  created_from: datetime | None = None, created_to: datetime | None = None,
                  limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
                  db: Session = Depends(get_db)):
    items, total = admin_ocr.list_jobs(db, status=status, error_code=error_code, min_attempts=min_attempts,
                                       created_from=created_from, created_to=created_to, limit=limit, offset=offset)
    return AdminOcrJobsPage(items=items, total=total, limit=limit, offset=offset)


@router.get('/ocr/jobs/{job_id}', response_model=AdminOcrJobDetailOut,
            dependencies=[Depends(require_scope('admin.ocr.read'))])
def detail_ocr_job(job_id: int, db: Session = Depends(get_db)):
    return admin_ocr.detail(db, job_id)


@router.post('/ocr/jobs/{job_id}/retry', response_model=AdminOcrJobDetailOut,
             dependencies=[Depends(require_scope('admin.ocr.retry'))])
def retry_ocr_job(job_id: int, payload: OcrOperationReason, request: Request,
                  user=Depends(current_admin), db: Session = Depends(get_db)):
    return admin_ocr.retry(db, job_id, reason=payload.reason, actor_user_id=user.id,
                           request_id=getattr(request.state, 'request_id', None))


@router.post('/ocr/jobs/{job_id}/cancel', response_model=AdminOcrJobDetailOut,
             dependencies=[Depends(require_scope('admin.ocr.review'))])
def cancel_ocr_job(job_id: int, payload: OcrOperationReason, request: Request,
                   user=Depends(current_admin), db: Session = Depends(get_db)):
    return admin_ocr.cancel(db, job_id, reason=payload.reason, actor_user_id=user.id,
                            request_id=getattr(request.state, 'request_id', None))


@router.get("/me", response_model=MyAccessOut)
def my_access(user=Depends(current_admin), db: Session = Depends(get_db)):
    """Anyone with a valid session can see their *own* admin access — this is how a
    non-admin user discovers, correctly, that they have none (empty roles/scopes, not 403)."""
    roles, scopes = admin_service.effective_roles_and_scopes(db, user.id)
    return MyAccessOut(user_id=user.id, email=user.email, roles=roles, scopes=sorted(scopes))


@router.get("/roles", response_model=list[RoleOut], dependencies=[Depends(require_scope("admin.roles.read"))])
def list_roles(db: Session = Depends(get_db)):
    return admin_service.list_roles(db)


@router.get("/scopes", response_model=list[ScopeOut], dependencies=[Depends(require_scope("admin.roles.read"))])
def list_scopes(db: Session = Depends(get_db)):
    return admin_service.list_scopes(db)


@router.get("/role-assignments", response_model=RoleAssignmentsPage, dependencies=[Depends(require_scope("admin.roles.read"))])
def list_role_assignments(user_id: uuid.UUID | None = None, role_name: str | None = None,
                           status: str | None = Query(None, pattern="^(active|expired|revoked)$"),
                           limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
                           db: Session = Depends(get_db)):
    items, total = admin_service.list_assignments(db, user_id=user_id, role_name=role_name,
                                                   status_filter=status, limit=limit, offset=offset)
    return RoleAssignmentsPage(items=items, total=total, limit=limit, offset=offset)


@router.post("/role-assignments", response_model=RoleAssignmentOut,
            dependencies=[Depends(require_scope("admin.roles.manage"))])
def create_role_assignment(payload: RoleAssignmentCreate, request: Request,
                            user=Depends(current_admin), db: Session = Depends(get_db)):
    request_id = getattr(request.state, "request_id", None)
    return admin_service.assign_role(db, target_user_id=payload.user_id, role_name=payload.role_name,
                                     assigned_by_user_id=user.id, reason=payload.reason,
                                     expires_at=payload.expires_at, request_id=request_id)


@router.post("/role-assignments/{assignment_id}/revoke", response_model=RoleAssignmentOut,
            dependencies=[Depends(require_scope("admin.roles.manage"))])
def revoke_role_assignment(assignment_id: uuid.UUID, payload: RoleAssignmentRevoke, request: Request,
                            user=Depends(current_admin), db: Session = Depends(get_db)):
    request_id = getattr(request.state, "request_id", None)
    return admin_service.revoke_assignment(db, assignment_id=assignment_id, revoked_by_user_id=user.id,
                                           reason=payload.reason, request_id=request_id)


@router.get("/audit-events", response_model=AuditEventsPage, dependencies=[Depends(require_scope("admin.audit.read"))])
def list_audit_events(actor_user_id: uuid.UUID | None = None, action: str | None = None,
                       result: str | None = Query(None, pattern="^(success|denied|error)$"),
                       limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
                       db: Session = Depends(get_db)):
    rows, total = admin_service.list_audit_events(db, actor_user_id=actor_user_id, action=action, result=result,
                                                   limit=limit, offset=offset)
    return AuditEventsPage(items=[AuditEventOut.model_validate(r) for r in rows], total=total, limit=limit, offset=offset)
