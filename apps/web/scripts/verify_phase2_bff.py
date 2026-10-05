"""Phase 2 live check (ERD-CONS-01 / ERD-GOAL-01) through the real Next BFF.

Requires auth-enabled `next dev` (default http://localhost:3021) and the isolated auth API (:8011).
Never prints passwords, cookies, token values or raw response bodies; only statuses and derived facts.
Uses a disposable account; deletes the fresh home at the end (the account stays for DB teardown).

    NEXT_PUBLIC_AUTH_ENABLED=true API_BASE_URL=http://127.0.0.1:8011 WEB_ORIGIN=http://localhost:3021 \
      npx next dev -p 3021            # in apps/web
    AUTH_INTEGRATION_WEB_ORIGIN=http://localhost:3021 python3 apps/web/scripts/verify_phase2_bff.py
"""
import datetime as dt
import http.cookiejar
import json
import os
import secrets
import urllib.error
import urllib.parse
import urllib.request
import uuid

origin = os.environ.get("AUTH_INTEGRATION_WEB_ORIGIN", "http://localhost:3021")
url = urllib.parse.urlparse(origin)
if url.scheme != "http" or url.hostname not in {"localhost", "127.0.0.1"} or url.path or url.port in {8000, 3000}:
    raise SystemExit("Refusing non-local or pilot integration target")
jar = http.cookiejar.CookieJar()
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
RD = dt.timezone(dt.timedelta(hours=-4))


def call(label, path, expected, method="GET", body=None):
    headers = {"Content-Type": "application/json", "Origin": origin}
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(origin + "/api/bff/" + path, data=data, headers=headers, method=method)
    try:
        response = client.open(request, timeout=30)
    except urllib.error.HTTPError as error:
        response = error
    raw = response.read()
    assert response.status == expected, f"{label}: expected {expected}, received {response.status}"
    assert b"access_token" not in raw and b"refresh_token" not in raw, f"{label}: token leak"
    assert "no-store" in response.headers.get("Cache-Control", ""), f"{label}: cacheable"
    print(f"{label}: HTTP {response.status}")
    return json.loads(raw) if raw else None


def page(path):
    response = client.open(origin + path, timeout=60)
    html = response.read()
    assert response.status == 200 and not response.geturl().endswith("/login"), f"{path}: not served"
    assert all(cookie.value.encode() not in html for cookie in jar), f"{path}: cookie value serialized"
    print(f"protected page {path}: HTTP 200, no cookie values in HTML")


now = dt.datetime.now(RD).replace(second=0, microsecond=0)
today = now.date()
credentials = {"email": f"erd-web-phase2-{uuid.uuid4().hex}@example.com", "password": secrets.token_urlsafe(32)}
register_credentials = {**credentials, "accept_terms": True}
call("epoch cookie (428 first)", "auth/register", 428, "POST", register_credentials)
call("register disposable user", "auth/register", 201, "POST", register_credentials)
home_id = call("create home EDESUR", "homes", 201, "POST", {"name": "Disposable ERD phase 2 web", "distributor": "EDESUR"})["id"]
for path in ("/readings", "/goal", "/consumption", "/dashboard"):
    page(path)

base = f"homes/{home_id}"
moments = [(now - dt.timedelta(days=9, hours=3), "1000"), (now - dt.timedelta(days=5, hours=2), "1052.5"), (now - dt.timedelta(hours=6), "1110.25")]
ids = []
for at, value in moments:
    created = call(f"add reading {value} kWh", f"{base}/readings", 201, "POST", {"read_at": at.isoformat(), "reading_kwh": value, "note": None})
    assert created["reading_kwh"] in {f"{float(value):.2f}", value}, "reading echoed"
    ids.append(created["id"])
listed = call("list readings", f"{base}/readings?limit=100&offset=0", 200)
assert len(listed) == 3 and listed[0]["id"] == ids[-1], "newest first"

dup = call("duplicate instant → 409 local", f"{base}/readings", 409, "POST", {"read_at": moments[1][0].isoformat(), "reading_kwh": "1052.5"})
assert dup["detail"] == "Ya existe una lectura con esa fecha y hora."
mono = call("non-monotonic → 422 local", f"{base}/readings", 422, "POST", {"read_at": (now - dt.timedelta(days=2)).isoformat(), "reading_kwh": "900"})
assert mono["detail"] == "La lectura debe ser mayor o igual que la anterior y menor o igual que la siguiente."
future = call("future reading → 422 field", f"{base}/readings", 422, "POST", {"read_at": (now + dt.timedelta(days=1)).isoformat(), "reading_kwh": "1200"})
assert future["detail"][0]["loc"] == ["body", "read_at"] and "futura" in future["detail"][0]["msg"]
call("reading without timezone → 422 at BFF", f"{base}/readings", 422, "POST", {"read_at": now.strftime("%Y-%m-%dT%H:%M:%S"), "reading_kwh": "1200"})
print("server rejections are local Spanish messages")

frm, to = (today - dt.timedelta(days=13)).isoformat(), today.isoformat()
day = call("consumption by day (14 days)", f"{base}/consumption?granularity=day&from={frm}&to={to}", 200)
assert len(day["buckets"]) == 14 and day["readings_used"] >= 2
gaps = [b for b in day["buckets"] if b["kwh"] is None]
assert gaps and all(b["quality"] is None and b["reason"] for b in gaps), "null buckets carry a reason, never 0"
assert day["totals"]["kwh"]["quality"] in {"REAL", "ESTIMATED"} and day["average_daily_kwh"]["quality"] == "ESTIMATED"
print(f"day: {len(gaps)} gap buckets with reason, total {day['totals']['kwh']['value']} kWh {day['totals']['kwh']['quality']}, peak {day['peak_bucket']['kwh']}")
month_from = dt.date(today.year - (1 if today.month < 12 else 0), (today.month % 12) + 1, 1).isoformat()
month = call("consumption by month (12 months preset)", f"{base}/consumption?granularity=month&from={month_from}&to={to}", 200)
assert len(month["buckets"]) == 12 and month["totals"]["kwh"] is not None
print(f"month: {len(month['buckets'])} buckets, {sum(b['kwh'] is None for b in month['buckets'])} without coverage")
too_long = call("range > 366 days → 422 local", f"{base}/consumption?granularity=day&from={(today - dt.timedelta(days=366)).isoformat()}&to={to}", 422)
assert too_long["detail"] == "Rango de fechas inválido: máximo 366 días."
call("unknown granularity rejected at BFF", f"{base}/consumption?granularity=hour&from={frm}&to={to}", 400)

assert call("goal before setting", f"{base}/goal", 200) is None
call("empty goal rejected at BFF", f"{base}/goal", 422, "PUT", {})
goal = call("set goal RD$ + kWh", f"{base}/goal", 200, "PUT", {"monthly_amount_rd": "3000", "monthly_kwh": "400"})
assert goal["monthly_amount_rd"] == "3000.00" and goal["monthly_kwh"] == "400.00"
progress = call("goal progress", f"{base}/goal/progress", 200)
assert progress["status"] in {"on_track", "at_risk", "exceeded", "insufficient_data"} and progress["goal"]
amount = progress["amount"]
tariff = amount and amount["tariff"]
print(f"progress: status={progress['status']} source={progress['data_source']} kwh.status={progress['kwh']['status']} "
      f"amount.basis={amount and amount['basis']} tariff={tariff and tariff['source_resolution']}")
if dt.date(2026, 10, 1) <= today <= dt.date(2026, 12, 31):
    assert tariff and tariff["source_resolution"] == "SIE-121-2026-TF" and amount["so_far"]["quality"] == "ESTIMATED"
    assert amount["projected"] is None or amount["projected"]["quality"] == "PROJECTED"
tariffs = call("tariffs EDESUR", f"tariffs?distributor=EDESUR&on={to}&limit=100&offset=0", 200)
print(f"tariffs: {len(tariffs)} ({', '.join(sorted({t['source_resolution'] for t in tariffs})) or 'none'})")
call("unknown tariff distributor rejected", "tariffs?distributor=Otra", 400)

call("unlisted PUT readings", f"{base}/readings", 404, "PUT", {})
call("unlisted GET single reading", f"{base}/readings/{ids[0]}", 404)
call("unlisted DELETE goal", f"{base}/goal", 404, "DELETE", {})
call("delete reading", f"{base}/readings/{ids[0]}", 204, "DELETE", {})
gone = call("delete again → 404 local", f"{base}/readings/{ids[0]}", 404, "DELETE", {})
assert gone["detail"] == "No encontrado o sin acceso."
assert len(call("list after delete", f"{base}/readings", 200)) == 2
after = call("progress after delete (recomputed)", f"{base}/goal/progress", 200)
print(f"progress after delete: status={after['status']}")

call("delete disposable home", f"homes/{home_id}", 204, "DELETE", {})
call("logout", "auth/logout", 200, "POST", {})
call("readings after logout → 401", f"{base}/readings", 401)
print("PASS: phase 2 web BFF ↔ isolated auth API (:8011); tokens never printed")
