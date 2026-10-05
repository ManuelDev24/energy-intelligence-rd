from contextlib import contextmanager

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Home
from app.services.errors import ApplicationError, NotFound


def require_home(db: Session, home_id, *, lock=False) -> Home:
    query = select(Home).where(Home.id == home_id)
    if lock:
        query = query.with_for_update()
    home = db.scalar(query.execution_options(populate_existing=True))
    if home is None:
        raise NotFound("Vivienda no encontrada")
    return home


@contextmanager
def write_transaction(db: Session):
    """One commit per use case; locks and audit writes share this transaction."""
    try:
        yield
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        code = getattr(exc.orig, "sqlstate", None)
        if code in {"23505", "23P01"}:
            raise ApplicationError("Registro duplicado o período solapado") from exc
        raise
    except Exception:
        db.rollback()
        raise
