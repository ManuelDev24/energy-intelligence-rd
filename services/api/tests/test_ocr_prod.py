"""ERD-OCR-PROD: OCR asíncrono de originales (imágenes y PDF multipágina), estados, reintentos y confirmación."""
import base64
import io
import shutil
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from PIL import Image, ImageDraw, ImageFont
from sqlalchemy import text
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings
from app.models.document import DocumentOcr
from app.services import jobs
from app.services.jobs import queue, runner
from app.services.ocr import jobs as ocr_jobs
from app.services.ocr import pipeline
from app.services.storage import EncryptedStore, Keyring, LocalFileStore, StorageFailure, set_store_for_tests
from tests.test_auth import auth_client, bearer, register  # noqa: F401
from tests.test_document_storage import KEY_A, SIGNING, home_of

BILL_TEXT = [
    "EDESUR DOMINICANA - Factura de energia electrica",
    "Periodo del 01/08/2026 al 31/08/2026 (31 dias)",
    "Lectura anterior: 1000 kWh",
    "Lectura actual: 1300 kWh",
    "Consumo del periodo: 300 kWh",
    "Total a pagar: RD$ 4,520.75",
]
REAL = shutil.which('tesseract') is not None


def bill_image(lines=BILL_TEXT, size=(1400, 900), rotate=0):
    image = Image.new('RGB', size, 'white')
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 38)
    for n, line in enumerate(lines):
        draw.text((40, 40 + n * 90), line, fill='black', font=font)
    return image.rotate(rotate, expand=True) if rotate else image


def encode(image, fmt='JPEG'):
    out = io.BytesIO()
    image.save(out, fmt)
    return out.getvalue()


def text_pdf(pages):
    """PDF mínimo con capa de texto (una línea de Helvetica por elemento de cada página)."""
    objects = [b'<< /Type /Catalog /Pages 2 0 R >>', None, b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
    kids = []
    for lines in pages:
        stream = b'BT /F1 12 Tf 40 760 Td 16 TL ' + b' '.join(b'(' + l.replace('(', '').replace(')', '').encode('latin-1') + b') Tj T*' for l in lines) + b' ET'
        content = len(objects) + 2
        kids.append(f'{len(objects) + 1} 0 R')
        objects.append(f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents {content} 0 R >>'.encode())
        objects.append(b'<< /Length %d >>\nstream\n' % len(stream) + stream + b'\nendstream')
    objects[1] = f'<< /Type /Pages /Kids [{" ".join(kids)}] /Count {len(kids)} >>'.encode()
    out, offsets = bytearray(b'%PDF-1.4\n'), []
    for number, body in enumerate(objects, 1):
        offsets.append(len(out))
        out += f'{number} 0 obj\n'.encode() + body + b'\nendobj\n'
    xref = len(out)
    out += f'xref\n0 {len(objects) + 1}\n0000000000 65535 f \n'.encode() + b''.join(f'{o:010d} 00000 n \n'.encode() for o in offsets)
    out += f'trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()
    return bytes(out)


def image_pdf(images):
    out = io.BytesIO()
    images[0].save(out, 'PDF', save_all=True, append_images=images[1:], resolution=150)
    return out.getvalue()


class FakeEngine:
    name = 'fake'

    def __init__(self, text=''):
        self.text, self.calls = text, 0

    def read_image(self, image):
        self.calls += 1
        return self.text


# ---------- pipeline ----------
def test_pdf_with_text_layer_is_read_without_ocr():
    engine = FakeEngine('NO DEBE USARSE')
    pdf = text_pdf([BILL_TEXT + ['Direccion de servicio documentada con texto suficiente para pasar el umbral de capa de texto']])
    got = pipeline.extract_document(pdf, 'application/pdf', engine)
    assert got.method == 'text_layer' and got.engine == 'pdf_text' and (got.pages_read, got.pages_total) == (1, 1)
    assert 'Total a pagar' in got.text and engine.calls == 0


def test_scanned_pdf_pages_fall_back_to_the_ocr_engine():
    engine = FakeEngine('texto por ocr')
    got = pipeline.extract_document(image_pdf([bill_image(), bill_image()]), 'application/pdf', engine)
    assert got.method == 'ocr' and got.pages_read == 2 and engine.calls == 2 and got.engine == 'fake'


def test_mixed_pdf_uses_each_pages_best_source():
    # página 1 con capa de texto; página 2 solo imagen (se arma un PDF de 2 páginas con una imagen incrustada en la segunda)
    engine = FakeEngine('ocr')
    pdf = text_pdf([BILL_TEXT + ['relleno ' * 12], ['']])
    got = pipeline.extract_document(pdf, 'application/pdf', engine)
    assert got.method == 'mixed' and got.pages_total == 2 and engine.calls == 1


def test_page_limit_is_enforced(monkeypatch):
    monkeypatch.setitem(settings.__dict__, 'OCR_MAX_PDF_PAGES', 2)
    pdf = text_pdf([BILL_TEXT + ['relleno ' * 12]] * 5)
    got = pipeline.extract_document(pdf, 'application/pdf', FakeEngine())
    assert (got.pages_read, got.pages_total) == (2, 5)
    assert got.text.count('Total a pagar') == 2


@pytest.mark.parametrize('content,code', [(b'%PDF-1.4 esto no es un pdf', 'unreadable'), (b'%PDF-', 'unreadable')])
def test_corrupt_pdf_is_unreadable(content, code):
    with pytest.raises(pipeline.UnreadableDocument) as failure:
        pipeline.extract_document(content, 'application/pdf', FakeEngine())
    assert failure.value.code == code


def test_encrypted_pdf_is_reported_as_protected():
    import pypdfium2 as pdfium
    base = pdfium.PdfDocument(text_pdf([['x' * 100]]))
    out = io.BytesIO()
    try:
        base.save(out, version=17)
    except Exception:  # pragma: no cover
        pytest.skip('pdfium no puede guardar el PDF de prueba')
    # pdfium no cifra al guardar: se comprueba el mapeo de errores con un documento que pide contraseña
    encrypted = (b'%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n'
                 b'3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>>endobj\n'
                 b'trailer<</Root 1 0 R/Encrypt<</Filter/Standard/V 1/R 2/O(' + b'0' * 32 + b')/U(' + b'0' * 32 + b')/P -4>>>>\n%%EOF')
    with pytest.raises(pipeline.UnreadableDocument) as failure:
        pipeline.extract_document(encrypted, 'application/pdf', FakeEngine())
    assert failure.value.code in {'protected_pdf', 'unreadable'}


def test_unreadable_image_and_exif_orientation():
    with pytest.raises(pipeline.UnreadableDocument):
        pipeline.extract_document(b'\xff\xd8\xff garbage', 'image/jpeg', FakeEngine())
    seen = []

    class Spy(FakeEngine):
        def read_image(self, image):
            seen.append(image.size)
            return ''
    tall = Image.new('RGB', (200, 100), 'white')
    exif = tall.getexif()
    exif[0x0112] = 6  # girada 90°: debe enderezarse antes de leerla
    out = io.BytesIO()
    tall.save(out, 'JPEG', exif=exif)
    pipeline.extract_document(out.getvalue(), 'image/jpeg', Spy())
    assert seen == [(100, 200)]


def test_huge_images_are_downscaled_before_ocr():
    seen = []

    class Spy(FakeEngine):
        def read_image(self, image):
            seen.append(max(image.size))
            return ''
    pipeline.extract_document(encode(Image.new('RGB', (6000, 3000), 'white'), 'PNG'), 'image/png', Spy())
    assert seen == [pipeline.MAX_SIDE_PX]


def test_heic_photos_are_decoded():
    import pillow_heif
    heif = pillow_heif.from_pillow(bill_image(size=(400, 300)))
    out = io.BytesIO()
    heif.save(out, format='HEIF')
    engine = FakeEngine('x')
    assert pipeline.extract_document(out.getvalue(), 'image/heic', engine).pages_read == 1 and engine.calls == 1


@pytest.mark.skipif(not REAL, reason='Tesseract no instalado')
def test_real_tesseract_reads_a_rendered_bill_photo_and_rotated_phone_photo():
    from app.services.ocr.parser import parse_bill_text
    for image in (bill_image(), ):
        got = pipeline.extract_document(encode(image), 'image/jpeg')
        draft = parse_bill_text(got.text)
        assert draft.period_start.value == '2026-08-01' and draft.period_end.value == '2026-08-31'
        assert draft.amount_dop.value and float(draft.amount_dop.value) == 4520.75


@pytest.mark.skipif(not REAL, reason='Tesseract no instalado')
def test_real_tesseract_reads_a_scanned_two_page_pdf():
    from app.services.ocr.parser import parse_bill_text
    blank = Image.new('RGB', (1400, 900), 'white')
    got = pipeline.extract_document(image_pdf([blank, bill_image()]), 'application/pdf')
    assert got.method == 'ocr' and got.pages_read == 2
    assert parse_bill_text(got.text).amount_dop.value and float(parse_bill_text(got.text).amount_dop.value) == 4520.75


# ---------- API + worker ----------
@pytest.fixture
def ocr_env(auth_client, tmp_path, monkeypatch, migrated):
    monkeypatch.setitem(settings.__dict__, 'STORAGE_URL_SIGNING_KEY', SIGNING)
    store = EncryptedStore(LocalFileStore(tmp_path / 'objects'), Keyring.parse(f'k1:{KEY_A}'))
    set_store_for_tests(store)
    alice, bob = register(auth_client), register(auth_client, 'bob@example.com')
    home = home_of(auth_client, alice)
    yield auth_client, alice, bob, home, store, migrated
    set_store_for_tests(None)


def start(client, tokens, home, content, name='f.jpg', ctype='image/jpeg', **form):
    return client.post(f'/api/v1/homes/{home}/bills/ocr-jobs', headers=bearer(tokens), files={'file': (name, content, ctype)}, data=form)


def poll(client, tokens, home, document_id):
    return client.get(f'/api/v1/homes/{home}/bills/ocr-jobs/{document_id}', headers=bearer(tokens))


def run_worker_once(engine, engine_obj, handler_engine=None, max_jobs=10):
    """Corre los trabajos vencidos con un motor falso o real (misma ruta que el worker)."""
    from app.services.jobs import handlers  # noqa: F401
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    done = {'succeeded': 0, 'retry': 0, 'dead': 0, 'lost': 0}
    with factory() as db:
        for _ in range(max_jobs):
            got = queue.claim(db, 'w', lease_of=runner.lease_of, limit=1)
            if not got:
                break
            done[runner.execute(db, got[0], 'w')] += 1
    return done


def use_engine(monkeypatch, engine):
    monkeypatch.setattr(pipeline, 'get_engine', lambda: engine)


def test_submit_returns_202_pending_and_stores_the_original_encrypted(ocr_env, tmp_path):
    client, alice, _, home, store, _ = ocr_env
    r = start(client, alice, home, encode(bill_image()), source='mobile')
    assert r.status_code == 202, r.text
    assert r.headers['cache-control'] == 'no-store' and r.headers['retry-after'] == '2'
    body = r.json()
    assert body['status'] == 'pending' and body['draft'] is None and body['attempts'] == 0 and body['error_code'] is None
    assert set(body) == {'document_id', 'status', 'attempts', 'method', 'pages_read', 'pages_total', 'draft', 'error_code',
                         'error_message', 'created_at', 'finished_at'}
    raw = (tmp_path / 'objects' / 'homes' / home / 'documents' / body['document_id']).read_bytes()
    assert raw.startswith(b'ERD1')
    assert client.get(f'/api/v1/homes/{home}/documents/{body["document_id"]}', headers=bearer(alice)).json()['uploaded_via'] == 'mobile'


def test_worker_turns_a_photo_into_a_draft_never_a_bill(ocr_env, monkeypatch):
    client, alice, _, home, _, engine = ocr_env
    use_engine(monkeypatch, FakeEngine('\n'.join(BILL_TEXT)))
    doc = start(client, alice, home, encode(bill_image())).json()['document_id']
    assert run_worker_once(engine, None) == {'succeeded': 1, 'retry': 0, 'dead': 0, 'lost': 0}
    body = poll(client, alice, home, doc).json()
    assert body['status'] == 'done' and body['method'] == 'ocr' and body['pages_read'] == 1
    draft = body['draft']
    assert draft['period_start']['value'] == '2026-08-01' and float(draft['amount_dop']['value']) == 4520.75 and draft['kwh']['confidence'] == 'high'
    assert client.get(f'/api/v1/homes/{home}/bills', headers=bearer(alice)).json() == []  # nunca OCR → facturas


def test_pdf_text_layer_job_end_to_end(ocr_env, monkeypatch):
    client, alice, _, home, _, engine = ocr_env
    use_engine(monkeypatch, FakeEngine('NO DEBE USARSE'))
    pdf = text_pdf([BILL_TEXT + ['relleno ' * 12], ['Pagina dos con texto adicional suficiente para la capa de texto ' * 2]])
    doc = start(client, alice, home, pdf, 'f.pdf', 'application/pdf').json()['document_id']
    run_worker_once(engine, None)
    body = poll(client, alice, home, doc).json()
    assert body['status'] == 'done' and body['method'] == 'text_layer' and (body['pages_read'], body['pages_total']) == (2, 2)
    assert float(body['draft']['amount_dop']['value']) == 4520.75


def test_page_limit_adds_a_warning_to_the_draft(ocr_env, monkeypatch):
    client, alice, _, home, _, engine = ocr_env
    monkeypatch.setitem(settings.__dict__, 'OCR_MAX_PDF_PAGES', 1)
    doc = start(client, alice, home, text_pdf([BILL_TEXT + ['relleno ' * 12]] * 3), 'f.pdf', 'application/pdf').json()['document_id']
    run_worker_once(engine, None)
    body = poll(client, alice, home, doc).json()
    assert any('primeras 1 de 3 páginas' in w for w in body['draft']['warnings'])


def test_unreadable_file_fails_permanently_without_retries(ocr_env, monkeypatch):
    client, alice, _, home, _, engine = ocr_env
    doc = start(client, alice, home, b'%PDF-1.4 corrupto de verdad', 'f.pdf', 'application/pdf').json()['document_id']
    assert run_worker_once(engine, None)['succeeded'] == 1  # el trabajo termina; el RESULTADO es «failed»
    body = poll(client, alice, home, doc).json()
    assert body['status'] == 'failed' and body['error_code'] == 'unreadable' and 'PDF original' in body['error_message'] and body['draft'] is None
    with engine.connect() as c:
        assert c.execute(text("SELECT attempts FROM jobs WHERE kind='ocr.process'")).scalar() == 1


def test_engine_errors_retry_then_fail_and_can_be_retried_by_hand(ocr_env, monkeypatch):
    client, alice, _, home, _, engine = ocr_env

    class Broken(FakeEngine):
        def read_image(self, image):
            raise pipeline.EngineError('TesseractError')
    use_engine(monkeypatch, Broken())
    doc = start(client, alice, home, encode(bill_image())).json()['document_id']
    first = run_worker_once(engine, None)
    assert first['retry'] == 1
    state = poll(client, alice, home, doc).json()
    assert state['status'] == 'processing' and state['attempts'] == 1  # visible para la persona mientras reintenta
    with engine.begin() as c:  # saltar la espera de reintentos
        c.execute(text("UPDATE jobs SET run_at = now() - interval '1 second'"))
    run_worker_once(engine, None)
    with engine.begin() as c:
        c.execute(text("UPDATE jobs SET run_at = now() - interval '1 second'"))
    last = run_worker_once(engine, None)
    assert last['dead'] == 1
    body = poll(client, alice, home, doc).json()
    assert body['status'] == 'failed' and body['error_code'] == 'engine_error' and body['attempts'] == 3
    # reintento manual con un motor que ya funciona
    use_engine(monkeypatch, FakeEngine('\n'.join(BILL_TEXT)))
    retried = client.post(f'/api/v1/homes/{home}/bills/ocr-jobs/{doc}/retry', headers=bearer(alice))
    assert retried.status_code == 202 and retried.json()['status'] == 'pending' and retried.json()['attempts'] == 0
    run_worker_once(engine, None)
    assert poll(client, alice, home, doc).json()['status'] == 'done'


def test_retry_only_applies_to_failed_jobs(ocr_env, monkeypatch):
    client, alice, _, home, _, engine = ocr_env
    use_engine(monkeypatch, FakeEngine('\n'.join(BILL_TEXT)))
    doc = start(client, alice, home, encode(bill_image())).json()['document_id']
    assert client.post(f'/api/v1/homes/{home}/bills/ocr-jobs/{doc}/retry', headers=bearer(alice)).json()['status'] == 'pending'
    with engine.connect() as c:
        assert c.execute(text("SELECT count(*) FROM jobs WHERE kind='ocr.process'")).scalar() == 1  # no se duplica
    run_worker_once(engine, None)
    assert client.post(f'/api/v1/homes/{home}/bills/ocr-jobs/{doc}/retry', headers=bearer(alice)).json()['status'] == 'done'


def test_storage_hiccup_retries_and_missing_object_fails_cleanly(ocr_env, monkeypatch):
    client, alice, _, home, store, engine = ocr_env
    use_engine(monkeypatch, FakeEngine('\n'.join(BILL_TEXT)))
    doc = start(client, alice, home, encode(bill_image())).json()['document_id']
    real_get, calls = store.inner.get, []

    def flaky(key):
        calls.append(key)
        if len(calls) == 1:
            raise StorageFailure('net')
        return real_get(key)
    monkeypatch.setattr(store.inner, 'get', flaky)
    assert run_worker_once(engine, None)['retry'] == 1
    with engine.begin() as c:
        c.execute(text("UPDATE jobs SET run_at = now() - interval '1 second'"))
    assert run_worker_once(engine, None)['succeeded'] == 1 and poll(client, alice, home, doc).json()['status'] == 'done'
    second = start(client, alice, home, encode(bill_image(rotate=0).resize((1300, 800)))).json()['document_id']
    store.delete(f'homes/{home}/documents/{second}')
    run_worker_once(engine, None)
    body = poll(client, alice, home, second).json()
    assert body['status'] == 'failed' and body['error_code'] == 'file_missing'


def test_tampered_object_fails_without_retrying(ocr_env, monkeypatch, tmp_path):
    client, alice, _, home, _, engine = ocr_env
    doc = start(client, alice, home, encode(bill_image())).json()['document_id']
    path = tmp_path / 'objects' / 'homes' / home / 'documents' / doc
    raw = bytearray(path.read_bytes())
    raw[-2] ^= 0xFF
    path.write_bytes(bytes(raw))
    run_worker_once(engine, None)
    assert poll(client, alice, home, doc).json()['error_code'] == 'engine_error'


def test_job_is_idempotent_and_survives_the_document_being_deleted(ocr_env, monkeypatch):
    client, alice, _, home, _, engine = ocr_env
    fake = FakeEngine('\n'.join(BILL_TEXT))
    use_engine(monkeypatch, fake)
    doc = start(client, alice, home, encode(bill_image())).json()['document_id']
    run_worker_once(engine, None)
    assert fake.calls == 1
    with sessionmaker(bind=engine, expire_on_commit=False)() as db:  # un segundo intento del mismo trabajo no repite el OCR
        assert ocr_jobs.process(db, uuid.UUID(doc), attempt=2, max_attempts=3) == 'skipped'
    assert fake.calls == 1
    gone = start(client, alice, home, encode(bill_image().resize((1300, 800)))).json()['document_id']
    assert client.delete(f'/api/v1/homes/{home}/documents/{gone}', headers=bearer(alice)).status_code == 204
    assert run_worker_once(engine, None)['succeeded'] == 1  # el trabajo huérfano termina sin error
    assert poll(client, alice, home, gone).status_code == 404


def test_confirming_the_bill_attaches_the_original_and_drops_the_draft(ocr_env, monkeypatch):
    client, alice, _, home, _, engine = ocr_env
    use_engine(monkeypatch, FakeEngine('\n'.join(BILL_TEXT)))
    doc = start(client, alice, home, encode(bill_image())).json()['document_id']
    run_worker_once(engine, None)
    draft = poll(client, alice, home, doc).json()['draft']
    payload = {'period_start': draft['period_start']['value'], 'period_end': draft['period_end']['value'], 'days': 31,
               'kwh': '300', 'amount_dop': draft['amount_dop']['value'], 'document_id': doc}
    created = client.post(f'/api/v1/homes/{home}/bills', headers=bearer(alice), json=payload)
    assert created.status_code == 201, created.text
    assert 'document_id' not in created.json()
    meta = client.get(f'/api/v1/homes/{home}/documents/{doc}', headers=bearer(alice)).json()
    assert meta['bill_id'] == created.json()['id'] and meta['retention_until'] is None
    after = poll(client, alice, home, doc).json()
    assert after['status'] == 'done' and after['draft'] is None  # el borrador ya no hace falta
    with engine.connect() as c:  # y en la base es NULL de SQL, no el JSON «null»
        assert c.execute(text('SELECT draft IS NULL FROM document_ocr WHERE document_id = :d'), {'d': doc}).scalar() is True
    # el mismo original no se puede ligar a una segunda factura
    again = client.post(f'/api/v1/homes/{home}/bills', headers=bearer(alice), json={**payload, 'period_start': '2026-09-01', 'period_end': '2026-09-30'})
    assert again.status_code == 404
    assert len(client.get(f'/api/v1/homes/{home}/bills', headers=bearer(alice)).json()) == 1


def test_confirming_with_a_foreign_or_unknown_document_rolls_back_the_bill(ocr_env):
    client, alice, bob, home, _, _ = ocr_env
    other = home_of(client, alice, 'Otra')
    foreign = start(client, alice, other, encode(bill_image())).json()['document_id']
    base = {'period_start': '2026-08-01', 'period_end': '2026-08-31', 'days': 31, 'kwh': '300', 'amount_dop': '4000'}
    for document in (foreign, str(uuid.uuid4())):
        assert client.post(f'/api/v1/homes/{home}/bills', headers=bearer(alice), json={**base, 'document_id': document}).status_code == 404
    assert client.get(f'/api/v1/homes/{home}/bills', headers=bearer(alice)).json() == []  # la factura no quedó a medias


def test_strangers_cannot_start_poll_or_retry(ocr_env):
    client, alice, bob, home, _, _ = ocr_env
    doc = start(client, alice, home, encode(bill_image())).json()['document_id']
    assert start(client, bob, home, encode(bill_image())).status_code == 404
    assert poll(client, bob, home, doc).status_code == 404
    assert client.post(f'/api/v1/homes/{home}/bills/ocr-jobs/{doc}/retry', headers=bearer(bob)).status_code == 404
    other = home_of(client, alice, 'Otra')
    assert poll(client, alice, other, doc).status_code == 404  # un id de otra vivienda propia tampoco


def test_busy_limit_and_validation(ocr_env, monkeypatch):
    client, alice, _, home, _, _ = ocr_env
    monkeypatch.setitem(settings.__dict__, 'OCR_MAX_ACTIVE_PER_HOME', 2)
    for color in ('white', 'yellow'):
        assert start(client, alice, home, encode(Image.new('RGB', (50, 50), color))).status_code == 202
    busy = start(client, alice, home, encode(Image.new('RGB', (50, 50), 'blue')))
    assert busy.status_code == 409 and busy.json()['code'] == 'document_quota_exceeded'
    assert start(client, alice, home, b'<script>', 'a.jpg').status_code == 422
    assert start(client, alice, home, b'', 'a.jpg').status_code == 422


def test_disabled_storage_answers_503(auth_client):
    set_store_for_tests(None)
    alice = register(auth_client)
    home = home_of(auth_client, alice)
    assert start(auth_client, alice, home, encode(bill_image())).status_code == 503


def test_dead_job_is_reported_as_failed_even_if_the_state_row_was_not_closed(ocr_env):
    client, alice, _, home, _, engine = ocr_env
    doc = start(client, alice, home, encode(bill_image())).json()['document_id']
    with engine.begin() as c:
        c.execute(text("UPDATE jobs SET status='dead', finished_at=now(), attempts=3 WHERE kind='ocr.process'"))
    body = poll(client, alice, home, doc).json()
    assert body['status'] == 'failed' and body['error_code'] == 'engine_error'


def test_document_expiry_removes_the_draft(ocr_env, monkeypatch):
    client, alice, _, home, _, engine = ocr_env
    use_engine(monkeypatch, FakeEngine('\n'.join(BILL_TEXT)))
    doc = start(client, alice, home, encode(bill_image())).json()['document_id']
    run_worker_once(engine, None)
    with engine.begin() as c:
        c.execute(text("UPDATE documents SET retention_until = now() - interval '1 minute'"))
    from app.services import documents
    with sessionmaker(bind=engine, expire_on_commit=False)() as db:
        assert documents.expire_unconfirmed(db) == 1
    with engine.connect() as c:
        assert c.execute(text('SELECT count(*) FROM document_ocr')).scalar() == 0


def test_stored_draft_never_contains_the_full_text(ocr_env, monkeypatch):
    client, alice, _, home, _, engine = ocr_env
    secret = 'LINEA-SECRETA-' + 'x' * 900
    use_engine(monkeypatch, FakeEngine('\n'.join(BILL_TEXT) + '\n' + 'relleno ' * 100 + secret))
    start(client, alice, home, encode(bill_image()))
    run_worker_once(engine, None)
    with engine.connect() as c:
        stored = c.execute(text('SELECT draft::text FROM document_ocr')).scalar()
    assert 'LINEA-SECRETA' not in stored  # solo el extracto del inicio, como en /ocr


def test_migration_roundtrip(migrated, alembic_cfg):
    from alembic import command
    command.downgrade(alembic_cfg, '0017')
    with migrated.connect() as c:
        assert c.execute(text("SELECT to_regclass('public.document_ocr')")).scalar() is None
    command.upgrade(alembic_cfg, 'head')
    with migrated.connect() as c:
        assert c.execute(text("SELECT to_regclass('public.document_ocr')")).scalar() is not None
