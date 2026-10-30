from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pymongo.operations import SearchIndexModel

from app.config import settings
from app.db import knowledge_chunks, KNOWLEDGE_VECTOR_INDEX
from app.routers import auth, conversations, knowledge, tenants, webhook, users, meta

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        cursor = knowledge_chunks.list_search_indexes()
        existing = await cursor.to_list(20)
        if not any(idx.get("name") == KNOWLEDGE_VECTOR_INDEX for idx in existing):
            logger.info("Creating vector search index: %s", KNOWLEDGE_VECTOR_INDEX)
            model = SearchIndexModel(
                definition={
                    "fields": [
                        {
                            "type": "vector",
                            "path": "embedding",
                            "numDimensions": 1024,
                            "similarity": "cosine",
                        },
                        {"type": "filter", "path": "tenant_id"},
                    ]
                },
                name=KNOWLEDGE_VECTOR_INDEX,
                type="vectorSearch",
            )
            await knowledge_chunks.create_search_index(model=model)
            logger.info("Vector search index creation triggered.")
    except Exception as e:
        logger.warning("Could not auto-verify search index: %s", e)
    yield


app = FastAPI(title="WhatsApp AI Chatbot Service", lifespan=lifespan)


cors_origins = [o.strip() for o in settings.frontend_origin.split(",") if o.strip()]
if "*" in cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response

app.add_middleware(SecurityHeadersMiddleware)

app.include_router(auth.router)
app.include_router(tenants.router)
app.include_router(knowledge.router)
app.include_router(conversations.router)
app.include_router(webhook.router)
app.include_router(users.router)
app.include_router(meta.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
