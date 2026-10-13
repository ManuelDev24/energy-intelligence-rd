"""ERD-BILL-LIVE-QA (web): foto -> OCR -> corregir -> confirmar -> detalle -> historial, contra API real con auth.

Requiere la pila de ERD-ONB-ACCEPTANCE (API :18011, web :3011) y una imagen en $BILL_IMAGE.
IMPORTANTE: con una imagen SINTÉTICA esto valida la tubería, no la calidad con facturas reales de las distribuidoras.
Uso: BILL_IMAGE=/ruta/factura.png python web-bill-live.py <dir-salida>
"""
import json, os, secrets, sys, uuid
from pathlib import Path
from playwright.sync_api import sync_playwright

WEB, OUT, IMAGE = "http://localhost:3011", Path(sys.argv[1]), os.environ["BILL_IMAGE"]
OUT.mkdir(parents=True, exist_ok=True)
results = []


def check(name, ok, detail=""):
    results.append({"check": name, "ok": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""), flush=True)


def bff(page, path, method="GET", body=None):
    return page.evaluate("""async ([p, m, b]) => { const r = await fetch('/api/bff/' + p, {method: m, credentials: 'same-origin',
        headers: {'Content-Type': 'application/json'}, body: b ? JSON.stringify(b) : undefined});
        return {status: r.status, body: r.status === 204 ? null : await r.json()}; }""", [path, method, body])


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--no-sandbox"])
    page = browser.new_context(viewport={"width": 1280, "height": 1000}).new_page()
    page.goto(WEB + "/register", wait_until="networkidle")
    page.get_by_label("Correo electrónico").fill(f"erd-bill-{uuid.uuid4().hex}@example.com")
    page.get_by_label("Contraseña").fill(secrets.token_urlsafe(24))
    page.locator("#accept-terms").check()
    page.get_by_role("button", name="Crear cuenta").click()
    page.wait_for_url("**/homes", timeout=30000)
    page.get_by_role("button", name="Empezar").wait_for(timeout=30000)
    home_id = bff(page, "homes", "POST", {"name": "Casa factura QA", "distributor": "EDESUR"})["body"]["id"]
    page.reload(wait_until="networkidle")
    page.get_by_role("button", name="Casa factura QA · EDESUR").click()
    page.wait_for_url("**/dashboard", timeout=30000)

    page.get_by_role("link", name="Facturas").first.click()
    page.get_by_role("link", name="Registrar factura").click()
    page.wait_for_url("**/bills/new")
    page.locator("input[type=file]").set_input_files(IMAGE)
    page.get_by_role("heading", name="Revisa la sugerencia").wait_for(timeout=60000)
    page.screenshot(path=str(OUT / "bill-1-borrador.jpg"), type="jpeg", quality=70)
    check("OCR devuelve un borrador y NO crea factura", bff(page, f"homes/{home_id}/bills")["body"] == [])
    check("formulario precargado con lo leído", page.get_by_label("Consumo facturado (kWh)").input_value() == "320.00"
          and page.get_by_label("Inicio del período").input_value() == "2026-09-01",
          f"kWh={page.get_by_label('Consumo facturado (kWh)').input_value()} monto={page.get_by_label('Monto (RD$)').input_value()}")
    # Corrección humana: el monto leído se cambia antes de confirmar.
    page.get_by_label("Monto (RD$)").fill("4550.00")
    page.get_by_role("button", name="Confirmar y guardar factura").click()
    page.wait_for_url("**/dashboard", timeout=30000)
    bills = bff(page, f"homes/{home_id}/bills")["body"]
    check("se creó exactamente una factura con el valor corregido", len(bills) == 1 and bills[0]["amount_dop"] == "4550.00"
          and bills[0]["kwh"] == "320.00", json.dumps({k: bills[0][k] for k in ("kwh", "amount_dop", "period_start", "period_end")}) if bills else "sin facturas")
    check("la factura confirmada se guarda como source=manual (nunca ocr)", bills[0].get("source") == "manual", str(bills[0].get("source")))
    bill_id = bills[0]["id"]

    page.get_by_role("link", name="Facturas").first.click()
    page.wait_for_url("**/bills")
    page.wait_for_timeout(1500)
    page.screenshot(path=str(OUT / "bill-2-historial.jpg"), type="jpeg", quality=70)
    check("historial lista la factura", "320" in page.inner_text("main"), page.inner_text("main")[:120].replace("\n", " | "))
    page.locator(f"a[href='/bills/{bill_id}']").click()
    page.wait_for_url(f"**/bills/{bill_id}")
    page.wait_for_timeout(2000)
    page.screenshot(path=str(OUT / "bill-3-detalle.jpg"), type="jpeg", quality=70)
    body = page.inner_text("main")
    check("detalle muestra consumo y monto", "320" in body and "4,550" in body.replace(" ", ""), body[:160].replace("\n", " | "))
    # Rechazo: una segunda foto no-imagen no crea nada.
    bad = bff(page, f"homes/{home_id}/bills", "POST", {"period_start": "2026-09-01", "period_end": "2026-09-30", "days": 30, "kwh": "-5", "amount_dop": "10"})
    check("factura inválida rechazada (422)", bad["status"] == 422, str(bad["status"]))
    check("sigue habiendo una sola factura", len(bff(page, f"homes/{home_id}/bills")["body"]) == 1)
    browser.close()

(OUT / "results.json").write_text(json.dumps(results, indent=2, ensure_ascii=False))
failed = [r for r in results if not r["ok"]]
print(f"{len(results) - len(failed)}/{len(results)} comprobaciones OK")
sys.exit(1 if failed else 0)
