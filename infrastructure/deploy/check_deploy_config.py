#!/usr/bin/env python3
"""ERD-DEPLOY-01 — comprobación estática de la configuración de despliegue (sin red, sin cuentas).

Verifica que:
  * cada variable de render.yaml existe en el código que la consume (API: campos de Settings en
    services/api/app/config.py; web: referencias en apps/web) o es una variable de plataforma conocida;
  * los secretos usan `sync: false` y no hay valores secretos escritos en el Blueprint;
  * producción: rama main, auto-deploy apagado, migración como preDeployCommand, sin seed/migrate-on-start;
  * staging: rama Dev; todas las instancias en la región virginia;
  * apps/mobile/eas.json: cada EXPO_PUBLIC_* se usa en apps/mobile/src y las URLs pasan la misma regla
    HTTPS que src/config.ts aplica en compilaciones release.

Uso (desde la raíz del repo):  python3 infrastructure/deploy/check_deploy_config.py
Requiere PyYAML o Ruby (para leer YAML). Sale con código 1 si algo falla.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
# Variables que consume la plataforma (Render/Node/Next), no el código de la app.
PLATFORM_VARS = {"NODE_VERSION", "NEXT_TELEMETRY_DISABLED"}
# Variables de recuperación de contraseña: las añade el trabajo de recuperación en curso.
# Si aún no están en config.py se informan como PENDIENTE (aviso), no como error.
PENDING_API_VARS = {"EMAIL_BACKEND", "RESEND_API_KEY", "EMAIL_FROM", "PASSWORD_RESET_URL"}
SECRET_VARS = {"DATABASE_URL", "AUTH_SIGNING_KEY", "RESEND_API_KEY"}
# Copia de HTTPS_ORIGIN en apps/mobile/src/config.ts.
HTTPS_ORIGIN = re.compile(
    r"^https://(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*|\[[0-9a-f:.]+\])(?::\d{1,5})?/?$",
    re.I,
)

errors: list[str] = []
warnings: list[str] = []


def load_yaml(path: Path):
    try:
        import yaml  # type: ignore

        return yaml.safe_load(path.read_text())
    except ImportError:
        out = subprocess.run(
            ["ruby", "-ryaml", "-rjson", "-e", "puts JSON.generate(YAML.load_file(ARGV[0]))", str(path)],
            check=True, capture_output=True, text=True,
        )
        return json.loads(out.stdout)


def settings_fields() -> set[str]:
    text = (ROOT / "services/api/app/config.py").read_text()
    body = text.split("class Settings", 1)[1]
    return set(re.findall(r"^    ([A-Z][A-Z0-9_]*)\s*:", body, re.M))


def referenced(folder: str, key: str, exts=(".ts", ".tsx", ".mjs", ".js")) -> bool:
    pattern = re.compile(rf"\b{re.escape(key)}\b")
    for path in (ROOT / folder).rglob("*"):
        if "node_modules" in path.parts or ".next" in path.parts or path.suffix not in exts:
            continue
        if ".test." in path.name:
            continue
        if pattern.search(path.read_text(errors="ignore")):
            return True
    return False


def check_render() -> None:
    doc = load_yaml(ROOT / "render.yaml")
    fields = settings_fields()
    envs = {e["name"]: e for e in doc["projects"][0]["environments"]}
    if set(envs) != {"staging", "production"}:
        errors.append(f"entornos esperados staging/production, hay {sorted(envs)}")
    for env_name, env in envs.items():
        groups = {g["name"]: g["envVars"] for g in env.get("envVarGroups", [])}
        for svc in env["services"]:
            name = svc["name"]
            keys: dict[str, dict] = {}
            for item in svc.get("envVars", []):
                if "fromGroup" in item:
                    for gv in groups.get(item["fromGroup"], []):
                        keys[gv["key"]] = gv
                    if item["fromGroup"] not in groups:
                        errors.append(f"{name}: grupo {item['fromGroup']} no definido en {env_name}")
                else:
                    keys[item["key"]] = item
            if svc.get("region") != "virginia":
                errors.append(f"{name}: región {svc.get('region')} (se esperaba virginia)")
            expected_branch = "main" if env_name == "production" else "Dev"
            if svc.get("branch") != expected_branch:
                errors.append(f"{name}: rama {svc.get('branch')} (se esperaba {expected_branch})")
            for key, item in keys.items():
                if key in SECRET_VARS and item.get("sync") is not False:
                    errors.append(f"{name}: secreto {key} sin sync:false")
                if "value" in item and key in SECRET_VARS:
                    errors.append(f"{name}: secreto {key} con valor escrito")
            if svc["runtime"] == "docker":
                for key in keys:
                    if key in fields:
                        continue
                    if key in PENDING_API_VARS:
                        warnings.append(f"{name}: {key} aún no existe en config.py (recuperación de contraseña en curso)")
                    else:
                        errors.append(f"{name}: {key} no es un campo de Settings (services/api/app/config.py)")
                for required in ("DATABASE_URL", "AUTH_SIGNING_KEY", "CORS_ORIGINS", "ENVIRONMENT", "AUTH_ENABLED"):
                    if required not in keys:
                        errors.append(f"{name}: falta {required}")
                if keys.get("ENVIRONMENT", {}).get("value") != env_name:
                    errors.append(f"{name}: ENVIRONMENT debe ser {env_name}")
                for flag in ("MIGRATE_ON_START", "SEED_PILOT"):
                    if keys.get(flag, {}).get("value", "false") != "false":
                        errors.append(f"{name}: {flag} debe ser false")
                if svc.get("healthCheckPath") != "/health":
                    errors.append(f"{name}: healthCheckPath debe ser /health")
                if env_name == "production" and svc.get("preDeployCommand") != "alembic upgrade head":
                    errors.append(f"{name}: preDeployCommand debe ser 'alembic upgrade head'")
                if svc.get("plan") == "free" and svc.get("preDeployCommand"):
                    errors.append(f"{name}: Render no admite preDeployCommand en instancias free")
            else:
                for key in keys:
                    if key in PLATFORM_VARS:
                        continue
                    if not referenced("apps/web", key):
                        errors.append(f"{name}: {key} no se usa en apps/web")
                for required in ("NEXT_PUBLIC_AUTH_ENABLED", "API_BASE_URL", "WEB_ORIGIN"):
                    if required not in keys:
                        errors.append(f"{name}: falta {required}")
                if keys.get("NEXT_PUBLIC_AUTH_ENABLED", {}).get("value") != "true":
                    errors.append(f"{name}: NEXT_PUBLIC_AUTH_ENABLED debe ser \"true\"")
                if "NODE_ENV" in keys:
                    errors.append(f"{name}: no fijar NODE_ENV (npm ci omitiría devDependencies del build)")
            if env_name == "production" and svc.get("autoDeployTrigger") != "off":
                errors.append(f"{name}: producción requiere autoDeployTrigger off")
            print(f"  render.yaml · {env_name:<10} {name:<22} {len(keys):>2} variables")


def check_eas() -> None:
    doc = json.loads((ROOT / "apps/mobile/eas.json").read_text())
    profiles = doc["build"]
    for required in ("development", "preview", "production"):
        if required not in profiles:
            errors.append(f"eas.json: falta el perfil {required}")
    for name, profile in profiles.items():
        for key, value in profile.get("env", {}).items():
            if not referenced("apps/mobile/src", key):
                errors.append(f"eas.json/{name}: {key} no se usa en apps/mobile/src")
            if key == "EXPO_PUBLIC_API_URL" and not HTTPS_ORIGIN.match(value):
                errors.append(f"eas.json/{name}: EXPO_PUBLIC_API_URL no es un origen HTTPS válido")
        print(f"  eas.json · perfil {name:<12} env={sorted(profile.get('env', {}))}")


if __name__ == "__main__":
    print("Comprobando configuración de despliegue…")
    check_render()
    check_eas()
    for w in warnings:
        print("AVISO:", w)
    for e in errors:
        print("ERROR:", e)
    print(f"Resultado: {len(errors)} errores, {len(warnings)} avisos")
    sys.exit(1 if errors else 0)
