"""Plan gratuito: la API arranca también el worker en el mismo contenedor (sin servicio de worker de pago).

El worker debe usar SU rol (`WORKER_DATABASE_URL`, erd_worker), nunca el del API ni el dueño de las migraciones.
"""
import os
import signal
import stat
import subprocess
import time
from pathlib import Path

import pytest
from pydantic import ValidationError

from tests.test_config import PRODUCTION, config

ENTRYPOINT = Path(__file__).resolve().parents[1] / "docker-entrypoint.sh"
WORKER_URL = "postgresql+psycopg://erd_worker:other@db.internal/energy_rd"


def test_worker_in_web_requires_its_own_database_url():
    with pytest.raises(ValidationError, match="WORKER_DATABASE_URL"):
        config(RUN_WORKER_IN_WEB=True)


def test_worker_in_web_rejects_the_api_role_in_deployment():
    with pytest.raises(ValidationError, match="erd_worker"):
        config(**PRODUCTION, RUN_WORKER_IN_WEB=True, WORKER_DATABASE_URL=PRODUCTION["DATABASE_URL"])


def test_worker_in_web_rejects_a_local_url_in_deployment():
    with pytest.raises(ValidationError, match="WORKER_DATABASE_URL"):
        config(**PRODUCTION, RUN_WORKER_IN_WEB=True,
               WORKER_DATABASE_URL="postgresql+psycopg://erd_worker:x@localhost/energy_rd")


def test_worker_in_web_accepts_a_distinct_worker_role_and_hides_it():
    settings = config(**PRODUCTION, RUN_WORKER_IN_WEB=True, WORKER_DATABASE_URL=WORKER_URL)
    assert settings.RUN_WORKER_IN_WEB is True
    assert "other" not in repr(settings)


def _stub(bin_dir: Path, name: str, body: str) -> None:
    path = bin_dir / name
    path.write_text("#!/bin/sh\n" + body)
    path.chmod(path.stat().st_mode | stat.S_IEXEC)


def _run_entrypoint(tmp_path: Path, **env: str) -> str:
    bin_dir, log = tmp_path / "bin", tmp_path / "calls.log"
    bin_dir.mkdir()
    # `python -c …` (validación de config, migración/semilla opcionales) termina bien; `python -m app.worker` deja constancia
    # del rol con el que arrancó y si heredó la URL del dueño.
    _stub(bin_dir, "python", f"""if [ "$1" = "-m" ]; then
  echo "worker db=$DATABASE_URL migration=${{MIGRATION_DATABASE_URL:-unset}} combined=${{RUN_WORKER_IN_WEB:-unset}}" >> "{log}"
  sleep 30
fi
exit 0
""")
    _stub(bin_dir, "uvicorn", f'echo "uvicorn $*" >> "{log}"\nsleep 30\n')
    full_env = {"PATH": f"{bin_dir}:{os.environ['PATH']}", "DATABASE_URL": "postgresql+psycopg://erd_app:a@db/x",
                "MIGRATION_DATABASE_URL": "postgresql+psycopg://owner:o@db/x", **env}
    proc = subprocess.Popen(["sh", str(ENTRYPOINT)], cwd=ENTRYPOINT.parent, env=full_env, start_new_session=True,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        deadline = time.monotonic() + 10
        expected = 2 if env.get("RUN_WORKER_IN_WEB", "").lower() in {"1", "true", "yes", "on", "t", "y"} else 1
        while time.monotonic() < deadline:
            if log.exists() and len(log.read_text().splitlines()) >= expected:
                break
            time.sleep(0.1)
        time.sleep(0.3)  # deja aparecer una línea inesperada si la hubiera
        return log.read_text() if log.exists() else ""
    finally:
        os.killpg(proc.pid, signal.SIGKILL)
        proc.wait(timeout=5)


@pytest.mark.parametrize("flag", ["true", "TRUE", "1"])
def test_entrypoint_starts_worker_with_worker_role_and_without_owner_url(tmp_path, flag):
    calls = _run_entrypoint(tmp_path, RUN_WORKER_IN_WEB=flag, WORKER_DATABASE_URL=WORKER_URL)
    assert f"worker db={WORKER_URL} migration=unset combined=false" in calls
    # Real Settings validation of the child's environment (no DB connection).
    values = PRODUCTION | {"DATABASE_URL": WORKER_URL}
    child = config(**values, RUN_WORKER_IN_WEB=False, WORKER_DATABASE_URL=WORKER_URL)
    assert child.RUN_WORKER_IN_WEB is False
    assert "uvicorn app.main:app" in calls


@pytest.mark.parametrize("env", [{}, {"RUN_WORKER_IN_WEB": "false"}])
def test_entrypoint_without_flag_starts_only_the_api(tmp_path, env):
    calls = _run_entrypoint(tmp_path, **env)
    assert "uvicorn app.main:app" in calls
    assert "worker" not in calls
