from datetime import datetime, timezone

from pydantic import BaseModel, Field


class KnowledgeChunkOut(BaseModel):
    id: str
    tenant_id: str
    source_doc_name: str
    text: str
    created_at: datetime


class KnowledgeChunkInDB(BaseModel):
    tenant_id: str
    source_doc_name: str
    text: str
    embedding: list[float]
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class KnowledgeTextIn(BaseModel):
    source_doc_name: str
    text: str
