"""Admin OCR operations over the existing queue; never return OCR content or raw errors."""
from datetime import timedelta

from sqlalchemy import cast, func, select, String
from sqlalchemy.orm import Session

from app import rls
from app.models.document import Document, DocumentOcr
from app.models.job import Job
from app.services import admin
from app.services.errors import ApplicationError, NotFound
from app.services.jobs import queue
from app.services.ocr.jobs import KIND
from app.services.transactions import write_transaction

PERMANENT = frozenset({'unreadable', 'protected_pdf', 'file_missing'})


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
            'error_code': state.error_code if state.error_code in PERMANENT | {'engine_error'} else None}


def _query():
    return (select(Job, DocumentOcr).join(DocumentOcr, cast(DocumentOcr.document_id, String) == Job.idempotency_key)
            .join(Document, Document.id == DocumentOcr.document_id).where(Job.kind == KIND))


def list_jobs(db: Session, *, status=None, limit=50, offset=0):
    rls.enable_admin_ocr(db)
    query = _query()
    # Filtering the projection BEFORE limit/count is necessary for stable pagination.
    if status is not None:
        from sqlalchemy import case
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
    row = db.execute(_query().where(Job.id == job_id)).first()
    if row is None:
        raise NotFound('Trabajo OCR no encontrado')
    return _projection(*row)


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
    return _projection(job, state)


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
    return _projection(job, state)
