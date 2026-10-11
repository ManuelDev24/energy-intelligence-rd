"""Application errors, independent of HTTP."""
class ApplicationError(Exception):
    status_code = 409
    code = "conflict"


class NotFound(ApplicationError):
    status_code = 404
    code = "not_found"


class InvalidInput(ApplicationError):
    status_code = 422
    code = "invalid_input"


class Forbidden(ApplicationError):
    status_code = 403
    code = "forbidden"


class Unauthorized(ApplicationError):
    """Generic authentication failure; the HTTP layer adds WWW-Authenticate."""
    status_code = 401
    code = "http_401"


class StorageUnavailable(ApplicationError):
    """El almacenamiento privado no está configurado o falló; nunca se expone el motivo interno."""
    status_code = 503
    code = "storage_unavailable"


class QuotaExceeded(ApplicationError):
    status_code = 409
    code = "document_quota_exceeded"


class ServiceBusy(ApplicationError):
    """Capacidad agotada o dependencia lenta (pool de conexiones, tiempo de espera de la base, Argon2): se reintenta en unos segundos."""
    status_code = 503
    code = "service_busy"
    no_store = True
    retry_after = 2

    def __init__(self, message: str = "El servicio está ocupado. Intenta de nuevo en unos segundos.", retry_after: int = 2):
        super().__init__(message)
        self.retry_after = retry_after
