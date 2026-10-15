"""ERD-OPS-DR: conciliación entre `documents` y el almacenamiento tras restaurar la base de datos."""
import json
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text

from app.services import document_storage
from app.services.storage import EncryptedStore, Keyring, LocalFileStore, S3Store, set_store_for_tests
from tests.test_document_storage import KEY_A, home_of, keyring, storage, two_users, upload  # noqa: F401
from tests.test_auth import auth_client  # noqa: F401


def object_path(tmp_path, home, doc_id):
    return tmp_path / "objects" / "homes" / home / "documents" / doc_id


def stray_key():
    return f"homes/{uuid.uuid4()}/documents/{uuid.uuid4()}"


def run(migrated, **kw):
    from sqlalchemy.orm import Session
    with Session(migrated, expire_on_commit=False) as db:
        return document_storage.reconcile(db, **kw)


def test_consistent_state_reports_nothing(two_users, storage, migrated):
    client, alice, _, home = two_users
    upload(client, alice, home)
    upload(client, alice, home)
    report = run(migrated)
    assert (report["documents"], report["objects"], report["missing"], report["orphans"]) == (2, 2, 0, 0)


def test_a_row_without_object_is_reported_as_missing_with_its_id(two_users, storage, migrated, tmp_path):
    client, alice, _, home = two_users
    gone = upload(client, alice, home).json()
    upload(client, alice, home)
    object_path(tmp_path, home, gone["id"]).unlink()
    report = run(migrated)
    assert report["missing"] == 1 and report["missing_document_ids"] == [gone["id"]]


def test_orphans_are_only_deleted_on_request_and_when_old_enough(two_users, storage, migrated):
    client, alice, _, home = two_users
    kept = upload(client, alice, home).json()
    old, fresh = stray_key(), stray_key()
    storage.put(old, b"huerfano viejo")
    storage.put(fresh, b"huerfano reciente")
    later = datetime.now(timezone.utc) + timedelta(hours=2)
    # Solo informar: nada se borra.
    report = run(migrated, now=later)
    assert report["orphans"] == 2 and report["orphans_deleted"] == 0
    assert dict(storage.iter_objects()).keys() >= {old, fresh}
    # Con el margen por defecto de 60 min y un reloj "ahora", ninguno es lo bastante viejo.
    report = run(migrated, delete_orphans=True)
    assert report["orphans"] == 0 and report["orphans_too_new"] == 2 and report["orphans_deleted"] == 0
    # Dos horas después sí; la factura real no se toca.
    report = run(migrated, delete_orphans=True, now=later)
    assert report["orphans_deleted"] == 2
    left = set(dict(storage.iter_objects()))
    assert old not in left and fresh not in left and len(left) == 1
    assert report["missing"] == 0 and kept["id"]  # la factura real sigue ahí


def test_an_object_waiting_in_the_deletion_queue_is_not_an_orphan(two_users, storage, migrated):
    client, alice, _, home = two_users
    doc = upload(client, alice, home).json()
    assert client.delete(f"/api/v1/homes/{home}/documents/{doc['id']}", headers={"Authorization": f"Bearer {alice['access_token']}"}).status_code == 204
    report = run(migrated, now=datetime.now(timezone.utc) + timedelta(days=1))
    assert report["objects"] == 1 and report["orphans"] == 0 and report["missing"] == 0


def test_orphan_delete_failures_are_counted_not_raised(two_users, storage, migrated, monkeypatch):
    from app.services.storage import StorageFailure
    storage.put(stray_key(), b"x")

    def boom(key):
        raise StorageFailure("fallo")
    monkeypatch.setattr(storage, "delete", boom)
    report = run(migrated, delete_orphans=True, now=datetime.now(timezone.utc) + timedelta(hours=2))
    assert report["orphans_deleted"] == 0 and report["orphan_delete_failed"] == 1


def test_s3_listing_strips_the_prefix_and_ignores_foreign_keys():
    boto3 = pytest.importorskip("boto3")
    from moto import mock_aws
    with mock_aws():
        client = boto3.client("s3", region_name="us-east-1", aws_access_key_id="x", aws_secret_access_key="y")
        client.create_bucket(Bucket="recon-bucket")
        store = EncryptedStore(S3Store(client, "recon-bucket", prefix="prod"), Keyring.parse(f"k1:{KEY_A}"))
        key = stray_key()
        store.put(key, b"contenido")
        client.put_object(Bucket="recon-bucket", Key="prod/notas/lo-que-sea.txt", Body=b"x")      # ajeno, bajo el prefijo
        client.put_object(Bucket="recon-bucket", Key=f"otro/{stray_key()}", Body=b"x")            # fuera del prefijo
        assert [k for k, _ in store.iter_objects()] == [key]


def test_local_listing_ignores_partial_files(tmp_path):
    store = EncryptedStore(LocalFileStore(tmp_path / "o"), Keyring.parse(f"k1:{KEY_A}"))
    key = stray_key()
    store.put(key, b"x")
    (tmp_path / "o" / "homes").joinpath(".part-abc").write_bytes(b"parcial")
    assert [k for k, _ in store.iter_objects()] == [key]


def test_cli_exit_codes_and_report(two_users, storage, migrated, monkeypatch, capsys, tmp_path):
    from sqlalchemy.orm import sessionmaker
    from scripts import storage_reconcile
    client, alice, _, home = two_users
    monkeypatch.setattr(storage_reconcile, "SessionLocal", sessionmaker(bind=migrated, expire_on_commit=False))
    doc = upload(client, alice, home).json()
    assert storage_reconcile.main([]) == 0
    assert json.loads(capsys.readouterr().out)["missing"] == 0
    object_path(tmp_path, home, doc["id"]).unlink()
    assert storage_reconcile.main([]) == 1                       # pérdida de datos
    assert json.loads(capsys.readouterr().out)["missing_document_ids"] == [doc["id"]]
    set_store_for_tests(None)
    assert storage_reconcile.main([]) == 2
    assert "STORAGE_BACKEND" in capsys.readouterr().err


def test_report_never_contains_object_keys(two_users, storage, migrated):
    client, alice, _, home = two_users
    storage.put(stray_key(), b"x")
    upload(client, alice, home)
    blob = json.dumps(run(migrated, now=datetime.now(timezone.utc) + timedelta(hours=2)))
    assert "homes/" not in blob and "/documents/" not in blob
