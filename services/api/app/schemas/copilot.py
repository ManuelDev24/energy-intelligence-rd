import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Quality = Literal["REAL", "ESTIMATED", "PROJECTED", "INFERRED"]


def _single_line(value: str) -> str:
    value = " ".join(value.split())
    if not value:
        raise ValueError("no puede estar vacío")
    return value


class ConversationIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str | None = Field(None, max_length=120)

    @field_validator("title")
    @classmethod
    def clean(cls, value: str | None) -> str | None:
        return None if value is None else _single_line(value)


class ConversationRename(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=120)

    @field_validator("title")
    @classmethod
    def clean(cls, value: str) -> str:
        return _single_line(value)


class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    home_id: uuid.UUID
    title: str
    created_at: datetime
    updated_at: datetime


class SourceOut(BaseModel):
    kind: str
    label: str
    quality: Quality
    href: str | None


class CopilotMessageOut(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    role: Literal["user", "assistant"]
    content: str
    status: Literal["complete", "cancelled", "error", "refused", "limited"]
    sources: list[SourceOut]
    tools: list[str]
    feedback: Literal[-1, 1] | None
    created_at: datetime


class MessageIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    content: str = Field(min_length=1, max_length=4000)
    period_from: date | None = None
    period_to: date | None = None

    @field_validator("content")
    @classmethod
    def not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("no puede estar vacío")
        return value.strip()

    @model_validator(mode="after")
    def period(self) -> "MessageIn":
        if (self.period_from is None) != (self.period_to is None):
            raise ValueError("period_from y period_to van juntos")
        if self.period_from and self.period_to and (self.period_to < self.period_from or (self.period_to - self.period_from).days > 366):
            raise ValueError("período inválido (máx. 366 días)")
        return self


class FeedbackIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    value: Literal[-1, 1] | None


class CopilotUsageOut(BaseModel):
    day: date
    enabled: bool
    limited: bool
    messages_used: int
    messages_limit: int
    tokens_used: int
    tokens_limit: int
