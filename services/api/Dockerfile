# Auditoría C-12: bases fijadas por digest (reproducible; un rebuild no cambia de base sin que se vea en el diff).
# Resueltas el 2026-10-11 desde las etiquetas indicadas; Dependabot (ecosistema docker) propone las actualizaciones.
FROM python:3.12-slim@sha256:a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1

COPY --from=ghcr.io/astral-sh/uv:0.9@sha256:538e0b39736e7feae937a65983e49d2ab75e1559d35041f9878b7b7e51de91e4 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"
WORKDIR /app

# Tesseract is the native runtime used by pytesseract for bill OCR.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-spa tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

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
