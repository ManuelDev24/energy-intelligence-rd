"""Registro de tipos de trabajo. Un handler es `fn(db, job) -> None`; debe ser IDEMPOTENTE: la entrega es «al menos una
vez» (si un proceso muere o se pasa del tiempo, otro lo repite)."""
import re
from dataclasses import dataclass
from typing import Callable

_KIND = re.compile(r"^[a-z][a-z0-9_.-]{0,63}$")


class PermanentFailure(Exception):
    """El trabajo no tiene arreglo reintentando (datos inválidos, recurso inexistente): va directo a «muertos»."""


class RetryLater(Exception):
    """Reintentar pasado `seconds` (p. ej. el proveedor pidió esperar), en lugar de la espera creciente habitual."""

    def __init__(self, seconds: float):
        super().__init__(f"retry in {seconds}s")
        self.seconds = max(1.0, float(seconds))


@dataclass(frozen=True)
class JobSpec:
    kind: str
    handler: Callable
    timeout_seconds: int
    max_attempts: int | None


_REGISTRY: dict[str, JobSpec] = {}


def register(kind: str, *, timeout_seconds: int = 300, max_attempts: int | None = None):
    if not _KIND.match(kind) or not 1 <= timeout_seconds <= 3600:
        raise ValueError("Tipo de trabajo o tiempo máximo no válido")

    def decorator(handler):
        if kind in _REGISTRY and _REGISTRY[kind].handler is not handler:
            raise ValueError(f"Tipo de trabajo duplicado: {kind}")
        _REGISTRY[kind] = JobSpec(kind, handler, timeout_seconds, max_attempts)
        return handler
    return decorator


def get_spec(kind: str) -> JobSpec | None:
    return _REGISTRY.get(kind)


def registered_kinds() -> list[str]:
    return sorted(_REGISTRY)
