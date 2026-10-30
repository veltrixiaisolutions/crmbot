import re
import httpx

from app.config import settings

GRAPH_API_BASE = f"https://graph.facebook.com/{settings.whatsapp_api_version}"


def format_for_whatsapp(text: str) -> str:
    """Format markdown text specifically for WhatsApp Cloud API.
    - Convert markdown hyperlinks [Label](url) -> Label url
    - Strip asterisks wrapped around URLs (e.g. **https://...** -> https://...)
    - Convert markdown bold (**text**) to WhatsApp bold (*text*)
    """
    if not text:
        return text

    def replace_md_link(match):
        label = match.group(1).strip()
        url = match.group(2).strip()
        if label == url:
            return url
        return f"{label} {url}"

    text = re.sub(r'\[([^\]]+)\]\((https?://[^\)]+)\)', replace_md_link, text)
    text = re.sub(r'\*{1,2}(https?://[^\s*]+)\*{1,2}', r'\1', text)
    text = re.sub(r'\*\*(.+?)\*\*', r'*\1*', text)
    return text.strip()


async def send_text_message(phone_number_id: str, access_token: str, to: str, body: str) -> dict:
    """Send a free-form text reply via the WhatsApp Cloud API.

    Only valid within the 24h customer-initiated service window; outside
    that window Meta requires an approved template message instead.
    """
    cleaned_body = format_for_whatsapp(body)
    url = f"{GRAPH_API_BASE}/{phone_number_id}/messages"
    headers = {"Authorization": f"Bearer {access_token}"}
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"body": cleaned_body},
    }
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(url, json=payload, headers=headers)
        if response.status_code >= 400:
            import logging
            logging.error(f"WhatsApp API Error {response.status_code}: {response.text}")
        response.raise_for_status()
        return response.json()


async def upload_media(
    phone_number_id: str, access_token: str, file_bytes: bytes, filename: str, mime_type: str
) -> str:
    """Upload media file to WhatsApp Cloud API to obtain a media ID."""
    url = f"{GRAPH_API_BASE}/{phone_number_id}/media"
    headers = {"Authorization": f"Bearer {access_token}"}
    files = {
        "file": (filename, file_bytes, mime_type),
    }
    data = {
        "messaging_product": "whatsapp",
        "type": mime_type,
    }
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(url, headers=headers, files=files, data=data)
        if response.status_code >= 400:
            import logging
            logging.error(f"WhatsApp Media Upload Error {response.status_code}: {response.text}")
        response.raise_for_status()
        return response.json()["id"]


async def send_media_message(
    phone_number_id: str,
    access_token: str,
    to: str,
    file_bytes: bytes,
    filename: str,
    mime_type: str,
    caption: str | None = None,
) -> dict:
    """Send an image, video, audio, or document to a customer via WhatsApp Cloud API."""
    # Normalize video mime type if needed
    normalized_mime = mime_type
    if filename.lower().endswith(".mp4"):
        normalized_mime = "video/mp4"
    elif filename.lower().endswith((".3gp", ".3gpp")):
        normalized_mime = "video/3gpp"

    media_id = await upload_media(phone_number_id, access_token, file_bytes, filename, normalized_mime)
    url = f"{GRAPH_API_BASE}/{phone_number_id}/messages"
    headers = {"Authorization": f"Bearer {access_token}"}

    is_image = normalized_mime.startswith("image/")
    is_video = normalized_mime.startswith("video/") or filename.lower().endswith((".mp4", ".3gp", ".mov", ".m4v", ".webm"))
    is_audio = normalized_mime.startswith("audio/")
    cleaned_caption = format_for_whatsapp(caption) if caption else None

    if is_image:
        media_obj = {"id": media_id}
        if cleaned_caption:
            media_obj["caption"] = cleaned_caption
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "image",
            "image": media_obj,
        }
    elif is_video:
        media_obj = {"id": media_id}
        if cleaned_caption:
            media_obj["caption"] = cleaned_caption
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "video",
            "video": media_obj,
        }
    elif is_audio:
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "audio",
            "audio": {"id": media_id},
        }
    else:
        # Document (e.g. PDF)
        media_obj = {"id": media_id, "filename": filename}
        if cleaned_caption:
            media_obj["caption"] = cleaned_caption
        payload = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "document",
            "document": media_obj,
        }

    async with httpx.AsyncClient(timeout=45) as client:
        response = await client.post(url, json=payload, headers=headers)
        if response.status_code >= 400:
            import logging
            logging.error(f"WhatsApp Send Media Error {response.status_code}: {response.text}")
        response.raise_for_status()
        return response.json()


def get_extension_from_mime(mime_type: str) -> str:
    mime = mime_type.lower().split(";")[0].strip()
    if "audio/ogg" in mime or "ogg" in mime or "opus" in mime:
        return ".ogg"
    if "audio/mp4" in mime or "audio/m4a" in mime or "audio/aac" in mime:
        return ".m4a"
    if "audio/mpeg" in mime or "audio/mp3" in mime:
        return ".mp3"
    if "audio/wav" in mime:
        return ".wav"
    if "audio/amr" in mime:
        return ".amr"
    if "image/jpeg" in mime or "image/jpg" in mime:
        return ".jpg"
    if "image/png" in mime:
        return ".png"
    if "image/webp" in mime:
        return ".webp"
    if "image/gif" in mime:
        return ".gif"
    if "video/mp4" in mime:
        return ".mp4"
    if "video/3gpp" in mime:
        return ".3gp"
    if "application/pdf" in mime:
        return ".pdf"
    
    import mimetypes
    ext = mimetypes.guess_extension(mime)
    return ext or ".bin"


async def download_media(media_id: str, access_token: str) -> tuple[bytes, str]:
    """Retrieve media info and download the binary file from WhatsApp Cloud API.
    Returns (file_bytes, mime_type).
    """
    url = f"{GRAPH_API_BASE}/{media_id}"
    headers = {"Authorization": f"Bearer {access_token}"}
    async with httpx.AsyncClient(timeout=35) as client:
        # Step 1: get media metadata URL
        info_resp = await client.get(url, headers=headers)
        if info_resp.status_code >= 400:
            import logging
            logging.error(f"WhatsApp Media Info Error {info_resp.status_code}: {info_resp.text}")
            info_resp.raise_for_status()
        media_info = info_resp.json()
        media_download_url = media_info.get("url")
        mime_type = media_info.get("mime_type", "application/octet-stream")

        if not media_download_url:
            raise ValueError(f"No download URL returned for media ID {media_id}")

        # Step 2: download the binary content using the access token
        download_resp = await client.get(
            media_download_url,
            headers={
                "Authorization": f"Bearer {access_token}",
                "User-Agent": "curl/7.64.1",
            },
            follow_redirects=True,
        )
        if download_resp.status_code >= 400:
            import logging
            logging.error(f"WhatsApp Media Download Error {download_resp.status_code}: {download_resp.text}")
            download_resp.raise_for_status()

        return download_resp.content, mime_type

