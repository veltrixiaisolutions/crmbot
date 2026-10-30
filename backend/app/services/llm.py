import logging
from anthropic import AsyncAnthropic

from app.config import settings

logger = logging.getLogger(__name__)

_client = AsyncAnthropic(api_key=settings.anthropic_api_key)


def _format_messages_for_anthropic(history: list[dict], user_message: str) -> list[dict]:
    """Clean and merge consecutive messages with the same role to avoid Anthropic API errors and token waste."""
    raw = history + [{"role": "user", "content": user_message}]
    merged: list[dict] = []

    for msg in raw:
        role = msg.get("role")
        content = (msg.get("content") or "").strip()
        if not content or role not in ("user", "assistant"):
            continue

        if merged and merged[-1]["role"] == role:
            merged[-1]["content"] += f"\n{content}"
        else:
            merged.append({"role": role, "content": content})

    # Anthropic requires the first message to be from 'user'
    while merged and merged[0]["role"] != "user":
        merged.pop(0)

    if not merged:
        merged = [{"role": "user", "content": user_message or "Hello"}]

    return merged


def _prepare_system_blocks(system_prompt: str | list[dict]) -> list[dict] | str:
    """Ensure system prompt uses Anthropic Prompt Caching for 90% input cost discount."""
    if isinstance(system_prompt, list):
        return system_prompt

    if not isinstance(system_prompt, str):
        return str(system_prompt)

    # Prompt caching for large system prompts
    if len(system_prompt) > 1000:
        return [
            {
                "type": "text",
                "text": system_prompt,
                "cache_control": {"type": "ephemeral"},
            }
        ]

    return system_prompt


async def generate_reply(
    system_prompt: str | list[dict],
    history: list[dict],
    user_message: str,
    max_tokens: int = 350,
) -> str:
    """Generate Claude reply with prompt caching and cost optimization.
    
    history: list of {"role": "user"|"assistant", "content": str}, oldest first.
    max_tokens: defaults to 350 tokens (concise WhatsApp replies), saving output billing.
    """
    messages = _format_messages_for_anthropic(history, user_message)
    system_content = _prepare_system_blocks(system_prompt)

    response = await _client.messages.create(
        model=settings.anthropic_model,
        max_tokens=max_tokens,
        system=system_content,
        messages=messages,
    )

    usage = response.usage
    cache_read = getattr(usage, "cache_read_input_tokens", 0) or 0
    cache_create = getattr(usage, "cache_creation_input_tokens", 0) or 0
    logger.info(
        "Claude [%s] tokens: input=%d, output=%d, cached_read=%d (90%% off), cached_created=%d",
        settings.anthropic_model,
        usage.input_tokens,
        usage.output_tokens,
        cache_read,
        cache_create,
    )

    return "".join(block.text for block in response.content if block.type == "text")

