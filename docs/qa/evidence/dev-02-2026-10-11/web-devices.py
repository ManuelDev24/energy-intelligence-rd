"""ERD-DEV-02 (web): equipos con tipo, marca, modelo e icono; % por equipo calculado por el servidor; edición; validación.

Requiere API :18011 (migrada a 0021) y la web :3011 contra esa API. Datos SINTÉTICOS. No prueba la app móvil (sin dispositivo).
Uso: python web-devices.py <dir-salida>
"""
import json, secrets, sys, uuid
from decimal import Decimal
from pathlib import Path
from playwright.sync_api import sync_playwright

WEB, OUT = "http://localhost:3011", Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)
results = []


def check(name, ok, detail=""):
    results.append({"check": name, "ok": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""), flush=True)


def bff(page, path, method="GET", body=None):
    return page.evaluate("""async ([p, m, b]) => { const r = await fetch('/api/bff/' + p, {method: m, credentials: 'same-origin',
        headers: {'Content-Type': 'application/json'}, body: b ? JSON.stringify(b) : undefined});
        return {status: r.status, body: r.status === 204 ? null : await r.json()}; }""", [path, method, body])


def add_device(page, name, kind_label, brand, model, icon_label, power, hours):
    page.get_by_role("button", name="Agregar equipo").click()
    page.get_by_label("Nombre", exact=True).fill(name)
    page.get_by_label("Tipo de equipo").select_option(label=kind_label)
    page.get_by_label("Marca (opcional)").fill(brand)
    page.get_by_label("Modelo (opcional)").fill(model)
    if icon_label:
        page.get_by_role("radio", name=f"Icono: {icon_label}").click()
    page.get_by_label("Potencia (W)").fill(power)
    page.get_by_label("Horas de uso por día").fill(hours)
    page.get_by_role("button", name="Guardar equipo").click()
    page.get_by_role("heading", name=name).wait_for(timeout=20000)


email = f"erd-dev02-{uuid.uuid4().hex}@example.com"
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--no-sandbox"])
    page = browser.new_context(viewport={"width": 1280, "height": 1200}).new_page()
    page.goto(WEB + "/register", wait_until="networkidle")
    page.get_by_label("Correo electrónico").fill(email)
    page.get_by_label("Contraseña").fill(secrets.token_urlsafe(24))
    page.locator("#accept-terms").check()
    page.get_by_role("button", name="Crear cuenta").click()
    page.wait_for_url("**/homes", timeout=30000)
    page.get_by_role("button", name="Empezar").wait_for(timeout=30000)
    home = bff(page, "homes", "POST", {"name": "Casa equipos", "distributor": "EDESUR"})["body"]["id"]
    page.reload(wait_until="networkidle")
    page.get_by_role("button", name="Casa equipos · EDESUR").click()
    page.wait_for_url("**/dashboard", timeout=30000)
    page.get_by_role("link", name="Equipos").first.click()
    page.wait_for_url("**/equipment")

    add_device(page, "Aire sala", "Aire acondicionado", "Samsung", "AR12", None, "1500", "6")
    add_device(page, "Nevera cocina", "Nevera", "", "", "Copo de nieve", "150", "24")
    add_device(page, "Luces", "Iluminación", "Philips", "", None, "60", "5")
    page.get_by_text("Samsung AR12").wait_for()
    page.screenshot(path=str(OUT / "dev-1-tarjetas.jpg"), type="jpeg", quality=70)

    items = bff(page, f"homes/{home}/equipment")["body"]
    by = {i["name"]: i for i in items}
    check("el servidor guarda tipo, marca, modelo e icono",
          (by["Aire sala"]["kind"], by["Aire sala"]["brand"], by["Aire sala"]["model"], by["Aire sala"]["icon"]) == ("air_conditioner", "Samsung", "AR12", None)
          and (by["Nevera cocina"]["kind"], by["Nevera cocina"]["icon"], by["Nevera cocina"]["brand"]) == ("refrigerator", "snowflake", None)
          and (by["Luces"]["kind"], by["Luces"]["brand"], by["Luces"]["model"]) == ("lighting", "Philips", None))

    est = bff(page, f"homes/{home}/equipment/estimate")["body"]
    shares = {i["name"]: Decimal(i["share_pct"]["value"]) for i in est["items"]}
    check("los porcentajes por equipo vienen del servidor y suman exactamente 100,00",
          sum(shares.values()) == Decimal("100.00") and shares["Aire sala"] > shares["Nevera cocina"] > shares["Luces"], json.dumps({k: str(v) for k, v in shares.items()}))
    check("la nota aclara que el % no es de la factura", "no de la factura" in est["note"])

    page.wait_for_function("document.querySelectorAll('[data-testid=device-share]').length === 3", timeout=20000)
    text = page.inner_text("main")
    shown = {name: f"{shares[name]}%" for name in shares}
    missing = [n for n in shown if shown[n] not in text]
    check("la página muestra el mismo % que devolvió el servidor en cada tarjeta",
          not missing and page.locator('[data-testid=device-share]').count() == 3, f"faltan={missing} tarjetas={page.locator('[data-testid=device-share]').count()} esperado={shown}")
    check("cada tarjeta lleva ESTIMADO y su marca/modelo cuando existe",
          page.locator("[data-testid=device-make-model]").count() == 2 and page.get_by_text("ESTIMADO").count() >= 3)

    # Editar: cambiar tipo y borrar la marca.
    page.get_by_role("button", name="Editar Luces").click()
    check("el formulario de edición trae los valores guardados",
          page.get_by_label("Tipo de equipo").input_value() == "lighting" and page.get_by_label("Marca (opcional)").input_value() == "Philips")
    page.get_by_label("Tipo de equipo").select_option(label="Otro")
    page.get_by_label("Marca (opcional)").fill("   ")
    page.get_by_role("button", name="Guardar equipo").click()
    page.wait_for_function("() => !document.querySelector('form')", timeout=20000)
    after = {i["name"]: i for i in bff(page, f"homes/{home}/equipment")["body"]}
    check("editar cambia el tipo y una marca en blanco se guarda vacía (null)", after["Luces"]["kind"] == "other" and after["Luces"]["brand"] is None)

    # El servidor rechaza valores fuera del catálogo aunque el formulario no los permita.
    bad = bff(page, f"homes/{home}/equipment", "POST", {"name": "X", "room": None, "kind": "toaster", "brand": None, "model": None, "icon": None, "power_w": "1", "hours_per_day": "1"})
    check("el BFF rechaza un tipo fuera del catálogo", bad["status"] in (400, 422), str(bad["status"]))
    bad2 = bff(page, f"homes/{home}/equipment", "POST", {"name": "X", "room": None, "kind": "other", "brand": "x" * 61, "model": None, "icon": None, "power_w": "1", "hours_per_day": "1"})
    check("el BFF rechaza una marca de más de 60 caracteres", bad2["status"] in (400, 422), str(bad2["status"]))

    # Móvil estrecho: sin desbordes.
    page.set_viewport_size({"width": 375, "height": 900})
    page.wait_for_timeout(500)
    page.get_by_role("heading", name="Aire sala").wait_for()
    overflow = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    page.screenshot(path=str(OUT / "dev-2-movil.jpg"), type="jpeg", quality=70)
    check("a 375 px no hay desborde horizontal", overflow <= 0, f"desborde={overflow}")
    browser.close()

(OUT / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2))
failed = [r for r in results if not r["ok"]]
print(f"{len(results) - len(failed)}/{len(results)} comprobaciones OK")
sys.exit(1 if failed else 0)
