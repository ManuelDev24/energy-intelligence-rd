"""ERD-ONB-ACCEPTANCE (web): registro -> asistente de 6 etapas -> panel, contra API real con auth.

Requiere API auth-enabled y `next dev` con NEXT_PUBLIC_AUTH_ENABLED=true (puertos 18011 / 3011).
Uso: python web-onb.py <dir-salida>. Solo crea cuentas desechables `erd-onb-<uuid>@example.com`.
"""
import json, secrets, sys, uuid
from pathlib import Path
from playwright.sync_api import sync_playwright

WEB, OUT = "http://localhost:3011", Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
results = []


def check(name, ok, detail=""):
    results.append({"check": name, "ok": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""), flush=True)


def bff(page, path, method="GET", body=None):
    return page.evaluate("""async ([p, m, b]) => { const r = await fetch('/api/bff/' + p, {method: m, credentials: 'same-origin',
        headers: {'Content-Type': 'application/json'}, body: b ? JSON.stringify(b) : undefined});
        return {status: r.status, body: r.status === 204 ? null : await r.json()}; }""", [path, method, body])


email, password = f"erd-onb-{uuid.uuid4().hex}@example.com", secrets.token_urlsafe(24)
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--no-sandbox"])
    page = browser.new_context(viewport={"width": 1280, "height": 900}).new_page()
    page.goto(WEB + "/register", wait_until="networkidle")
    page.get_by_label("Correo electrónico").fill(email)
    page.get_by_label("Contraseña").fill(password)
    page.locator("#accept-terms").check()
    page.get_by_role("button", name="Crear cuenta").click()
    page.wait_for_url("**/homes", timeout=30000)
    page.get_by_role("button", name="Empezar").wait_for(timeout=30000)
    check("registro lleva al asistente (cuenta sin viviendas)", page.get_by_role("button", name="Empezar").is_visible())
    page.screenshot(path=str(OUT / "onb-0-inicio.jpg"), type="jpeg", quality=70)
    page.get_by_role("button", name="Empezar").click()

    # Etapa 1: la validación impide avanzar sin datos obligatorios y no crea nada.
    page.get_by_role("button", name="Guardar y continuar").click()
    check("etapa 1 exige nombre, provincia y municipio", page.get_by_text("Indica nombre, provincia y municipio.").is_visible())
    check("sin avanzar no hay viviendas", bff(page, "homes")["body"] == [])
    page.get_by_label("Nombre de la vivienda").fill("Casa de prueba ONB")
    page.get_by_label("Provincia").fill("Santo Domingo")
    page.get_by_label("Municipio").fill("Santo Domingo Este")
    page.get_by_label("Sector (opcional)").fill("Los Mina")
    page.get_by_role("button", name="Guardar y continuar").click()
    # Etapa 2: distribuidora crea la vivienda.
    page.get_by_label("Selecciona tu distribuidora").select_option("EDEESTE")
    page.get_by_role("button", name="Guardar y continuar").click()
    page.get_by_label("Tipo de usuario").wait_for()
    homes = bff(page, "homes")["body"]
    check("etapa 2 crea exactamente una vivienda", len(homes) == 1 and homes[0]["distributor"] == "EDEESTE", json.dumps(homes)[:120])
    home_id = homes[0]["id"]
    # Etapa 3
    page.get_by_label("Tipo de usuario").fill("residencial")
    page.get_by_role("button", name="Guardar y continuar").click()
    # Etapa 4: ocupantes inválidos bloquean; los indicadores desconocidos quedan en null.
    page.get_by_label("Ocupantes").fill("0")
    page.get_by_role("button", name="Guardar y continuar").click()
    check("etapa 4 rechaza 0 ocupantes", page.get_by_text("Indica entre 1 y 999 ocupantes.").is_visible())
    page.get_by_label("Ocupantes").fill("4")
    page.locator("main select").first.select_option(value=page.locator("main select").first.locator("option").nth(1).get_attribute("value"))
    page.get_by_role("button", name="Guardar y continuar").click()
    # Etapa 5: contrato
    page.get_by_label("Número de cuenta").fill("NIC-ONB-0001")
    page.get_by_role("button", name="Guardar y continuar").click()
    # Etapa 6: meta inválida y luego válida
    page.get_by_label("Meta de consumo mensual (kWh)").fill("abc")
    page.get_by_role("button", name="Guardar y continuar").click()
    check("etapa 6 rechaza meta inválida", page.get_by_text("Revisa la meta:").is_visible())
    page.get_by_label("Meta de consumo mensual (kWh)").fill("300")
    page.get_by_label("Meta de gasto mensual (RD$)").fill("3000")
    page.get_by_role("button", name="Guardar y continuar").click()
    page.get_by_role("button", name="Ir al panel").wait_for()
    page.screenshot(path=str(OUT / "onb-7-resumen.jpg"), type="jpeg", quality=70)

    home = bff(page, f"homes/{home_id}")["body"]
    check("perfil guardado", (home["province"], home["municipality"], home["sector"], home["occupants"], home["user_type"])
          == ("Santo Domingo", "Santo Domingo Este", "Los Mina", 4, "residencial"), json.dumps({k: home[k] for k in ("province", "occupants", "has_ac", "has_pool")}))
    flags = [home[k] for k in ("has_ac", "has_water_heater", "has_pool", "has_solar", "has_inverter")]
    check("indicadores: uno elegido, el resto sin indicar (null)", sorted(map(str, flags)) == sorted(["True", "None", "None", "None", "None"]) or flags.count(None) == 4, str(flags))
    contract = bff(page, f"homes/{home_id}/contract")["body"]
    check("contrato guardado", contract["account_number"] == "NIC-ONB-0001")
    goal = bff(page, f"homes/{home_id}/goal")["body"]
    check("meta guardada", (goal["monthly_kwh"], goal["monthly_amount_rd"]) == ("300.00", "3000.00"), json.dumps(goal)[:100])
    check("sigue habiendo una sola vivienda", len(bff(page, "homes")["body"]) == 1)

    page.get_by_role("button", name="Ir al panel").click()
    page.wait_for_url("**/dashboard", timeout=30000)
    page.get_by_role("heading", name="Inicio").wait_for()
    check("llega al panel de la vivienda recién creada", "Casa de prueba ONB" in page.inner_text("body"))
    page.screenshot(path=str(OUT / "onb-8-panel.jpg"), type="jpeg", quality=70)

    # Cuenta aislada: otra sesión no ve la vivienda.
    page.context.clear_cookies()
    other = page.context.new_page()
    other.goto(WEB + "/register", wait_until="networkidle")
    other.get_by_label("Correo electrónico").fill(f"erd-onb-{uuid.uuid4().hex}@example.com")
    other.get_by_label("Contraseña").fill(secrets.token_urlsafe(24))
    other.locator("#accept-terms").check()
    other.get_by_role("button", name="Crear cuenta").click()
    other.wait_for_url("**/homes", timeout=30000)
    check("segunda cuenta no ve la vivienda de la primera", bff(other, "homes")["body"] == [])
    browser.close()

(OUT / "results.json").write_text(json.dumps(results, indent=2, ensure_ascii=False))
failed = [r for r in results if not r["ok"]]
print(f"{len(results) - len(failed)}/{len(results)} comprobaciones OK")
sys.exit(1 if failed else 0)
