"""Admin OCR operations over the existing queue; never return OCR content or raw errors."""
from datetime import timedelta

from sqlalchemy import case, cast, func, select, String
from sqlalchemy.orm import Session

from app import rls
from app.models.admin import AdminAuditEvent
from app.models.document import Document, DocumentOcr
from app.models.job import Job
from app.services import admin
from app.services.errors import ApplicationError, NotFound
from app.services.jobs import queue
from app.services.ocr.jobs import KIND
from app.services.transactions import write_transaction

PERMANENT = frozenset({'unreadable', 'protected_pdf', 'file_missing'})
PUBLIC_ERRORS = PERMANENT | {'engine_error'}
HISTORY_ACTIONS = ('ocr.retry', 'ocr.cancel')
HISTORY_LIMIT = 50


def _status(job, state):
    if job.status == 'cancelled' or state.status == 'cancelled':
        return 'cancelled'
    if state.status == 'done':
        return 'completed'
    if state.status == 'failed':
        if state.error_code in PERMANENT:
            return 'failed_permanent'
        if job.status == 'dead':
            return 'dead_letter'
        return 'failed_retryable'
    if job.status == 'dead':
        return 'dead_letter'
    if job.status == 'succeeded':
        return 'completed'
    if job.status == 'running' or state.status == 'processing':
        return 'processing'
    return 'queued'


def _projection(job, state):
    return {'id': job.id, 'document_id': state.document_id, 'status': _status(job, state),
            'attempts': job.attempts, 'max_attempts': job.max_attempts, 'run_at': job.run_at,
            'created_at': job.created_at, 'finished_at': job.finished_at,
            'error_code': state.error_code if state.error_code in PUBLIC_ERRORS else None}


def _detail(db, job, state, document):
    """Metadatos operativos del trabajo y del archivo; nunca el borrador, el texto ni el error crudo."""
    history = db.scalars(select(AdminAuditEvent).where(AdminAuditEvent.resource == f'jobs:{job.id}',
                                                      AdminAuditEvent.action.in_(HISTORY_ACTIONS))
                         .order_by(AdminAuditEvent.created_at.desc()).limit(HISTORY_LIMIT)).all()
    return {**_projection(job, state), 'generation': job.generation, 'started_at': job.started_at,
            'engine': state.engine, 'method': state.method, 'pages_read': state.pages_read,
            'pages_total': state.pages_total, 'document_kind': document.kind,
            'document_content_type': document.content_type, 'document_size_bytes': document.size_bytes,
            'uploaded_via': document.uploaded_via, 'attached_to_bill': document.bill_id is not None,
            'history': [{'action': e.action, 'result': e.result, 'reason': e.reason, 'created_at': e.created_at}
                        for e in history]}


def _query():
    return (select(Job, DocumentOcr).join(DocumentOcr, cast(DocumentOcr.document_id, String) == Job.idempotency_key)
            .join(Document, Document.id == DocumentOcr.document_id).where(Job.kind == KIND))


def list_jobs(db: Session, *, status=None, error_code=None, min_attempts=None, created_from=None,
              created_to=None, limit=50, offset=0):
    rls.enable_admin_ocr(db)
    query = _query()
    # Filtering the projection BEFORE limit/count is necessary for stable pagination.
    if error_code is not None:
        query = query.where(DocumentOcr.error_code == error_code)
    if min_attempts is not None:
        query = query.where(Job.attempts >= min_attempts)
    if created_from is not None:
        query = query.where(Job.created_at >= created_from)
    if created_to is not None:
        query = query.where(Job.created_at < created_to)
    if status is not None:
        effective = case(
            ((Job.status == 'cancelled') | (DocumentOcr.status == 'cancelled'), 'cancelled'),
            (DocumentOcr.status == 'done', 'completed'),
            ((DocumentOcr.status == 'failed') & DocumentOcr.error_code.in_(PERMANENT), 'failed_permanent'),
            ((DocumentOcr.status == 'failed') & (Job.status == 'dead'), 'dead_letter'),
            (DocumentOcr.status == 'failed', 'failed_retryable'),
            (Job.status == 'dead', 'dead_letter'),
            (Job.status == 'succeeded', 'completed'),
            ((Job.status == 'running') | (DocumentOcr.status == 'processing'), 'processing'),
            else_='queued')
        query = query.where(effective == status)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.execute(query.order_by(Job.id.desc()).limit(limit).offset(offset)).all()
    return [_projection(j, s) for j, s in rows], total


def detail(db: Session, job_id):
    rls.enable_admin_ocr(db)
    row = db.execute(_query().add_columns(Document).where(Job.id == job_id)).first()
    if row is None:
        raise NotFound('Trabajo OCR no encontrado')
    return _detail(db, *row)


def _locked(db, job_id):
    job = db.scalar(select(Job).where(Job.id == job_id, Job.kind == KIND).with_for_update()
                    .execution_options(populate_existing=True))
    if job is None:
        raise NotFound('Trabajo OCR no encontrado')
    # Never trust job payload; the unique key is the canonical document reference.
    document = db.scalar(select(Document).where(cast(Document.id, String) == job.idempotency_key)
                         .with_for_update().execution_options(populate_existing=True))
    if document is None or document.bill_id is not None:
        raise ApplicationError('El documento ya no está disponible para operaciones OCR')
    state = db.get(DocumentOcr, document.id, with_for_update=True, populate_existing=True)
    if state is None:
        raise ApplicationError('No existe estado OCR activo')
    return job, state


def retry(db: Session, job_id, *, reason, actor_user_id, request_id):
    rls.enable_admin_ocr(db)
    with write_transaction(db):
        job, state = _locked(db, job_id)
        if state.status != 'failed' or state.error_code in PERMANENT or job.status not in ('dead', 'succeeded'):
            raise ApplicationError('El trabajo no admite reintento manual')
        current = admin.now()
        generation = job.generation + 1
        job.status, job.attempts, job.generation = 'queued', 0, generation
        job.run_at = current + timedelta(seconds=queue.backoff_seconds(max(1, job.attempts), rng=lambda: .5))
        job.finished_at = job.started_at = job.locked_by = job.locked_until = None
        job.last_error = None
        state.generation, state.status, state.attempts = generation, 'pending', 0
        state.error_code = state.started_at = state.finished_at = state.draft = None
        admin.record_audit(db, actor_user_id=actor_user_id, action='ocr.retry', resource=f'jobs:{job.id}',
                           scope_used='admin.ocr.retry', reason=reason, result='success', request_id=request_id,
                           metadata={'job_id': job.id, 'generation': generation})
    return detail(db, job_id)


def cancel(db: Session, job_id, *, reason, actor_user_id, request_id):
    rls.enable_admin_ocr(db)
    with write_transaction(db):
        job, state = _locked(db, job_id)
        if job.status not in ('queued', 'running') or state.status not in ('pending', 'processing'):
            raise ApplicationError('El trabajo no admite cancelación')
        current = admin.now()
        job.status, job.generation, job.finished_at = 'cancelled', job.generation + 1, current
        job.locked_by = job.locked_until = None
        state.status, state.generation, state.finished_at = 'cancelled', job.generation, current
        state.draft = None
        admin.record_audit(db, actor_user_id=actor_user_id, action='ocr.cancel', resource=f'jobs:{job.id}',
                           scope_used='admin.ocr.review', reason=reason, result='success', request_id=request_id,
                           metadata={'job_id': job.id, 'generation': job.generation})
    return detail(db, job_id)
