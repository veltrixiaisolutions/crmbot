from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field

MessageDirection = Literal["in", "out"]
MessageStatus = Literal["sent", "delivered", "read", "failed", "pending"]


class MessageOut(BaseModel):
    id: str
    conversation_id: str
    tenant_id: str
    direction: MessageDirection
    text: str = ""
    media_url: str | None = None
    media_type: str | None = None
    media_filename: str | None = None
    status: MessageStatus | None = None
    status_updated_at: datetime | None = None
    failure_reason: str | None = None
    timestamp: datetime | None = None
    is_edited: bool = False
    edited_at: datetime | None = None


class MessageInDB(BaseModel):
    conversation_id: str
    tenant_id: str
    direction: MessageDirection
    text: str = ""
    media_url: str | None = None
    media_type: str | None = None
    media_filename: str | None = None
    wa_message_id: str | None = None
    status: MessageStatus | None = None
    status_updated_at: datetime | None = None
    failure_reason: str | None = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_edited: bool = False
    edited_at: datetime | None = None

class MessageCreate(BaseModel):
    text: str

class MessageUpdate(BaseModel):
    text: str
