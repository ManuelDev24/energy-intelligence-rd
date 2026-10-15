#!/usr/bin/env python3
"""ERD-DEPLOY-01 / ERD-OPS-DR — SIMULACRO local del despliegue: API + worker + bucket S3 (servidor `moto`) + PostgreSQL local.

NO es un despliegue ni prueba Render, Neon, Cloudflare R2, Resend ni EAS: sustituye cada servicio por un doble local para
ejercitar el CÓDIGO de extremo a extremo (configuración tipo producción de almacenamiento, worker, OCR, alertas, correo y la
recuperación de un objeto perdido). Datos sintéticos.

Requisitos: PostgreSQL local (usuario `energy`), `moto_server` en 127.0.0.1:5555 (`uvx --from 'moto[server]' moto_server -p 5555`),
Tesseract, y las dependencias de backend/api. Uso:  python3 infrastructure/sim/staging_sim.py <dir-salida>
"""
import base64, json, os, secrets, signal, subprocess, sys, time, uuid
from datetime import date, timedelta
from pathlib import Path

import boto3
import httpx

ROOT = Path(__file__).resolve().parents[2]
API_DIR = ROOT / "backend/api"
OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(API_DIR))
from tests import synthetic_bills as sb  # noqa: E402

PG = "postgresql+psycopg://energy:change_me_local_only@localhost:5432"
DB, PORT, MOTO = "erd_sim", 18021, "http://127.0.0.1:5555"
BUCKET = "erd-sim-private"
OUTBOX = OUT / "outbox.jsonl"
results = []


def check(name, ok, detail=""):
    results.append({"check": name, "ok": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""), flush=True)


env = {**os.environ,
       "DATABASE_URL": f"{PG}/{DB}", "AUTH_ENABLED": "true", "ENVIRONMENT": "development",
       "AUTH_SIGNING_KEY": secrets.token_urlsafe(48), "CORS_ORIGINS": "http://localhost:3000",
       "PASSWORD_RESET_URL": "http://localhost:3000/restablecer-contrasena", "EMAIL_DEV_OUTBOX": str(OUTBOX),
       "STORAGE_BACKEND": "s3", "STORAGE_S3_BUCKET": BUCKET, "STORAGE_S3_ENDPOINT_URL": MOTO, "STORAGE_S3_PREFIX": "prod",
       "STORAGE_S3_ACCESS_KEY_ID": "sim", "STORAGE_S3_SECRET_ACCESS_KEY": "sim-secret",
       "STORAGE_ENCRYPTION_KEYS": "k1:" + base64.urlsafe_b64encode(os.urandom(32)).decode(),
       "STORAGE_URL_SIGNING_KEY": secrets.token_urlsafe(48), "WORKER_POLL_SECONDS": "0.5",
       "AWS_ACCESS_KEY_ID": "sim", "AWS_SECRET_ACCESS_KEY": "sim-secret", "AWS_DEFAULT_REGION": "us-east-1"}
UV = ["uv", "run", "--frozen"]


def sh(args, **kw):
    return subprocess.run(args, cwd=API_DIR, env=env, capture_output=True, text=True, **kw)


s3 = boto3.client("s3", endpoint_url=MOTO, region_name="us-east-1", aws_access_key_id="sim", aws_secret_access_key="sim-secret")
for bucket in s3.list_buckets().get("Buckets", []):
    if bucket["Name"] == BUCKET:
        for v in s3.list_object_versions(Bucket=BUCKET).get("Versions", []) + s3.list_object_versions(Bucket=BUCKET).get("DeleteMarkers", []):
            s3.delete_object(Bucket=BUCKET, Key=v["Key"], VersionId=v["VersionId"])
        s3.delete_bucket(Bucket=BUCKET)
s3.create_bucket(Bucket=BUCKET)
s3.put_bucket_versioning(Bucket=BUCKET, VersioningConfiguration={"Status": "Enabled"})
check("bucket privado creado con versionado", s3.get_bucket_versioning(Bucket=BUCKET).get("Status") == "Enabled")

admin = "postgresql://energy:change_me_local_only@localhost:5432/postgres"
subprocess.run(["psql", admin, "-qc", f"DROP DATABASE IF EXISTS {DB}", "-c", f"CREATE DATABASE {DB}"], check=True, capture_output=True)
mig = sh(UV + ["alembic", "upgrade", "head"])
check("migraciones hasta head en una base vacía", mig.returncode == 0, mig.stderr.strip().splitlines()[-1] if mig.returncode else "")

procs = []
try:
    api = subprocess.Popen(UV + ["uvicorn", "app.main:app", "--port", str(PORT), "--no-proxy-headers"], cwd=API_DIR, env=env,
                           stdout=(OUT / "api.log").open("w"), stderr=subprocess.STDOUT)
    worker = subprocess.Popen(UV + ["python", "-m", "app.worker"], cwd=API_DIR, env=env, stdout=(OUT / "worker.log").open("w"),
                              stderr=subprocess.STDOUT)
    procs += [api, worker]
    base = f"http://127.0.0.1:{PORT}/api/v1"
    for _ in range(60):
        try:
            if httpx.get(f"http://127.0.0.1:{PORT}/health", timeout=2).status_code == 200:
                break
        except httpx.HTTPError:
            time.sleep(1)
    health = httpx.get(f"http://127.0.0.1:{PORT}/health").json()
    check("la API arranca con almacenamiento S3 y responde /health", health == {"status": "healthy", "database": "ok"}, json.dumps(health))

    c = httpx.Client(base_url=base, timeout=60)
    email = f"sim-{uuid.uuid4().hex}@example.com"
    tokens = c.post("/auth/register", json={"email": email, "password": secrets.token_urlsafe(24), "accept_terms": True}).json()
    c.headers["Authorization"] = "Bearer " + tokens["access_token"]
    home = c.post("/homes", json={"name": "Casa simulacro", "distributor": "EDESUR"}).json()["id"]

    # 1) Foto sintética -> documento cifrado en el bucket -> OCR en el worker -> borrador -> confirmar con document_id.
    today = date.today()
    data = sb.BillData(today - timedelta(days=38), today - timedelta(days=12), 4210, 4450, today + timedelta(days=2))
    png = sb.to_bytes(sb.render("EDESUR", data, 768))
    job = c.post(f"/homes/{home}/bills/ocr-jobs", files={"file": ("factura.png", png, "image/png")})
    check("subir la foto responde 202 de inmediato", job.status_code == 202, str(job.status_code))
    doc = job.json()["document_id"]
    status = {}
    for _ in range(90):
        status = c.get(f"/homes/{home}/bills/ocr-jobs/{doc}").json()
        if status["status"] in ("done", "failed"):
            break
        time.sleep(1)
    draft = status.get("draft") or {}
    check("el worker leyó la foto (estado done)", status.get("status") == "done", json.dumps({k: status.get(k) for k in ("status", "method", "attempts")}))
    exp = sb.expected(data)
    ok = {f: (draft.get(f) or {}).get("value") for f in exp}
    check("el borrador trae los campos esperados", all(ok[f] and float(ok[f]) == float(v) if f in ("kwh", "amount_dop", "days") else ok[f] == v
                                                       for f, v in exp.items() if f not in ("reading_previous", "reading_current")), json.dumps(ok))
    objs = [o["Key"] for o in s3.list_objects_v2(Bucket=BUCKET).get("Contents", [])]
    raw = s3.get_object(Bucket=BUCKET, Key=objs[0])["Body"].read() if objs else b""
    check("el objeto del bucket existe, con el prefijo y CIFRADO (no es un PNG)", len(objs) == 1 and objs[0].startswith("prod/homes/")
          and raw[:4] == b"ERD1" and b"PNG" not in raw[:16] and raw.find(b"EDESUR") == -1, objs[0] if objs else "sin objetos")
    bills_before = c.get(f"/homes/{home}/bills").json()
    check("leer NO creó ninguna factura", bills_before == [])
    bill = c.post(f"/homes/{home}/bills", json={"period_start": exp["period_start"], "period_end": exp["period_end"], "days": int(exp["days"]),
                                               "kwh": exp["kwh"], "amount_dop": exp["amount_dop"], "due_date": exp["due_date"], "document_id": doc})
    check("confirmar crea la factura y la liga al original", bill.status_code == 201, bill.text[:120])

    # 2) El worker evalúa alertas y envía el correo de aviso (bandeja de desarrollo, sin cifras).
    deadline = time.time() + 60
    mails = []
    while time.time() < deadline and not mails:
        time.sleep(1)
        mails = [json.loads(l) for l in OUTBOX.read_text().splitlines() if email in l] if OUTBOX.exists() else []
    alerts = c.get(f"/homes/{home}/alerts").json()
    check("hay una alerta de pago por vencer", any(a["type"] == "payment_due" for a in alerts), json.dumps(sorted({a["type"] for a in alerts})))
    check("el worker envió el correo de aviso sin cifras ni montos", len(mails) >= 1 and all(x not in mails[0]["text"] for x in ("RD$", exp["kwh"], exp["amount_dop"])),
          mails[0]["subject"] if mails else "sin correo")
    stats = sh(UV + ["python", "-m", "scripts.jobs", "stats"])
    st = json.loads(stats.stdout.strip().splitlines()[-1]) if stats.stdout.strip() else {}
    check("la cola no tiene trabajos muertos ni concesiones vencidas", stats.returncode == 0 and st.get("dead", 1) == 0 and st.get("stuck", 1) == 0, json.dumps(st))

    # 3) Conciliación base<->bucket y recuperación de un objeto perdido (versionado).
    rec = sh(UV + ["python", "-m", "scripts.storage_reconcile"])
    check("la conciliación inicial es consistente (salida 0)", rec.returncode == 0, rec.stdout.strip())
    version = s3.list_object_versions(Bucket=BUCKET, Prefix=objs[0])["Versions"][0]["VersionId"]
    s3.delete_object(Bucket=BUCKET, Key=objs[0])   # pérdida simulada (con versionado deja una marca de borrado)
    lost = sh(UV + ["python", "-m", "scripts.storage_reconcile"])
    report = json.loads(lost.stdout.strip().splitlines()[-1])
    check("tras perder el objeto la conciliación sale 1 y nombra el documento", lost.returncode == 1 and report["missing"] == 1 and report["missing_document_ids"] == [doc], json.dumps(report))
    s3.delete_object(Bucket=BUCKET, Key=objs[0], VersionId=s3.list_object_versions(Bucket=BUCKET, Prefix=objs[0])["DeleteMarkers"][0]["VersionId"])
    back = sh(UV + ["python", "-m", "scripts.storage_reconcile"])
    check("quitar la marca de borrado (recuperar la versión) deja la conciliación en 0", back.returncode == 0 and version, back.stdout.strip())
    url = c.get(f"/homes/{home}/documents").json()
    check("el documento recuperado sigue listado para su dueño", any(d["id"] == doc for d in url), "")

    # 4) Borrar el documento: la cola de borrado vacía el bucket.
    deleted = c.delete(f"/homes/{home}/documents/{doc}")
    for _ in range(40):
        sh(UV + ["python", "-m", "scripts.storage_maintenance"])
        live = [o for o in s3.list_objects_v2(Bucket=BUCKET).get("Contents", [])]
        if not live:
            break
        time.sleep(1)
    check("borrar el documento vacía el bucket por la cola de borrado", deleted.status_code in (200, 204) and not live, f"{deleted.status_code}, {len(live)} objeto(s)")
finally:
    for p in procs:
        p.send_signal(signal.SIGTERM)
    for p in procs:
        try:
            p.wait(timeout=15)
        except subprocess.TimeoutExpired:
            p.kill()
    subprocess.run(["psql", admin, "-qc", f"DROP DATABASE IF EXISTS {DB}"], capture_output=True)

(OUT / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2))
failed = [r for r in results if not r["ok"]]
print(f"{len(results) - len(failed)}/{len(results)} comprobaciones OK")
sys.exit(1 if failed else 0)
