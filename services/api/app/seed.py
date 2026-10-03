"""Seed idempotente de las 5 viviendas piloto (datos DEMO, source='seed').

Uso:  uv run python -m app.seed
Claves estables: homes.code (PILOT-01..05) y bills (home_id, period_start).
Ejecutar varias veces no duplica ni sobrescribe datos existentes.
"""
from datetime import date
from decimal import Decimal as D

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Bill, Home

# (code, nombre, ciudad, distribuidora, [(inicio, fin, días, kWh, RD$)])
PILOT_HOMES = [
    ("PILOT-01", "Vivienda piloto 01 (demo)", "Santo Domingo", "EDESUR", [
        (date(2026, 6, 1), date(2026, 6, 30), 30, D("250"), D("3150.00")),
        (date(2026, 7, 1), date(2026, 7, 31), 31, D("280"), D("3560.00")),
        (date(2026, 8, 1), date(2026, 8, 31), 31, D("420"), D("5600.00")),   # subida >40 %: critical
    ]),
    ("PILOT-02", "Vivienda piloto 02 (demo)", "Santiago", "EDENORTE", [
        (date(2026, 6, 1), date(2026, 6, 30), 30, D("310"), D("3900.00")),
        (date(2026, 7, 1), date(2026, 7, 31), 31, D("305"), D("3860.00")),
        (date(2026, 8, 1), date(2026, 8, 31), 31, D("315"), D("4010.00")),   # estable: sin alerta
    ]),
    ("PILOT-03", "Vivienda piloto 03 (demo)", "San Pedro de Macorís", "EDEESTE", [
        (date(2026, 7, 1), date(2026, 7, 31), 31, D("180"), D("2300.00")),
        (date(2026, 8, 1), date(2026, 8, 31), 31, D("225"), D("2900.00")),   # +25 %: warning; solo 2 facturas
    ]),
    ("PILOT-04", "Vivienda piloto 04 (demo)", "La Romana", "Otra", [
        (date(2026, 6, 1), date(2026, 6, 30), 30, D("500"), D("6800.00")),
        (date(2026, 7, 1), date(2026, 7, 31), 31, D("460"), D("6250.00")),
        (date(2026, 8, 1), date(2026, 8, 31), 31, D("410"), D("5600.00")),   # a la baja
    ]),
    ("PILOT-05", "Vivienda piloto 05 (demo)", "Santo Domingo", "EDESUR", [
        (date(2026, 6, 1), date(2026, 6, 30), 30, D("220"), D("2800.00")),
        (date(2026, 7, 1), date(2026, 7, 31), 31, D("240"), D("3050.00")),
    ]),
]


def seed_pilot(db: Session) -> dict[str, int]:
    created_homes = created_bills = 0
    for code, name, city, distributor, bills in PILOT_HOMES:
        home = db.scalar(select(Home).where(Home.code == code))
        if home is None:
            home = Home(code=code, name=name, city=city, distributor=distributor)
            db.add(home)
            db.flush()
            created_homes += 1
        for start, end, days, kwh, amount in bills:
            exists = db.scalar(select(Bill.id).where(Bill.home_id == home.id, Bill.period_start == start))
            if exists is None:
                db.add(Bill(home_id=home.id, period_start=start, period_end=end, days=days,
                            kwh=kwh, amount_dop=amount, source="seed"))
                created_bills += 1
    db.commit()
    return {"homes_created": created_homes, "bills_created": created_bills}


def main() -> None:
    from app.database import SessionLocal

    with SessionLocal() as db:
        print(seed_pilot(db))


if __name__ == "__main__":
    main()
