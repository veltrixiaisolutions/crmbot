from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database
    mongodb_uri: str
    mongodb_db_name: str = "whatsapp_chatbot"

    # LLM / embeddings
    anthropic_api_key: str
    anthropic_model: str = "claude-haiku-4-5"
    voyage_api_key: str
    voyage_embedding_model: str = "voyage-3.5"

    # WhatsApp Cloud API
    whatsapp_verify_token: str
    whatsapp_app_secret: str | None = None
    whatsapp_api_version: str = "v21.0"

    # Meta Embedded Signup (Tech Provider flow)
    meta_app_id: str | None = None
    meta_app_secret: str | None = None
    meta_es_config_id: str | None = None  # ES Config ID from Embedded Signup Builder

    # Auth
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expires_minutes: int = 60 * 24 * 7

    # CORS
    frontend_origin: str = "http://localhost:3000"

    # Public HTTPS address of the dashboard (used in links sent to Meta,
    # e.g. the data deletion status page)
    public_app_url: str = "http://localhost:3000"


settings = Settings()
