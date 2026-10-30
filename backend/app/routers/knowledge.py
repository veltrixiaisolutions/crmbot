from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, UploadFile, status

from app.core.deps import get_current_tenant
from app.db import knowledge_chunks
from app.models.knowledge import KnowledgeChunkInDB, KnowledgeChunkOut, KnowledgeTextIn
from app.services.embeddings import embed_chunks
from app.services.ingestion import chunk_text, extract_text

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


def _to_out(doc: dict) -> KnowledgeChunkOut:
    return KnowledgeChunkOut(
        id=str(doc["_id"]),
        tenant_id=doc["tenant_id"],
        source_doc_name=doc["source_doc_name"],
        text=doc["text"],
        created_at=doc["created_at"],
    )


async def _ingest(tenant_id: str, source_doc_name: str, text: str) -> list[KnowledgeChunkOut]:
    chunks = chunk_text(text)
    if not chunks:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No text extracted from source")

    embeddings = await embed_chunks(chunks)
    docs = [
        KnowledgeChunkInDB(
            tenant_id=tenant_id, source_doc_name=source_doc_name, text=chunk, embedding=embedding
        ).model_dump()
        for chunk, embedding in zip(chunks, embeddings)
    ]
    result = await knowledge_chunks.insert_many(docs)
    inserted = await knowledge_chunks.find({"_id": {"$in": result.inserted_ids}}).to_list(length=len(docs))
    return [_to_out(d) for d in inserted]


@router.post("/text", response_model=list[KnowledgeChunkOut])
async def add_text_knowledge(payload: KnowledgeTextIn, tenant: dict = Depends(get_current_tenant)):
    return await _ingest(str(tenant["_id"]), payload.source_doc_name, payload.text)


@router.post("/upload", response_model=list[KnowledgeChunkOut])
async def upload_knowledge_file(file: UploadFile, tenant: dict = Depends(get_current_tenant)):
    raw_bytes = await file.read()
    text = extract_text(file.filename, raw_bytes)
    return await _ingest(str(tenant["_id"]), file.filename, text)


@router.get("", response_model=list[KnowledgeChunkOut])
async def list_knowledge(tenant: dict = Depends(get_current_tenant)):
    docs = await knowledge_chunks.find({"tenant_id": str(tenant["_id"])}).to_list(length=1000)
    return [_to_out(d) for d in docs]


@router.delete("/{chunk_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_knowledge_chunk(chunk_id: str, tenant: dict = Depends(get_current_tenant)):
    result = await knowledge_chunks.delete_one({"_id": ObjectId(chunk_id), "tenant_id": str(tenant["_id"])})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chunk not found")
