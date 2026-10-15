"""Disposable DB lifecycle; invoked only by run.mjs in the API's uv environment."""
import os
import sys
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

NAME = "energy_rd_admin_e2e_test"
OCR_KIND = "ocr.process"  # app/services/ocr/jobs.py
# Synthetic OCR queue for the console: (document_ocr status, error, job status, attempts, max_attempts).
OCR_CASES = [("failed", "engine_error", "dead", 3, 3), ("pending", None, "queued", 0, 3),
             ("failed", "unreadable", "succeeded", 1, 3)]


def seed_copilot(conn, home):
    """Uso sintético del Copilot (sin texto real): lo justo para ver cifras, errores, herramientas y valoraciones en la consola."""
    conv = conn.scalar(text("INSERT INTO copilot_conversations(id,home_id,title) VALUES(gen_random_uuid(),:h,'Conversación sintética E2E') RETURNING id"), {"h": home})
    for status, tokens_in, tokens_out, latency, feedback, tools in (
            ("complete", 1000, 500, 1200, 1, '["consultar_facturas"]'), ("complete", 2000, 800, 3400, -1, '["consultar_facturas","consultar_tarifa"]'),
            ("error", 0, 0, 100, None, None)):
        conn.execute(text(
            "INSERT INTO copilot_messages(id,conversation_id,role,content,status,tools,model,input_tokens,output_tokens,latency_ms,feedback) "
            "VALUES(gen_random_uuid(),:c,'assistant','texto sintético de la respuesta',:s,CAST(:t AS jsonb),'modelo-e2e',:i,:o,:l,:f)"),
            {"c": conv, "s": status, "t": tools, "i": tokens_in, "o": tokens_out, "l": latency, "f": feedback})
    conn.execute(text("INSERT INTO copilot_usage(subject,day,messages,tokens) VALUES('pilot',(now() AT TIME ZONE 'America/Santo_Domingo')::date,3,4300)"))


def seed_ocr(conn):
    """Never real data: one synthetic home and documents that only exist as rows (storage is disabled here)."""
    home = conn.scalar(text("INSERT INTO homes(id,code,name,distributor,province,address) VALUES(gen_random_uuid(),'E2E-HOME-01','Vivienda sintética E2E','EDESUR','Distrito Nacional','Calle Sintética 1') RETURNING id"))
    bills = [conn.scalar(text(
        "INSERT INTO bills(id,home_id,period_start,period_end,kwh,amount_dop,days,source) "
        "VALUES(gen_random_uuid(),:home,:s,:e,:kwh,:amount,30,'manual') RETURNING id"), {"home": home, "s": s, "e": e, "kwh": kwh, "amount": amount})
        for s, e, kwh, amount in (("2026-07-01", "2026-07-30", "300", "3900.00"), ("2026-08-01", "2026-08-30", "390", "5460.00"))]
    seed_copilot(conn, home)
    for index, (state, error, job_status, attempts, max_attempts) in enumerate(OCR_CASES):
        doc = conn.scalar(text(
            "INSERT INTO documents(id,home_id,kind,content_type,size_bytes,sha256,storage_key,uploaded_via,retention_until) "
            "VALUES(gen_random_uuid(),:home,'bill_photo','image/jpeg',2048,:sha,gen_random_uuid()::text,'web',now()+interval '7 days') RETURNING id"),
            {"home": home, "sha": f"{index:x}" * 64})
        if index == 2:  # el original de la primera factura, con su OCR fallido
            conn.execute(text("UPDATE documents SET bill_id=:b WHERE id=:d"), {"b": bills[0], "d": doc})
        conn.execute(text("INSERT INTO document_ocr(document_id,status,error_code,draft) VALUES(:d,:s,:e,NULL)"),
                     {"d": doc, "s": state, "e": error})
        conn.execute(text(
            "INSERT INTO jobs(kind,payload,idempotency_key,status,attempts,max_attempts,last_error,finished_at) "
            "VALUES(:kind,jsonb_build_object('document_id',CAST(:d AS text)),CAST(:d AS text),:status,:attempts,:max,"
            "'synthetic engine failure',CASE WHEN CAST(:finished AS boolean) THEN now() END)"),
            {"kind": OCR_KIND, "d": str(doc), "status": job_status, "attempts": attempts, "max": max_attempts,
             "finished": job_status in ("succeeded", "dead")})


def guarded_url():
    url = make_url(os.environ["DATABASE_URL"])
    if (url.drivername != "postgresql+psycopg" or url.database != NAME
            or url.host not in ("localhost", "127.0.0.1") or url.query):
        raise RuntimeError("Refusing non-disposable/non-local database")
    return url


def main(action):
    url = guarded_url()
    admin = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    try:
        with admin.connect() as conn:
            if action == "create":
                if conn.scalar(text("SELECT 1 FROM pg_database WHERE datname=:name"), {"name": NAME}):
                    raise RuntimeError("Disposable DB already exists; refusing to overwrite it")
                conn.execute(text(f'CREATE DATABASE "{NAME}"'))
            elif action == "drop":
                conn.execute(text("SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                                  "WHERE datname=:name AND pid <> pg_backend_pid()"), {"name": NAME})
                conn.execute(text(f'DROP DATABASE IF EXISTS "{NAME}"'))
            elif action == "migrate":
                from alembic import command
                from alembic.config import Config
                api_dir = Path(__file__).resolve().parents[3] / "backend" / "api"
                cfg = Config(str(api_dir / "alembic.ini"))
                cfg.set_main_option("sqlalchemy.url", url.render_as_string(hide_password=False).replace("%", "%%"))
                command.upgrade(cfg, "head")
            elif action == "seed-ocr":
                with create_engine(url).begin() as db:
                    seed_ocr(db)
            else:
                raise RuntimeError("Unknown action")
    finally:
        admin.dispose()


if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in ("create", "migrate", "seed-ocr", "drop"):
        raise SystemExit("Expected create, migrate, seed-ocr or drop")
    main(sys.argv[1])
