"""ERD-ADM-SYSTEM-WEB: configuración y salud del sistema. SOLO LECTURA.

Regla de oro: **nunca** se devuelve el valor de una variable de entorno, ni un secreto, ni una URL; solo SI cumple la condición que exige la
aplicación (`checks`). Lo que no se puede medir (respaldo, simulacro de restauración) se muestra como «declarado por operaciones» con su antigüedad,
nunca como un hecho comprobado. Qué es medido y qué es declarado se dice en cada fila."""
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings as default_settings
from app.services.legal import LEGAL_STATUS

_STARTED = datetime.now(timezone.utc)
BACKUP_MAX_AGE_DAYS = 35
RESTORE_DRILL_MAX_AGE_DAYS = 180

RUNBOOKS = [
    {"title": "Recuperación ante desastres", "path": "docs/ops/DISASTER_RECOVERY.md", "use_when": "Restaurar la base, ensayar un restore o decidir un rollback."},
    {"title": "Trabajos en segundo plano", "path": "docs/ops/JOBS.md", "use_when": "La cola se atrasa, hay trabajos muertos o el worker parece detenido."},
    {"title": "Roles de base de datos", "path": "docs/ops/DB_ROLES.md", "use_when": "Configurar o rotar los roles mínimos de la API y el worker."},
    {"title": "Observabilidad", "path": "docs/ops/OBSERVABILITY.md", "use_when": "Revisar errores, trazas y alertas operativas."},
    {"title": "Operación del OCR", "path": "docs/ops/OCR_ADMIN_OPERATIONS.md", "use_when": "Reintentar o cancelar lecturas de facturas."},
    {"title": "Guía de despliegue y variables", "path": "docs/deploy/DEPLOY_GUIDE.md", "use_when": "Desplegar, cambiar variables o volver a una versión anterior."},
]


def _https(url: str) -> bool:
    parts = urlsplit(url or "")
    return parts.scheme == "https" and bool(parts.hostname)


def _strong(secret: str, minimum: int = 43) -> bool:
    return len(secret or "") >= minimum and len(set(secret)) >= 16


def config_checks(cfg=default_settings, legal_status: str = LEGAL_STATUS) -> list[dict]:
    """Función pura: recibe la configuración y devuelve las comprobaciones. No lee el entorno ni la base de datos."""
    dev = cfg.ENVIRONMENT.lower() == "development"
    prod = cfg.ENVIRONMENT.lower() in {"production", "staging"}

    def row(key, label, status, hint):
        return {"key": key, "label": label, "status": status, "hint": hint}

    def required(key, label, ok, hint_ok, hint_bad, *, na_in_dev=False):
        if na_in_dev and dev:
            return row(key, label, "na", "No aplica en desarrollo.")
        return row(key, label, "ok" if ok else "missing", hint_ok if ok else hint_bad)

    checks = [
        row("ENVIRONMENT", "Entorno", "ok", f"Entorno declarado: {cfg.ENVIRONMENT}."),
        required("AUTH_ENABLED", "Cuentas y sesiones", cfg.AUTH_ENABLED, "Las cuentas están activas.", "Las cuentas están apagadas (modo piloto): no debe usarse fuera de desarrollo.", na_in_dev=False),
        row("AUTH_SIGNING_KEY", "Clave de firma de sesiones", "ok" if (cfg.AUTH_ENABLED and _strong(cfg.AUTH_SIGNING_KEY)) else ("na" if not cfg.AUTH_ENABLED else "missing"),
            "Configurada y con longitud suficiente." if cfg.AUTH_ENABLED and _strong(cfg.AUTH_SIGNING_KEY) else ("No aplica sin cuentas." if not cfg.AUTH_ENABLED else "Falta o es demasiado débil.")),
        row("DB_REQUIRE_RESTRICTED_ROLE", "Rol de base de datos de mínimo privilegio", "ok" if cfg.DB_REQUIRE_RESTRICTED_ROLE else ("warning" if dev else "missing"),
            "La API exige conectarse como rol sin privilegios." if cfg.DB_REQUIRE_RESTRICTED_ROLE else "No se exige el rol restringido (la RLS podría no aplicarse)."),
        row("MIGRATION_DATABASE_URL", "Credencial separada para migraciones", "ok" if cfg.MIGRATION_DATABASE_URL else ("na" if dev else "warning"),
            "Las migraciones usan su propia credencial." if cfg.MIGRATION_DATABASE_URL else ("No aplica en desarrollo." if dev else "Las migraciones usarían la credencial de la API.")),
        row("CORS_ORIGINS", "Orígenes permitidos (CORS)", "ok" if cfg.cors_origins_list and all(_https(o) for o in cfg.cors_origins_list) else ("na" if dev else "missing"),
            "Solo orígenes HTTPS explícitos." if cfg.cors_origins_list and all(_https(o) for o in cfg.cors_origins_list) else ("No aplica en desarrollo." if dev else "Hay orígenes que no son HTTPS.")),
        row("EMAIL_BACKEND", "Envío de correo real", "ok" if (cfg.EMAIL_BACKEND == "resend" and cfg.RESEND_API_KEY.strip() and cfg.EMAIL_FROM.strip()) else ("na" if dev else "missing"),
            "Proveedor, clave y remitente configurados." if cfg.EMAIL_BACKEND == "resend" and cfg.RESEND_API_KEY.strip() and cfg.EMAIL_FROM.strip()
            else ("En desarrollo los correos van a la consola." if dev else "Falta el proveedor, la clave o el remitente.")),
        row("PASSWORD_RESET_URL", "Enlaces de correo (recuperación, invitación, verificación)",
            "ok" if all(_https(u) for u in (cfg.PASSWORD_RESET_URL, cfg.INVITATION_URL, cfg.EMAIL_VERIFICATION_URL)) else ("na" if dev else "missing"),
            "Los tres enlaces son HTTPS." if all(_https(u) for u in (cfg.PASSWORD_RESET_URL, cfg.INVITATION_URL, cfg.EMAIL_VERIFICATION_URL)) else ("No aplica en desarrollo." if dev else "Algún enlace no es HTTPS.")),
    ]
    storage_ok = cfg.STORAGE_BACKEND == "s3" and bool(cfg.STORAGE_S3_BUCKET and cfg.STORAGE_S3_ACCESS_KEY_ID and cfg.STORAGE_S3_SECRET_ACCESS_KEY)
    checks.append(row("STORAGE_BACKEND", "Almacenamiento de originales de facturas",
                      "ok" if storage_ok else ("warning" if cfg.STORAGE_BACKEND in ("disabled", "local") and dev else ("missing" if prod else "warning")),
                      {"s3": "Almacenamiento S3 configurado." if storage_ok else "S3 sin bucket o credenciales.",
                       "local": "Disco local (solo desarrollo).", "disabled": "Apagado: los originales no se guardan ni se lee el OCR."}.get(cfg.STORAGE_BACKEND, "Desconocido.")))
    if cfg.STORAGE_BACKEND != "disabled":
        checks.append(row("STORAGE_ENCRYPTION_KEYS", "Claves de cifrado y firma del almacenamiento", "ok" if (cfg.STORAGE_ENCRYPTION_KEYS and _strong(cfg.STORAGE_URL_SIGNING_KEY)) else "missing",
                          "Cifrado y firma de enlaces configurados." if cfg.STORAGE_ENCRYPTION_KEYS and _strong(cfg.STORAGE_URL_SIGNING_KEY) else "Falta la clave de cifrado o la de firma."))
    checks += [
        row("SENTRY_DSN", "Seguimiento de errores (Sentry)", "ok" if cfg.SENTRY_DSN else ("na" if dev else "warning"),
            "Configurado." if cfg.SENTRY_DSN else ("No aplica en desarrollo." if dev else "Sin seguimiento de errores: los fallos no llegan a nadie.")),
        row("BFF_API_SHARED_SECRET", "Secreto compartido web↔API", "ok" if _strong(cfg.BFF_API_SHARED_SECRET) else ("na" if cfg.CLIENT_IP_SOURCE != "cf-connecting-ip" else "missing"),
            "Configurado." if _strong(cfg.BFF_API_SHARED_SECRET) else ("Solo se exige con IP de cliente desde Cloudflare." if cfg.CLIENT_IP_SOURCE != "cf-connecting-ip" else "Falta o es débil.")),
        row("ANTHROPIC_API_KEY", "Clave del Copilot", "ok" if (cfg.COPILOT_PROVIDER == "anthropic" and cfg.ANTHROPIC_API_KEY.strip()) else ("na" if cfg.COPILOT_PROVIDER != "anthropic" else "missing"),
            "Configurada." if cfg.COPILOT_PROVIDER == "anthropic" and cfg.ANTHROPIC_API_KEY.strip() else (f"No aplica: el Copilot está en «{cfg.COPILOT_PROVIDER}»." if cfg.COPILOT_PROVIDER != "anthropic" else "Falta la clave.")),
        row("SUPPORT_EMAIL", "Correo de soporte del centro de ayuda", "ok" if cfg.SUPPORT_EMAIL.strip() else "warning",
            "Definido." if cfg.SUPPORT_EMAIL.strip() else "Sin definir: el centro de ayuda no muestra una vía de contacto."),
        _legal_row(cfg, legal_status),
        row("SEED_PILOT", "Datos de demostración apagados", "ok" if not cfg.SEED_PILOT else ("warning" if dev else "missing"),
            "Apagados." if not cfg.SEED_PILOT else "Los datos de demostración están activos."),
    ]
    return checks


def _legal_row(cfg, legal_status: str) -> dict:
    """Términos y privacidad: en producción la API no arranca con textos en borrador salvo aceptación explícita del riesgo (ALLOW_DRAFT_LEGAL, C-04)."""
    key, label = "ALLOW_DRAFT_LEGAL", "Términos y política de privacidad"
    if legal_status == "final":
        return {"key": key, "label": label, "status": "ok", "hint": "Textos legales aprobados."}
    if cfg.ENVIRONMENT.lower() == "production" and getattr(cfg, "ALLOW_DRAFT_LEGAL", False):
        return {"key": key, "label": label, "status": "warning", "hint": "Textos en BORRADOR con el riesgo aceptado de forma explícita (ALLOW_DRAFT_LEGAL): personas reales aceptan un texto sin revisión legal."}
    if cfg.ENVIRONMENT.lower() == "production":
        return {"key": key, "label": label, "status": "missing", "hint": "Textos en borrador sin aceptación del riesgo: producción no debería estar sirviendo."}
    return {"key": key, "label": label, "status": "warning", "hint": "Textos en borrador pendientes de revisión legal: producción no arrancará hasta aprobarlos."}


def attestations(now: datetime, cfg=default_settings) -> list[dict]:
    def one(key, label, declared, max_age):
        if declared is None:
            return {"key": key, "label": label, "declared_at": None, "age_days": None, "max_age_days": max_age, "status": "unknown",
                    "source": "Declarado por operaciones (no medido). Sin fecha declarada."}
        declared = declared if declared.tzinfo else declared.replace(tzinfo=timezone.utc)
        age = max(0, (now - declared).days)
        return {"key": key, "label": label, "declared_at": declared, "age_days": age, "max_age_days": max_age,
                "status": "ok" if age <= max_age else "stale", "source": "Declarado por operaciones (no medido)."}
    return [one("OPS_LAST_BACKUP_VERIFIED_AT", "Último respaldo verificado", cfg.OPS_LAST_BACKUP_VERIFIED_AT, BACKUP_MAX_AGE_DAYS),
            one("OPS_LAST_RESTORE_DRILL_AT", "Último simulacro de restauración", cfg.OPS_LAST_RESTORE_DRILL_AT, RESTORE_DRILL_MAX_AGE_DAYS)]


def migrations(db: Session) -> dict:
    """Revisión aplicada vs la más reciente del código. Si no se puede comprobar (p. ej. sin carpeta de migraciones) se dice, no se supone."""
    current = head = None
    try:
        current = db.execute(text("SELECT admin_migration_version()")).scalar()
    except Exception:  # noqa: BLE001 — función ausente o sin permiso: «no verificable»
        db.rollback()
    try:
        from alembic.config import Config
        from alembic.script import ScriptDirectory
        root = Path(__file__).resolve().parents[2]
        cfg = Config(str(root / "alembic.ini"))
        cfg.set_main_option("script_location", str(root / "app" / "alembic"))
        head = ScriptDirectory.from_config(cfg).get_current_head()
    except Exception:  # noqa: BLE001
        head = None
    return {"current": current, "head": head, "up_to_date": (current == head) if (current and head) else None}


def build(db: Session, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    release = (os.environ.get("RENDER_GIT_COMMIT") or os.environ.get("GIT_SHA") or "").strip()[:12] or None
    return {"environment": default_settings.ENVIRONMENT, "version": default_settings.VERSION, "release": release, "started_at": _STARTED,
            "uptime_seconds": max(0, int((now - _STARTED).total_seconds())), "migrations": migrations(db),
            "checks": config_checks(default_settings), "attestations": attestations(now, default_settings), "runbooks": RUNBOOKS}
