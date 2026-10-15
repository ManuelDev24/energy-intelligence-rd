"""ERD-AI-CHAT: Energy Copilot contra PostgreSQL real con el proveedor determinista (sin red) y el adaptador de Claude con un cliente
simulado que verifica la forma exacta de la petición."""
import json
from types import SimpleNamespace

import pytest
from sqlalchemy import text

from app.config import settings
from app.services.copilot import engine, provider as providers, tools
from tests.test_auth import auth_client, bearer, register  # noqa: F401


def sse(response):
    events = []
    for chunk in response.text.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in chunk.splitlines() if ": " in line)
        events.append((lines["event"], json.loads(lines["data"])))
    return events


@pytest.fixture
def copilot(auth_client, monkeypatch):  # noqa: F811
    monkeypatch.setitem(settings.__dict__, "COPILOT_PROVIDER", "fake")
    return auth_client


def home_for(client, email):
    headers = bearer(register(client, email))
    home = client.post("/api/v1/homes", headers=headers, json={"name": "Casa de prueba", "distributor": "EDESUR"})
    assert home.status_code == 201, home.text
    return headers, home.json()["id"]


def root(home):
    return f"/api/v1/homes/{home}/copilot"


def new_conversation(client, headers, home, title=None):
    r = client.post(root(home) + "/conversations", headers=headers, json={} if title is None else {"title": title})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def ask(client, headers, home, conversation, content, **extra):
    return client.post(f"{root(home)}/conversations/{conversation}/messages", headers=headers, json={"content": content, **extra})


def test_disabled_by_default_answers_503_without_storing_anything(auth_client, migrated):  # noqa: F811
    headers, home = home_for(auth_client, "off@example.com")
    usage = auth_client.get(root(home) + "/usage", headers=headers).json()
    assert usage["enabled"] is False and usage["messages_used"] == 0
    conversation = new_conversation(auth_client, headers, home)
    r = ask(auth_client, headers, home, conversation, "Hola")
    assert r.status_code == 503 and r.json()["code"] == "copilot_disabled"
    with migrated.connect() as c:
        assert c.execute(text("SELECT count(*) FROM copilot_messages")).scalar_one() == 0


def test_conversations_are_private_to_their_owner_and_home(copilot, migrated):
    alice, home = home_for(copilot, "alice@example.com")
    bob, other_home = home_for(copilot, "bob@example.com")
    with migrated.begin() as c:  # Bob también vive en la casa de Alice
        c.execute(text("INSERT INTO home_members(home_id,user_id,role) SELECT :h, id, 'member' FROM users WHERE email='bob@example.com'"),
                  {"h": home})
    conversation = new_conversation(copilot, alice, home, "  Mi   factura  ")
    listed = copilot.get(root(home) + "/conversations", headers=alice).json()
    assert [c["title"] for c in listed] == ["Mi factura"]
    assert copilot.get(root(home) + "/conversations", headers=bob).json() == []
    for headers, h in ((bob, home), (bob, other_home), (alice, other_home)):
        assert copilot.get(f"{root(h)}/conversations/{conversation}/messages", headers=headers).status_code == 404
        assert ask(copilot, headers, h, conversation, "hola").status_code == 404
        assert copilot.patch(f"{root(h)}/conversations/{conversation}", headers=headers, json={"title": "x"}).status_code == 404
        assert copilot.delete(f"{root(h)}/conversations/{conversation}", headers=headers).status_code == 404
    renamed = copilot.patch(f"{root(home)}/conversations/{conversation}", headers=alice, json={"title": "Gasto de septiembre"})
    assert renamed.status_code == 200 and renamed.json()["title"] == "Gasto de septiembre"
    assert copilot.patch(f"{root(home)}/conversations/{conversation}", headers=alice, json={"title": "   "}).status_code == 422
    assert copilot.delete(f"{root(home)}/conversations/{conversation}", headers=alice).status_code == 204
    assert copilot.get(root(home) + "/conversations", headers=alice).json() == []


def test_turn_streams_uses_real_data_and_persists_sources(copilot, migrated):
    headers, home = home_for(copilot, "datos@example.com")
    bill = copilot.post(f"/api/v1/homes/{home}/bills", headers=headers, json={
        "period_start": "2026-08-01", "period_end": "2026-08-31", "kwh": "320", "amount_dop": "4100.50", "days": 31})
    assert bill.status_code == 201, bill.text
    conversation = new_conversation(copilot, headers, home)
    r = ask(copilot, headers, home, conversation, "¿Cuántas facturas tengo?", period_from="2026-08-01", period_to="2026-08-31")
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("text/event-stream") and r.headers["cache-control"] == "no-store"
    events = sse(r)
    kinds = [k for k, _ in events]
    assert kinds[0] == "start" and kinds[-1] == "done" and "tool" in kinds and "delta" in kinds
    assert dict(events)["tool"] == {"name": "list_bills", "label": "Consultando facturas"}
    streamed = "".join(d["text"] for k, d in events if k == "delta")
    done = events[-1][1]["message"]
    assert done["content"] == streamed and "**1** facturas" in streamed
    assert done["status"] == "complete" and done["tools"] == ["list_bills"]
    assert done["sources"] == [{"kind": "bill", "label": "Factura 01/08/2026–31/08/2026", "quality": "REAL",
                                "href": f"/bills/{bill.json()['id']}"}]
    history = copilot.get(f"{root(home)}/conversations/{conversation}/messages", headers=headers).json()
    assert [(m["role"], m["status"]) for m in history] == [("user", "complete"), ("assistant", "complete")]
    assert history[1]["sources"] == done["sources"]
    titles = [c["title"] for c in copilot.get(root(home) + "/conversations", headers=headers).json()]
    assert titles == ["¿Cuántas facturas tengo?"]
    usage = copilot.get(root(home) + "/usage", headers=headers).json()
    assert usage["messages_used"] == 1 and usage["tokens_used"] > 0 and usage["enabled"] is True
    for forbidden in ("Eres Energy Copilot", "[Contexto de la app]", "tool_use", "toolu_"):
        assert forbidden not in r.text and forbidden not in json.dumps(history)


def test_missing_data_is_reported_not_invented(copilot):
    headers, home = home_for(copilot, "vacio@example.com")
    conversation = new_conversation(copilot, headers, home)
    events = sse(ask(copilot, headers, home, conversation, "¿Qué equipo consume más?"))
    done = events[-1][1]
    assert done["message"]["tools"] == ["get_equipment_estimate"]
    assert any("no tiene equipos registrados" in w for w in done["warnings"])
    assert done["message"]["sources"][0]["quality"] == "ESTIMATED"


def test_refusal_and_provider_failure_never_leak_internal_text(copilot, migrated):
    headers, home = home_for(copilot, "rechazo@example.com")
    conversation = new_conversation(copilot, headers, home)
    refused = sse(ask(copilot, headers, home, conversation, "[rechazo] algo"))
    assert [k for k, _ in refused] == ["start", "refused", "done"]
    assert refused[-1][1]["message"]["status"] == "refused" and refused[-1][1]["message"]["content"] == ""
    failed = ask(copilot, headers, home, conversation, "[falla] algo")
    events = sse(failed)
    assert [k for k, _ in events] == ["start", "error"]
    assert events[-1][1]["code"] == "provider_error" and "fake failure" not in failed.text
    with migrated.connect() as c:
        statuses = [r[0] for r in c.execute(text("SELECT status FROM copilot_messages WHERE role='assistant' ORDER BY created_at"))]
    assert statuses == ["refused", "error"]


def test_daily_limit_blocks_before_storing_the_question(copilot, monkeypatch, migrated):
    monkeypatch.setitem(settings.__dict__, "COPILOT_DAILY_MESSAGES_PER_USER", 1)
    headers, home = home_for(copilot, "limite@example.com")
    conversation = new_conversation(copilot, headers, home)
    assert ask(copilot, headers, home, conversation, "¿Cuánto pagaré?").status_code == 200
    blocked = ask(copilot, headers, home, conversation, "¿Y el mes que viene?")
    assert blocked.status_code == 429 and blocked.json()["code"] == "copilot_limit"
    assert blocked.headers["retry-after"] == "3600"
    assert copilot.get(root(home) + "/usage", headers=headers).json()["limited"] is True
    with migrated.connect() as c:
        assert c.execute(text("SELECT count(*) FROM copilot_messages WHERE role='user'")).scalar_one() == 1


def test_feedback_only_on_own_assistant_answers(copilot):
    headers, home = home_for(copilot, "feedback@example.com")
    conversation = new_conversation(copilot, headers, home)
    message = sse(ask(copilot, headers, home, conversation, "¿Cómo puedo ahorrar?"))[-1][1]["message"]
    url = f"{root(home)}/conversations/{conversation}/messages/{message['id']}/feedback"
    assert copilot.put(url, headers=headers, json={"value": 1}).json()["feedback"] == 1
    assert copilot.put(url, headers=headers, json={"value": None}).json()["feedback"] is None
    assert copilot.put(url, headers=headers, json={"value": 5}).status_code == 422
    question = copilot.get(f"{root(home)}/conversations/{conversation}/messages", headers=headers).json()[0]
    assert copilot.put(f"{root(home)}/conversations/{conversation}/messages/{question['id']}/feedback", headers=headers,
                       json={"value": 1}).status_code == 404


@pytest.mark.parametrize("body", [{"content": ""}, {"content": "   "}, {"content": "x" * 4001}, {"content": "hola", "period_from": "2026-01-01"},
                                  {"content": "hola", "period_from": "2026-02-01", "period_to": "2026-01-01"},
                                  {"content": "hola", "extra": 1}])
def test_message_validation(copilot, body):
    headers, home = home_for(copilot, "valida@example.com")
    conversation = new_conversation(copilot, headers, home)
    r = copilot.post(f"{root(home)}/conversations/{conversation}/messages", headers=headers, json=body)
    assert r.status_code == 422


def test_cancelled_turn_keeps_the_partial_answer(copilot, migrated):
    headers, home = home_for(copilot, "cancela@example.com")
    conversation = new_conversation(copilot, headers, home)
    user_id = copilot.get("/api/v1/auth/me", headers=headers).json()["id"]
    ctx = engine.Context(user_id=user_id, home_id=home)
    from sqlalchemy.orm import Session
    with Session(migrated) as db:
        engine.start_turn(db, ctx, conversation, "¿Cuánto pagaré este mes?")
    stream = engine.run_turn(migrated, ctx, conversation, providers.FakeProvider())
    received = []
    for event in stream:
        received.append(event)
        if event.startswith("event: delta"):
            break
    stream.close()
    with migrated.connect() as c:
        status, content = c.execute(text("SELECT status, content FROM copilot_messages WHERE role='assistant'")).one()
    assert status == "cancelled" and content and content in "".join(received).replace("\\n", "\n")


def test_tool_inputs_are_validated_before_running(session):
    home = SimpleNamespace(id=None, name="x", distributor="EDESUR")
    assert tools.run_tool(session, home, "drop_tables", {}).is_error
    assert tools.run_tool(session, home, "list_bills", "no-dict").is_error
    bad = tools.run_tool(session, home, "list_bills", {"limit": 500})
    assert bad.is_error and "invalid_input" in bad.content
    assert tools.run_tool(session, home, "get_consumption", {"from_date": "2026-02-01", "to_date": "2026-01-01"}).is_error
    assert tools.run_tool(session, home, "estimate_cost", {"kwh": "-3"}).is_error
    assert tools.run_tool(session, home, "get_home_overview", {"home_id": "otra"}).is_error


def test_tool_definitions_are_stable_and_closed():
    first, second = tools.definitions(), tools.definitions()
    assert first == second and [d["name"] for d in first] == [s.name for s in tools.SPECS]
    for definition in first:
        assert definition["input_schema"]["additionalProperties"] is False and definition["eager_input_streaming"] is True


def test_echo_content_drops_pre_fallback_internal_blocks():
    blocks = [{"type": "thinking", "thinking": ""}, {"type": "text", "text": "parcial"}, {"type": "tool_use", "id": "a"},
              {"type": "fallback"}, {"type": "thinking", "thinking": ""}, {"type": "tool_use", "id": "b"}]
    assert providers.echo_content(blocks) == [{"type": "text", "text": "parcial"}, {"type": "fallback"},
                                              {"type": "thinking", "thinking": ""}, {"type": "tool_use", "id": "b"}]
    assert providers.echo_content(blocks[:3]) == blocks[:3]


class _FakeStream:
    def __init__(self, final, events):
        self.final, self.events = final, events

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def __iter__(self):
        return iter(self.events)

    def get_final_message(self):
        return self.final


def test_anthropic_adapter_sends_the_documented_request(monkeypatch):
    monkeypatch.setitem(settings.__dict__, "COPILOT_MODEL", "claude-opus-5-5")
    calls = []
    block = SimpleNamespace(type="text", model_dump=lambda **_: {"type": "text", "text": "Hola"})
    tool = SimpleNamespace(type="tool_use", id="toolu_1", name="list_bills", input={"limit": 3},
                           model_dump=lambda **_: {"type": "tool_use", "id": "toolu_1", "name": "list_bills", "input": {"limit": 3}})
    final = SimpleNamespace(content=[block, tool], stop_reason="tool_use", model="claude-opus-5-5",
                            usage=SimpleNamespace(input_tokens=10, output_tokens=5, cache_read_input_tokens=100, cache_creation_input_tokens=0))
    delta = SimpleNamespace(type="content_block_delta", delta=SimpleNamespace(type="text_delta", text="Hola"))
    client = SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(
        stream=lambda **kwargs: calls.append(kwargs) or _FakeStream(final, [delta]))))
    out = list(providers.AnthropicProvider(client).stream_turn(system="S", messages=[{"role": "user", "content": "hola"}],
                                                               tools=tools.definitions()))
    assert isinstance(out[0], providers.TextDelta) and out[0].text == "Hola"
    result = out[-1]
    assert result.tool_uses == [{"id": "toolu_1", "name": "list_bills", "input": {"limit": 3}}]
    assert result.input_tokens == 110 and result.output_tokens == 5
    request = calls[0]
    assert request["model"] == "claude-opus-5-5" and request["thinking"] == {"type": "adaptive"}
    assert request["fallbacks"] == "default" and request["betas"] == ["server-side-fallback-2026-07-01"]
    assert request["output_config"] == {"effort": settings.COPILOT_EFFORT}
    assert request["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert "tool_choice" not in request and "temperature" not in request and "budget_tokens" not in json.dumps(request)


def test_anthropic_errors_become_provider_errors():
    import anthropic
    import httpx2

    def boom(**_):
        raise anthropic.APIConnectionError(request=httpx2.Request("POST", "https://api.anthropic.com/v1/messages"))
    client = SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(stream=boom)))
    with pytest.raises(providers.ProviderError):
        list(providers.AnthropicProvider(client).stream_turn(system="S", messages=[], tools=[]))


def test_fake_provider_is_development_only(monkeypatch):
    from pydantic import ValidationError
    from app.config import Settings
    assert Settings(_env_file=None, ENVIRONMENT="development", COPILOT_PROVIDER="fake").COPILOT_PROVIDER == "fake"
    with pytest.raises(ValidationError, match="development-only"):
        Settings(_env_file=None, ENVIRONMENT="production", COPILOT_PROVIDER="fake")
    with pytest.raises(ValidationError, match="ANTHROPIC_API_KEY"):
        Settings(_env_file=None, COPILOT_PROVIDER="anthropic", ANTHROPIC_API_KEY="")
