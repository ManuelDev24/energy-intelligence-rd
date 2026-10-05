import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ContractIn(BaseModel):
    account_number: str = Field(min_length=1, max_length=120)

    @field_validator('account_number')
    @classmethod
    def nonempty(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError('account_number no puede estar vacío')
        return value


class ContractOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    home_id: uuid.UUID
    account_number: str
    updated_at: datetime
