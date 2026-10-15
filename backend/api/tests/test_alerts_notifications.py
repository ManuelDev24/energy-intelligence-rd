"""ERD-ALERT-02: alertas de pago, datos incompletos, anomalía y ahorro; avisos por correo y push; dispositivos y preferencias.

Fechas relativas a HOY (hora de RD): las reglas dependen de la fecha actual."""
import uuid
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Alert, DeviceToken, Notification
from app.services import alerts, email, notifications, push
from app.services import consumption_calc as cc
from app.services.errors import ApplicationError  # noqa: F401
from tests.test_anomaly_scan import iso, run_jobs
from tests.test_auth import auth_client, bearer, register  # noqa: F401

TODAY = datetime.now(timezone.utc).astimezone(cc.SANTO_DOMINGO).date()
TOKEN = "ExponentPushToken[abcdefghijklmnopqrstuv]"
TOKEN2 = "ExpoPushToken[zyxwvutsrqponmlkjihgfe]"


class FakeEmail:
    def __init__(self, ok=True):
        self.sent, self.ok = [], ok

    def send(self, message):
        self.sent.append(message)
        return self.ok


class FakePush:
    def __init__(self, delivered=1, invalid=(), unavailable=False):
        self.calls, self.delivered, self.invalid, self.unavailable = [], delivered, list(invalid), unavailable

    def send(self, tokens, *, title, body, data):
        self.calls.append({"tokens": list(tokens), "title": title, "body": body, "data": data})
        if self.unavailable:
            raise push.PushUnavailable("down")
        return push.PushResult(self.delivered, self.invalid)


def verify_all(engine):
    """Auditoría C-10: solo se notifica a correos verificados; estas pruebas son de alertas, no de verificación."""
    with engine.begin() as c:
        c.execute(text("UPDATE users SET email_verified_at = now() WHERE email_verified_at IS NULL"))


@pytest.fixture
def world(auth_client, migrated, monkeypatch):
    """Alicia (propietaria) con una vivienda; correo falso; ayudantes para facturas, alertas y envíos."""
    sender = FakeEmail()
    monkeypatch.setattr(email, "get_email_sender", lambda: sender)
    alice = register(auth_client)
    verify_all(migrated)
    sender.sent.clear()                              # los correos de verificación del registro no son de este tema
    home = auth_client.post("/api/v1/homes", headers=bearer(alice), json={"name": "Casa <Playa>", "distributor": "EDESUR"}).json()["id"]

    class W:
        client, engine, mail = auth_client, migrated, sender
        tokens, home_id = alice, home

        def bill(self, end_ago=10, kwh=300, days=30, due_in=None, tokens=alice):
            end = TODAY - timedelta(days=end_ago)
            body = {"period_start": str(end - timedelta(days=days - 1)), "period_end": str(end), "days": days, "kwh": str(kwh), "amount_dop": str(kwh * 12)}
            if due_in is not None:
                body["due_date"] = str(TODAY + timedelta(days=due_in))
            r = auth_client.post(f"/api/v1/homes/{home}/bills", headers=bearer(tokens), json=body)
            assert r.status_code == 201, r.text
            return r.json()

        def alerts(self, **params):
            r = auth_client.get(f"/api/v1/homes/{home}/alerts", headers=bearer(alice), params=params)
            assert r.status_code == 200, r.text
            return r.json()

        def of(self, kind):
            return [a for a in self.alerts() if a["type"] == kind]

        def notes(self):
            with migrated.connect() as c:
                return [dict(r._mapping) for r in c.execute(text("SELECT channel, severity, status, reason, user_id FROM notifications ORDER BY created_at, channel"))]

        def member(self, address="bob@example.com"):
            bob = register(auth_client, address)
            verify_all(migrated)
            sender.sent.clear()
            with migrated.begin() as c:
                c.execute(text("INSERT INTO home_members(home_id,user_id,role) SELECT :h,id,'member' FROM users WHERE email=:e"), {"h": home, "e": address})
            return bob

        def user_id(self, address="alice@example.com"):
            with migrated.connect() as c:
                return c.execute(text("SELECT id FROM users WHERE email=:e"), {"e": address}).scalar()

        def session(self):
            return Session(migrated, expire_on_commit=False)

    return W()


# ---------- fecha límite y pago ----------
def test_due_date_is_validated_stored_and_returned(world):
    start = TODAY - timedelta(days=39)
    base = {"period_start": str(start), "period_end": str(TODAY - timedelta(days=10)), "days": 30, "kwh": "300", "amount_dop": "3600"}
    url = f"/api/v1/homes/{world.home_id}/bills"
    for bad in (str(start - timedelta(days=1)), str(TODAY - timedelta(days=10) + timedelta(days=121)), "no-es-fecha"):
        assert world.client.post(url, headers=bearer(world.tokens), json={**base, "due_date": bad}).status_code == 422, bad
    bill = world.bill(due_in=5)
    assert bill["due_date"] == str(TODAY + timedelta(days=5)) and bill["paid_at"] is None
    fetched = world.client.get(f"{url}/{bill['id']}", headers=bearer(world.tokens)).json()
    assert fetched["due_date"] == bill["due_date"]
    cleared = world.client.put(f"{url}/{bill['id']}", headers=bearer(world.tokens), json={k: bill[k] for k in ("period_start", "period_end", "days", "kwh", "amount_dop")})
    assert cleared.json()["due_date"] is None and world.of("payment_due") == []


def test_payment_alert_appears_with_the_bill_and_disappears_when_paid(world):
    bill = world.bill(due_in=2)
    (alert,) = world.of("payment_due")
    assert (alert["severity"], alert["bill_id"], alert["status"]) == ("warning", bill["id"], "unread")
    assert "vence en 2 días" in alert["message"] and "RD$" in alert["message"]
    url = f"/api/v1/homes/{world.home_id}/bills/{bill['id']}/payment"
    paid = world.client.put(url, headers=bearer(world.tokens), json={"paid": True})
    assert paid.status_code == 200 and paid.json()["paid_at"] is not None
    assert world.of("payment_due") == []
    assert world.client.put(url, headers=bearer(world.tokens), json={"paid": True}).status_code == 200      # idempotente
    assert world.client.put(url, headers=bearer(world.tokens), json={"paid": False}).json()["paid_at"] is None
    assert len(world.of("payment_due")) == 1                                                                  # vuelve a estar pendiente


def test_payment_endpoint_validates_and_isolates(world):
    bill = world.bill(due_in=2)
    url = f"/api/v1/homes/{world.home_id}/bills/{bill['id']}/payment"
    for body in ({}, {"paid": "quizás"}, {"paid": True, "extra": 1}):
        assert world.client.put(url, headers=bearer(world.tokens), json=body).status_code == 422, body
    bob = register(world.client, "bob@example.com")
    assert world.client.put(url, headers=bearer(bob), json={"paid": True}).status_code == 404
    assert world.client.put(url.replace(bill["id"], str(uuid.uuid4())), headers=bearer(world.tokens), json={"paid": True}).status_code == 404


def test_an_overdue_bill_is_critical_and_only_the_latest_bill_counts(world):
    world.bill(end_ago=70, due_in=-35)           # vieja, sin pagar: se da por resuelta al haber una posterior
    assert [a["severity"] for a in world.of("payment_due")] == ["critical"]
    world.bill(end_ago=10, due_in=None)          # la más reciente no tiene fecha límite
    assert world.of("payment_due") == []


def test_severity_escalates_with_time_and_resets_to_unread(world):
    world.bill(due_in=5)
    (a,) = world.of("payment_due")
    assert a["severity"] == "info"
    world.client.patch(f"/api/v1/homes/{world.home_id}/alerts/{a['id']}", headers=bearer(world.tokens), json={"status": "read"})
    with world.session() as db:
        later = datetime.now(timezone.utc) + timedelta(days=3)       # vence en 2 días
        changes = alerts.refresh_alerts(db, uuid.UUID(world.home_id), now=later, notify=False)
        db.commit()
        assert [x.severity for x in changes.escalated] == ["warning"]
    (b,) = world.of("payment_due")
    assert (b["id"], b["severity"], b["status"]) == (a["id"], "warning", "unread")
    with world.session() as db:                                       # misma evaluación otra vez: no vuelve a escalar
        again = alerts.refresh_alerts(db, uuid.UUID(world.home_id), now=datetime.now(timezone.utc) + timedelta(days=3), notify=False)
        db.commit()
        assert again.escalated == [] and again.created == []


# ---------- ahorro y datos incompletos ----------
def test_a_notable_drop_is_a_savings_alert_and_never_notifies(world):
    world.bill(end_ago=40, kwh=400)
    world.bill(end_ago=10, kwh=300)
    (alert,) = [a for a in world.alerts() if a["severity"] == "savings"]
    assert alert["type"] == "bill_variation" and "bajó 25" in alert["message"] and "Buen trabajo" in alert["message"]
    assert world.notes() == []


def test_a_small_drop_is_not_celebrated(world):
    world.bill(end_ago=40, kwh=400)
    world.bill(end_ago=10, kwh=340)
    assert [a for a in world.alerts() if a["severity"] == "savings"] == []


def test_missing_bill_and_stale_readings_are_informative_and_clear_themselves(world):
    world.bill(end_ago=80)
    (missing,) = world.of("missing_bill")
    assert missing["severity"] == "warning" and "80 días" in missing["message"]
    world.bill(end_ago=5)                                                  # se registra la factura que faltaba
    assert world.of("missing_bill") == []
    for days_ago, kwh in ((40, 0), (30, 100), (20, 200)):
        r = world.client.post(f"/api/v1/homes/{world.home_id}/readings", headers=bearer(world.tokens), json={"read_at": iso(TODAY - timedelta(days=days_ago)), "reading_kwh": str(kwh)})
        assert r.status_code == 201, r.text
    (stale,) = world.of("stale_readings")
    assert stale["severity"] == "info" and "20 días" in stale["message"]
    world.client.post(f"/api/v1/homes/{world.home_id}/readings", headers=bearer(world.tokens), json={"read_at": iso(TODAY), "reading_kwh": "300"})
    assert world.of("stale_readings") == []
    assert world.notes() == []                                             # lo informativo no se envía


def test_data_incomplete_alerts_never_notify_even_when_they_escalate(world):
    world.bill(end_ago=170)                                                 # dos ciclos sin factura: severidad «advertencia»
    assert world.of("missing_bill")[0]["severity"] == "warning"
    assert world.notes() == []


def test_a_dismissed_rule_alert_does_not_come_back_until_the_condition_clears(world):
    world.bill(end_ago=80)
    (a,) = world.of("missing_bill")
    world.client.patch(f"/api/v1/homes/{world.home_id}/alerts/{a['id']}", headers=bearer(world.tokens), json={"status": "dismissed"})
    with world.session() as db:
        alerts.refresh_alerts(db, uuid.UUID(world.home_id), notify=False)
        db.commit()
    assert world.of("missing_bill") == [] and len(world.alerts(status="dismissed")) == 1


# ---------- anomalías -> alertas ----------
def readings(world, per_day, start_ago):
    first, total = TODAY - timedelta(days=start_ago), 0
    for n in range(len(per_day) + 1):
        r = world.client.post(f"/api/v1/homes/{world.home_id}/readings", headers=bearer(world.tokens),
                              json={"read_at": iso(first + timedelta(days=n)), "reading_kwh": str(total)})
        assert r.status_code == 201, r.text
        if n < len(per_day):
            total += per_day[n]
    return first


def anomalies(world, **params):
    return world.client.get(f"/api/v1/homes/{world.home_id}/anomalies", headers=bearer(world.tokens), params=params).json()


def test_a_fresh_anomaly_creates_a_linked_alert_and_states_stay_in_sync(world):
    readings(world, [10] * 6 + [25] + [10, 10], start_ago=9)            # el pico cae hace ~3 días
    (alert,) = world.of("anomaly")
    (anomaly,) = anomalies(world)
    assert alert["anomaly_id"] == anomaly["id"] and alert["severity"] == anomaly["severity"] and alert["status"] == "unread"
    patch = lambda path, status: world.client.patch(f"/api/v1/homes/{world.home_id}/{path}", headers=bearer(world.tokens), json={"status": status})  # noqa: E731
    assert patch(f"alerts/{alert['id']}", "read").status_code == 200
    assert anomalies(world)[0]["status"] == "acknowledged"
    assert patch(f"anomalies/{anomaly['id']}", "open").status_code == 200
    assert world.of("anomaly")[0]["status"] == "unread"
    assert patch(f"alerts/{alert['id']}", "dismissed").status_code == 200
    assert anomalies(world) == [] and anomalies(world, status="dismissed")[0]["id"] == anomaly["id"]


def test_dismissing_the_anomaly_dismisses_its_alert(world):
    readings(world, [10] * 6 + [25] + [10, 10], start_ago=9)
    (anomaly,) = anomalies(world)
    world.client.patch(f"/api/v1/homes/{world.home_id}/anomalies/{anomaly['id']}", headers=bearer(world.tokens), json={"status": "dismissed"})
    assert world.of("anomaly") == [] and world.alerts(status="dismissed")[0]["type"] == "anomaly"


def test_a_resolved_anomaly_takes_its_alert_with_it(world):
    first = readings(world, [10] * 6 + [25], start_ago=7)
    assert len(world.of("anomaly")) == 1
    with world.engine.connect() as c:
        last = c.execute(text("SELECT id FROM meter_readings ORDER BY read_at DESC LIMIT 1")).scalar()
    assert world.client.delete(f"/api/v1/homes/{world.home_id}/readings/{last}", headers=bearer(world.tokens)).status_code == 204
    assert world.of("anomaly") == [] and first


def test_old_anomalies_are_listed_but_do_not_generate_alerts(world):
    readings(world, [10] * 6 + [30] + [10] * 20, start_ago=27)           # el pico cae hace ~20 días: fuera de la ventana de aviso
    assert any(a["kind"] == "peak" for a in anomalies(world))
    assert world.of("anomaly") == []


# ---------- avisos ----------
def test_a_warning_alert_notifies_every_member_by_email_once(world):
    world.member()
    world.bill(due_in=2)
    assert [(n["channel"], n["severity"], n["status"]) for n in world.notes()] == [("email", "warning", "pending")] * 2
    assert run_jobs(world.engine) == ["succeeded"] * 2
    assert sorted(m.to for m in world.mail.sent) == ["alice@example.com", "bob@example.com"]
    assert {n["status"] for n in world.notes()} == {"sent"}
    world.client.put(f"/api/v1/homes/{world.home_id}/bills/{world.client.get(f'/api/v1/homes/{world.home_id}/bills', headers=bearer(world.tokens)).json()[0]['id']}/payment",
                     headers=bearer(world.tokens), json={"paid": False})
    assert len(world.notes()) == 2                                       # reevaluar no repite


def test_the_email_has_no_figures_links_to_the_app_and_escapes_the_home_name(world):
    world.bill(due_in=2)
    run_jobs(world.engine)
    (msg,) = world.mail.sent
    assert msg.subject == "Energy RD: Su factura vence pronto"
    for forbidden in ("RD$", "kWh", "3600", str(TODAY)):
        assert forbidden not in msg.text and forbidden not in msg.html
    assert f"{notifications.web_origin()}/alerts" in msg.text and "Perfil → Notificaciones" in msg.text
    assert "«Casa &lt;Playa&gt;»" in msg.html and "<Playa>" not in msg.html


def test_critical_after_warning_notifies_again_but_a_repeat_evaluation_does_not(world):
    world.bill(due_in=2)
    assert len(world.notes()) == 1
    for shift in (3, 3):                                                   # la segunda evaluación no añade nada
        with world.session() as db:
            alerts.refresh_alerts(db, uuid.UUID(world.home_id), now=datetime.now(timezone.utc) + timedelta(days=shift))
            db.commit()
    assert [(n["severity"]) for n in world.notes()] == ["warning", "critical"]


def test_preferences_decide_who_gets_what(world):
    bob = world.member()
    world.client.put("/api/v1/auth/me/preferences", headers=bearer(bob), json={"alerts_email": False, "alerts_push": True})
    world.client.put("/api/v1/auth/devices", headers=bearer(bob), json={"token": TOKEN, "platform": "android"})
    world.bill(due_in=2)
    rows = [(n["user_id"] == world.user_id("bob@example.com"), n["channel"]) for n in world.notes()]
    assert sorted(rows) == [(False, "email"), (True, "push")]              # Alicia: correo; Bob: solo push


def test_changing_a_preference_after_queueing_still_skips_the_send(world):
    world.bill(due_in=2)
    world.client.put("/api/v1/auth/me/preferences", headers=bearer(world.tokens), json={"alerts_email": False, "alerts_push": False})
    run_jobs(world.engine)
    assert world.mail.sent == [] and [(n["status"], n["reason"]) for n in world.notes()] == [("skipped", "preference")]


def test_push_needs_a_registered_device(world):
    world.bill(due_in=2)
    assert {n["channel"] for n in world.notes()} == {"email"}               # sin dispositivo no se encola push


def test_old_bills_entered_late_do_not_send_notifications(world):
    world.bill(end_ago=200, kwh=300)
    world.bill(end_ago=170, kwh=900)                                       # alerta de variación crítica, pero de hace 5 meses
    assert any(a["type"] == "bill_variation" for a in world.alerts())
    assert world.notes() == []
    world.bill(end_ago=140, kwh=300)
    world.bill(end_ago=10, kwh=1200)                                       # esta sí es reciente
    assert {(n["channel"], n["severity"]) for n in world.notes()} == {("email", "critical")}


def test_a_dismissed_alert_is_not_sent(world):
    world.bill(due_in=2)
    (alert,) = world.of("payment_due")
    world.client.patch(f"/api/v1/homes/{world.home_id}/alerts/{alert['id']}", headers=bearer(world.tokens), json={"status": "dismissed"})
    run_jobs(world.engine)
    assert world.mail.sent == [] and world.notes()[0]["reason"] == "dismissed"


def test_the_daily_cap_limits_how_many_are_sent(world, monkeypatch):
    monkeypatch.setitem(settings.__dict__, "NOTIFY_DAILY_CAP", 1)
    world.bill(end_ago=40, kwh=300)
    world.bill(end_ago=10, kwh=900, due_in=2)                              # variación crítica + pago: dos avisos
    assert len(world.notes()) == 2
    run_jobs(world.engine)
    assert sorted(n["status"] for n in world.notes()) == ["sent", "skipped"] and len(world.mail.sent) == 1
    assert [n["reason"] for n in world.notes() if n["status"] == "skipped"] == ["daily_cap"]


def deliver_one(world, sender=None, pusher=None, attempt=1, max_attempts=5):
    with world.session() as db:
        row = db.scalars(select(Notification).where(Notification.status == "pending")).first()
        return notifications.deliver(db, row.id, attempt=attempt, max_attempts=max_attempts, email_sender=sender, push_sender=pusher)


def test_email_failure_retries_and_the_last_attempt_marks_it_failed(world):
    world.bill(due_in=2)
    bad = FakeEmail(ok=False)
    with pytest.raises(RuntimeError):
        deliver_one(world, sender=bad, attempt=1)
    assert world.notes()[0]["status"] == "pending"
    assert deliver_one(world, sender=bad, attempt=5) == "failed"
    assert (world.notes()[0]["status"], world.notes()[0]["reason"]) == ("failed", "delivery_error")


def test_push_delivery_removes_dead_tokens_and_reports_no_valid_device(world):
    world.client.put("/api/v1/auth/devices", headers=bearer(world.tokens), json={"token": TOKEN, "platform": "ios"})
    world.client.put("/api/v1/auth/devices", headers=bearer(world.tokens), json={"token": TOKEN2, "platform": "android"})
    world.bill(due_in=2)
    with world.session() as db:
        db.execute(text("UPDATE notifications SET status='skipped' WHERE channel='email'"))
        db.commit()
    pusher = FakePush(delivered=1, invalid=[TOKEN])
    assert deliver_one(world, pusher=pusher) == "sent"
    assert sorted(pusher.calls[0]["tokens"]) == sorted([TOKEN, TOKEN2]) and pusher.calls[0]["title"] == "Su factura vence pronto"
    assert set(pusher.calls[0]["data"]) == {"alert_id", "home_id"} and "RD$" not in pusher.calls[0]["body"]
    with world.session() as db:
        assert db.scalars(select(DeviceToken.token)).all() == [TOKEN2]


def test_push_with_every_token_dead_fails_without_retrying(world):
    world.client.put("/api/v1/auth/devices", headers=bearer(world.tokens), json={"token": TOKEN, "platform": "ios"})
    world.bill(due_in=2)
    with world.session() as db:
        db.execute(text("UPDATE notifications SET status='skipped' WHERE channel='email'"))
        db.commit()
    assert deliver_one(world, pusher=FakePush(delivered=0, invalid=[TOKEN])) == "failed"
    assert world.notes()[-1]["reason"] == "no_valid_device"


def test_push_service_outage_retries(world):
    world.client.put("/api/v1/auth/devices", headers=bearer(world.tokens), json={"token": TOKEN, "platform": "ios"})
    world.bill(due_in=2)
    with world.session() as db:
        db.execute(text("UPDATE notifications SET status='skipped' WHERE channel='email'"))
        db.commit()
    with pytest.raises(RuntimeError):
        deliver_one(world, pusher=FakePush(unavailable=True), attempt=2)
    assert world.notes()[-1]["status"] == "pending"


def test_deleting_the_alert_or_the_user_removes_pending_notifications(world):
    world.bill(due_in=2)
    assert len(world.notes()) == 1
    bill = world.client.get(f"/api/v1/homes/{world.home_id}/bills", headers=bearer(world.tokens)).json()[0]
    world.client.delete(f"/api/v1/homes/{world.home_id}/bills/{bill['id']}", headers=bearer(world.tokens))
    assert world.notes() == []
    assert run_jobs(world.engine) == ["succeeded"]                          # el trabajo huérfano termina sin error


# ---------- dispositivos ----------
def test_register_device_is_idempotent_validated_and_moves_between_accounts(world):
    put = lambda who, token=TOKEN, platform="ios": world.client.put("/api/v1/auth/devices", headers=bearer(who), json={"token": token, "platform": platform})  # noqa: E731
    assert put(world.tokens).status_code == 204 and put(world.tokens).status_code == 204
    for bad in ({"token": "x" * 30, "platform": "ios"}, {"token": TOKEN, "platform": "windows"}, {"token": TOKEN, "platform": "ios", "extra": 1}, {"token": "ExpoPushToken[corto]", "platform": "ios"}):
        assert world.client.put("/api/v1/auth/devices", headers=bearer(world.tokens), json=bad).status_code == 422, bad
    bob = register(world.client, "bob@example.com")
    assert put(bob).status_code == 204                                       # el mismo teléfono con otra cuenta
    with world.engine.connect() as c:
        owners = c.execute(text("SELECT u.email FROM device_tokens d JOIN users u ON u.id=d.user_id")).scalars().all()
    assert owners == ["bob@example.com"]
    assert world.client.put("/api/v1/auth/devices", json={"token": TOKEN, "platform": "ios"}).status_code == 401


def test_devices_are_capped_per_person_and_removal_is_scoped(world, monkeypatch):
    monkeypatch.setitem(settings.__dict__, "MAX_DEVICES_PER_USER", 2)
    tokens = [f"ExponentPushToken[device{n:02d}abcdefghijklmn]" for n in range(3)]
    for token in tokens:
        assert world.client.put("/api/v1/auth/devices", headers=bearer(world.tokens), json={"token": token, "platform": "android"}).status_code == 204
    with world.engine.connect() as c:
        assert c.execute(text("SELECT count(*) FROM device_tokens")).scalar() == 2
    bob = register(world.client, "bob@example.com")
    remove = lambda who, token: world.client.post("/api/v1/auth/devices/remove", headers=bearer(who), json={"token": token})  # noqa: E731
    assert remove(bob, tokens[2]).status_code == 204                          # no es suyo: no hace nada
    with world.engine.connect() as c:
        assert c.execute(text("SELECT count(*) FROM device_tokens")).scalar() == 2
    assert remove(world.tokens, tokens[2]).status_code == 204 and remove(world.tokens, tokens[2]).status_code == 204
    with world.engine.connect() as c:
        assert c.execute(text("SELECT count(*) FROM device_tokens")).scalar() == 1


# ---------- servicio push de Expo ----------
def expo(handler, token=""):
    return push.ExpoPushSender(token, transport=httpx.MockTransport(handler))


def test_expo_sender_posts_batches_and_reads_tickets():
    seen = []

    def handler(request):
        import json as _json
        messages = _json.loads(request.content)
        seen.append((str(request.url), request.headers.get("authorization"), len(messages), messages[0]))
        return httpx.Response(200, json={"data": [{"status": "ok"} if i % 2 == 0 else {"status": "error", "details": {"error": "DeviceNotRegistered"}} for i in range(len(messages))]})
    tokens = [f"ExponentPushToken[t{n:04d}abcdefghijklmno]" for n in range(150)]
    result = expo(handler, token="secret").send(tokens, title="T", body="B", data={"a": 1})
    assert [s[2] for s in seen] == [100, 50] and seen[0][0] == push.EXPO_URL and seen[0][1] == "Bearer secret"
    assert seen[0][3] == {"to": tokens[0], "title": "T", "body": "B", "data": {"a": 1}, "sound": "default", "priority": "high"}
    assert result.delivered == 75 and len(result.invalid) == 75 and result.invalid[0] == tokens[1]


def test_expo_sender_failures_are_retryable_or_ignored_as_documented():
    for status in (429, 500, 503):
        with pytest.raises(push.PushUnavailable):
            expo(lambda r, s=status: httpx.Response(s)).send([TOKEN], title="T", body="B", data={})
    with pytest.raises(push.PushUnavailable):
        expo(lambda r: (_ for _ in ()).throw(httpx.ConnectError("boom"))).send([TOKEN], title="T", body="B", data={})
    with pytest.raises(push.PushUnavailable):
        expo(lambda r: httpx.Response(200, content=b"no es json")).send([TOKEN], title="T", body="B", data={})
    assert expo(lambda r: httpx.Response(400, json={"errors": []})).send([TOKEN], title="T", body="B", data={}) == push.PushResult(0, [])
    assert "secret" not in repr(push.ExpoPushSender("secret"))


# ---------- trabajos programados y base de datos ----------
def test_the_daily_job_evaluates_homes_with_recent_data(world):
    world.bill(due_in=2)
    from app.services.jobs import queue
    with world.session() as db:
        queue.enqueue(db, "alerts.evaluate_all", now=datetime.now(timezone.utc))
    assert set(run_jobs(world.engine)) == {"succeeded"}      # el correo pendiente, el diario y la evaluación de la vivienda
    with world.engine.connect() as c:
        keys = c.execute(text("SELECT idempotency_key FROM jobs WHERE kind='alerts.evaluate_home'")).scalars().all()
    assert keys == [f"{world.home_id}:{TODAY.isoformat()}"]
    assert run_jobs(world.engine) == []
    assert len(world.of("payment_due")) == 1                                  # reevaluar no duplica


def test_database_constraints_for_alerts_notifications_and_tokens(world):
    world.bill(due_in=2)
    bad = [
        "INSERT INTO alerts(id,home_id,type,severity,message) VALUES(gen_random_uuid(),:h,'payment_due','urgent','x')",
        "INSERT INTO alerts(id,home_id,type,severity,message) VALUES(gen_random_uuid(),:h,'rumor','info','x')",
        "INSERT INTO alerts(id,home_id,type,severity,message,dedupe_key) SELECT gen_random_uuid(),home_id,'stale_readings','info','x','payment:dup' FROM alerts LIMIT 1",
        "INSERT INTO device_tokens(id,user_id,token,platform) VALUES(gen_random_uuid(),(SELECT id FROM users LIMIT 1),'t','windows')",
        "INSERT INTO notifications(id,alert_id,user_id,channel,severity) SELECT gen_random_uuid(),id,(SELECT id FROM users LIMIT 1),'sms','warning' FROM alerts LIMIT 1",
        "INSERT INTO notifications(id,alert_id,user_id,channel,severity) SELECT gen_random_uuid(),id,(SELECT id FROM users LIMIT 1),'email','info' FROM alerts LIMIT 1",
        "INSERT INTO notifications(id,alert_id,user_id,channel,severity) SELECT gen_random_uuid(),alert_id,user_id,channel,severity FROM notifications LIMIT 1",
        "UPDATE bills SET due_date = period_start - 1",
    ]
    ok = "INSERT INTO alerts(id,home_id,type,severity,message,dedupe_key) VALUES(gen_random_uuid(),:h,'stale_readings','info','x','payment:dup')"
    with world.engine.begin() as c:
        c.execute(text(ok), {"h": world.home_id})
    from sqlalchemy.exc import DBAPIError, IntegrityError
    for statement in bad:
        with pytest.raises((IntegrityError, DBAPIError)):
            with world.engine.begin() as c:
                c.execute(text(statement), {"h": world.home_id})


def test_migration_roundtrip_and_downgrade_removes_new_alert_kinds(world, alembic_cfg):
    from alembic import command
    world.bill(due_in=2)
    assert world.of("payment_due")
    command.downgrade(alembic_cfg, "0019")
    with world.engine.connect() as c:
        assert c.execute(text("SELECT to_regclass('public.notifications')")).scalar() is None
        assert c.execute(text("SELECT count(*) FROM alerts WHERE type <> 'bill_variation' OR severity NOT IN ('warning','critical')")).scalar() == 0
        assert "due_date" not in {r[0] for r in c.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='bills'"))}
    command.upgrade(alembic_cfg, "head")
    with world.engine.connect() as c:
        assert c.execute(text("SELECT to_regclass('public.notifications')")).scalar() is not None
