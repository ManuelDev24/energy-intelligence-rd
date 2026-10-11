"""Contexto de aislamiento por vivienda para PostgreSQL RLS (auditoría C-01). Sin FastAPI.

El API fija, por transacción, quién es la persona (`app.user_id`) y en qué vivienda trabaja la petición (`app.home_id`) con
`set_config(..., is_local => true)`: el valor muere con la transacción y no se filtra entre conexiones del pool. Las políticas de la
migración 0025 usan `app_user()` / `app_home()`. El contexto vive en `session.info`; el evento `after_begin` lo reaplica al empezar cada
transacción (los servicios hacen commit varias veces por petición), y `set_context` lo aplica de inmediato si ya hay una transacción abierta.

Solo se llama desde las dependencias de autenticación y desde los pocos casos de uso que cruzan viviendas (borrado de cuenta, exportación)
o que obtienen la vivienda de una prueba criptográfica (invitación, enlace de descarga firmado). Las sesiones del worker no fijan nada:
conectan como `erd_worker`, cuyas políticas permiten todo.
"""
from uuid import UUID

from sqlalchemy import event
from sqlalchemy.orm import Session

_UNSET = object()
_STATEMENT = "SELECT set_config('app.user_id', %s, true), set_config('app.home_id', %s, true)"


def _text(value) -> str:
    return "" if value is None else str(UUID(str(value)))  # str(UUID(...)) valida: nada que no sea un UUID llega a la base


def _apply(connection, user_id, home_id) -> None:
    connection.exec_driver_sql(_STATEMENT, (_text(user_id), _text(home_id)))


@event.listens_for(Session, "after_begin")
def _on_begin(session: Session, transaction, connection) -> None:
    info = session.info
    if "rls_user_id" in info or "rls_home_id" in info:
        _apply(connection, info.get("rls_user_id"), info.get("rls_home_id"))


def set_context(db: Session, *, user_id=_UNSET, home_id=_UNSET) -> None:
    """Fija persona y/o vivienda del contexto (lo no indicado se conserva; `None` lo borra)."""
    if user_id is not _UNSET:
        db.info["rls_user_id"] = user_id
    if home_id is not _UNSET:
        db.info["rls_home_id"] = home_id
    if db.in_transaction():
        _apply(db.connection(), db.info.get("rls_user_id"), db.info.get("rls_home_id"))


def current_home(db: Session):
    return db.info.get("rls_home_id")
