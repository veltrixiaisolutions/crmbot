import logging
from app.db import vector_search_knowledge
from app.services.embeddings import embed_query

logger = logging.getLogger(__name__)

COMMON_GREETINGS = {
    "hi", "hello", "hey", "hola", "namaste", "namaskar",
    "good morning", "good evening", "good afternoon",
    "ok", "okay", "thanks", "thank you", "bye", "yes", "no"
}


def is_simple_greeting(text: str) -> bool:
    clean = text.strip().lower()
    return clean in COMMON_GREETINGS or len(clean) < 3


async def build_system_prompt(tenant: dict, user_query: str) -> list[dict]:
    """Constructs structured system blocks with Anthropic Prompt Caching.
    
    Block 1 (Static): Tenant strategy, business info, rules (tagged with cache_control for 90% discount).
    Block 2 (Dynamic): Knowledge chunks (only when query warrants semantic lookup and meets relevance threshold).
    """
    business_hours = tenant.get("business_hours")
    hours_info = f"\nBusiness hours: {business_hours} (Only mention if the customer specifically asks about opening times or operating hours).\n" if business_hours else ""

    static_system_text = (
        f"{tenant.get('system_prompt', '')}\n\n"
        f"Business name: {tenant.get('business_name', '')}"
        f"{hours_info}\n\n"
        "### STRICT OPERATIONAL RULES FOR EVERY RESPONSE:\n"
        "- Always stay in character as the business assistant. Follow your core strategy, persona, and conversion goals above.\n"
        "- Keep replies short (typically 2 to 4 lines), punchy, and natural. Mirror the customer's language (Hindi, Hinglish, or English).\n"
        "- NEVER use robotic meta-phrases like 'in my knowledge base', 'according to my database', or 'I don't have information on services'. You represent this business directly.\n"
        "- WhatsApp formatting: WhatsApp uses single asterisk *bold* for bold text, NEVER use double asterisks **. NEVER put asterisks or brackets around URLs or links (output plain URLs like https://...).\n"
        "- When the user asks what you do, who you are, or to explain the service, use your core strategy explanation and drive toward the next action (connect GMB or book a call).\n"
        "- Never bring up refund policies or business hours unless the customer explicitly asks for them."
    )

    blocks: list[dict] = [
        {
            "type": "text",
            "text": static_system_text,
            "cache_control": {"type": "ephemeral"},
        }
    ]

    # Skip RAG vector search for simple greetings/short words to save Voyage AI embedding & Claude tokens
    if not is_simple_greeting(user_query):
        try:
            query_embedding = await embed_query(user_query)
            chunks = await vector_search_knowledge(
                tenant_id=str(tenant["_id"]), query_embedding=query_embedding, top_k=3
            )
            # Filter chunks by relevance score if available
            relevant = [c for c in chunks if c.get("score") is None or c.get("score", 0) >= 0.60]
            if relevant:
                knowledge_block = "\n".join(f"- {c['text']}" for c in relevant)
                blocks.append({
                    "type": "text",
                    "text": (
                        "### SUPPLEMENTARY BUSINESS KNOWLEDGE (POLICIES & SPECIFIC FACTS):\n"
                        f"{knowledge_block}\n"
                        "(Use these specific facts if the customer asks about policies, refund terms, or specific document details.)"
                    ),
                })
        except Exception as e:
            logger.warning("RAG retrieval skipped or failed: %s", e)

    return blocks



