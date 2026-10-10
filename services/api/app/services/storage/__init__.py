"""ERD-STORE-01: almacenamiento privado y cifrado de los originales de factura."""
from dataclasses import dataclass

from app.services.errors import StorageUnavailable
from app.services.storage.backends import LocalFileStore, ObjectMissing, ObjectStore, S3Store, StorageFailure, check_key
from app.services.storage.crypto import DecryptionError, Keyring, decrypt, encrypt, key_id_of

__all__ = ["EncryptedStore", "DecryptionError", "Keyring", "LocalFileStore", "ObjectMissing", "S3Store", "StorageFailure",
           "build_store", "get_store", "set_store_for_tests"]


@dataclass
class EncryptedStore:
    """Cifra antes de subir y descifra al leer; el almacén interno solo ve texto cifrado."""
    inner: ObjectStore
    keyring: Keyring

    def put(self, key: str, plaintext: bytes) -> None:
        self.inner.put(check_key(key), encrypt(self.keyring, key, plaintext))

    def get(self, key: str) -> bytes:
        return decrypt(self.keyring, key, self.inner.get(check_key(key)))

    def delete(self, key: str) -> None:
        self.inner.delete(check_key(key))

    def reencrypt(self, key: str) -> bool:
        """Reescribe el objeto con la clave activa. Devuelve False si ya la usaba."""
        blob = self.inner.get(check_key(key))
        if key_id_of(blob) == self.keyring.active_id:
            return False
        self.inner.put(key, encrypt(self.keyring, key, decrypt(self.keyring, key, blob)))
        return True


def build_store() -> EncryptedStore | None:
    """Almacén según la configuración; `None` si está deshabilitado (las rutas responden 503, nada se guarda en silencio)."""
    from app.config import settings  # import tardío: la validación de la configuración usa `storage.crypto`
    if settings.STORAGE_BACKEND == "disabled":
        return None
    keyring = Keyring.parse(settings.STORAGE_ENCRYPTION_KEYS)
    if settings.STORAGE_BACKEND == "local":
        return EncryptedStore(LocalFileStore(settings.STORAGE_LOCAL_DIR), keyring)
    import boto3
    from botocore.config import Config
    client = boto3.client(
        "s3", endpoint_url=settings.STORAGE_S3_ENDPOINT_URL or None, region_name=settings.STORAGE_S3_REGION,
        aws_access_key_id=settings.STORAGE_S3_ACCESS_KEY_ID, aws_secret_access_key=settings.STORAGE_S3_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4", retries={"max_attempts": 3, "mode": "standard"},
                      connect_timeout=5, read_timeout=30))
    return EncryptedStore(S3Store(client, settings.STORAGE_S3_BUCKET, settings.STORAGE_S3_PREFIX), keyring)


_store: EncryptedStore | None = None
_built = False


def get_store() -> EncryptedStore:
    global _store, _built
    if not _built:
        _store, _built = build_store(), True
    if _store is None:
        raise StorageUnavailable("El almacenamiento de documentos no está disponible")
    return _store


def set_store_for_tests(store: EncryptedStore | None) -> None:
    global _store, _built
    _store, _built = store, True
