"""ERD-OCR-PROD (web): foto/PDF -> 202 -> sondeo -> borrador -> confirmar con document_id, contra API real con auth y worker.

Requiere: API :18011 con STORAGE_BACKEND=local (+ claves), un worker (`python -m app.worker`) y la web :3011.
IMPORTANTE: las entradas son SINTÉTICAS (texto renderizado); validan la tubería, NO la calidad con facturas reales.
Uso: INPUT_DIR=/dir/con/bill.jpg,bill-text.pdf,bill-scan.pdf,corrupto.pdf,falso.jpg python web-ocr-prod.py <dir-salida>
"""
import json, os, secrets, sys, uuid
from pathlib import Path
from playwright.sync_api import sync_playwright

WEB, OUT, IN = "http://localhost:3011", Path(sys.argv[1]), Path(os.environ["INPUT_DIR"])
OUT.mkdir(parents=True, exist_ok=True)
results = []


def check(name, ok, detail=""):
    results.append({"check": name, "ok": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""), flush=True)


def bff(page, path, method="GET", body=None):
    return page.evaluate("""async ([p, m, b]) => { const r = await fetch('/api/bff/' + p, {method: m, credentials: 'same-origin',
        headers: {'Content-Type': 'application/json'}, body: b ? JSON.stringify(b) : undefined});
        return {status: r.status, body: r.status === 204 ? null : await r.json()}; }""", [path, method, body])


def new_bill_page(page):
    # Navegación por enlaces (la vivienda elegida vive en memoria, no se recupera con goto).
    page.get_by_role("link", name="Facturas").first.click()
    page.get_by_role("link", name="Registrar factura").click()
    page.wait_for_url("**/bills/new")


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--no-sandbox"])
    page = browser.new_context(viewport={"width": 1280, "height": 1000}).new_page()
    requests = []
    page.on("request", lambda r: requests.append((r.method, r.url.split("localhost:3011")[-1])) if "/api/bff/" in r.url else None)
    page.goto(WEB + "/register", wait_until="networkidle")
    page.get_by_label("Correo electrónico").fill(f"erd-ocr-{uuid.uuid4().hex}@example.com")
    page.get_by_label("Contraseña").fill(secrets.token_urlsafe(24))
    page.locator("#accept-terms").check()
    page.get_by_role("button", name="Crear cuenta").click()
    page.wait_for_url("**/homes", timeout=30000)
    page.get_by_role("button", name="Empezar").wait_for(timeout=30000)
    home_id = bff(page, "homes", "POST", {"name": "Casa OCR PROD", "distributor": "EDESUR"})["body"]["id"]
    page.reload(wait_until="networkidle")
    page.get_by_role("button", name="Casa OCR PROD · EDESUR").click()
    page.wait_for_url("**/dashboard", timeout=30000)

    # 1) Foto: 202 inmediato, progreso visible, borrador, NO crea factura.
    new_bill_page(page)
    check("el selector acepta fotos y PDF", page.locator("input[type=file]").get_attribute("accept") == "image/*,application/pdf")
    page.locator("input[type=file]").set_input_files(str(IN / "bill.jpg"))
    page.get_by_text("Analizando tu factura").wait_for(timeout=10000)
    page.screenshot(path=str(OUT / "ocr-1-progreso.jpg"), type="jpeg", quality=70)
    page.get_by_role("heading", name="Revisa la sugerencia").wait_for(timeout=90000)
    page.screenshot(path=str(OUT / "ocr-2-borrador-foto.jpg"), type="jpeg", quality=70)
    check("la foto se envió a ocr-jobs (async) y se sondeó", ("POST", f"/api/bff/homes/{home_id}/bills/ocr-jobs") in requests
          and any(m == "GET" and "/bills/ocr-jobs/" in u for m, u in requests))
    check("la lectura NO creó ninguna factura", bff(page, f"homes/{home_id}/bills")["body"] == [])
    check("formulario precargado con lo leído de la foto", page.get_by_label("Inicio del período").input_value() == "2026-08-01"
          and page.get_by_label("Consumo facturado (kWh)").input_value() == "300.00",
          f"kWh={page.get_by_label('Consumo facturado (kWh)').input_value()} monto={page.get_by_label('Monto (RD$)').input_value()}")
    page.get_by_role("button", name="Confirmar y guardar factura").click()
    page.wait_for_url("**/dashboard", timeout=30000)
    bills = bff(page, f"homes/{home_id}/bills")["body"]
    check("se creó una sola factura al confirmar", len(bills) == 1 and bills[0]["source"] == "manual", json.dumps([b["period_end"] for b in bills]))
    docs = bff(page, f"homes/{home_id}/bills/ocr-jobs/00000000-0000-4000-8000-000000000000")
    check("un id inexistente da 404 con mensaje local", docs["status"] == 404, json.dumps(docs["body"], ensure_ascii=False)[:90])

    # 2) PDF con capa de texto de 2 páginas.
    new_bill_page(page)
    page.locator("input[type=file]").set_input_files(str(IN / "bill-text.pdf"))
    page.get_by_role("heading", name="Revisa la sugerencia").wait_for(timeout=90000)
    desc = page.inner_text("main")
    page.screenshot(path=str(OUT / "ocr-3-borrador-pdf.jpg"), type="jpeg", quality=70)
    check("PDF multipágina leído de la capa de texto (sin OCR)", "Leído del texto del PDF (2 de 2 páginas)" in desc, desc[desc.find("Leído"):][:80])

    # 3) PDF escaneado (solo imagen): OCR por página.
    new_bill_page(page)
    page.locator("input[type=file]").set_input_files(str(IN / "bill-scan.pdf"))
    page.get_by_role("heading", name="Revisa la sugerencia").wait_for(timeout=90000)
    check("PDF escaneado leído con OCR", "reconocimiento óptico" in page.inner_text("main"))

    # 4) Archivos que no se pueden leer.
    new_bill_page(page)
    page.locator("input[type=file]").set_input_files(str(IN / "corrupto.pdf"))
    page.get_by_role("alert").filter(has_text="No se pudo leer el archivo").wait_for(timeout=90000)
    page.screenshot(path=str(OUT / "ocr-4-fallo.jpg"), type="jpeg", quality=70)
    check("PDF corrupto: mensaje claro, sin Reintentar, con alternativa manual",
          page.get_by_role("button", name="Reintentar").count() == 0 and page.get_by_role("button", name="Registrar manualmente").count() >= 1)
    new_bill_page(page)
    page.locator("input[type=file]").set_input_files(str(IN / "falso.jpg"))
    page.locator("main [role=alert]").first.wait_for(timeout=15000)
    check("HTML disfrazado de .jpg se rechaza al subir (422, mensaje local)",
          "foto (JPG, PNG, WEBP o HEIC" in page.inner_text("main") and page.get_by_role("heading", name="Revisa la sugerencia").count() == 0,
          page.locator("main [role=alert]").first.inner_text()[:80])
    leaks = [t for t in (page.inner_text("body"),) if "<script" in t or "Traceback" in t or "storage_key" in t]
    check("la interfaz no filtra texto interno", not leaks)
    check("el navegador nunca habló con la API directamente (solo /api/bff)", all(u.startswith("/api/bff/") for _, u in requests))
    browser.close()

(OUT / "results.json").write_text(json.dumps(results, indent=2, ensure_ascii=False))
failed = [r for r in results if not r["ok"]]
print(f"\n{len(results) - len(failed)}/{len(results)} comprobaciones OK")
sys.exit(1 if failed else 0)
