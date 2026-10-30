import hashlib
import hmac
import json
import logging
import os
import time
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request, Response, status

from app.config import settings
from app.db import conversations, messages, tenants, broadcasts, wa_contacts
from app.models.conversation import ConversationInDB
from app.models.message import MessageInDB
from app.services.handoff import wants_human
from app.services.llm import generate_reply
from app.services.rag import build_system_prompt
from app.services.assignment import auto_assign_conversation
from app.services.whatsapp_client import send_text_message, download_media, get_extension_from_mime

UPLOAD_DIR = os.environ.get("UPLOAD_DIR", os.path.join(os.path.dirname(__file__), "..", "..", "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)

router = APIRouter(prefix="/webhook", tags=["webhook"])
logger = logging.getLogger(__name__)

HISTORY_LIMIT = 8
_processed_message_cache: dict[str, float] = {}
CACHE_TTL_SECONDS = 3600


@router.get("")
async def verify_webhook(
    hub_mode: str = Query(alias="hub.mode"),
    hub_verify_token: str = Query(alias="hub.verify_token"),
    hub_challenge: str = Query(alias="hub.challenge"),
):
    if hub_mode == "subscribe" and hub_verify_token == settings.whatsapp_verify_token:
        return Response(content=hub_challenge, media_type="text/plain")
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Verification failed")


async def _get_or_create_conversation(tenant_id: str, wa_user_phone: str) -> dict:
    clean_phone = wa_user_phone.lstrip("+").strip()
    conv = await conversations.find_one({
        "tenant_id": tenant_id,
        "$or": [
            {"wa_user_phone": clean_phone},
            {"wa_user_phone": f"+{clean_phone}"}
        ]
    })
    if conv is not None:
        return conv
    # Name synced from the client's WhatsApp Business app (coexistence), if any
    contact = await wa_contacts.find_one({"tenant_id": tenant_id, "phone": clean_phone})
    new_conv = ConversationInDB(
        tenant_id=tenant_id, wa_user_phone=clean_phone, lead_name=contact["name"] if contact else None
    )
    result = await conversations.insert_one(new_conv.model_dump())
    return await conversations.find_one({"_id": result.inserted_id})


async def _store_message(
    conversation_id: str, 
    tenant_id: str, 
    direction: str, 
    text: str, 
    wa_message_id: str | None = None,
    media_url: str | None = None,
    media_type: str | None = None,
    media_filename: str | None = None,
    status: str | None = None,
    is_blocked: bool = False,
) -> None:
    msg = MessageInDB(
        conversation_id=conversation_id, 
        tenant_id=tenant_id, 
        direction=direction, 
        text=text, 
        wa_message_id=wa_message_id,
        media_url=media_url,
        media_type=media_type,
        media_filename=media_filename,
        status=status or ("sent" if direction == "out" else None)
    )
    await messages.insert_one(msg.model_dump())
    
    preview_text = text
    if not preview_text:
        if media_type == "image":
            preview_text = "📷 Photo"
        elif media_type == "audio":
            preview_text = "🎤 Voice note"
        elif media_type == "video":
            preview_text = "🎥 Video"
        elif media_type == "document":
            preview_text = f"📄 {media_filename or 'Document'}"
        elif media_type:
            preview_text = "Attachment"

    now_utc = datetime.now(timezone.utc)
    update_doc: dict = {
        "$set": {
            "last_message_at": now_utc,
            "last_message_text": (preview_text or "")[:150],
            "last_message_direction": direction,
            "last_message_status": status or ("sent" if direction == "out" else None),
        }
    }
    if direction == "in" and not is_blocked:
        update_doc["$set"]["has_unread"] = True
        update_doc["$inc"] = {"unread_count": 1}

    conv_query = {"$or": [{"_id": ObjectId(conversation_id)}, {"_id": conversation_id}]} if ObjectId.is_valid(conversation_id) else {"_id": conversation_id}
    await conversations.update_one(
        conv_query,
        update_doc,
    )


async def _load_history(conversation_id: str) -> list[dict]:
    docs = (
        await messages.find({"conversation_id": conversation_id})
        .sort("timestamp", -1)
        .to_list(length=HISTORY_LIMIT)
    )
    docs.reverse()
    return [{"role": "user" if d["direction"] == "in" else "assistant", "content": d["text"]} for d in docs]


async def _extract_content(message: dict, tenant: dict, download: bool = True) -> tuple[str, str | None, str | None, str | None]:
    """Text and media fields for a WhatsApp message object. With download=False
    media is fetched on demand when the dashboard first opens it."""
    msg_type = message.get("type", "text")
    text = ""
    media_url = None
    media_type = None
    media_filename = None
    media_id = None

    if msg_type == "text":
        text = message.get("text", {}).get("body", "")
    elif msg_type == "interactive":
        interactive = message.get("interactive", {})
        if interactive.get("type") == "button_reply":
            text = interactive.get("button_reply", {}).get("title", "")
        elif interactive.get("type") == "list_reply":
            text = interactive.get("list_reply", {}).get("title", "")
        else:
            text = "[Interactive Response]"
    elif msg_type == "button":
        text = message.get("button", {}).get("text", "[Button response]")
    elif msg_type == "image":
        caption = message.get("image", {}).get("caption", "").strip()
        text = caption
        media_type = "image"
        media_id = message.get("image", {}).get("id")
    elif msg_type in ("audio", "voice"):
        text = ""
        media_type = "audio"
        media_id = message.get(msg_type, {}).get("id")
    elif msg_type == "video":
        caption = message.get("video", {}).get("caption", "").strip()
        text = caption
        media_type = "video"
        media_id = message.get("video", {}).get("id")
    elif msg_type == "document":
        media_filename = message.get("document", {}).get("filename", "")
        caption = message.get("document", {}).get("caption", "").strip()
        text = caption
        media_type = "document"
        media_id = message.get("document", {}).get("id")
    elif msg_type == "sticker":
        text = ""
        media_type = "image"
        media_id = message.get("sticker", {}).get("id")
    elif msg_type == "location":
        loc = message.get("location", {})
        name = loc.get("name") or loc.get("address")
        text = f"📍 Location: {name}" if name else "📍 [Location shared]"
    elif msg_type == "contacts":
        text = "👤 [Contact card]"
    else:
        text = f"[{msg_type.title()} message]"

    # Download incoming media if available
    if media_id:
        ext = ".bin"
        if msg_type == "image":
            ext = ".jpg"
        elif msg_type == "video":
            ext = ".mp4"
        elif msg_type in ("audio", "voice"):
            ext = ".ogg"
        elif msg_type == "sticker":
            ext = ".webp"
        elif msg_type == "document" and media_filename:
            _, doc_ext = os.path.splitext(media_filename)
            if doc_ext:
                ext = doc_ext.lower()

        safe_media_filename = f"{media_id}_{int(time.time())}{ext}"
        media_url = f"/conversations/media/{safe_media_filename}"
        if not media_filename:
            media_filename = safe_media_filename

        token = tenant.get("whatsapp_access_token")
        if token and download:
            try:
                file_bytes, mime = await download_media(media_id, token)
                real_ext = get_extension_from_mime(mime)
                if real_ext and real_ext != ext:
                    safe_media_filename = f"{media_id}_{int(time.time())}{real_ext}"
                    media_url = f"/conversations/media/{safe_media_filename}"
                    if media_filename.startswith(media_id):
                        media_filename = safe_media_filename
                os.makedirs(UPLOAD_DIR, exist_ok=True)
                save_path = os.path.join(UPLOAD_DIR, safe_media_filename)
                with open(save_path, "wb") as f:
                    f.write(file_bytes)
                logger.info("Successfully saved incoming WhatsApp %s (%d bytes) to %s", media_type, len(file_bytes), media_url)
            except Exception as e:
                logger.error("Failed to download WhatsApp media %s immediately (will recover on-demand): %s", media_id, e)

    # Fallback text if message has no text but has media
    if not text:
        if media_type == "image" or msg_type in ("image", "sticker"):
            text = "📷 [Photo]"
        elif media_type == "audio" or msg_type in ("audio", "voice"):
            text = "🎤 [Voice note]"
        elif media_type == "video" or msg_type == "video":
            text = "🎥 [Video]"
        elif media_type == "document" or msg_type == "document":
            text = f"📄 {media_filename or 'Document'}"

    return text, media_url, media_type, media_filename


def _parse_wa_timestamp(ts: str | None) -> datetime:
    try:
        return datetime.fromtimestamp(float(ts), tz=timezone.utc)
    except (TypeError, ValueError):
        return datetime.now(timezone.utc)


async def _handle_message_echoes(tenant: dict, echoes: list[dict]) -> None:
    """Coexistence: messages the business typed in the WhatsApp Business app.

    Stored as outgoing so the dashboard thread is complete, and the
    conversation is handed to a human so the bot stops replying over them
    (switch it back to bot from the dashboard).
    """
    tenant_id = str(tenant["_id"])
    for echo in echoes:
        wa_id = echo.get("id")
        to_number = echo.get("to")
        if not to_number or (wa_id and await messages.find_one({"wa_message_id": wa_id})):
            continue

        text, media_url, media_type, media_filename = await _extract_content(echo, tenant)
        conv = await _get_or_create_conversation(tenant_id, to_number)
        await _store_message(
            str(conv["_id"]),
            tenant_id,
            "out",
            text,
            wa_message_id=wa_id,
            media_url=media_url,
            media_type=media_type,
            media_filename=media_filename,
            status="sent",
        )
        if conv.get("status") != "human":
            await conversations.update_one({"_id": conv["_id"]}, {"$set": {"status": "human"}})
            logger.info("Owner replied from WhatsApp Business app; conversation %s switched to human", conv["_id"])


async def _import_history(tenant: dict, chunks: list[dict]) -> None:
    """Coexistence: past chats from the WhatsApp Business app, sent in chunks
    after onboarding. Imported silently — the bot never replies to these."""
    tenant_id = str(tenant["_id"])
    for chunk in chunks:
        for err in chunk.get("errors", []):
            logger.warning("History sync error for tenant %s: %s", tenant_id, err.get("message") or err)

        for thread in chunk.get("threads", []):
            customer = str(thread.get("id") or "").lstrip("+")
            if not customer:
                continue
            conv = await _get_or_create_conversation(tenant_id, customer)
            conv_id = str(conv["_id"])

            latest: MessageInDB | None = None
            for message in thread.get("messages", []):
                wa_id = message.get("id")
                if wa_id and await messages.find_one({"wa_message_id": wa_id}):
                    continue
                text, media_url, media_type, media_filename = await _extract_content(message, tenant, download=False)
                direction = "in" if str(message.get("from", "")).lstrip("+") == customer else "out"
                msg = MessageInDB(
                    conversation_id=conv_id,
                    tenant_id=tenant_id,
                    direction=direction,
                    text=text,
                    media_url=media_url,
                    media_type=media_type,
                    media_filename=media_filename,
                    wa_message_id=wa_id,
                    status="read" if direction == "out" else None,
                    timestamp=_parse_wa_timestamp(message.get("timestamp")),
                )
                await messages.insert_one(msg.model_dump())
                if latest is None or msg.timestamp > latest.timestamp:
                    latest = msg

            # Only move the preview forward; a fresh conversation has no preview yet
            if latest is not None:
                await conversations.update_one(
                    {
                        "_id": conv["_id"],
                        "$or": [{"last_message_at": {"$lt": latest.timestamp}}, {"last_message_text": None}],
                    },
                    {
                        "$set": {
                            "last_message_at": latest.timestamp,
                            "last_message_text": (latest.text or "")[:150],
                            "last_message_direction": latest.direction,
                            "last_message_status": latest.status,
                        }
                    },
                )


async def _sync_contacts(tenant: dict, items: list[dict]) -> None:
    """Coexistence: contact names from the WhatsApp Business app, used as lead
    names. Kept in wa_contacts so conversations created later pick them up."""
    tenant_id = str(tenant["_id"])
    for item in items:
        if item.get("type") != "contact":
            continue
        contact = item.get("contact", {})
        phone = str(contact.get("phone_number") or "").lstrip("+").strip()
        if not phone:
            continue
        if item.get("action") == "remove":
            await wa_contacts.delete_one({"tenant_id": tenant_id, "phone": phone})
            continue
        name = contact.get("full_name") or contact.get("first_name")
        if not name:
            continue
        await wa_contacts.update_one(
            {"tenant_id": tenant_id, "phone": phone}, {"$set": {"name": name}}, upsert=True
        )
        await conversations.update_many(
            {"tenant_id": tenant_id, "wa_user_phone": {"$in": [phone, f"+{phone}"]}, "lead_name": None},
            {"$set": {"lead_name": name}},
        )


async def process_webhook_payload(payload: dict):
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})
            phone_number_id = value.get("metadata", {}).get("phone_number_id")
            if phone_number_id is None:
                continue

            phone_id_str = str(phone_number_id).strip()
            tenant = await tenants.find_one(
                {
                    "$or": [
                        {"whatsapp_phone_number_id": phone_id_str},
                        {"whatsapp_phone_number_id": int(phone_id_str) if phone_id_str.isdigit() else phone_id_str}
                    ]
                },
                sort=[("created_at", -1)]
            )
            if tenant is None:
                logger.warning("No tenant found for phone_number_id=%s", phone_number_id)
                continue

            # Coexistence (WhatsApp Business app numbers) only
            await _handle_message_echoes(tenant, value.get("message_echoes", []))
            await _import_history(tenant, value.get("history", []))
            await _sync_contacts(tenant, value.get("state_sync", []))

            # Process WhatsApp message delivery and read receipts
            for status_obj in value.get("statuses", []):
                wa_msg_id = status_obj.get("id")
                new_status = status_obj.get("status")  # sent, delivered, read, failed
                ts_str = status_obj.get("timestamp")

                if not wa_msg_id or not new_status:
                    continue

                status_dt = None
                if ts_str:
                    try:
                        status_dt = datetime.fromtimestamp(float(ts_str), tz=timezone.utc)
                    except Exception:
                        status_dt = datetime.now(timezone.utc)
                else:
                    status_dt = datetime.now(timezone.utc)

                status_hierarchy = {"sent": 1, "delivered": 2, "read": 3, "failed": 0}
                new_rank = status_hierarchy.get(new_status, 1)

                msg = await messages.find_one({"wa_message_id": wa_msg_id})
                if msg:
                    curr_status = msg.get("status", "sent")
                    curr_rank = status_hierarchy.get(curr_status, 1)

                    if new_rank >= curr_rank or new_status == "failed":
                        set_data = {"status": new_status, "status_updated_at": status_dt}
                        if new_status == "failed":
                            errors = status_obj.get("errors", [])
                            if errors:
                                e_info = errors[0]
                                code = e_info.get("code")
                                title = e_info.get("title") or e_info.get("message") or "Unknown error"
                                details = e_info.get("error_data", {}).get("details")
                                if code == 131047:
                                    reason_str = "Outside 24h customer window. Free-form text cannot be sent unless customer replies first or an approved template is used."
                                elif code == 131026:
                                    reason_str = f"Message undeliverable ({details or title})"
                                elif code == 131030:
                                    reason_str = "Recipient phone number not in allowed test list in Meta Developer Portal."
                                else:
                                    reason_str = f"[{code}] {title}: {details}" if details else f"[{code}] {title}"
                                set_data["failure_reason"] = reason_str
                                logger.warning("WhatsApp message delivery failed for %s: %s", wa_msg_id, reason_str)

                        await messages.update_one(
                            {"_id": msg["_id"]},
                            {"$set": set_data}
                        )

                        if wa_msg_id:
                            try:
                                b_upd = {"results.$.status": new_status}
                                if new_status == "failed" and set_data.get("failure_reason"):
                                    b_upd["results.$.error"] = set_data["failure_reason"]
                                await broadcasts.update_many(
                                    {"results.wa_message_id": wa_msg_id},
                                    {"$set": b_upd}
                                )
                            except Exception as be:
                                logger.error("Error updating broadcast status for %s: %s", wa_msg_id, be)

                        conv_id = msg.get("conversation_id")
                        if conv_id:
                            try:
                                await conversations.update_one(
                                    {"_id": ObjectId(conv_id), "last_message_direction": "out"},
                                    {"$set": {"last_message_status": new_status}}
                                )
                                if new_status == "read":
                                    await conversations.update_one(
                                        {"_id": ObjectId(conv_id)},
                                        {"$set": {"last_customer_read_at": status_dt}}
                                    )
                                    await messages.update_many(
                                        {
                                            "conversation_id": conv_id,
                                            "direction": "out",
                                            "timestamp": {"$lte": msg["timestamp"]},
                                            "status": {"$in": ["sent", "delivered", None]}
                                        },
                                        {"$set": {"status": "read", "status_updated_at": status_dt}}
                                    )
                            except Exception as e:
                                logger.error("Error updating conversation read status: %s", e)

            for message in value.get("messages", []):
                msg_type = message.get("type", "text")
                from_number = message.get("from")
                message_id = message.get("id")

                if message_id:
                    now_ts = time.time()
                    global _processed_message_cache
                    if len(_processed_message_cache) > 2000:
                        cutoff = now_ts - CACHE_TTL_SECONDS
                        _processed_message_cache = {k: v for k, v in _processed_message_cache.items() if v > cutoff}

                    if message_id in _processed_message_cache:
                        logger.info("Message %s already in processing set, skipping duplicate", message_id)
                        continue
                    _processed_message_cache[message_id] = now_ts
                    
                    existing = await messages.find_one({"wa_message_id": message_id})
                    if existing:
                        logger.info("Message %s already processed in DB, skipping", message_id)
                        continue

                text, media_url, media_type, media_filename = await _extract_content(message, tenant)

                conv = await _get_or_create_conversation(str(tenant["_id"]), from_number)
                conv_id = str(conv["_id"])

                if conv.get("is_blocked"):
                    logger.info("Ignoring incoming message from blocked contact %s (reason: %s)", from_number, conv.get("blocked_reason"))
                    await _store_message(
                        conv_id,
                        str(tenant["_id"]),
                        "in",
                        text,
                        wa_message_id=message_id,
                        media_url=media_url,
                        media_type=media_type,
                        media_filename=media_filename,
                        is_blocked=True
                    )
                    continue

                if conv.get("assigned_to") is None:
                    # Only assigns to staff who are online AND have a live dashboard heartbeat.
                    # If nobody is active, the lead is queued and assigned when someone comes online.
                    await auto_assign_conversation(str(tenant["_id"]), conv)

                await _store_message(
                    conv_id,
                    str(tenant["_id"]),
                    "in",
                    text,
                    wa_message_id=message_id,
                    media_url=media_url,
                    media_type=media_type,
                    media_filename=media_filename
                )

                # Since customer sent a message, they have read our previous messages
                now_utc = datetime.now(timezone.utc)
                conv_q = {"$or": [{"_id": ObjectId(conv_id)}, {"_id": conv_id}]} if ObjectId.is_valid(conv_id) else {"_id": conv_id}
                await conversations.update_one(
                    conv_q,
                    {"$set": {"last_customer_read_at": now_utc}}
                )
                await messages.update_many(
                    {
                        "conversation_id": conv_id,
                        "direction": "out",
                        "status": {"$in": ["sent", "delivered", None]}
                    },
                    {"$set": {"status": "read", "status_updated_at": now_utc}}
                )

                if conv["status"] == "human":
                    continue

                if wants_human(text):
                    await conversations.update_one({"_id": conv["_id"]}, {"$set": {"status": "human"}})
                    handoff_reply = (
                        "I've flagged this conversation for a team member to follow up with you shortly."
                    )
                    res = await send_text_message(
                        tenant["whatsapp_phone_number_id"], tenant["whatsapp_access_token"], from_number, handoff_reply
                    )
                    wa_msg_id = (res.get("messages") or [{}])[0].get("id") if isinstance(res, dict) else None
                    await _store_message(conv_id, str(tenant["_id"]), "out", handoff_reply, wa_message_id=wa_msg_id, status="sent")
                    continue

                # Cost optimization: Don't invoke Claude for voice notes/audio (Claude cannot hear them)
                if media_type in ("audio", "voice") or msg_type in ("audio", "voice"):
                    audio_reply = (
                        "Thank you for your voice note! Our assistant cannot listen to audio directly. "
                        "Please type your message or query here, and I'll be happy to assist you!"
                    )
                    res = await send_text_message(
                        tenant["whatsapp_phone_number_id"], tenant["whatsapp_access_token"], from_number, audio_reply
                    )
                    wa_msg_id = (res.get("messages") or [{}])[0].get("id") if isinstance(res, dict) else None
                    await _store_message(conv_id, str(tenant["_id"]), "out", audio_reply, wa_message_id=wa_msg_id, status="sent")
                    continue

                if msg_type == "sticker":
                    continue

                if media_type == "image" and not text.strip():
                    img_reply = (
                        "Thank you for sharing the photo! Please let me know what you need help with regarding this, or feel free to type your question."
                    )
                    res = await send_text_message(
                        tenant["whatsapp_phone_number_id"], tenant["whatsapp_access_token"], from_number, img_reply
                    )
                    wa_msg_id = (res.get("messages") or [{}])[0].get("id") if isinstance(res, dict) else None
                    await _store_message(conv_id, str(tenant["_id"]), "out", img_reply, wa_message_id=wa_msg_id, status="sent")
                    continue

                llm_input = text.strip()
                if not llm_input:
                    continue

                system_prompt = await build_system_prompt(tenant, llm_input)
                history = await _load_history(conv_id)
                reply_text = await generate_reply(system_prompt, history[:-1], llm_input)

                if not reply_text or not reply_text.strip():
                    reply_text = "I'm having trouble processing that right now. Could you please try again?"

                from app.services.whatsapp_client import format_for_whatsapp
                reply_text = format_for_whatsapp(reply_text)

                res = await send_text_message(
                    tenant["whatsapp_phone_number_id"], tenant["whatsapp_access_token"], from_number, reply_text
                )
                wa_msg_id = (res.get("messages") or [{}])[0].get("id") if isinstance(res, dict) else None
                await _store_message(conv_id, str(tenant["_id"]), "out", reply_text, wa_message_id=wa_msg_id, status="sent")


@router.post("")
async def receive_webhook(request: Request, background_tasks: BackgroundTasks):
    raw_body = await request.body()

    if settings.whatsapp_app_secret:
        signature = request.headers.get("X-Hub-Signature-256")
        if not signature or not signature.startswith("sha256="):
            logger.warning("Webhook request missing valid X-Hub-Signature-256 header")
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Signature required")

        expected_sig = hmac.new(
            settings.whatsapp_app_secret.encode("utf-8"),
            raw_body,
            hashlib.sha256,
        ).hexdigest()

        provided_sig = signature[7:]
        if not hmac.compare_digest(provided_sig, expected_sig):
            logger.warning("Webhook HMAC signature mismatch")
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid signature")

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON")

    background_tasks.add_task(process_webhook_payload, payload)
    return {"status": "ok"}
