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
