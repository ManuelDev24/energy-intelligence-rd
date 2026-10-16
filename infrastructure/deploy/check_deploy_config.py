#!/usr/bin/env python3
"""ERD-DEPLOY-01 — comprobación estática de la configuración de despliegue (sin red, sin cuentas).

Verifica que:
  * render.yaml (piloto gratuito): un único servicio web Docker Free en «ohio» (junto a Neon us-east-2) con API + worker
    (RUN_WORKER_IN_WEB), secretos con `sync: false`, cada variable existe en Settings, sin rol dueño ni migración al arrancar;
  * frontend-mobile/app/eas.json: cada EXPO_PUBLIC_* se usa en frontend-mobile/app/src y las URLs pasan la misma regla
    HTTPS que src/config.ts aplica en compilaciones release.
Web y admin van en Vercel (docs/deploy/VERCEL_PLAN.md).

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
SECRET_VARS = {"DATABASE_URL", "WORKER_DATABASE_URL", "MIGRATION_DATABASE_URL", "AUTH_SIGNING_KEY", "RESEND_API_KEY", "STORAGE_S3_ACCESS_KEY_ID",
               "STORAGE_S3_SECRET_ACCESS_KEY", "STORAGE_ENCRYPTION_KEYS", "STORAGE_URL_SIGNING_KEY", "EXPO_ACCESS_TOKEN"}
# Copia de HTTPS_ORIGIN en frontend-mobile/app/src/config.ts.
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
    text = (ROOT / "backend/api/app/config.py").read_text()
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
    """Piloto gratuito: un único servicio web Docker (API + worker en el mismo contenedor) en la región de Neon."""
    doc = load_yaml(ROOT / "render.yaml")
    fields = settings_fields()
    services = doc.get("services", [])
    if [s.get("name") for s in services] != ["energyrd-api"]:
        errors.append(f"render.yaml: se esperaba solo el servicio energyrd-api, hay {[s.get('name') for s in services]}")
        return
    svc = services[0]
    keys = {item["key"]: item for item in svc.get("envVars", [])}
    expected = {"type": "web", "runtime": "docker", "plan": "free", "region": "ohio", "healthCheckPath": "/health",
                "dockerfilePath": "./backend/api/Dockerfile", "dockerContext": "./backend/api"}
    for field, value in expected.items():
        if svc.get(field) != value:
            errors.append(f"energyrd-api: {field}={svc.get(field)!r} (se esperaba {value!r})")
    if svc.get("preDeployCommand"):
        errors.append("energyrd-api: Render no admite preDeployCommand en instancias free")
    for key, item in keys.items():
        if key not in fields:
            errors.append(f"energyrd-api: {key} no es un campo de Settings (backend/api/app/config.py)")
        if key in SECRET_VARS and (item.get("sync") is not False or "value" in item):
            errors.append(f"energyrd-api: secreto {key} debe ir con sync:false y sin valor")
    for required in ("DATABASE_URL", "WORKER_DATABASE_URL", "AUTH_SIGNING_KEY", "CORS_ORIGINS", "ENVIRONMENT", "AUTH_ENABLED",
                     "DB_REQUIRE_RESTRICTED_ROLE", "RUN_WORKER_IN_WEB", "PASSWORD_RESET_URL"):
        if required not in keys:
            errors.append(f"energyrd-api: falta {required}")
    fixed = {"ENVIRONMENT": "staging", "AUTH_ENABLED": "true", "DB_REQUIRE_RESTRICTED_ROLE": "true", "RUN_WORKER_IN_WEB": "true",
             "MIGRATE_ON_START": "false", "SEED_PILOT": "false"}
    for key, value in fixed.items():
        if keys.get(key, {}).get("value", "false" if key in {"MIGRATE_ON_START", "SEED_PILOT"} else None) != value:
            errors.append(f"energyrd-api: {key} debe ser {value!r}")
    if "MIGRATION_DATABASE_URL" in keys:
        errors.append("energyrd-api: el rol dueño (MIGRATION_DATABASE_URL) no se carga en Render; las migraciones se ejecutan aparte")
    if "ALLOW_DRAFT_LEGAL" in keys:
        errors.append("energyrd-api: ALLOW_DRAFT_LEGAL no puede fijarse en el blueprint")
    print(f"  render.yaml · energyrd-api ({svc.get('plan')}, {svc.get('region')}) {len(keys):>2} variables")


def check_eas() -> None:
    doc = json.loads((ROOT / "frontend-mobile/app/eas.json").read_text())
    profiles = doc["build"]
    for required in ("development", "preview", "production"):
        if required not in profiles:
            errors.append(f"eas.json: falta el perfil {required}")
    for name, profile in profiles.items():
        for key, value in profile.get("env", {}).items():
            if not referenced("frontend-mobile/app/src", key):
                errors.append(f"eas.json/{name}: {key} no se usa en frontend-mobile/app/src")
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
