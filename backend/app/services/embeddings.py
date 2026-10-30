import voyageai

from app.config import settings

_client = voyageai.AsyncClient(api_key=settings.voyage_api_key)


async def embed_chunks(texts: list[str]) -> list[list[float]]:
    result = await _client.embed(
        texts, model=settings.voyage_embedding_model, input_type="document"
    )
    return result.embeddings


async def embed_query(text: str) -> list[float]:
    result = await _client.embed(
        [text], model=settings.voyage_embedding_model, input_type="query"
    )
    return result.embeddings[0]
