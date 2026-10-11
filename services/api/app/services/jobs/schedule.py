"""Programador sin líder: cada worker, en cada vuelta, encola las tareas periódicas cuyo «hueco» actual aún no existe.
La clave de idempotencia `sched:<hueco>` hace que dos workers no dupliquen: gana el primero y el otro recibe el existente.
Si los workers estuvieron caídos no se acumula un atraso: solo se encola el hueco vigente (las tareas periódicas deben ser
idempotentes y ponerse al día en una sola pasada)."""
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.services.jobs import queue


@dataclass(frozen=True)
class Schedule:
    kind: str
    every_seconds: int
    payload: dict = field(default_factory=dict)

    def __post_init__(self):
        if self.every_seconds < 10:
            raise ValueError("Una tarea periódica no puede repetirse en menos de 10 s")


def slot_key(schedule: Schedule, now) -> str:
    return f"sched:{int(now.timestamp() // schedule.every_seconds)}"


def tick(db: Session, schedules, *, now=None) -> int:
    """Encola lo que toque. Devuelve cuántos trabajos nuevos creó."""
    created = 0
    for schedule in schedules:
        current = now or queue._now(None)
        _, new = queue.enqueue(db, schedule.kind, schedule.payload, idempotency_key=slot_key(schedule, current), now=current)
        created += new
    return created
