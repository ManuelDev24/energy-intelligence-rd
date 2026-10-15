"""Presupuesto de rendimiento (hallazgo F08-02): sentencias SQL por petición (guarda contra N+1) y latencia con datos sintéticos.

Los presupuestos de latencia son DELIBERADAMENTE holgados (muy por encima de lo medido) para no fallar en un runner compartido; existen
para atrapar regresiones de orden de magnitud, como el cálculo de consumo O(cubetas × intervalos) que tardaba ~600 ms (F08-01).
`PERF_REPORT=1 pytest tests/test_performance_budget.py -s` imprime la tabla medida.
"""
import calendar
import os
import statistics
import time
from datetime import date, timedelta

import pytest
from sqlalchemy import event

from tests.test_api_homes_bills import mk_home
from tests.test_api_readings import add_reading

REPORT = os.getenv("PERF_REPORT") == "1"
RUNS = 7


class SqlCounter:
    def __init__(self, engine):
        self.engine, self.n = engine, 0

    def _hook(self, *_args):
        self.n += 1

    def __enter__(self):
        event.listen(self.engine, "before_cursor_execute", self._hook)
        return self

    def __exit__(self, *_exc):
        event.remove(self.engine, "before_cursor_execute", self._hook)


def load(client, bills: int, readings: int):
    home = mk_home(client)["id"]
    today = date.today() - timedelta(days=1)  # siempre pasado: la fecha UTC puede ir un día por delante de la de RD
    first = date(today.year, today.month, 1)
    # `bills` meses consecutivos terminando el mes anterior al actual
    y, m = first.year, first.month - 1
    if m == 0:
        y, m = y - 1, 12
    months = []
    for _ in range(bills):
        months.append((y, m))
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    for (y, m) in reversed(months):
        last = calendar.monthrange(y, m)[1]
        r = client.post(f"/api/v1/homes/{home}/bills", json={"period_start": f"{y}-{m:02d}-01", "period_end": f"{y}-{m:02d}-{last}",
                                                           "kwh": str(300 + (y * 12 + m) % 90), "amount_dop": str(5000 + (y * 12 + m) % 900), "days": last})
        assert r.status_code == 201, r.text
    total = 1000.0
    for i in range(readings):
        day = today - timedelta(days=readings - 1 - i)
        total += 10 + (i % 7)
        add_reading(client, home, f"{day.isoformat()}T08:00:00-04:00", f"{total:.1f}")
    return home, today


def measure(client, engine, url, params=None):
    times = []
    sql = 0
    size = 0
    for _ in range(RUNS):
        with SqlCounter(engine) as c:
            t0 = time.perf_counter()
            r = client.get(url, params=params)
            times.append((time.perf_counter() - t0) * 1000)
        assert r.status_code == 200, (url, r.text[:200])
        sql, size = c.n, len(r.content)
    times.sort()
    return {"sql": sql, "bytes": size, "p50": statistics.median(times), "max": times[-1]}


# Presupuestos = máximo de sentencias SQL por petición y p50 de latencia en ms. Medido (2026-10-13, PostgreSQL 16 local, 27 facturas y
# 400 lecturas): SQL 2–10 y p50 8–59 ms. Los límites de SQL dejan poco margen (detectan un N+1 o una consulta extra); los de latencia
# dejan ~7x (detectan el O(n²) de F08-01, que costaba 600–850 ms, sin fallar por el ruido de un runner compartido).
BUDGET = {
    "dashboard": (5, 150),
    "bills?limit=100": (3, 150),
    "readings?limit=100": (3, 150),
    "energy-score": (14, 250),
    "consumption mensual 12m": (14, 400),
    "consumption diario 90d": (14, 400),
    "consumption diario 12m": (14, 400),
}
CONSTANT_SQL = ("dashboard", "bills?limit=100", "readings?limit=100", "consumption diario 90d")


def endpoints(home, today):
    base = f"/api/v1/homes/{home}"
    start12 = (today - timedelta(days=364)).isoformat()
    return {
        "dashboard": (f"{base}/dashboard", None),
        "bills?limit=100": (f"{base}/bills", {"limit": 100}),
        "readings?limit=100": (f"{base}/readings", {"limit": 100}),
        "energy-score": (f"{base}/energy-score", None),
        "consumption mensual 12m": (f"{base}/consumption", {"granularity": "month", "from": start12, "to": today.isoformat()}),
        "consumption diario 90d": (f"{base}/consumption", {"granularity": "day", "from": (today - timedelta(days=89)).isoformat(), "to": today.isoformat()}),
        "consumption diario 12m": (f"{base}/consumption", {"granularity": "day", "from": start12, "to": today.isoformat()}),
    }


def test_sql_and_latency_budget_and_no_n_plus_1(client, migrated):
    # Un solo escenario (cargar los datos cuesta ~20 s): hogar grande y hogar pequeño en la misma base.
    big_home, today = load(client, bills=27, readings=400)
    small_home, _ = load(client, bills=3, readings=20)
    big = {n: measure(client, migrated, u, p) for n, (u, p) in endpoints(big_home, today).items()}
    small = {n: measure(client, migrated, u, p) for n, (u, p) in endpoints(small_home, today).items()}

    if REPORT:
        print("\n| endpoint | SQL | bytes | p50 ms | max ms |")
        for name, r in big.items():
            print(f"| {name} | {r['sql']} | {r['bytes']} | {r['p50']:.1f} | {r['max']:.1f} |")

    over = [f"{n}: {r['sql']} SQL (máx. {BUDGET[n][0]}), p50 {r['p50']:.0f} ms (máx. {BUDGET[n][1]})"
            for n, r in big.items() if r["sql"] > BUDGET[n][0] or r["p50"] > BUDGET[n][1]]
    assert not over, "Presupuesto de rendimiento superado: " + "; ".join(over)

    # N+1: con 27 facturas / 400 lecturas el número de sentencias debe ser el mismo que con 3 / 20.
    n_plus_1 = [f"{n}: {small[n]['sql']} SQL con pocos datos vs {big[n]['sql']} con muchos" for n in CONSTANT_SQL if small[n]["sql"] != big[n]["sql"]]
    assert not n_plus_1, "El número de sentencias crece con los datos (posible N+1): " + "; ".join(n_plus_1)
