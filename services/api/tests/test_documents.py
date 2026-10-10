"""ERD-DB-DOCUMENTS: modelo `documents`, procedencia inmutable, retención y cola de borrado de almacenamiento."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from alembic import command
from sqlalchemy import inspect, text
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.services import documents
from app.services.errors import InvalidInput, NotFound
from tests.test_auth import auth_client  # noqa: F401 (fixture)

SHA = 'a' * 64
NOW = datetime(2026, 10, 10, 12, 0, tzinfo=timezone.utc)


def sql(engine, statement, **params):
    with engine.begin() as c:
        return c.execute(text(statement), params).scalar()


def make_user(engine, email='alice@example.com'):
    return sql(engine, "INSERT INTO users(id,email,password_hash) VALUES(gen_random_uuid(),:e,'x') RETURNING id", e=email)


def make_home(engine, owner=None, name='Casa'):
    home = sql(engine, "INSERT INTO homes(id,name,distributor) VALUES(gen_random_uuid(),:n,'EDESUR') RETURNING id", n=name)
    if owner:
        sql(engine, "INSERT INTO home_members(home_id,user_id,role) VALUES(:h,:u,'owner') RETURNING 1", h=home, u=owner)
    return home


def make_bill(engine, home, start='2026-09-01', end='2026-09-30'):
    return sql(engine, "INSERT INTO bills(id,home_id,period_start,period_end,kwh,amount_dop,days,source) "
                       "VALUES(gen_random_uuid(),:h,:s,:e,300,3000,30,'manual') RETURNING id", h=home, s=start, e=end)


def register(db, home, user, **overrides):
    args = dict(kind='bill_photo', content_type='image/jpeg', size_bytes=2048, sha256=SHA, uploaded_via='mobile', now=NOW)
    args.update(overrides)
    return documents.register_document(db, home, user, **args)


def outbox(engine):
    with engine.connect() as c:
        return sorted(r[0] for r in c.execute(text('SELECT storage_key FROM storage_deletions')))


@pytest.fixture
def ctx(migrated):
    user = make_user(migrated)
    home = make_home(migrated, user)
    with Session(migrated, expire_on_commit=False) as db:  # igual que SessionLocal
        yield migrated, db, home, user


def test_migration_roundtrip_keeps_other_data(migrated, alembic_cfg):
    user = make_user(migrated)
    command.downgrade(alembic_cfg, '0013')
    tables = inspect(migrated).get_table_names()
    assert 'documents' not in tables and 'storage_deletions' not in tables
    with migrated.connect() as c:
        assert c.execute(text('SELECT count(*) FROM users')).scalar() == 1
    command.upgrade(alembic_cfg, 'head')
    assert {'documents', 'storage_deletions'} <= set(inspect(migrated).get_table_names())
    assert sql(migrated, 'SELECT count(*) FROM users') == 1 and user


def test_register_stores_provenance_and_an_unconfirmed_retention(ctx):
    engine, db, home, user = ctx
    doc = register(db, home, user)
    assert doc.home_id == home and doc.uploaded_by == user and doc.bill_id is None
    assert doc.storage_key == f'homes/{home}/documents/{doc.id}'
    assert (doc.kind, doc.content_type, doc.size_bytes, doc.sha256, doc.uploaded_via) == ('bill_photo', 'image/jpeg', 2048, SHA, 'mobile')
    assert doc.retention_until == NOW + timedelta(days=settings.DOCUMENT_UNCONFIRMED_RETENTION_DAYS)


@pytest.mark.parametrize('overrides', [
    {'kind': 'selfie'}, {'kind': 'bill_pdf'},                           # pdf con content-type de imagen
    {'content_type': 'application/zip'}, {'content_type': 'image/svg+xml'},
    {'size_bytes': 0}, {'size_bytes': -1}, {'size_bytes': settings.DOCUMENT_MAX_PHOTO_BYTES + 1},
    {'sha256': 'A' * 64}, {'sha256': 'a' * 63}, {'sha256': 'g' * 64},
    {'uploaded_via': 'fax'},
])
def test_register_rejects_invalid_metadata_without_writing(ctx, overrides):
    engine, db, home, user = ctx
    with pytest.raises(InvalidInput):
        register(db, home, user, **overrides)
    assert sql(engine, 'SELECT count(*) FROM documents') == 0


def test_pdf_has_its_own_larger_limit(ctx):
    engine, db, home, user = ctx
    ok = register(db, home, user, kind='bill_pdf', content_type='application/pdf', size_bytes=settings.DOCUMENT_MAX_PDF_BYTES)
    assert ok.kind == 'bill_pdf'
    with pytest.raises(InvalidInput):
        register(db, home, user, kind='bill_pdf', content_type='application/pdf', size_bytes=settings.DOCUMENT_MAX_PDF_BYTES + 1)


def test_attach_to_bill_clears_retention_and_is_one_way(ctx):
    engine, db, home, user = ctx
    bill, other_bill = make_bill(engine, home), make_bill(engine, home, '2026-10-01', '2026-10-31')
    doc = register(db, home, user)
    attached = documents.attach_to_bill(db, home, doc.id, bill)
    assert attached.bill_id == bill and attached.retention_until is None
    assert documents.attach_to_bill(db, home, doc.id, bill).bill_id == bill          # idempotente
    with pytest.raises(InvalidInput):
        documents.attach_to_bill(db, home, doc.id, other_bill)                       # no se mueve a otra factura


def test_attach_rejects_a_bill_from_another_home_and_unknown_ids(ctx):
    engine, db, home, user = ctx
    foreign_bill = make_bill(engine, make_home(engine, name='Ajena'))
    doc = register(db, home, user)
    with pytest.raises(NotFound):
        documents.attach_to_bill(db, home, doc.id, foreign_bill)
    with pytest.raises(NotFound):
        documents.attach_to_bill(db, home, doc.id, uuid.uuid4())
    with pytest.raises(NotFound):
        documents.attach_to_bill(db, home, uuid.uuid4(), foreign_bill)
    assert documents.get_document(db, home, doc.id).bill_id is None


def test_database_also_refuses_a_cross_home_bill_and_content_edits(ctx):
    engine, db, home, user = ctx
    foreign_bill = make_bill(engine, make_home(engine, name='Ajena'))
    doc = register(db, home, user)
    with pytest.raises(DBAPIError), engine.begin() as c:
        c.execute(text('UPDATE documents SET bill_id=:b WHERE id=:d'), {'b': foreign_bill, 'd': doc.id})
    stranger = make_user(engine, 'mallory@example.com')
    for column, value in (('sha256', 'b' * 64), ('storage_key', 'x/y'), ('size_bytes', 1), ('content_type', 'image/png'),
                          ('home_id', make_home(engine, name='Otra')), ('uploaded_by', stranger), ('kind', 'bill_pdf')):
        with pytest.raises(DBAPIError), engine.begin() as c:
            c.execute(text(f'UPDATE documents SET {column}=:v WHERE id=:d'), {'v': value, 'd': doc.id})


def test_database_requires_a_retention_date_for_unattached_documents(ctx):
    engine, db, home, user = ctx
    with pytest.raises(IntegrityError), engine.begin() as c:
        c.execute(text("INSERT INTO documents(id,home_id,kind,content_type,size_bytes,sha256,storage_key,uploaded_via) "
                       "VALUES(gen_random_uuid(),:h,'bill_photo','image/jpeg',1,:s,'k1','web')"), {'h': home, 's': SHA})


def test_list_and_get_are_scoped_to_the_home(ctx):
    engine, db, home, user = ctx
    other_home = make_home(engine, name='Otra')
    mine, theirs = register(db, home, user), register(db, other_home, user)
    assert [d.id for d in documents.list_documents(db, home)] == [mine.id]
    with pytest.raises(NotFound):
        documents.get_document(db, home, theirs.id)
    bill = make_bill(engine, home)
    documents.attach_to_bill(db, home, mine.id, bill)
    other = register(db, home, user)
    assert [d.id for d in documents.list_documents(db, home, bill_id=bill)] == [mine.id]
    assert {d.id for d in documents.list_documents(db, home)} == {mine.id, other.id}


def test_delete_document_removes_the_row_and_queues_the_object(ctx):
    engine, db, home, user = ctx
    doc = register(db, home, user)
    documents.delete_document(db, home, doc.id)
    assert sql(engine, 'SELECT count(*) FROM documents') == 0
    assert outbox(engine) == [f'homes/{home}/documents/{doc.id}']
    with pytest.raises(NotFound):
        documents.delete_document(db, home, doc.id)


def test_deleting_a_bill_deletes_its_documents_and_queues_the_objects(ctx):
    engine, db, home, user = ctx
    bill = make_bill(engine, home)
    kept, attached = register(db, home, user), register(db, home, user)
    documents.attach_to_bill(db, home, attached.id, bill)
    sql(engine, 'DELETE FROM bills WHERE id=:b RETURNING 1', b=bill)
    assert sql(engine, 'SELECT count(*) FROM documents') == 1
    assert outbox(engine) == [attached.storage_key] and kept.storage_key not in outbox(engine)


def test_deleting_a_home_queues_every_document_object(ctx):
    engine, db, home, user = ctx
    keys = sorted(register(db, home, user).storage_key for _ in range(3))
    sql(engine, 'DELETE FROM homes WHERE id=:h RETURNING 1', h=home)
    assert sql(engine, 'SELECT count(*) FROM documents') == 0
    assert outbox(engine) == keys


def test_deleting_the_uploader_keeps_the_document_but_drops_the_link(ctx):
    engine, db, home, user = ctx
    other = make_user(engine, 'bob@example.com')
    doc = register(db, home, user)
    sql(engine, 'DELETE FROM home_members WHERE user_id=:u RETURNING 1', u=user)
    sql(engine, 'DELETE FROM users WHERE id=:u RETURNING 1', u=user)
    assert sql(engine, 'SELECT uploaded_by FROM documents WHERE id=:d', d=doc.id) is None
    assert outbox(engine) == [] and other


def test_account_deletion_queues_the_objects_of_the_erased_home(auth_ctx):
    from app.services import account
    engine, client, tokens, home = auth_ctx
    with Session(engine, expire_on_commit=False) as db:
        user = db.execute(text("SELECT id FROM users WHERE email='alice@example.com'")).scalar_one()
        doc = register(db, home, user)
        from app.models.auth import User
        account.delete_account(db, db.get(User, user), 'valid-test-password-123')
    assert sql(engine, 'SELECT count(*) FROM documents') == 0
    assert outbox(engine) == [doc.storage_key]


@pytest.fixture
def auth_ctx(auth_client, migrated):
    from tests.test_auth import bearer, register as register_user
    tokens = register_user(auth_client)
    home = auth_client.post('/api/v1/homes', headers=bearer(tokens), json={'name': 'Casa', 'distributor': 'EDESUR'}).json()['id']
    return migrated, auth_client, tokens, uuid.UUID(home)


def test_expire_unconfirmed_removes_only_overdue_unattached_documents(ctx):
    engine, db, home, user = ctx
    bill = make_bill(engine, home)
    overdue = register(db, home, user, now=NOW - timedelta(days=30))
    fresh = register(db, home, user, now=NOW)
    attached = register(db, home, user, now=NOW - timedelta(days=30))
    documents.attach_to_bill(db, home, attached.id, bill)
    assert documents.expire_unconfirmed(db, now=NOW) == 1
    assert {d.id for d in documents.list_documents(db, home)} == {fresh.id, attached.id}
    assert outbox(engine) == [overdue.storage_key]
    assert documents.expire_unconfirmed(db, now=NOW) == 0


def test_outbox_claims_are_exclusive_leased_and_retried(ctx):
    engine, db, home, user = ctx
    docs = [register(db, home, user) for _ in range(3)]
    for doc in docs:
        documents.delete_document(db, home, doc.id)
    with Session(engine) as a, Session(engine) as b:
        first = documents.claim_storage_deletions(a, limit=2, now=NOW, lease_seconds=60)
        second = documents.claim_storage_deletions(b, limit=5, now=NOW, lease_seconds=60)
        assert len(first) == 2 and len(second) == 1
        assert not {r.id for r in first} & {r.id for r in second}
        # Con la concesión vigente nadie más lo recibe; vencida, vuelve a ofrecerse.
        assert documents.claim_storage_deletions(b, limit=5, now=NOW + timedelta(seconds=30), lease_seconds=60) == []
        again = documents.claim_storage_deletions(b, limit=5, now=NOW + timedelta(seconds=61), lease_seconds=60)
        assert len(again) == 3
        documents.complete_storage_deletions(b, [r.id for r in again[:2]], now=NOW + timedelta(seconds=62))
        documents.fail_storage_deletion(b, again[2].id, 'timeout', now=NOW + timedelta(seconds=62))
    assert sql(engine, 'SELECT count(*) FROM storage_deletions WHERE done_at IS NULL') == 1
    with engine.connect() as c:
        row = c.execute(text('SELECT attempts, last_error FROM storage_deletions WHERE done_at IS NULL')).one()
    assert (row.last_error, row.attempts) == ('timeout', 2)


def test_done_rows_are_purged_after_the_grace_period(ctx):
    engine, db, home, user = ctx
    doc = register(db, home, user)
    documents.delete_document(db, home, doc.id)
    row = documents.claim_storage_deletions(db, limit=1, now=NOW, lease_seconds=60)[0]
    documents.complete_storage_deletions(db, [row.id], now=NOW)
    assert documents.purge_completed_deletions(db, now=NOW + timedelta(days=1), keep_days=7) == 0
    assert documents.purge_completed_deletions(db, now=NOW + timedelta(days=8), keep_days=7) == 1
