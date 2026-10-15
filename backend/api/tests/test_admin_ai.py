"""ERD-AI-ADMIN-WEB: supervisión del Copilot — agregados, costo estimado solo con precios, privacidad y scope propio."""
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import text

from app.services.admin_ai import estimate_cost
from tests.test_admin_rbac import _grant
from tests.test_auth import auth_client, bearer, register  # noqa: F401

ADMIN = '/api/v1/admin'


def test_cost_is_only_estimated_with_both_prices():
    assert estimate_cost(1_000_000, 500_000, None, None)['configured'] is False
    assert estimate_cost(1_000_000, 500_000, Decimal('3'), None)['total_usd'] is None  # un costo parcial engañaría
    c = estimate_cost(1_000_000, 500_000, Decimal('3'), Decimal('15'))
    assert c == {'configured': True, 'input_usd': Decimal('3.0000'), 'output_usd': Decimal('7.5000'), 'total_usd': Decimal('10.5000')}
    assert estimate_cost(0, 0, Decimal('3'), Decimal('15'))['total_usd'] == Decimal('0.0000')


def _seed(migrated, home_id, user_id):
    with migrated.begin() as c:
        conv = c.execute(text("INSERT INTO copilot_conversations(id,home_id,user_id,title) VALUES(gen_random_uuid(),:h,:u,'Mi factura de agosto SECRETA') RETURNING id"),
                         {'h': home_id, 'u': user_id}).scalar_one()
        rows = [('complete', 1000, 500, 1200, 1, '["get_bills","get_tariff"]', 'claude-x'), ('complete', 2000, 800, 3400, -1, '["get_bills"]', 'claude-x'),
                ('complete', 500, 300, 800, None, None, 'claude-y'), ('error', 0, 0, 100, None, None, None), ('refused', 100, 0, 50, None, None, 'claude-x')]
        for status, i, o, lat, fb, tools, model in rows:
            c.execute(text("INSERT INTO copilot_messages(id,conversation_id,role,content,status,tools,model,input_tokens,output_tokens,latency_ms,feedback) "
                           "VALUES(gen_random_uuid(),:c,'assistant','respuesta privada SECRETA',:s,CAST(:t AS jsonb),:m,:i,:o,:l,:f)"),
                      {'c': conv, 's': status, 't': tools, 'm': model, 'i': i, 'o': o, 'l': lat, 'f': fb})
        c.execute(text("INSERT INTO copilot_messages(id,conversation_id,role,content,status) VALUES(gen_random_uuid(),:c,'user','pregunta privada SECRETA','complete')"), {'c': conv})
        today = date.today()
        for subject, day, msgs, toks in ((str(user_id), today, 5, 4700), (str(user_id), today - timedelta(days=1), 2, 900), ('pilot', today, 1, 100),
                                         (str(user_id), today - timedelta(days=60), 9, 9999)):
            c.execute(text("INSERT INTO copilot_usage(subject,day,messages,tokens) VALUES(:s,:d,:m,:t)"), {'s': subject, 'd': day, 'm': msgs, 't': toks})


def test_ai_usage_scope_aggregates_privacy_and_audit(auth_client, migrated):
    ops = register(auth_client, 'ops-ai@example.com')
    support = register(auth_client, 'soporte-ai@example.com')
    owner = register(auth_client, 'persona-ai@example.com')
    _grant(migrated, 'ops-ai@example.com', 'operations_admin')
    _grant(migrated, 'soporte-ai@example.com', 'support_readonly')
    home = auth_client.post('/api/v1/homes', headers=bearer(owner), json={'name': 'Casa IA', 'distributor': 'EDESUR'}).json()['id']
    with migrated.connect() as c:
        owner_id = c.execute(text("SELECT id FROM users WHERE email='persona-ai@example.com'")).scalar_one()
    _seed(migrated, home, owner_id)

    assert auth_client.get(f'{ADMIN}/ai/usage').status_code == 401
    assert auth_client.get(f'{ADMIN}/ai/usage', headers=bearer(owner)).status_code == 403
    assert auth_client.get(f'{ADMIN}/ai/usage', headers=bearer(support)).status_code == 403  # soporte no tiene admin.ai.read
    assert auth_client.get(f'{ADMIN}/ai/usage?days=0', headers=bearer(ops)).status_code == 422
    assert auth_client.get(f'{ADMIN}/ai/usage?days=91', headers=bearer(ops)).status_code == 422

    r = auth_client.get(f'{ADMIN}/ai/usage?days=14', headers=bearer(ops))
    assert r.status_code == 200, r.text
    assert r.headers['cache-control'] == 'no-store'
    d = r.json()
    assert d['days'] == 14 and d['assistant_messages'] == 5 and d['by_status'] == {'complete': 3, 'error': 1, 'refused': 1}
    assert d['input_tokens'] == 3600 and d['output_tokens'] == 1600 and d['conversations'] == 1
    assert d['feedback_up'] == 1 and d['feedback_down'] == 1
    assert d['latency_p50_ms'] == 1200 and 3000 < d['latency_p95_ms'] <= 3400  # solo mensajes completos: 800, 1200, 3400
    models = {m['model']: m for m in d['by_model']}
    assert models['claude-x']['messages'] == 3 and models['claude-y']['messages'] == 1 and models['desconocido']['messages'] == 1
    assert {t['name']: t['count'] for t in d['tools']} == {'get_bills': 2, 'get_tariff': 1} and d['tools'][0]['name'] == 'get_bills'
    assert [x['messages'] for x in d['by_day']] == [2, 6] and d['by_day'][-1]['people'] == 2  # el uso de hace 60 días queda fuera
    top = d['top_people']
    assert top[0]['subject'] == str(owner_id) and top[0]['messages'] == 7 and top[0]['tokens'] == 5600 and top[0]['days_active'] == 2
    assert d['cost']['configured'] is False and d['cost']['total_usd'] is None
    assert d['limits']['provider'] in ('disabled', 'anthropic', 'fake') and d['limits']['daily_messages_per_user'] >= 1

    for forbidden in ('secreta', 'casa ia', 'persona-ai', '@example.com', 'mi factura', 'respuesta', 'pregunta'):
        assert forbidden not in r.text.lower(), forbidden
    for method in ('post', 'put', 'patch', 'delete'):
        assert getattr(auth_client, method)(f'{ADMIN}/ai/usage', headers=bearer(ops)).status_code in (404, 405)
    with migrated.connect() as c:
        events = c.execute(text("SELECT action, resource, scope_used FROM admin_audit_events WHERE action = 'ai.usage'")).all()
    assert len(events) == 1 and events[0][2] == 'admin.ai.read'


def test_ai_usage_with_no_data_is_empty_not_invented(auth_client, migrated):
    ops = register(auth_client, 'ops-ai2@example.com')
    _grant(migrated, 'ops-ai2@example.com', 'operations_admin')
    d = auth_client.get(f'{ADMIN}/ai/usage', headers=bearer(ops)).json()
    assert d['assistant_messages'] == 0 and d['by_status'] == {} and d['latency_p50_ms'] is None and d['latency_p95_ms'] is None
    assert d['by_model'] == [] and d['tools'] == [] and d['by_day'] == [] and d['top_people'] == []
