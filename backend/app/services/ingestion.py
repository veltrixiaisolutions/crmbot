import io

from pypdf import PdfReader

CHUNK_SIZE_CHARS = 2000
CHUNK_OVERLAP_CHARS = 200


def extract_text(filename: str, raw_bytes: bytes) -> str:
    if filename.lower().endswith(".pdf"):
        reader = PdfReader(io.BytesIO(raw_bytes))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    return raw_bytes.decode("utf-8", errors="ignore")


def chunk_text(text: str) -> list[str]:
    text = text.strip()
    if not text:
        return []

    chunks = []
    start = 0
    while start < len(text):
        end = start + CHUNK_SIZE_CHARS
        chunks.append(text[start:end].strip())
        start = end - CHUNK_OVERLAP_CHARS
    return [c for c in chunks if c]
