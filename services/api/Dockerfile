FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.9 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"
WORKDIR /app

# Dependencias primero (cache de capas); versiones fijadas por uv.lock.
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --no-install-project

COPY alembic.ini docker-entrypoint.sh ./
COPY app ./app
RUN chmod +x docker-entrypoint.sh \
    && useradd --system --uid 10001 --home-dir /app app \
    && chown -R app:app /app

# Sin privilegios de root dentro del contenedor.
USER app

# Puerto por defecto en local; en Render escucha en $PORT (lo inyecta la plataforma).
EXPOSE 8000
# Sin argumentos arranca la API; con argumentos ejecuta ese comando tras validar la configuración
# (p. ej. `alembic upgrade head` como paso de release).
ENTRYPOINT ["./docker-entrypoint.sh"]
