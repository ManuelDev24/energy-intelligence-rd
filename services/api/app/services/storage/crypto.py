"""Cifrado de objetos en reposo (AES-256-GCM) con claves versionadas. Sin FastAPI ni red.

Formato del objeto cifrado:  b"ERD1" | len(key_id):1 | key_id | salt:16 | nonce:12 | ciphertext+tag
- La clave de cada objeto se deriva con HKDF-SHA256(clave maestra, salt aleatorio, info = clave del objeto).
- La clave del objeto (`storage_key`) va además como dato autenticado (AAD): un objeto copiado a otra clave no descifra.
- Rotación: se agrega una clave nueva AL PRINCIPIO de `STORAGE_ENCRYPTION_KEYS`; las anteriores siguen sirviendo para leer
  hasta que `reencrypt` (o la tarea de mantenimiento) reescribe los objetos con la clave activa.
"""
import base64
import binascii
import os
import re
from dataclasses import dataclass

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

MAGIC = b"ERD1"
_KEY_ID = re.compile(r"^[A-Za-z0-9_-]{1,32}$")


class DecryptionError(Exception):
    """Objeto alterado, clave equivocada o formato desconocido. El mensaje nunca incluye contenido ni claves."""


@dataclass(frozen=True)
class Keyring:
    active_id: str
    keys: dict  # id -> bytes(32)

    @classmethod
    def parse(cls, raw: str) -> "Keyring":
        """`id1:<base64url 32 bytes>,id2:<...>`; la primera es la activa."""
        entries = [e.strip() for e in raw.split(",") if e.strip()]
        if not entries:
            raise ValueError("STORAGE_ENCRYPTION_KEYS is empty")
        keys: dict = {}
        for entry in entries:
            key_id, sep, material = entry.partition(":")
            if not sep or not _KEY_ID.match(key_id) or key_id in keys:
                raise ValueError("STORAGE_ENCRYPTION_KEYS entries must be unique 'id:key' pairs")
            try:
                key = base64.urlsafe_b64decode(material + "=" * (-len(material) % 4))
            except (binascii.Error, ValueError):
                raise ValueError("STORAGE_ENCRYPTION_KEYS keys must be base64url") from None
            if len(key) != 32 or len(set(key)) < 8:
                raise ValueError("STORAGE_ENCRYPTION_KEYS keys must be 32 random bytes")
            keys[key_id] = key
        return cls(active_id=next(iter(keys)), keys=keys)


def _object_key(master: bytes, salt: bytes, storage_key: str) -> bytes:
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=salt, info=b"erd-object-v1:" + storage_key.encode()).derive(master)


def encrypt(keyring: Keyring, storage_key: str, plaintext: bytes) -> bytes:
    key_id = keyring.active_id.encode()
    salt, nonce = os.urandom(16), os.urandom(12)
    box = AESGCM(_object_key(keyring.keys[keyring.active_id], salt, storage_key))
    return MAGIC + bytes([len(key_id)]) + key_id + salt + nonce + box.encrypt(nonce, plaintext, storage_key.encode())


def key_id_of(blob: bytes) -> str:
    """Id de la clave con que se cifró el objeto (para saber si falta re-cifrar)."""
    if not blob.startswith(MAGIC) or len(blob) < 5 or len(blob) < 5 + blob[4]:
        raise DecryptionError("Formato de objeto desconocido")
    return blob[5:5 + blob[4]].decode(errors="replace")


def decrypt(keyring: Keyring, storage_key: str, blob: bytes) -> bytes:
    try:
        key_id = key_id_of(blob)
        master = keyring.keys.get(key_id)
        if master is None:
            raise DecryptionError("Clave de cifrado desconocida")
        offset = 5 + blob[4]
        salt, nonce, body = blob[offset:offset + 16], blob[offset + 16:offset + 28], blob[offset + 28:]
        if len(salt) != 16 or len(nonce) != 12:
            raise DecryptionError("Objeto truncado")
        return AESGCM(_object_key(master, salt, storage_key)).decrypt(nonce, body, storage_key.encode())
    except InvalidTag:
        raise DecryptionError("El objeto no pasa la verificación de integridad") from None
