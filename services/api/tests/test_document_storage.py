"""ERD-STORE-01: cifrado en reposo, almacenes (local y S3 simulado), URLs firmadas, subida/descarga/borrado y cola."""
import base64
import io
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from PIL import Image
from sqlalchemy import text

from app.config import Settings, settings
from app.services import document_storage, documents
from app.services.errors import InvalidInput, NotFound
from app.services.storage import (DecryptionError, EncryptedStore, Keyring, LocalFileStore, ObjectMissing, S3Store,
                                  StorageFailure, set_store_for_tests)
from app.services.storage.crypto import decrypt, encrypt, key_id_of
from app.services.storage.signing import sign_download, verify_download
from tests.test_auth import AUTH, PASSWORD, auth_client, bearer, register  # noqa: F401

KEY_A = base64.urlsafe_b64encode(bytes(range(32))).decode()
KEY_B = base64.urlsafe_b64encode(bytes(range(100, 132))).decode()
SIGNING = secrets.token_urlsafe(48)
HOME, DOC = str(uuid.uuid4()), str(uuid.uuid4())
KEY = f'homes/{HOME}/documents/{DOC}'


def jpeg(size=(40, 30), color=(200, 30, 30)):
    out = io.BytesIO()
    Image.new('RGB', size, color).save(out, 'JPEG')
    return out.getvalue()


def png():
    out = io.BytesIO()
    Image.new('RGB', (8, 8), (0, 90, 200)).save(out, 'PNG')
    return out.getvalue()


PDF = b'%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF'


@pytest.fixture
def keyring():
    return Keyring.parse(f'k1:{KEY_A}')


@pytest.fixture
def storage(tmp_path, keyring, monkeypatch):
    """Almacén local cifrado en un directorio temporal; se restaura a «deshabilitado» al terminar."""
    monkeypatch.setitem(settings.__dict__, 'STORAGE_URL_SIGNING_KEY', SIGNING)
    store = EncryptedStore(LocalFileStore(tmp_path / 'objects'), keyring)
    set_store_for_tests(store)
    yield store
    set_store_for_tests(None)


# ---------- cifrado ----------
def test_roundtrip_and_ciphertext_hides_plaintext(keyring):
    plain = b'factura de luz ' * 50
    blob = encrypt(keyring, KEY, plain)
    assert plain not in blob and blob.startswith(b'ERD1') and key_id_of(blob) == 'k1'
    assert decrypt(keyring, KEY, blob) == plain
    assert encrypt(keyring, KEY, plain) != blob  # sal y nonce nuevos en cada cifrado


def test_tampering_wrong_key_and_object_swap_are_detected(keyring):
    blob = bytearray(encrypt(keyring, KEY, b'secreto'))
    blob[-1] ^= 1
    with pytest.raises(DecryptionError):
        decrypt(keyring, KEY, bytes(blob))
    good = encrypt(keyring, KEY, b'secreto')
    other_key = f'homes/{HOME}/documents/{uuid.uuid4()}'
    with pytest.raises(DecryptionError):  # copiar el objeto a otra clave no sirve: la clave va autenticada
        decrypt(keyring, other_key, good)
    with pytest.raises(DecryptionError):
        decrypt(Keyring.parse(f'k1:{KEY_B}'), KEY, good)
    for broken in (b'', b'ERD1', b'XXXX' + good[4:], good[:20]):
        with pytest.raises(DecryptionError):
            decrypt(keyring, KEY, broken)


def test_keyring_parsing_rejects_weak_or_malformed_keys():
    assert Keyring.parse(f'new:{KEY_B}, old:{KEY_A}').active_id == 'new'
    for bad in ('', 'k1', f'k1:{KEY_A},k1:{KEY_B}', 'k1:short', f'bad id:{KEY_A}', 'k1:' + base64.urlsafe_b64encode(b'a' * 32).decode()):
        with pytest.raises(ValueError):
            Keyring.parse(bad)


def test_key_rotation_reads_old_objects_and_reencrypts(tmp_path):
    inner = LocalFileStore(tmp_path)
    EncryptedStore(inner, Keyring.parse(f'old:{KEY_A}')).put(KEY, b'dato')
    rotated = EncryptedStore(inner, Keyring.parse(f'new:{KEY_B},old:{KEY_A}'))
    assert rotated.get(KEY) == b'dato' and key_id_of(inner.get(KEY)) == 'old'
    assert rotated.reencrypt(KEY) is True and key_id_of(inner.get(KEY)) == 'new'
    assert rotated.reencrypt(KEY) is False and rotated.get(KEY) == b'dato'
    forgotten = f'homes/{HOME}/documents/{uuid.uuid4()}'
    EncryptedStore(inner, Keyring.parse(f'old:{KEY_A}')).put(forgotten, b'sin rotar')
    with pytest.raises(DecryptionError):  # retirada la clave vieja, lo que quedó sin re-cifrar ya no se lee
        EncryptedStore(inner, Keyring.parse(f'new:{KEY_B}')).get(forgotten)


# ---------- almacenes ----------
def test_local_store_rejects_unsafe_keys_and_deletes_idempotently(tmp_path):
    store = LocalFileStore(tmp_path)
    for bad in ('../etc/passwd', f'homes/{HOME}/documents/../../x', '/absolute', f'homes/{HOME}/documents/{DOC}/extra', '', 'homes/x/documents/y'):
        with pytest.raises(ValueError):
            store.put(bad, b'x')
    store.put(KEY, b'a')
    store.put(KEY, b'b')
    assert store.get(KEY) == b'b'
    assert oct(os.stat(tmp_path / KEY).st_mode & 0o777) == '0o600'
    assert not [p for p in (tmp_path / 'homes').rglob('.part-*')]
    store.delete(KEY)
    store.delete(KEY)
    with pytest.raises(ObjectMissing):
        store.get(KEY)


def test_s3_store_keeps_only_ciphertext_and_maps_errors(keyring):
    boto3 = pytest.importorskip('boto3')
    from moto import mock_aws
    with mock_aws():
        client = boto3.client('s3', region_name='us-east-1', aws_access_key_id='x', aws_secret_access_key='y')
        client.create_bucket(Bucket='private-bucket')
        store = EncryptedStore(S3Store(client, 'private-bucket', prefix='prod'), keyring)
        store.put(KEY, b'contenido de la factura')
        raw = client.get_object(Bucket='private-bucket', Key=f'prod/{KEY}')['Body'].read()
        assert b'contenido' not in raw and store.get(KEY) == b'contenido de la factura'
        store.delete(KEY)
        store.delete(KEY)
        with pytest.raises(ObjectMissing):
            store.get(KEY)
        broken = EncryptedStore(S3Store(client, 'no-such-bucket'), keyring)
        with pytest.raises(StorageFailure) as failure:
            broken.put(KEY, b'x')
        assert 'no-such-bucket' not in str(failure.value)  # el mensaje no filtra detalles del proveedor


# ---------- URLs firmadas ----------
def test_signed_download_roundtrip_expiry_and_tampering(monkeypatch):
    monkeypatch.setitem(settings.__dict__, 'STORAGE_URL_SIGNING_KEY', SIGNING)
    now = datetime(2026, 10, 10, 12, tzinfo=timezone.utc)
    user = uuid.uuid4()
    token, expires = sign_download(DOC, HOME, user, now=now)
    assert expires == now + timedelta(seconds=settings.STORAGE_URL_TTL_SECONDS)
    claim = verify_download(token, now=now + timedelta(seconds=59))
    assert (str(claim.document_id), str(claim.home_id), claim.user_id) == (DOC, HOME, user)
    for bad in (token, 'garbage', '', 'v1..', 'v2.' + token[3:], token[:-2] + 'xx', token + 'a'):
        with pytest.raises(NotFound):
            verify_download(bad, now=now + timedelta(seconds=61 if bad == token else 1))
    body = token.split('.')[1]
    forged = base64.urlsafe_b64encode(base64.urlsafe_b64decode(body + '==').replace(DOC.encode(), str(uuid.uuid4()).encode())).decode().rstrip('=')
    with pytest.raises(NotFound):
        verify_download(f'v1.{forged}.{token.split(".")[2]}', now=now)
    monkeypatch.setitem(settings.__dict__, 'STORAGE_URL_SIGNING_KEY', secrets.token_urlsafe(48))
    with pytest.raises(NotFound):  # otra clave de firma no valida tokens ajenos
        verify_download(token, now=now)


# ---------- detección de tipo ----------
@pytest.mark.parametrize('content,expected', [
    (jpeg(), ('bill_photo', 'image/jpeg')), (png(), ('bill_photo', 'image/png')), (PDF, ('bill_pdf', 'application/pdf')),
    (b'RIFF\x00\x00\x00\x00WEBPVP8 ', ('bill_photo', 'image/webp')),
    (b'\x00\x00\x00\x18ftypheic\x00\x00\x00\x00', ('bill_photo', 'image/heic')),
    (b'\x00\x00\x00\x18ftypmif1\x00\x00\x00\x00', ('bill_photo', 'image/heif')),
])
def test_type_is_decided_by_bytes(content, expected):
    assert document_storage.sniff(content) == expected


@pytest.mark.parametrize('content', [b'<html><script>alert(1)</script></html>', b'MZ\x90\x00', b'GIF89a', b'plain text', b'\x00' * 20])
def test_unsupported_or_disguised_files_are_rejected(content):
    with pytest.raises(InvalidInput):
        document_storage.sniff(content)


# ---------- API ----------
def home_of(client, tokens, name='Casa'):
    return client.post('/api/v1/homes', headers=bearer(tokens), json={'name': name, 'distributor': 'EDESUR'}).json()['id']


def upload(client, tokens, home, content=None, name='factura.jpg', ctype='image/jpeg', **form):
    return client.post(f'/api/v1/homes/{home}/documents', headers=bearer(tokens),
                       files={'file': (name, jpeg() if content is None else content, ctype)}, data=form)


@pytest.fixture
def two_users(auth_client, storage):
    alice, bob = register(auth_client), register(auth_client, 'bob@example.com')
    return auth_client, alice, bob, home_of(auth_client, alice)


def test_upload_returns_metadata_without_internal_key_and_stores_ciphertext(two_users, storage, tmp_path):
    client, alice, _, home = two_users
    content = jpeg()
    r = upload(client, alice, home, content, source='mobile')
    assert r.status_code == 201, r.text
    body = r.json()
    assert r.headers['cache-control'] == 'no-store'
    assert set(body) == {'id', 'home_id', 'bill_id', 'kind', 'content_type', 'size_bytes', 'sha256', 'uploaded_via', 'created_at', 'retention_until'}
    assert body['kind'] == 'bill_photo' and body['content_type'] == 'image/jpeg' and body['uploaded_via'] == 'mobile'
    assert body['size_bytes'] == len(content) and body['bill_id'] is None and body['retention_until']
    on_disk = (tmp_path / 'objects' / 'homes' / home / 'documents' / body['id']).read_bytes()
    assert on_disk.startswith(b'ERD1') and content not in on_disk and content[:16] not in on_disk


def test_signed_url_downloads_the_exact_bytes_without_a_session(two_users):
    client, alice, _, home = two_users
    content = jpeg(color=(1, 2, 3))
    doc = upload(client, alice, home, content).json()
    issued = client.post(f'/api/v1/homes/{home}/documents/{doc["id"]}/download-url', headers=bearer(alice))
    assert issued.status_code == 200 and issued.headers['cache-control'] == 'no-store'
    url = issued.json()['url']
    assert url.startswith('/api/v1/documents/download?token=')
    got = client.get(url)  # sin Authorization: la firma sustituye a la sesión
    assert got.status_code == 200 and got.content == content
    assert got.headers['content-type'] == 'image/jpeg' and got.headers['x-content-type-options'] == 'nosniff'
    assert got.headers['cache-control'] == 'private, no-store' and 'attachment' in got.headers['content-disposition']
    assert got.headers['content-security-policy'] == "default-src 'none'; sandbox"
    assert doc['id'] in got.headers['content-disposition'] and 'factura.jpg' not in got.headers['content-disposition']


def test_pdf_roundtrip(two_users):
    client, alice, _, home = two_users
    doc = upload(client, alice, home, PDF, 'f.pdf', 'application/pdf').json()
    assert doc['kind'] == 'bill_pdf'
    url = client.post(f'/api/v1/homes/{home}/documents/{doc["id"]}/download-url', headers=bearer(alice)).json()['url']
    got = client.get(url)
    assert got.content == PDF and got.headers['content-type'] == 'application/pdf' and got.headers['content-disposition'].endswith('.pdf"')


def test_strangers_cannot_upload_list_read_or_ask_for_links(two_users):
    client, alice, bob, home = two_users
    doc = upload(client, alice, home).json()
    base = f'/api/v1/homes/{home}/documents'
    assert upload(client, bob, home).status_code == 404
    assert client.get(base, headers=bearer(bob)).status_code == 404
    assert client.get(f'{base}/{doc["id"]}', headers=bearer(bob)).status_code == 404
    assert client.post(f'{base}/{doc["id"]}/download-url', headers=bearer(bob)).status_code == 404
    assert client.delete(f'{base}/{doc["id"]}', headers=bearer(bob)).status_code == 404
    assert client.get(f'{base}/{doc["id"]}', headers=bearer(alice)).status_code == 200


def test_a_document_id_from_another_home_is_not_found(two_users):
    client, alice, _, home = two_users
    other = home_of(client, alice, 'Otra')
    doc = upload(client, alice, home).json()
    assert client.get(f'/api/v1/homes/{other}/documents/{doc["id"]}', headers=bearer(alice)).status_code == 404
    assert client.post(f'/api/v1/homes/{other}/documents/{doc["id"]}/download-url', headers=bearer(alice)).status_code == 404


def test_link_dies_when_the_person_leaves_the_home(two_users, migrated):
    client, alice, bob, home = two_users
    with migrated.begin() as c:
        c.execute(text("INSERT INTO home_members(home_id,user_id,role) SELECT :h,id,'member' FROM users WHERE email='bob@example.com'"), {'h': home})
    doc = upload(client, alice, home).json()
    url = client.post(f'/api/v1/homes/{home}/documents/{doc["id"]}/download-url', headers=bearer(bob)).json()['url']
    assert client.get(url).status_code == 200
    with migrated.begin() as c:
        c.execute(text("DELETE FROM home_members WHERE user_id=(SELECT id FROM users WHERE email='bob@example.com')"))
    assert client.get(url).status_code == 404


def test_expired_tampered_and_missing_links_are_all_404(two_users, monkeypatch):
    client, alice, _, home = two_users
    doc = upload(client, alice, home).json()
    url = client.post(f'/api/v1/homes/{home}/documents/{doc["id"]}/download-url', headers=bearer(alice)).json()['url']
    token = url.split('token=')[1]
    assert client.get('/api/v1/documents/download').status_code == 422
    assert client.get('/api/v1/documents/download?token=' + token[:-3] + 'abc').status_code == 404
    assert client.get('/api/v1/documents/download?token=short').status_code == 422
    from app.services.storage import signing
    real = signing.datetime

    class Later(real):
        @classmethod
        def now(cls, tz=None):
            return real.now(tz) + timedelta(seconds=settings.STORAGE_URL_TTL_SECONDS + 5)
    monkeypatch.setattr(signing, 'datetime', Later)
    assert client.get(url).status_code == 404


def test_download_route_is_not_listed_in_openapi_but_never_leaks_errors(two_users):
    client, *_ = two_users
    assert '/api/v1/documents/download' not in client.get('/openapi.json').json()['paths']
    r = client.get('/api/v1/documents/download?token=' + 'x' * 40)
    assert r.status_code == 404 and 'token' not in r.text.lower().replace('"code"', '')


def test_uploads_reject_bad_files(two_users):
    client, alice, _, home = two_users
    for content, name, ctype in [(b'', 'a.jpg', 'image/jpeg'), (b'<script>alert(1)</script>', 'a.jpg', 'image/jpeg'),
                                 (b'\xff\xd8\xff\xe0' + b'garbage' * 10, 'a.jpg', 'image/jpeg'), (b'MZ' + b'0' * 100, 'a.pdf', 'application/pdf')]:
        r = upload(client, alice, home, content, name, ctype)
        assert r.status_code == 422, (content[:6], r.text)
    assert client.get(f'/api/v1/homes/{home}/documents', headers=bearer(alice)).json() == []


def test_declared_type_and_filename_are_ignored(two_users):
    client, alice, _, home = two_users
    r = upload(client, alice, home, png(), '../../etc/passwd.exe', 'text/html')
    assert r.status_code == 201 and r.json()['content_type'] == 'image/png'


def test_size_limits_per_kind(two_users, monkeypatch):
    client, alice, _, home = two_users
    monkeypatch.setitem(settings.__dict__, 'DOCUMENT_MAX_PHOTO_BYTES', 2048)
    big = jpeg((600, 600))
    assert len(big) > 2048
    r = upload(client, alice, home, big)
    assert r.status_code == 422
    monkeypatch.setitem(settings.__dict__, 'DOCUMENT_MAX_PDF_BYTES', 4096)
    assert upload(client, alice, home, PDF + b'0' * 5000, 'a.pdf', 'application/pdf').status_code == 422
    assert upload(client, alice, home, PDF, 'a.pdf', 'application/pdf').status_code == 201


def test_pixel_bomb_is_rejected(two_users, monkeypatch):
    client, alice, _, home = two_users
    monkeypatch.setattr(document_storage, 'MAX_PIXELS', 100)
    assert upload(client, alice, home, jpeg((20, 20))).status_code == 422


def test_pending_documents_per_home_are_capped(two_users, monkeypatch):
    client, alice, _, home = two_users
    monkeypatch.setitem(settings.__dict__, 'DOCUMENT_MAX_UNCONFIRMED_PER_HOME', 2)
    for color in ((1, 1, 1), (2, 2, 2)):
        assert upload(client, alice, home, jpeg(color=color)).status_code == 201
    r = upload(client, alice, home, jpeg(color=(3, 3, 3)))
    assert r.status_code == 409 and r.json()['code'] == 'document_quota_exceeded'


def test_failed_storage_write_leaves_no_row(two_users, storage, monkeypatch):
    client, alice, _, home = two_users

    def broken(key, data):
        raise StorageFailure('boom')
    monkeypatch.setattr(storage.inner, 'put', broken)
    r = upload(client, alice, home)
    assert r.status_code == 503 and r.json()['code'] == 'storage_unavailable' and 'boom' not in r.text
    assert client.get(f'/api/v1/homes/{home}/documents', headers=bearer(alice)).json() == []


def test_disabled_storage_answers_503_everywhere(auth_client, monkeypatch):
    set_store_for_tests(None)
    alice = register(auth_client)
    home = home_of(auth_client, alice)
    assert upload(auth_client, alice, home).status_code == 503
    doc = str(uuid.uuid4())
    assert auth_client.post(f'/api/v1/homes/{home}/documents/{doc}/download-url', headers=bearer(alice)).status_code == 503
    monkeypatch.setitem(settings.__dict__, 'STORAGE_URL_SIGNING_KEY', SIGNING)
    token, _ = sign_download(doc, home, None)
    assert auth_client.get('/api/v1/documents/download?token=' + token).status_code == 503


def test_object_tampered_in_storage_is_never_served(two_users, tmp_path):
    client, alice, _, home = two_users
    doc = upload(client, alice, home).json()
    path = tmp_path / 'objects' / 'homes' / home / 'documents' / doc['id']
    raw = bytearray(path.read_bytes())
    raw[-3] ^= 0xFF
    path.write_bytes(bytes(raw))
    url = client.post(f'/api/v1/homes/{home}/documents/{doc["id"]}/download-url', headers=bearer(alice)).json()['url']
    r = client.get(url)
    assert r.status_code == 503 and r.json()['code'] == 'storage_unavailable'


def test_object_replaced_by_valid_ciphertext_of_other_content_fails_the_hash_check(two_users, storage):
    client, alice, _, home = two_users
    doc = upload(client, alice, home).json()
    storage.put(f'homes/{home}/documents/{doc["id"]}', b'otro contenido')
    url = client.post(f'/api/v1/homes/{home}/documents/{doc["id"]}/download-url', headers=bearer(alice)).json()['url']
    assert client.get(url).status_code == 503


def test_missing_object_is_404(two_users, storage):
    client, alice, _, home = two_users
    doc = upload(client, alice, home).json()
    storage.delete(f'homes/{home}/documents/{doc["id"]}')
    url = client.post(f'/api/v1/homes/{home}/documents/{doc["id"]}/download-url', headers=bearer(alice)).json()['url']
    assert client.get(url).status_code == 404


def test_list_filters_by_bill_and_delete_removes_object_through_the_queue(two_users, storage, migrated, tmp_path):
    client, alice, _, home = two_users
    first, second = upload(client, alice, home, jpeg(color=(9, 9, 9))).json(), upload(client, alice, home, jpeg(color=(8, 8, 8))).json()
    bill = client.post(f'/api/v1/homes/{home}/bills', headers=bearer(alice), json={
        'period_start': '2026-09-01', 'period_end': '2026-09-30', 'days': 30, 'kwh': '300', 'amount_dop': '3000'}).json()['id']
    with migrated.begin() as c:
        c.execute(text('UPDATE documents SET bill_id=:b, retention_until=NULL WHERE id=:d'), {'b': bill, 'd': first['id']})
    listed = client.get(f'/api/v1/homes/{home}/documents', headers=bearer(alice)).json()
    assert {d['id'] for d in listed} == {first['id'], second['id']}
    only = client.get(f'/api/v1/homes/{home}/documents?bill_id={bill}', headers=bearer(alice)).json()
    assert [d['id'] for d in only] == [first['id']]
    obj = tmp_path / 'objects' / 'homes' / home / 'documents' / first['id']
    assert obj.exists()
    assert client.delete(f'/api/v1/homes/{home}/documents/{first["id"]}', headers=bearer(alice)).status_code == 204
    assert obj.exists()  # el borrado del objeto lo hace la cola, no la petición
    from sqlalchemy.orm import Session
    with Session(migrated, expire_on_commit=False) as db:
        assert document_storage.drain_storage_deletions(db) == {'deleted': 1, 'failed': 0}
        assert document_storage.drain_storage_deletions(db) == {'deleted': 0, 'failed': 0}
    assert not obj.exists()


def test_drain_isolates_failures_and_retries(two_users, storage, migrated, monkeypatch):
    from sqlalchemy.orm import Session
    client, alice, _, home = two_users
    docs = [upload(client, alice, home, jpeg(color=(n, n, n))).json() for n in (10, 20)]
    for d in docs:
        client.delete(f'/api/v1/homes/{home}/documents/{d["id"]}', headers=bearer(alice))
    real_delete, calls = storage.inner.delete, []

    def flaky(key):
        calls.append(key)
        if len(calls) == 1:
            raise StorageFailure('network down: secret-host.example')
        real_delete(key)
    monkeypatch.setattr(storage.inner, 'delete', flaky)
    t0 = datetime.now(timezone.utc)
    with Session(migrated, expire_on_commit=False) as db:
        assert document_storage.drain_storage_deletions(db, now=t0) == {'deleted': 1, 'failed': 1}
    with migrated.connect() as c:
        row = c.execute(text('SELECT attempts, last_error, done_at FROM storage_deletions WHERE done_at IS NULL')).one()
    assert row.attempts == 1 and row.done_at is None and 'secret-host' not in (row.last_error or '')
    with Session(migrated, expire_on_commit=False) as db:
        assert document_storage.drain_storage_deletions(db, now=t0 + timedelta(seconds=1)) == {'deleted': 1, 'failed': 0}


def test_account_deletion_leaves_no_orphan_objects(two_users, storage, migrated, tmp_path):
    from sqlalchemy.orm import Session
    client, alice, _, home = two_users
    upload(client, alice, home)
    objects = tmp_path / 'objects'
    assert len([p for p in objects.rglob('*') if p.is_file()]) == 1
    assert client.delete(f'/api/v1/homes/{home}', headers=bearer(alice)).status_code == 204
    with Session(migrated, expire_on_commit=False) as db:
        assert document_storage.drain_storage_deletions(db)['deleted'] == 1
    assert [p for p in objects.rglob('*') if p.is_file()] == []


def test_reencrypt_all_rotates_to_the_active_key(two_users, storage, migrated, tmp_path):
    from sqlalchemy.orm import Session
    client, alice, _, home = two_users
    doc = upload(client, alice, home).json()
    storage.keyring = Keyring.parse(f'k2:{KEY_B},k1:{KEY_A}')
    with Session(migrated, expire_on_commit=False) as db:
        assert document_storage.reencrypt_all(db) == {'reencrypted': 1, 'already_current': 0, 'failed': 0}
        assert document_storage.reencrypt_all(db) == {'reencrypted': 0, 'already_current': 1, 'failed': 0}
    raw = (tmp_path / 'objects' / 'homes' / home / 'documents' / doc['id']).read_bytes()
    assert key_id_of(raw) == 'k2'


# ---------- configuración ----------
def settings_with(**env):
    base = dict(ENVIRONMENT='development', STORAGE_BACKEND='local', STORAGE_LOCAL_DIR='/tmp/x',
                STORAGE_ENCRYPTION_KEYS=f'k1:{KEY_A}', STORAGE_URL_SIGNING_KEY=SIGNING)
    base.update(env)
    return Settings(_env_file=None, **base)


def test_storage_config_validation():
    assert settings_with().STORAGE_BACKEND == 'local'
    assert Settings(_env_file=None).STORAGE_BACKEND == 'disabled'  # por omisión no se guarda nada
    for bad in (dict(STORAGE_ENCRYPTION_KEYS=''), dict(STORAGE_ENCRYPTION_KEYS='k1:weak'), dict(STORAGE_URL_SIGNING_KEY='short'),
                dict(STORAGE_URL_SIGNING_KEY='change_me' * 6), dict(STORAGE_LOCAL_DIR=''), dict(STORAGE_BACKEND='s3')):
        with pytest.raises(ValueError):
            settings_with(**bad)
    assert settings_with(STORAGE_BACKEND='s3', STORAGE_S3_BUCKET='b', STORAGE_S3_ACCESS_KEY_ID='a', STORAGE_S3_SECRET_ACCESS_KEY='s')


def test_secrets_never_appear_in_settings_repr():
    shown = repr(settings_with(STORAGE_BACKEND='s3', STORAGE_S3_BUCKET='b', STORAGE_S3_ACCESS_KEY_ID='AKIASECRET', STORAGE_S3_SECRET_ACCESS_KEY='topsecret'))
    for secret in (KEY_A, SIGNING, 'AKIASECRET', 'topsecret'):
        assert secret not in shown


# ---------- mantenimiento ----------
def test_maintenance_expires_drains_and_purges(two_users, storage, migrated, tmp_path):
    from sqlalchemy.orm import Session
    from scripts import storage_maintenance
    client, alice, _, home = two_users
    doc = upload(client, alice, home).json()
    obj = tmp_path / 'objects' / 'homes' / home / 'documents' / doc['id']
    with migrated.begin() as c:
        c.execute(text("UPDATE documents SET retention_until = now() - interval '1 minute'"))
    with Session(migrated, expire_on_commit=False) as db:
        report = storage_maintenance.run(db)
    assert report == {'expired': 1, 'deleted': 1, 'failed': 0, 'purged': 0} and not obj.exists()
    with Session(migrated, expire_on_commit=False) as db:
        assert storage_maintenance.run(db) == {'expired': 0, 'deleted': 0, 'failed': 0, 'purged': 0}
    with migrated.begin() as c:
        c.execute(text("UPDATE storage_deletions SET done_at = now() - interval '8 days'"))
    with Session(migrated, expire_on_commit=False) as db:
        assert storage_maintenance.run(db)['purged'] == 1


def test_maintenance_cli_exit_codes(migrated, monkeypatch, capsys):
    from sqlalchemy.orm import sessionmaker
    from scripts import storage_maintenance
    monkeypatch.setattr(storage_maintenance, 'SessionLocal', sessionmaker(bind=migrated, expire_on_commit=False))
    set_store_for_tests(None)
    assert storage_maintenance.main([]) == 2
    assert 'STORAGE_BACKEND' in capsys.readouterr().err


# ---------- auditoría C-08: el tope del cuerpo no impide subir archivos legítimos ----------
def _noisy_jpeg(side=900):
    out = io.BytesIO()
    Image.frombytes('RGB', (side, side), os.urandom(side * side * 3)).save(out, 'JPEG', quality=95)
    return out.getvalue()


def test_a_photo_bigger_than_the_json_body_limit_still_uploads(two_users):
    client, alice, _, home = two_users
    content = _noisy_jpeg()
    assert settings.MAX_REQUEST_BODY_BYTES < len(content) < settings.DOCUMENT_MAX_PHOTO_BYTES
    assert upload(client, alice, home, content).status_code == 201


def test_a_body_beyond_the_upload_envelope_is_refused_with_413_before_parsing(two_users, monkeypatch):
    client, alice, _, home = two_users
    monkeypatch.setitem(settings.__dict__, 'DOCUMENT_MAX_PHOTO_BYTES', 4096)
    monkeypatch.setitem(settings.__dict__, 'DOCUMENT_MAX_PDF_BYTES', 8192)
    monkeypatch.setitem(settings.__dict__, 'UPLOAD_BODY_OVERHEAD_BYTES', 4096)
    r = upload(client, alice, home, b'\xff\xd8\xff' + b'0' * 20_000)
    assert r.status_code == 413 and r.json()['code'] == 'http_413'
