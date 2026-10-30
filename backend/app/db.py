import dns.resolver
from motor.motor_asyncio import AsyncIOMotorClient

from app.config import settings

# Some home routers time out on the SRV/TXT lookups that mongodb+srv:// URIs
# need, so resolve them through public DNS instead.
dns.resolver.default_resolver = dns.resolver.Resolver(configure=False)
dns.resolver.default_resolver.nameservers = ["8.8.8.8", "1.1.1.1"]

client = AsyncIOMotorClient(settings.mongodb_uri)
db = client[settings.mongodb_db_name]

tenants = db["tenants"]
users = db["users"]
knowledge_chunks = db["knowledge_chunks"]
conversations = db["conversations"]
messages = db["messages"]
attendance = db["attendance"]
broadcasts = db["broadcasts"]
meta_onboardings = db["meta_onboardings"]
wa_contacts = db["wa_contacts"]
data_deletion_requests = db["data_deletion_requests"]

KNOWLEDGE_VECTOR_INDEX = "knowledge_vector_index"


async def vector_search_knowledge(tenant_id: str, query_embedding: list[float], top_k: int = 5) -> list[dict]:
    """Top-k semantic search over a tenant's knowledge chunks via Atlas Vector Search.

    Requires a vector search index named KNOWLEDGE_VECTOR_INDEX on the
    `embedding` field of `knowledge_chunks`, created in the Atlas UI/API
    (see README) — it cannot be created from the driver.
    """
    pipeline = [
        {
            "$vectorSearch": {
                "index": KNOWLEDGE_VECTOR_INDEX,
                "path": "embedding",
                "queryVector": query_embedding,
                "numCandidates": max(top_k * 10, 50),
                "limit": top_k,
                "filter": {"tenant_id": tenant_id},
            }
        },
        {
            "$project": {
                "text": 1,
                "source_doc_name": 1,
                "tenant_id": 1,
                "score": {"$meta": "vectorSearchScore"},
            }
        },
    ]
    return await knowledge_chunks.aggregate(pipeline).to_list(length=top_k)
