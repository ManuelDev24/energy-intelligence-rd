"""ERD-WORKER-01: proceso que ejecuta los trabajos en segundo plano.

    python -m app.worker           # bucle continuo (un servicio «background worker»)
    python -m app.worker --once    # procesa lo vencido y sale (un cron cada pocos minutos)

En la imagen de la API:  ./docker-entrypoint.sh python -m app.worker
Un proceso ejecuta un trabajo a la vez; para más paralelismo se lanzan más procesos (la cola reparte sin duplicar).
SIGTERM/SIGINT: termina el trabajo en curso y sale, sin tomar otro.
"""
import argparse
import logging
import os
import random
import signal
import socket
import threading

from app.config import settings
from app.database import SessionLocal
from app.services.jobs import claim, execute, tick
from app.services.jobs.handlers import schedules
from app.services.jobs.runner import lease_of
from app.telemetry import init_telemetry

log = logging.getLogger("energyrd.jobs")


def worker_id() -> str:
    return f"{socket.gethostname()[:40]}:{os.getpid()}:{random.randrange(16 ** 4):04x}"


def run_worker(*, once: bool = False, poll_seconds: float | None = None, stop: threading.Event | None = None,
               session_factory=SessionLocal, schedule_items=None, max_jobs: int | None = None) -> dict:
    stop = stop or threading.Event()
    poll = settings.WORKER_POLL_SECONDS if poll_seconds is None else poll_seconds
    me, items = worker_id(), schedules() if schedule_items is None else schedule_items
    totals = {"succeeded": 0, "retry": 0, "dead": 0, "lost": 0}
    handled = 0
    while not stop.is_set():
        with session_factory() as db:
            tick(db, items)
            jobs = claim(db, me, lease_of=lease_of, limit=1)
            for job in jobs:
                totals[execute(db, job, me)] += 1
                handled += 1
        if max_jobs is not None and handled >= max_jobs:
            break
        if not jobs:
            if once:
                break
            stop.wait(poll * (0.8 + 0.4 * random.random()))
    return totals


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--once", action="store_true", help="procesa lo vencido y sale")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format='{"level": "%(levelname)s", "logger": "%(name)s", "msg": "%(message)s"}')
    stop = threading.Event()
    for name in (signal.SIGTERM, signal.SIGINT):
        signal.signal(name, lambda *_: stop.set())
    init_telemetry(settings)
    totals = run_worker(once=args.once, stop=stop)
    log.info("worker stopped %s", totals)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
