"""Almacenes de objetos. Guardan bytes ya cifrados; nunca interpretan el contenido.

`LocalFileStore` sirve para desarrollo y pruebas (nunca en producción: lo impide la configuración).
`S3Store` habla con cualquier servicio compatible con S3 (AWS S3, Cloudflare R2): el bucket debe ser PRIVADO y sin acceso
público; el cifrado ocurre antes de subir, así que el proveedor solo ve texto cifrado.
"""
import os
import re
import tempfile
from collections.abc import Iterator
from datetime import datetime, timezone
from pathlib import Path
from typing import Protocol

KEY_PATTERN = re.compile(r"^homes/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
                         r"/documents/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


class ObjectMissing(Exception):
    pass


class StorageFailure(Exception):
    """Fallo del proveedor o del disco. El detalle original queda como `__cause__`, no en el mensaje."""


class ObjectStore(Protocol):
    def put(self, key: str, data: bytes) -> None: ...
    def get(self, key: str) -> bytes: ...
    def delete(self, key: str) -> None: ...  # idempotente: borrar lo inexistente no es un error
    def iter_objects(self) -> Iterator[tuple[str, datetime]]: ...  # (clave, última modificación UTC); solo claves válidas


def check_key(key: str) -> str:
    if not isinstance(key, str) or not KEY_PATTERN.match(key):
        raise ValueError("Clave de objeto no válida")
    return key


class LocalFileStore:
    def __init__(self, root: str | os.PathLike):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)

    def _path(self, key: str) -> Path:
        path = (self.root / check_key(key)).resolve()
        if self.root not in path.parents:
            raise ValueError("Clave de objeto no válida")
        return path

    def put(self, key: str, data: bytes) -> None:
        path = self._path(key)
        try:
            path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".part-")
            try:
                with os.fdopen(fd, "wb") as handle:
                    handle.write(data)
                    handle.flush()
                    os.fsync(handle.fileno())
                os.chmod(tmp, 0o600)
                os.replace(tmp, path)  # atómico: nunca se lee un objeto a medio escribir
            except BaseException:
                Path(tmp).unlink(missing_ok=True)
                raise
        except OSError as exc:
            raise StorageFailure("No se pudo guardar el objeto") from exc

    def get(self, key: str) -> bytes:
        try:
            return self._path(key).read_bytes()
        except FileNotFoundError:
            raise ObjectMissing(key) from None
        except OSError as exc:
            raise StorageFailure("No se pudo leer el objeto") from exc

    def delete(self, key: str) -> None:
        try:
            self._path(key).unlink(missing_ok=True)
        except OSError as exc:
            raise StorageFailure("No se pudo borrar el objeto") from exc


    def iter_objects(self) -> Iterator[tuple[str, datetime]]:
        try:
            for path in self.root.rglob("*"):
                if path.is_file() and not path.name.startswith(".part-"):
                    key = path.relative_to(self.root).as_posix()
                    if KEY_PATTERN.match(key):
                        yield key, datetime.fromtimestamp(path.stat().st_mtime, timezone.utc)
        except OSError as exc:
            raise StorageFailure("No se pudo listar el almacenamiento") from exc


class S3Store:
    def __init__(self, client, bucket: str, prefix: str = ""):
        self.client, self.bucket = client, bucket
        self.prefix = prefix.strip("/") + "/" if prefix.strip("/") else ""

    def _name(self, key: str) -> str:
        return self.prefix + check_key(key)

    def put(self, key: str, data: bytes) -> None:
        from botocore.exceptions import BotoCoreError, ClientError
        try:
            self.client.put_object(Bucket=self.bucket, Key=self._name(key), Body=data, ContentType="application/octet-stream")
        except (BotoCoreError, ClientError) as exc:
            raise StorageFailure("No se pudo guardar el objeto") from exc

    def get(self, key: str) -> bytes:
        from botocore.exceptions import BotoCoreError, ClientError
        try:
            return self.client.get_object(Bucket=self.bucket, Key=self._name(key))["Body"].read()
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") in {"NoSuchKey", "404", "NotFound"}:
                raise ObjectMissing(key) from None
            raise StorageFailure("No se pudo leer el objeto") from exc
        except BotoCoreError as exc:
            raise StorageFailure("No se pudo leer el objeto") from exc

    def delete(self, key: str) -> None:
        from botocore.exceptions import BotoCoreError, ClientError
        try:
            self.client.delete_object(Bucket=self.bucket, Key=self._name(key))  # S3 responde 204 aunque no exista
        except (BotoCoreError, ClientError) as exc:
            raise StorageFailure("No se pudo borrar el objeto") from exc

    def iter_objects(self) -> Iterator[tuple[str, datetime]]:
        from botocore.exceptions import BotoCoreError, ClientError
        try:
            for page in self.client.get_paginator("list_objects_v2").paginate(Bucket=self.bucket, Prefix=self.prefix):
                for item in page.get("Contents", []):
                    key = item["Key"][len(self.prefix):]
                    if KEY_PATTERN.match(key):
                        yield key, item["LastModified"].astimezone(timezone.utc)
        except (BotoCoreError, ClientError) as exc:
            raise StorageFailure("No se pudo listar el almacenamiento") from exc
