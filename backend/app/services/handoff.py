HANDOFF_KEYWORDS = {
    "human",
    "agent",
    "representative",
    "talk to someone",
    "talk to a person",
    "speak to a human",
    "customer service",
}


def wants_human(user_message: str) -> bool:
    lowered = user_message.lower()
    return any(keyword in lowered for keyword in HANDOFF_KEYWORDS)
