"""ERD-BILL-02: real HTTP + PostgreSQL; isolated runner only."""
import pytest
from tests.test_api_homes_bills import BILL, bill_url, mk_home


ITEM = {'label': 'Capturado manualmente', 'kind': 'charge', 'amount_dop': '1.00'}


@pytest.mark.parametrize('body', [
    {}, {'items': None}, {'items': [ITEM] * 101}, {'items': [], 'original_snapshot': {}},
    *[{'items': [{**ITEM, **patch}]} for patch in [
        {'amount_dop': '99999999999.99'}, {'amount_dop': '0.001'},
        {'amount_dop': 'NaN'}, {'amount_dop': 'Infinity'}, {'amount_dop': True},
        {'amount_dop': '-0.01'}, {'kind': 'discount', 'amount_dop': '0.01'},
        {'kind': 'tariff'}, {'label': ''}, {'label': '   '}, {'label': '\x00'}, {'label': 'x' * 201},
        {'label': 123}, {'position': 99}, {'bill_id': 'other'}, {'source': 'ocr'},
    ]],
])
def test_items_reject_unsafe_payload_before_mutation(client, body):
    _, _, url = setup_bill(client)
    assert client.put(url + '/items', json=body).status_code == 422
    assert client.get(url + '/items').json()['items'] == []


def test_items_accept_decimal_boundary_and_maximum_count_without_sum_overflow(client):
    _, _, url = setup_bill(client)
    result = client.put(url + '/items', json={'items': [{**ITEM, 'amount_dop': '9999999999.99'}] * 100})
    assert result.status_code == 200, result.text
    assert result.json()['items_total_dop'] == '999999999999.00'
    assert len(result.json()['items']) == 100
    assert client.get(url + '/items').json() == result.json()


def test_replace_items_preserves_order_signed_sum_and_records_atomic_history(client, migrated):
    from sqlalchemy import text
    _, bill, url = setup_bill(client)
    items = [{'label': 'Texto manual', 'kind': 'charge', 'amount_dop': '3200'},
             {'label': 'Corrección manual', 'kind': 'discount', 'amount_dop': '-100.25'}]
    response = client.put(url + '/items', json={'items': items})
    assert response.status_code == 200, response.text
    result = response.json()
    assert [i['position'] for i in result['items']] == [0, 1]
    assert result['items_total_dop'] == '3099.75'
    assert result['difference_dop'] == '-0.25'
    assert client.get(url + '/items').json() == result
    assert client.get(url).json()['amount_dop'] == '3100.00'
    assessment = client.post(url + '/validate').json()
    assert 'items_sum' in assessment['warnings']
    assert assessment['detail']['difference_dop'] == '-0.25'
    assert client.put(url + '/items', json={'items': []}).json()['items_total_dop'] is None
    with migrated.connect() as c:
        events = c.execute(text("SELECT before, after FROM audit_events WHERE entity='bill_items' AND entity_id=:b ORDER BY created_at,id"), {'b': bill['id']}).all()
        assert len(events) == 2
        assert events[0].before == {'items': []}
        assert events[0].after['items'][0]['amount_dop'] == '3200.00'
        assert events[1].before == events[0].after
        assert events[1].after == {'items': []}


def setup_bill(client, **fields):
    home = mk_home(client)
    response = client.post(bill_url(home['id']), json={**BILL, **fields})
    assert response.status_code == 201, response.text
    bill = response.json()
    return home, bill, bill_url(home['id'], bill['id'])


def test_creation_snapshot_is_immutable_and_corrections_keep_original(client, migrated):
    from sqlalchemy import inspect, text
    from sqlalchemy.exc import IntegrityError
    _, bill, url = setup_bill(client)
    assert 'bill_snapshots' in inspect(migrated).get_table_names()
    with migrated.connect() as c:
        original = c.execute(text('SELECT origin,data,captured_at FROM bill_snapshots WHERE bill_id=:b'), {'b': bill['id']}).one()
        assert original.origin == 'creation'
        assert original.data['amount_dop'] == '3100.00'
        assert original.captured_at is not None
    assert client.put(url, json={**BILL, 'amount_dop': '3000'}).status_code == 200
    with migrated.connect() as c:
        assert c.execute(text('SELECT data FROM bill_snapshots WHERE bill_id=:b'), {'b': bill['id']}).scalar_one() == original.data
        event = c.execute(text("SELECT before,after,created_at FROM audit_events WHERE entity='bills' AND operation='update' AND entity_id=:b"), {'b': bill['id']}).one()
        assert event.before['amount_dop'] == '3100.00'
        assert event.after['amount_dop'] == '3000.00'
        assert event.created_at is not None
    with pytest.raises(IntegrityError):
        with migrated.begin() as c:
            c.execute(text("UPDATE bill_snapshots SET data='{}' WHERE bill_id=:b"), {'b': bill['id']})
    with pytest.raises(IntegrityError):
        with migrated.begin() as c:
            c.execute(text('DELETE FROM bill_snapshots WHERE bill_id=:b'), {'b': bill['id']})
    assert client.put(url, json={**BILL, 'original_snapshot': {}}).status_code == 422
    assert client.delete(url).status_code == 204
    with migrated.connect() as c:
        assert c.execute(text('SELECT count(*) FROM bill_snapshots')).scalar_one() == 0


def test_validation_assesses_real_inputs_without_writes_or_human_approval(client, migrated):
    from sqlalchemy import text
    _, _, url = setup_bill(client, days=30, reading_previous='100', reading_current='350.5')
    client.put(url + '/items', json={'items': [{**ITEM, 'amount_dop': '3100'}]})
    with migrated.connect() as c:
        counts = c.execute(text('SELECT (SELECT count(*) FROM audit_events),(SELECT count(*) FROM bill_snapshots)')).one()
    response = client.post(url + '/validate', json={})
    assert response.status_code == 200, response.text
    assessment = response.json()
    assert assessment['read_only'] is True
    assert assessment['approval'] == 'not_performed'
    assert 'validated' not in assessment
    assert assessment['status'] == 'consistent'
    checks = {check['code']: check for check in assessment['checks']}
    assert checks['days_consistency']['status'] == 'pass'
    assert checks['days_consistency']['observed'] == {'declared_days': 30, 'elapsed_days': 30, 'inclusive_days': 31, 'convention': 'unspecified'}
    assert checks['readings_kwh']['status'] == 'pass'
    assert checks['items_sum']['status'] == 'pass'
    assert assessment['provenance']['origin'] == 'creation'
    assert assessment['provenance']['original_available'] is True
    assert assessment['provenance']['data']['amount_dop'] == '3100.00'
    client.put(url, json={**BILL, 'days': 2, 'reading_previous': '100', 'reading_current': '350'})
    assessment = client.post(url + '/validate').json()
    assert assessment['status'] == 'warnings'
    assert set(assessment['warnings']) == {'days_consistency', 'readings_kwh'}
    assert len(assessment['corrections']) == 2
    assert assessment['corrections'][-1]['before']['days'] == 30
    assert assessment['corrections'][-1]['after']['days'] == 2
    assert set(assessment['corrections'][-1]) == {'entity', 'operation', 'before', 'after', 'created_at'}
    with migrated.connect() as c:
        # Only the explicit bill correction adds an audit event.
        assert c.execute(text('SELECT count(*) FROM audit_events')).scalar_one() == counts[0] + 1
        assert c.execute(text('SELECT count(*) FROM bill_snapshots')).scalar_one() == counts[1]
    assert client.post(url + '/validate', json={'validated': True}).status_code == 422


def test_items_read_blocks_replacement_until_coherent_result_is_built(client, migrated, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event
    import uuid
    from sqlalchemy.orm import Session
    from app.services import bill_detail
    from app.schemas.bill_detail import BillItemsReplace
    home, bill, url = setup_bill(client)
    client.put(url + '/items', json={'items': [ITEM]})
    entered, release, finished = Event(), Event(), Event()
    original = bill_detail.get_bill

    def pause_reader(db, home_id, bill_id):
        result = original(db, home_id, bill_id)
        if db.info.get('reader'):
            entered.set()
            assert release.wait(5)
        return result

    monkeypatch.setattr(bill_detail, 'get_bill', pause_reader)

    def read():
        with Session(migrated) as db:
            db.info['reader'] = True
            return bill_detail.get_items(db, uuid.UUID(home['id']), uuid.UUID(bill['id']))

    def write():
        with Session(migrated) as db:
            bill_detail.replace_items(db, uuid.UUID(home['id']), uuid.UUID(bill['id']),
                                      BillItemsReplace(items=[{**ITEM, 'amount_dop': '20'}]))
            finished.set()

    with ThreadPoolExecutor(2) as pool:
        reader = pool.submit(read)
        assert entered.wait(5)
        writer = pool.submit(write)
        try:
            assert not finished.wait(0.3), 'write interleaved inside items assessment'
        finally:
            release.set()
        result = reader.result(5)
        writer.result(5)
    assert result.items_total_dop == 1
    assert client.get(url + '/items').json()['items_total_dop'] == '20.00'


def test_long_lived_session_does_not_return_stale_bill_amount(client, migrated):
    import uuid
    from sqlalchemy.orm import Session
    from app.services.bill_detail import get_items
    home, bill, url = setup_bill(client)
    with Session(migrated, expire_on_commit=False) as db:
        assert get_items(db, uuid.UUID(home['id']), uuid.UUID(bill['id'])).bill_amount_dop == 3100
        # End the read transaction while retaining the identity map.
        db.commit()
        from app.models import Bill
        cached = db.get(Bill, uuid.UUID(bill['id']))
        db.commit()
        assert client.put(url, json={**BILL, 'amount_dop': '123'}).status_code == 200
        assert get_items(db, uuid.UUID(home['id']), uuid.UUID(bill['id'])).bill_amount_dop == 123
        assert cached.amount_dop == 123


def test_empty_items_have_no_invented_total_and_legacy_shape_unchanged(client):
    home, bill, url = setup_bill(client)
    response = client.get(url + '/items')
    assert response.status_code == 200
    assert response.json() == {'home_id': home['id'], 'bill_id': bill['id'], 'items': [],
                               'items_total_dop': None, 'bill_amount_dop': '3100.00',
                               'difference_dop': None}
    assert set(client.get(url).json()) == set(bill)
