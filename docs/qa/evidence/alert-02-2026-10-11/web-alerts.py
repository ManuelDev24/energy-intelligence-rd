"""ERD-ALERT-02 (web): fecha límite -> alerta de pago -> correo -> marcar pagada; datos incompletos; severidades; preferencias.

Requiere API :18011 (migrada a 0020, AUTH_ENABLED, EMAIL_DEV_OUTBOX=$OUTBOX), un worker (`python -m app.worker`) y la web :3011.
Datos SINTÉTICOS. No prueba el envío push (necesita dispositivo, EAS y credenciales FCM/APNs) ni un proveedor de correo real.
Uso: OUTBOX=/ruta/outbox.jsonl python web-alerts.py <dir-salida>
"""
import json, os, secrets, sys, time, uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright

WEB, OUT, OUTBOX = "http://localhost:3011", Path(sys.argv[1]), Path(os.environ["OUTBOX"])
OUT.mkdir(parents=True, exist_ok=True)
TODAY = datetime.now(timezone(timedelta(hours=-4))).date()
results = []


def check(name, ok, detail=""):
    results.append({"check": name, "ok": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""), flush=True)


def bff(page, path, method="GET", body=None):
    return page.evaluate("""async ([p, m, b]) => { const r = await fetch('/api/bff/' + p, {method: m, credentials: 'same-origin',
        headers: {'Content-Type': 'application/json'}, body: b ? JSON.stringify(b) : undefined});
        return {status: r.status, body: r.status === 204 ? null : await r.json()}; }""", [path, method, body])


def outbox():
    return [json.loads(line) for line in OUTBOX.read_text().splitlines()] if OUTBOX.exists() else []


email = f"erd-alert-{uuid.uuid4().hex}@example.com"
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--no-sandbox"])
    page = browser.new_context(viewport={"width": 1280, "height": 1100}).new_page()
    page.goto(WEB + "/register", wait_until="networkidle")
    page.get_by_label("Correo electrónico").fill(email)
    page.get_by_label("Contraseña").fill(secrets.token_urlsafe(24))
    page.locator("#accept-terms").check()
    page.get_by_role("button", name="Crear cuenta").click()
    page.wait_for_url("**/homes", timeout=30000)
    page.get_by_role("button", name="Empezar").wait_for(timeout=30000)
    home = bff(page, "homes", "POST", {"name": "Casa alertas", "distributor": "EDESUR"})["body"]["id"]
    page.reload(wait_until="networkidle")
    page.get_by_role("button", name="Casa alertas · EDESUR").click()
    page.wait_for_url("**/dashboard", timeout=30000)

    # 1) Registrar una factura CON fecha límite desde la interfaz.
    page.get_by_role("link", name="Facturas").first.click()
    page.get_by_role("link", name="Registrar factura").click()
    page.wait_for_url("**/bills/new")
    page.get_by_role("button", name="Registrar manualmente").click()
    end = TODAY - timedelta(days=10)
    page.get_by_label("Inicio del período").fill(str(end - timedelta(days=29)))
    page.get_by_label("Fin del período").fill(str(end))
    page.get_by_label("Consumo facturado (kWh)").fill("320")
    page.get_by_label("Monto (RD$)").fill("4550.00")
    page.get_by_label("Días facturados").fill("30")
    page.get_by_label("Fecha límite de pago (opcional)").fill(str(TODAY + timedelta(days=2)))
    page.screenshot(path=str(OUT / "alert-1-formulario.jpg"), type="jpeg", quality=70)
    page.get_by_role("button", name="Confirmar y guardar factura").click()
    page.wait_for_url("**/dashboard", timeout=30000)
    bills = bff(page, f"homes/{home}/bills")["body"]
    check("la factura guarda la fecha límite", len(bills) == 1 and bills[0]["due_date"] == str(TODAY + timedelta(days=2)) and bills[0]["paid_at"] is None)

    # 2) La alerta de pago aparece en la página de alertas, con acción para resolverla.
    page.get_by_role("link", name="Alertas").first.click()
    page.wait_for_url("**/alerts")
    page.get_by_text("Factura por vencer").first.wait_for(timeout=20000)
    page.screenshot(path=str(OUT / "alert-2-alertas.jpg"), type="jpeg", quality=70)
    text = page.inner_text("main")
    check("la página de alertas muestra la factura por vencer, con su mensaje y la acción «Ver factura»",
          "Factura por vencer" in text and "vence en 2 días" in text and page.get_by_role("link", name=r"Ver factura: Factura por vencer").count() == 1, text[:200].replace("\n", " | "))

    # 3) El worker envía el correo (bandeja de desarrollo): sin cifras, con enlace a /alerts.
    deadline = time.time() + 40
    while time.time() < deadline and not [m for m in outbox() if m["to"] == email]:
        time.sleep(1)
    mails = [m for m in outbox() if m["to"] == email]
    check("el worker envió un correo de aviso", len(mails) == 1, f"{len(mails)} correo(s)")
    if mails:
        body = mails[0]["text"]
        check("el correo no lleva cifras ni montos y enlaza a las alertas", all(x not in body + mails[0]["html"] for x in ("RD$", "4550", "kWh", "320")) and "/alerts" in body and "Perfil → Notificaciones" in body, mails[0]["subject"])
    with_db = bff(page, f"homes/{home}/alerts")["body"]
    check("hay una alerta de pago con severidad «warning»", [a["severity"] for a in with_db if a["type"] == "payment_due"] == ["warning"])

    # 4) Marcar la factura como pagada retira la alerta.
    page.get_by_role("link", name="Facturas").first.click()
    page.wait_for_url("**/bills")
    page.locator(f"a[href='/bills/{bills[0]['id']}']").click()
    page.get_by_role("button", name="Marcar como pagada").click()
    page.get_by_text("Pagada el").wait_for(timeout=15000)
    page.screenshot(path=str(OUT / "alert-3-pagada.jpg"), type="jpeg", quality=70)
    after = bff(page, f"homes/{home}/alerts")["body"]
    check("al marcarla pagada la alerta de pago desaparece", not [a for a in after if a["type"] == "payment_due"])
    page.get_by_role("button", name="Marcar como pendiente").click()
    page.get_by_text("Pendiente", exact=True).wait_for(timeout=15000)
    check("y vuelve al dejarla pendiente", len([a for a in bff(page, f"homes/{home}/alerts")["body"] if a["type"] == "payment_due"]) == 1)
    time.sleep(4)
    # Marcar pagada y deshacerlo crea una alerta NUEVA (la anterior se retiró): es un evento distinto y avisa de nuevo (límite conocido).
    sent = len([m for m in outbox() if m["to"] == email])
    check("pagar y deshacer avisa una vez más (la alerta es nueva); no se repite sin cambios", sent == 2, f"{sent} correos")
    again = bff(page, f"homes/{home}/bills/{bills[0]['id']}/payment", "PUT", {"paid": False})
    time.sleep(3)
    check("repetir «pendiente» sin cambios no envía nada", again["status"] == 200 and len([m for m in outbox() if m["to"] == email]) == sent)

    # 5) Datos incompletos: la factura es de hace 10 días; tras un ciclo largo sin otra, avisa (aquí lo forzamos con una factura vieja).
    old_end = TODAY - timedelta(days=200)
    bff(page, f"homes/{home}/bills/{bills[0]['id']}", "DELETE")
    r = bff(page, f"homes/{home}/bills", "POST", {"period_start": str(old_end - timedelta(days=29)), "period_end": str(old_end), "days": 30, "kwh": "300", "amount_dop": "3600"})
    check("una última factura de hace más de dos ciclos genera «falta registrar una factura» (advertencia)",
          r["status"] == 201 and [a["severity"] for a in bff(page, f"homes/{home}/alerts")["body"] if a["type"] == "missing_bill"] == ["warning"])
    time.sleep(4)
    check("lo informativo/incompleto NO manda correo", len([m for m in outbox() if m["to"] == email]) == sent)

    # 6) Preferencias: sin avisos por correo, una nueva alerta de pago no manda nada.
    prefs = bff(page, "auth/me/preferences", "PUT", {"alerts_email": False, "alerts_push": False})
    check("las preferencias se guardan", prefs["status"] == 200 and prefs["body"]["alerts_email"] is False)
    due_end = TODAY - timedelta(days=5)
    bff(page, f"homes/{home}/bills", "POST", {"period_start": str(due_end - timedelta(days=29)), "period_end": str(due_end), "days": 30, "kwh": "310", "amount_dop": "3700", "due_date": str(TODAY + timedelta(days=1))})
    time.sleep(5)
    check("con el correo desactivado no se envía otro aviso", len([m for m in outbox() if m["to"] == email]) == sent)
    check("pero la alerta nueva sí está en la app", [a["severity"] for a in bff(page, f"homes/{home}/alerts")["body"] if a["type"] == "payment_due"] == ["warning"])
    page.get_by_role("link", name="Mi cuenta").first.click()
    page.wait_for_url("**/account", timeout=15000)
    page.get_by_role("heading", name="Notificaciones").wait_for(timeout=20000)
    prof = page.inner_text("main")
    page.screenshot(path=str(OUT / "alert-4-preferencias.jpg"), type="jpeg", quality=70)
    check("el texto de preferencias ya no dice que no se envía nada", "todavía no se envía" not in prof and "solo se ven dentro de la app" in prof, "")
    browser.close()

(OUT / "results.json").write_text(json.dumps(results, indent=2, ensure_ascii=False))
failed = [r for r in results if not r["ok"]]
print(f"\n{len(results) - len(failed)}/{len(results)} comprobaciones OK")
sys.exit(1 if failed else 0)
