"""Persistence, legacy migration and security regressions for bill detail."""
import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from alembic import command
from sqlalchemy import inspect, text
from sqlalchemy.exc import DataError, IntegrityError
from sqlalchemy.orm import Session

from tests.test_bill_detail import ITEM, setup_bill
from tests.test_api_homes_bills import BILL, bill_url, mk_home
from tests.test_auth import auth_client, bearer, register


def test_nonfinite_item_rejected_even_when_bypassing_schema(client, migrated):
    _, bill, _ = setup_bill(client)
    with pytest.raises(IntegrityError):
        with migrated.begin() as c:
            c.execute(text("INSERT INTO bill_items(id,bill_id,position,label,kind,amount_dop) VALUES(gen_random_uuid(),:b,0,'manual','charge','NaN')"), {'b': bill['id']})


def test_foreign_and_missing_ids_are_indistinguishable(auth_client):
    a = register(auth_client)
    auth_client.headers.update(bearer(a))
    home, bill, url = setup_bill(auth_client)
    other = mk_home(auth_client)
    outsider = register(auth_client, 'outside@example.com')
    request_id = 'bill-idor-probe'
    for method, suffix, body in [('GET','/items',None), ('PUT','/items',{'items':[ITEM]}), ('POST','/validate',{})]:
        foreign_child = auth_client.request(method, bill_url(other['id'],bill['id']) + suffix, json=body, headers={'X-Request-ID': request_id})
        unknown_child = auth_client.request(method, bill_url(other['id'],str(uuid.uuid4())) + suffix, json=body, headers={'X-Request-ID': request_id})
        assert foreign_child.status_code == unknown_child.status_code == 404
        assert foreign_child.json() == unknown_child.json()
        foreign_home = auth_client.request(method,url+suffix,json=body,headers={**bearer(outsider),'X-Request-ID':request_id})
        unknown_home = auth_client.request(method,bill_url(str(uuid.uuid4()),bill['id'])+suffix,json=body,headers={**bearer(outsider),'X-Request-ID':request_id})
        assert foreign_home.status_code == unknown_home.status_code == 404
        assert foreign_home.json() == unknown_home.json()
    assert auth_client.get(url+'/items').json()['items'] == []


def test_members_can_replace_items_and_assess_after_membership_is_granted(auth_client, migrated):
    a = register(auth_client)
    auth_client.headers.update(bearer(a))
    home, bill, url = setup_bill(auth_client)
    member = register(auth_client, 'member@example.com')
    with migrated.begin() as c:
        c.execute(text("INSERT INTO home_members(home_id,user_id,role) SELECT :h,id,'member' FROM users WHERE email='member@example.com'"), {'h':home['id']})
    assert auth_client.put(url+'/items',json={'items':[ITEM]},headers=bearer(member)).status_code == 200
    assert auth_client.post(url+'/validate',headers=bearer(member)).status_code == 200
    with migrated.begin() as c:
        c.execute(text("DELETE FROM home_members WHERE home_id=:h AND user_id=(SELECT id FROM users WHERE email='member@example.com')"), {'h':home['id']})
    assert auth_client.get(url+'/items',headers=bearer(member)).status_code == 404


def test_failed_history_write_rolls_back_item_replacement(client, migrated, monkeypatch):
    from app.services import bill_detail
    from app.models.audit import AuditEvent
    from app.schemas.bill_detail import BillItemsReplace
    home, bill, url = setup_bill(client)
    client.put(url+'/items',json={'items':[ITEM]})
    original = client.get(url+'/items').json()
    record_change = bill_detail.record_change

    def fail_at_commit(db, home_id, record, *args, **kwargs):
        record_change(db, home_id, record, *args, **kwargs)
        # Real DB failure after items were deleted/reinserted and audit was queued.
        db.add(AuditEvent(home_id=home_id,entity_id=record.id,entity='bill_items',operation='x'*17))

    monkeypatch.setattr(bill_detail,'record_change',fail_at_commit)
    with Session(migrated) as db:
        with pytest.raises(DataError):
            bill_detail.replace_items(db,uuid.UUID(home['id']),uuid.UUID(bill['id']),BillItemsReplace.model_validate({'items':[{**ITEM,'amount_dop':'2'}]}))
        assert db.is_active
    assert client.get(url+'/items').json() == original
    with migrated.connect() as c:
        assert c.execute(text("SELECT count(*) FROM audit_events WHERE entity='bill_items'")).scalar_one() == 1


def test_concurrent_replacements_are_whole_batches_with_audited_before_after(client, migrated):
    from app.services.bill_detail import replace_items
    from app.schemas.bill_detail import BillItemsReplace
    home, bill, url = setup_bill(client)
    barrier = Barrier(2)

    def replace(amount):
        with Session(migrated) as db:
            barrier.wait(5)
            replace_items(db,uuid.UUID(home['id']),uuid.UUID(bill['id']),BillItemsReplace.model_validate({'items':[{**ITEM,'amount_dop':amount}]*3}))
    with ThreadPoolExecutor(2) as pool:
        jobs = [pool.submit(replace, amount) for amount in ['2','3']]
        for job in jobs:
            job.result(10)
    result = client.get(url+'/items').json()
    assert result['items_total_dop'] in ['6.00','9.00']
    assert len({i['amount_dop'] for i in result['items']}) == 1
    with migrated.connect() as c:
        events = c.execute(text("SELECT before,after FROM audit_events WHERE entity='bill_items' AND entity_id=:b"),{'b':bill['id']}).all()
        first = next(e for e in events if e.before == {'items': []})
        second = next(e for e in events if e.before != {'items': []})
        assert len(events) == 2
        assert second.before == first.after
        assert second.after['items'] == result['items']


def test_migration_roundtrip_preserves_legacy_bill_and_labels_snapshot_unverified(client, migrated, alembic_cfg):
    home, bill, url = setup_bill(client)
    client.put(url+'/items',json={'items':[ITEM]})
    with migrated.connect() as c:
        before = c.execute(text('SELECT to_jsonb(b) FROM bills b WHERE id=:b'),{'b':bill['id']}).scalar_one()
    command.downgrade(alembic_cfg,'0010')
    assert not ({'bill_items','bill_snapshots'} & set(inspect(migrated).get_table_names()))
    with migrated.connect() as c:
        assert c.execute(text('SELECT to_jsonb(b) FROM bills b WHERE id=:b'),{'b':bill['id']}).scalar_one() == before
        assert c.execute(text("SELECT count(*) FROM audit_events WHERE entity='bill_items'")).scalar_one() == 1
    command.upgrade(alembic_cfg,'0011')
    assessment = client.post(url+'/validate').json()
    assert assessment['provenance']['origin'] == 'migration'
    assert assessment['provenance']['original_available'] is False
    assert 'original_unverified' in assessment['warnings']
    assert assessment['detail']['items'] == []
    with migrated.connect() as c:
        assert c.execute(text('SELECT data FROM bill_snapshots WHERE bill_id=:b'),{'b':bill['id']}).scalar_one() == before
        assert c.execute(text('SELECT to_jsonb(b) FROM bills b WHERE id=:b'),{'b':bill['id']}).scalar_one() == before
    assert client.put(url+'/items',json={'items':[ITEM]}).status_code == 200
    assert client.delete('/api/v1/homes/'+home['id']).status_code == 204
    with migrated.connect() as c:
        assert c.execute(text('SELECT count(*) FROM bill_items')).scalar_one() == 0
        assert c.execute(text('SELECT count(*) FROM bill_snapshots')).scalar_one() == 0


def test_seed_without_original_stays_unknown_and_long_legacy_period_is_warning(client, migrated):
    home = mk_home(client)
    with migrated.begin() as c:
        bid = c.execute(text("INSERT INTO bills(id,home_id,period_start,period_end,kwh,amount_dop,days,source) VALUES(gen_random_uuid(),:h,'2024-01-01','2026-01-01',0,0,0,'seed') RETURNING id"),{'h':home['id']}).scalar_one()
    url = bill_url(home['id'],str(bid))
    before = client.get(url).json()
    assessment = client.post(url+'/validate').json()
    assert assessment['provenance'] == {'origin':'unknown','original_available':False,'data':None,'captured_at':None}
    assert set(assessment['warnings']) == {'original_unknown','days_consistency','period_duration'}
    checks = {c['code']:c for c in assessment['checks']}
    assert checks['readings_kwh']['status'] == checks['items_sum']['status'] == 'unavailable'
    assert client.get(url).json() == before
    with migrated.connect() as c:
        assert c.execute(text('SELECT count(*) FROM bill_snapshots')).scalar_one() == 0


def test_correction_dates_follow_write_order_not_transaction_start(client, migrated):
    from app.services.bill_detail import replace_items
    from app.schemas.bill_detail import BillItemsReplace
    home, bill, url = setup_bill(client)
    with Session(migrated) as older_transaction:
        older_transaction.execute(text('SELECT 1'))
        assert client.put(url+'/items',json={'items':[{**ITEM,'amount_dop':'2'}]}).status_code == 200
        replace_items(older_transaction,uuid.UUID(home['id']),uuid.UUID(bill['id']),
                      BillItemsReplace.model_validate({'items':[{**ITEM,'amount_dop':'3'}]}))
    events = client.post(url+'/validate').json()['corrections']
    assert [event['after']['items'][0]['amount_dop'] for event in events] == ['2.00','3.00']
    assert events[1]['before'] == events[0]['after']


def test_correction_response_is_bounded_and_has_no_private_actor_fields(client, migrated):
    home, bill, url = setup_bill(client)
    with migrated.begin() as c:
        c.execute(text("""INSERT INTO audit_events(id,home_id,entity_id,entity,operation,actor,before,after,created_at)
            SELECT gen_random_uuid(),:h,:b,'bill_items','replace','private-context',
                   '{"items": []}'::jsonb,'{"items": []}'::jsonb,now() + n*interval '1 microsecond'
            FROM generate_series(1,101) n"""),{'h':home['id'],'b':bill['id']})
    assessment = client.post(url+'/validate').json()
    assert len(assessment['corrections']) == 100
    assert assessment['corrections_has_more'] is True
    assert all(set(c) == {'entity','operation','before','after','created_at'} for c in assessment['corrections'])
    assert 'private-context' not in str(assessment)


def test_empty_detail_reports_incomplete_not_approved(client):
    _, _, url = setup_bill(client)
    assessment = client.post(url+'/validate').json()
    assert assessment['status'] == 'incomplete'
    assert assessment['approval'] == 'not_performed'
    assert assessment['detail']['items_total_dop'] is None


@pytest.mark.parametrize('days', [0, 1])
def test_single_day_legacy_conventions_remain_valid(client, days):
    _, _, url = setup_bill(client,period_end=BILL['period_start'],days=days,kwh='0',reading_previous='0',reading_current='0')
    client.put(url+'/items',json={'items':[{**ITEM,'amount_dop':'3100'}]})
    assert client.post(url+'/validate').json()['status'] == 'consistent'


def test_snapshot_table_cannot_be_truncated_directly(client, migrated):
    """Row triggers do not fire on TRUNCATE; originals must survive it too (review R1)."""
    setup_bill(client)
    with pytest.raises(IntegrityError):
        with migrated.begin() as c:
            c.execute(text("TRUNCATE bill_snapshots"))
    with migrated.connect() as c:
        assert c.execute(text("SELECT count(*) FROM bill_snapshots")).scalar_one() == 1
