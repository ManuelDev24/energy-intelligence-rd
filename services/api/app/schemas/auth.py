import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, SecretStr, field_validator


class Credentials(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr = Field(max_length=254)
    password: SecretStr = Field(min_length=12, max_length=128)

    @field_validator("password")
    @classmethod
    def validate_password_encoding(cls, value):
        try:
            value.get_secret_value().encode("utf-8", errors="strict")
        except UnicodeEncodeError:
            raise ValueError("Contraseña inválida") from None
        return value

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value):
        return str(value).lower()


class RegisterIn(Credentials):
    """Registro: aceptación explícita (booleano estricto). La versión la fija el servidor."""
    accept_terms: Literal[True]

    @field_validator("accept_terms", mode="before")
    @classmethod
    def require_json_true(cls, value):
        # Literal[True] alone admits 1 / 1.0 in lax mode; only the JSON literal true counts as consent.
        if value is not True:
            raise ValueError("Debes aceptar los términos")
        return value


class AccountDeletionIn(BaseModel):
    """Reautenticación para borrar la cuenta; mismos límites que Credentials."""
    model_config = ConfigDict(extra="forbid")
    password: SecretStr = Field(min_length=12, max_length=128)

    @field_validator("password")
    @classmethod
    def validate_password_encoding(cls, value):
        return Credentials.validate_password_encoding(value)


class LegalOut(BaseModel):
    terms_version: str
    privacy_version: str
    status: Literal["draft"]


class RefreshIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    refresh_token: str = Field(min_length=43, max_length=43, pattern=r"^[A-Za-z0-9_-]{43}$")


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    email: str
    role: Literal["user", "admin", "support"]
    created_at: datetime
    # Default None: clients parsing an older API (sin 0012) materialize null instead of failing.
    terms_version: str | None = None
    terms_accepted_at: datetime | None = None


class TokensOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
