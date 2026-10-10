"""ERD-AUTH-05: backends de correo (sin red; Resend se simula con httpx.MockTransport)."""
import json
import logging

import httpx
import pytest

from app.services import email

TOKEN = "T" * 43
LINK = "https://app.energy.example/restablecer#token=" + TOKEN


@pytest.fixture
def api_logs(caplog):
    """The API logger does not propagate; attach caplog to it and expose every record field."""
    caplog.set_level(logging.DEBUG, logger="energyrd.api")
    logger = logging.getLogger("energyrd.api")
    logger.addHandler(caplog.handler)
    yield lambda: caplog.text + " ".join(str(r.__dict__) for r in caplog.records)
    logger.removeHandler(caplog.handler)


@pytest.fixture(autouse=True)
def clean_outbox():
    email.DEV_OUTBOX.clear()
    yield
    email.DEV_OUTBOX.clear()


def message():
    return email.password_reset_message("alice@example.com", "https://app.energy.example/restablecer", TOKEN, 30)


def test_reset_link_puts_token_in_fragment_not_query():
    assert email.build_reset_link("https://app.energy.example/restablecer", TOKEN) == LINK


def test_reset_message_is_spanish_plain_and_simple_html_without_tracking():
    m = message()
    assert m.to == "alice@example.com"
    assert "contraseña" in m.subject.lower()
    for body in (m.text, m.html):
        assert LINK in body and "30 minutos" in body and "ignora" in body.lower()
    assert "<img" not in m.html.lower() and "<script" not in m.html.lower()
    assert "?token=" not in m.text + m.html


def test_console_sender_writes_outbox_and_never_logs_token(api_logs, capsys):
    assert email.ConsoleEmailSender().send(message()) is True
    assert list(email.DEV_OUTBOX) == [message()]
    output = capsys.readouterr()
    logged = api_logs() + output.out + output.err
    assert "email_queued_dev_outbox" in logged
    assert TOKEN not in logged and "restablecer" not in logged and "alice@example.com" not in logged


def test_console_sender_optionally_appends_to_dev_file(tmp_path):
    path = tmp_path / "outbox.jsonl"
    email.ConsoleEmailSender(outbox_path=str(path)).send(message())
    row = json.loads(path.read_text().splitlines()[0])
    assert row["to"] == "alice@example.com" and LINK in row["text"]


def test_resend_sender_posts_expected_request():
    seen = []

    def handler(request):
        seen.append(request)
        return httpx.Response(200, json={"id": "email-id"})

    sender = email.ResendEmailSender("re_test_key", "Energy RD <no-reply@energy.example>",
                                     transport=httpx.MockTransport(handler))
    assert sender.send(message()) is True
    request = seen[0]
    assert str(request.url) == "https://api.resend.com/emails" and request.method == "POST"
    assert request.headers["Authorization"] == "Bearer re_test_key"
    body = json.loads(request.content)
    assert body["from"] == "Energy RD <no-reply@energy.example>" and body["to"] == ["alice@example.com"]
    assert LINK in body["text"] and LINK in body["html"] and body["subject"]


@pytest.mark.parametrize("failure", ["status", "network", "timeout"])
def test_resend_failures_are_logged_without_secrets_and_never_raise(failure, api_logs, capsys):

    def handler(request):
        if failure == "network":
            raise httpx.ConnectError("boom re_test_key", request=request)
        if failure == "timeout":
            raise httpx.ReadTimeout("slow", request=request)
        return httpx.Response(422, json={"message": "invalid from re_test_key " + TOKEN})

    sender = email.ResendEmailSender("re_test_key", "no-reply@energy.example", transport=httpx.MockTransport(handler))
    assert sender.send(message()) is False
    output = capsys.readouterr()
    logged = api_logs() + output.out + output.err
    assert "email_delivery_failed" in logged
    for secret in ("re_test_key", TOKEN, "alice@example.com"):
        assert secret not in logged


def test_resend_uses_bounded_timeout():
    sender = email.ResendEmailSender("re_test_key", "no-reply@energy.example")
    assert 0 < sender.timeout <= 15
    assert "re_test_key" not in repr(sender)


def test_get_email_sender_follows_settings(monkeypatch):
    from app.config import settings
    monkeypatch.setitem(settings.__dict__, "EMAIL_BACKEND", "console")
    assert isinstance(email.get_email_sender(), email.ConsoleEmailSender)
    monkeypatch.setitem(settings.__dict__, "EMAIL_BACKEND", "resend")
    monkeypatch.setitem(settings.__dict__, "RESEND_API_KEY", "re_test_key")
    monkeypatch.setitem(settings.__dict__, "EMAIL_FROM", "no-reply@energy.example")
    assert isinstance(email.get_email_sender(), email.ResendEmailSender)
