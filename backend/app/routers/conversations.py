from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import FileResponse
from pymongo import ReturnDocument
import os
import uuid
import httpx
import re
import logging
import asyncio

logger = logging.getLogger(__name__)

from app.core.deps import get_current_tenant, get_current_admin, get_current_user
from app.db import conversations, messages, tenants, broadcasts
from app.models.conversation import (
    ConversationOut, 
    ConversationStatusUpdate, 
    NewChatRequest,
    BulkAssignRequest, 
    BulkAssignResponse,
    BulkRecipient,
    BulkMessageRequest,
    BulkMessageRecipientResult,
    BulkMessageResponse,
    BroadcastSummaryOut,
    BroadcastDetailOut,
    LeadAnalyticsReport,
    SliceData,
    StaffLeadStat,
    PaymentDetails,
    LeadStatusLog,
    BlockChatRequest
)
from app.models.message import MessageOut, MessageCreate, MessageInDB, MessageUpdate
from app.services.whatsapp_client import send_text_message, send_media_message
from app.routers.users import _get_tz
from datetime import datetime, timezone, timedelta

UPLOAD_DIR = os.environ.get("UPLOAD_DIR", os.path.join(os.path.dirname(__file__), "..", "..", "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)

router = APIRouter(prefix="/conversations", tags=["conversations"])


from typing import Any

def _to_utc(dt: Any) -> datetime | None:
    if dt is None:
        return None
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
        except Exception:
            return None
    elif isinstance(dt, (int, float)):
        try:
            dt = datetime.fromtimestamp(dt, tz=timezone.utc)
        except Exception:
            return None
    elif not isinstance(dt, datetime):
        return None

    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _check_last_message_status(doc: dict) -> str | None:
    existing = doc.get("last_message_status")
    if existing:
        return existing
    r_utc = _to_utc(doc.get("last_customer_read_at"))
    m_utc = _to_utc(doc.get("last_message_at"))
    if r_utc and m_utc and r_utc >= m_utc:
        return "read"
    if doc.get("last_message_direction") == "out":
        return "sent"
    return None


def _conv_out(doc: dict, assigned_email: str | None = None, user_map: dict | None = None) -> ConversationOut:
    user_map = user_map or {}
    assigned_info = user_map.get(doc.get("assigned_to"), {})
    setter_info = user_map.get(doc.get("setter_id"), {})
    closer_info = user_map.get(doc.get("closer_id"), {})

    payment_data = doc.get("payment")
    payment_obj = None
    if payment_data and isinstance(payment_data, dict):
        try:
            payment_obj = PaymentDetails(
                total_payment=payment_data.get("total_payment"),
                advance_payment=payment_data.get("advance_payment"),
                remaining_payment=payment_data.get("remaining_payment"),
                purpose=payment_data.get("purpose"),
                notes=payment_data.get("notes"),
                recorded_at=_to_utc(payment_data.get("recorded_at")),
                recorded_by_name=payment_data.get("recorded_by_name"),
                recorded_by_email=payment_data.get("recorded_by_email"),
            )
        except Exception:
            payment_obj = None

    raw_status_logs = doc.get("lead_status_logs") or []
    status_logs: list[LeadStatusLog] = []
    if isinstance(raw_status_logs, list):
        for entry in raw_status_logs:
            if isinstance(entry, dict):
                try:
                    status_logs.append(
                        LeadStatusLog(
                            id=str(entry.get("id")) if entry.get("id") else None,
                            from_status=entry.get("from_status"),
                            to_status=entry.get("to_status", "not contacted"),
                            changed_by_name=entry.get("changed_by_name"),
                            changed_by_email=entry.get("changed_by_email"),
                            changed_by_role=entry.get("changed_by_role"),
                            changed_at=_to_utc(entry.get("changed_at")) or _to_utc(doc.get("created_at")) or datetime.now(timezone.utc),
                            notes=entry.get("notes"),
                        )
                    )
                except Exception:
                    pass
    if not status_logs:
        status_logs.append(
            LeadStatusLog(
                id="init",
                from_status=None,
                to_status=doc.get("lead_status", "not contacted"),
                changed_by_name="System",
                changed_by_email=None,
                changed_by_role="System",
                changed_at=_to_utc(doc.get("created_at")) or datetime.now(timezone.utc),
                notes="Initial status on lead capture",
            )
        )

    return ConversationOut(
        id=str(doc["_id"]),
        tenant_id=doc["tenant_id"],
        wa_user_phone=doc["wa_user_phone"],
        status=doc["status"],
        lead_status=doc.get("lead_status", "not contacted"),
        lead_name=doc.get("lead_name"),
        assigned_to=doc.get("assigned_to"),
        assigned_name=assigned_info.get("name"),
        assigned_email=assigned_email or assigned_info.get("email"),
        setter_name=setter_info.get("name"),
        setter_email=setter_info.get("email"),
        closer_name=closer_info.get("name"),
        closer_email=closer_info.get("email"),
        notes=doc.get("notes"),
        payment=payment_obj,
        lead_status_logs=status_logs,
        last_message_at=_to_utc(doc.get("last_message_at")),
        created_at=_to_utc(doc.get("created_at")),
        last_message_text=doc.get("last_message_text"),
        last_message_direction=doc.get("last_message_direction"),
        last_message_status=_check_last_message_status(doc),
        last_customer_read_at=_to_utc(doc.get("last_customer_read_at")),
        has_unread=bool(doc.get("has_unread", False)),
        unread_count=int(doc.get("unread_count", 0)),
        is_blocked=bool(doc.get("is_blocked", False)),
        blocked_at=_to_utc(doc.get("blocked_at")),
        blocked_by_name=doc.get("blocked_by_name"),
        blocked_reason=doc.get("blocked_reason"),
    )


def _msg_out(doc: dict, customer_read_cutoff: datetime | None = None) -> MessageOut:
    status = doc.get("status")
    direction = doc.get("direction", "out")
    if direction == "out":
        if not status:
            status = "sent"
        msg_time = _to_utc(doc.get("timestamp"))
        if customer_read_cutoff and msg_time and status in ("sent", "delivered"):
            c_utc = _to_utc(customer_read_cutoff)
            if c_utc and msg_time <= c_utc:
                status = "read"

    msg_ts = _to_utc(doc.get("timestamp")) or datetime.now(timezone.utc)

    return MessageOut(
        id=str(doc["_id"]),
        conversation_id=str(doc.get("conversation_id", "")),
        tenant_id=str(doc.get("tenant_id", "")),
        direction="in" if direction == "in" else "out",
        text=doc.get("text") or "",
        media_url=doc.get("media_url"),
        media_type=doc.get("media_type"),
        media_filename=doc.get("media_filename"),
        status=status,
        status_updated_at=_to_utc(doc.get("status_updated_at")),
        failure_reason=doc.get("failure_reason"),
        timestamp=msg_ts,
        is_edited=bool(doc.get("is_edited", False)),
        edited_at=_to_utc(doc.get("edited_at")),
    )


def _build_user_map(users_list: list[dict]) -> dict:
    res = {}
    for u in users_list:
        uid = str(u["_id"])
        uname = u.get("name") or u["email"].split("@")[0].replace(".", " ").replace("_", " ").title()
        res[uid] = {"email": u["email"], "name": uname}
    return res


@router.get("", response_model=list[ConversationOut])
async def list_conversations(
    unread: bool | None = None,
    blocked: bool | None = None,
    tenant: dict = Depends(get_current_tenant)
):
    query: dict = {"tenant_id": str(tenant["_id"])}
    if unread is True:
        query["$or"] = [{"has_unread": True}, {"unread_count": {"$gt": 0}}]
    if blocked is True:
        query["is_blocked"] = True
    elif blocked is False:
        query["$or"] = [{"is_blocked": False}, {"is_blocked": {"$exists": False}}]
    docs = await conversations.find(query).sort("last_message_at", -1).to_list(length=1000)
    
    from app.db import users
    staff_ids = set()
    for d in docs:
        for f in ["assigned_to", "setter_id", "closer_id"]:
            if d.get(f): staff_ids.add(ObjectId(d[f]))
            
    staff_users = await users.find({"_id": {"$in": list(staff_ids)}}).to_list(length=100)
    user_map = _build_user_map(staff_users)
    
    res = [_conv_out(d, user_map=user_map) for d in docs]
    res.sort(
        key=lambda c: _to_utc(c.last_message_at) or _to_utc(c.created_at) or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True
    )
    return res
 
 
@router.post("", response_model=ConversationOut)
async def create_new_chat(
    payload: NewChatRequest,
    user: dict = Depends(get_current_user),
    tenant: dict = Depends(get_current_tenant),
):
    """Manually start a new WhatsApp conversation with a lead/customer."""
    clean_phone = re.sub(r"[^\d+]", "", payload.wa_user_phone).strip()
    clean_phone_digits = clean_phone.lstrip("+").strip()

    if not clean_phone_digits or len(clean_phone_digits) < 7:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide a valid WhatsApp phone number with country code (e.g. +91 9876543210).",
        )

    tenant_id_str = str(tenant["_id"])
    now_utc = datetime.now(timezone.utc)
    creator_name = user.get("name") or user.get("email", "").split("@")[0].title()

    # Check if conversation already exists for this tenant
    existing_conv = await conversations.find_one({
        "tenant_id": tenant_id_str,
        "$or": [
            {"wa_user_phone": clean_phone_digits},
            {"wa_user_phone": f"+{clean_phone_digits}"},
        ],
    })

    if existing_conv is not None:
        conv_id = str(existing_conv["_id"])
        update_fields: dict = {
            "status": "human",
        }
        if payload.lead_name and not existing_conv.get("lead_name"):
            update_fields["lead_name"] = payload.lead_name.strip()
        if payload.notes and not existing_conv.get("notes"):
            update_fields["notes"] = payload.notes.strip()

        # If unassigned and opened by staff, assign to this staff member
        if not existing_conv.get("assigned_to") and user.get("role") == "staff":
            update_fields["assigned_to"] = str(user["_id"])
            if user.get("staff_type") == "setter":
                update_fields["setter_id"] = str(user["_id"])
            elif user.get("staff_type") == "closer":
                update_fields["closer_id"] = str(user["_id"])
        elif payload.assigned_to:
            update_fields["assigned_to"] = payload.assigned_to

        # If initial message provided, send it
        if payload.initial_message and payload.initial_message.strip():
            msg_text = payload.initial_message.strip()
            wa_msg_id = None
            token = tenant.get("whatsapp_access_token")
            phone_id = tenant.get("whatsapp_phone_number_id")

            if token and phone_id:
                try:
                    wa_res = await send_text_message(phone_id, token, clean_phone_digits, msg_text)
                    if isinstance(wa_res, dict):
                        wa_msgs = wa_res.get("messages") or []
                        if wa_msgs:
                            wa_msg_id = wa_msgs[0].get("id")
                except Exception as e:
                    logger.warning("Could not send WhatsApp message to %s: %s", clean_phone_digits, e)

            msg = MessageInDB(
                conversation_id=conv_id,
                tenant_id=tenant_id_str,
                direction="out",
                text=msg_text,
                wa_message_id=wa_msg_id,
                status="sent" if wa_msg_id else "pending",
                timestamp=now_utc,
            )
            await messages.insert_one(msg.model_dump())

            update_fields["last_message_at"] = now_utc
            update_fields["last_message_text"] = msg_text[:150]
            update_fields["last_message_direction"] = "out"
            update_fields["last_message_status"] = "sent" if wa_msg_id else "pending"
            update_fields["lead_status"] = "contacted"

        await conversations.update_one({"_id": existing_conv["_id"]}, {"$set": update_fields})
        updated_doc = await conversations.find_one({"_id": existing_conv["_id"]})

        from app.db import users
        staff_users = await users.find({"tenant_id": tenant_id_str}).to_list(length=100)
        user_map = _build_user_map(staff_users)
        return _conv_out(updated_doc, user_map=user_map)

    # Brand new conversation
    assigned_to_id = payload.assigned_to
    if not assigned_to_id and user.get("role") == "staff":
        assigned_to_id = str(user["_id"])

    setter_id = str(user["_id"]) if user.get("staff_type") == "setter" else None
    closer_id = str(user["_id"]) if user.get("staff_type") == "closer" else None

    init_log = LeadStatusLog(
        id=str(uuid.uuid4()),
        from_status=None,
        to_status="contacted" if (payload.initial_message and payload.initial_message.strip()) else "not contacted",
        changed_by_name=creator_name,
        changed_by_email=user.get("email"),
        changed_by_role=user.get("role"),
        changed_at=now_utc,
        notes="Chat started manually from dashboard",
    )

    new_conv_doc = {
        "tenant_id": tenant_id_str,
        "wa_user_phone": clean_phone_digits,
        "status": "human",
        "lead_status": "contacted" if (payload.initial_message and payload.initial_message.strip()) else "not contacted",
        "lead_name": payload.lead_name.strip() if payload.lead_name else None,
        "assigned_to": assigned_to_id,
        "setter_id": setter_id,
        "closer_id": closer_id,
        "notes": payload.notes.strip() if payload.notes else None,
        "lead_status_logs": [init_log.model_dump()],
        "created_at": now_utc,
        "last_message_at": now_utc,
        "last_message_text": payload.initial_message.strip()[:150] if (payload.initial_message and payload.initial_message.strip()) else "Chat initiated manually",
        "last_message_direction": "out" if (payload.initial_message and payload.initial_message.strip()) else None,
        "last_message_status": None,
        "has_unread": False,
        "unread_count": 0,
    }

    insert_result = await conversations.insert_one(new_conv_doc)
    conv_id = str(insert_result.inserted_id)
    new_conv_doc["_id"] = insert_result.inserted_id

    if payload.initial_message and payload.initial_message.strip():
        msg_text = payload.initial_message.strip()
        wa_msg_id = None
        token = tenant.get("whatsapp_access_token")
        phone_id = tenant.get("whatsapp_phone_number_id")

        if token and phone_id:
            try:
                wa_res = await send_text_message(phone_id, token, clean_phone_digits, msg_text)
                if isinstance(wa_res, dict):
                    wa_msgs = wa_res.get("messages") or []
                    if wa_msgs:
                        wa_msg_id = wa_msgs[0].get("id")
            except Exception as e:
                logger.warning("Could not send initial WhatsApp message to %s: %s", clean_phone_digits, e)

        msg = MessageInDB(
            conversation_id=conv_id,
            tenant_id=tenant_id_str,
            direction="out",
            text=msg_text,
            wa_message_id=wa_msg_id,
            status="sent" if wa_msg_id else "pending",
            timestamp=now_utc,
        )
        await messages.insert_one(msg.model_dump())
        await conversations.update_one(
            {"_id": insert_result.inserted_id},
            {
                "$set": {
                    "last_message_status": "sent" if wa_msg_id else "pending",
                }
            },
        )
        new_conv_doc["last_message_status"] = "sent" if wa_msg_id else "pending"

    from app.db import users
    staff_users = await users.find({"tenant_id": tenant_id_str}).to_list(length=100)
    user_map = _build_user_map(staff_users)
    return _conv_out(new_conv_doc, user_map=user_map)


async def find_available_closer(tenant_id: str) -> str | None:
    from app.services.assignment import get_active_closers
    online_closers = await get_active_closers(tenant_id)
    if not online_closers:
        return None

    closer_ids = [str(s["_id"]) for s in online_closers]
    pipeline = [
        {"$match": {"tenant_id": tenant_id, "closer_id": {"$in": closer_ids}}},
        {"$group": {"_id": "$closer_id", "count": {"$sum": 1}}}
    ]
    counts = await conversations.aggregate(pipeline).to_list(length=100)
    count_map = {c["_id"]: c["count"] for c in counts}

    # Pick closer with lowest active load
    online_closers.sort(key=lambda s: count_map.get(str(s["_id"]), 0))
    return str(online_closers[0]["_id"])


from app.core.deps import get_current_user
@router.get("/leads", response_model=list[ConversationOut])
async def get_my_leads(
    timeframe: str = "today",
    tz: str | None = None,
    user: dict = Depends(get_current_user)
):
    user_id_str = str(user["_id"])
    tenant_id = user["tenant_id"]
    staff_type = user.get("staff_type", "general")
    
    tenant_doc = await tenants.find_one({"_id": ObjectId(tenant_id)})
    tz_name = tz or user.get("timezone") or (tenant_doc.get("timezone") if tenant_doc else None) or "Asia/Kolkata"
    tz_obj = _get_tz(tz_name)

    now_tz = datetime.now(tz_obj)
    today_start = datetime(now_tz.year, now_tz.month, now_tz.day, 0, 0, 0, tzinfo=tz_obj)
    today_end = today_start + timedelta(days=1)

    start_dt = None
    end_dt = None
    if timeframe == "today":
        start_dt = today_start
        end_dt = today_end
    elif timeframe in ("week", "weekly"):
        start_dt = today_start - timedelta(days=6)
        end_dt = today_end
    elif timeframe in ("month", "monthly"):
        start_dt = today_start - timedelta(days=29)
        end_dt = today_end
    elif timeframe == "yesterday":
        start_dt = today_start - timedelta(days=1)
        end_dt = today_start

    base_conditions = [{"tenant_id": tenant_id}]
    if user.get("role") == "admin":
        pass
    elif staff_type == "setter":
        base_conditions.append({
            "$or": [
                {"setter_id": user_id_str},
                {"assigned_to": user_id_str}
            ]
        })
    elif staff_type == "closer":
        base_conditions.append({
            "$or": [
                {"closer_id": user_id_str},
                {"assigned_to": user_id_str}
            ]
        })
    else:
        base_conditions.append({
            "$or": [
                {"assigned_to": user_id_str},
                {"setter_id": user_id_str},
                {"closer_id": user_id_str}
            ]
        })

    if start_dt and end_dt:
        s_utc = start_dt.astimezone(timezone.utc)
        e_utc = end_dt.astimezone(timezone.utc)
        base_conditions.append({
            "$or": [
                {"created_at": {"$gte": s_utc, "$lt": e_utc}},
                {"last_message_at": {"$gte": s_utc, "$lt": e_utc}}
            ]
        })

    if len(base_conditions) == 1:
        query = base_conditions[0]
    else:
        query = {"$and": base_conditions}

    docs = await conversations.find(query).sort("last_message_at", -1).to_list(length=1000)
    
    from app.db import users as db_users
    staff_ids = set()
    for d in docs:
        for f in ["assigned_to", "setter_id", "closer_id"]:
            if d.get(f):
                staff_ids.add(ObjectId(d[f]))
            
    staff_users = await db_users.find({"_id": {"$in": list(staff_ids)}}).to_list(length=100)
    user_map = _build_user_map(staff_users)
    uname = user.get("name") or user["email"].split("@")[0].replace(".", " ").replace("_", " ").title()
    user_map[user_id_str] = {"email": user["email"], "name": uname}
    
    res = [_conv_out(d, user_map=user_map) for d in docs]
    res.sort(
        key=lambda c: _to_utc(c.last_message_at) or _to_utc(c.created_at) or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True
    )
    return res


@router.get("/analytics", response_model=LeadAnalyticsReport)
async def get_lead_analytics(
    timeframe: str = "all",
    staff_id: str | None = None,
    tz: str | None = None,
    admin: dict = Depends(get_current_admin)
):
    tenant_id = str(admin["tenant_id"])
    tenant_doc = await tenants.find_one({"_id": ObjectId(tenant_id)})
    tz_name = tz or (tenant_doc.get("timezone") if tenant_doc else None) or "Asia/Kolkata"
    tz_obj = _get_tz(tz_name)

    now_tz = datetime.now(tz_obj)
    today_start = datetime(now_tz.year, now_tz.month, now_tz.day, 0, 0, 0, tzinfo=tz_obj)
    today_end = today_start + timedelta(days=1)

    start_dt = None
    end_dt = None
    if timeframe == "today":
        start_dt = today_start
        end_dt = today_end
    elif timeframe == "yesterday":
        start_dt = today_start - timedelta(days=1)
        end_dt = today_start
    elif timeframe in ("week", "weekly"):
        start_dt = today_start - timedelta(days=6)
        end_dt = today_end
    elif timeframe in ("month", "monthly"):
        start_dt = today_start - timedelta(days=29)
        end_dt = today_end

    from app.db import users as db_users
    staff_docs = await db_users.find({"tenant_id": tenant_id, "role": "staff"}).to_list(length=100)
    user_map = _build_user_map(staff_docs)
    staff_type_map = {str(s["_id"]): s.get("staff_type", "general") for s in staff_docs}

    base_conditions = [{"tenant_id": tenant_id}]
    if start_dt and end_dt:
        s_utc = start_dt.astimezone(timezone.utc)
        e_utc = end_dt.astimezone(timezone.utc)
        base_conditions.append({
            "$or": [
                {"created_at": {"$gte": s_utc, "$lt": e_utc}},
                {"last_message_at": {"$gte": s_utc, "$lt": e_utc}}
            ]
        })

    if staff_id and staff_id != "all":
        if staff_id == "unassigned":
            base_conditions.append({"assigned_to": None})
        else:
            stype = staff_type_map.get(staff_id, "general")
            if stype == "setter":
                base_conditions.append({
                    "$or": [
                        {"setter_id": staff_id},
                        {"assigned_to": staff_id}
                    ]
                })
            elif stype == "closer":
                base_conditions.append({
                    "$or": [
                        {"closer_id": staff_id},
                        {"assigned_to": staff_id}
                    ]
                })
            else:
                base_conditions.append({
                    "$or": [
                        {"assigned_to": staff_id},
                        {"setter_id": staff_id},
                        {"closer_id": staff_id}
                    ]
                })

    if len(base_conditions) == 1:
        query = base_conditions[0]
    else:
        query = {"$and": base_conditions}

    docs = await conversations.find(query).sort("last_message_at", -1).to_list(length=1000)
    docs.sort(
        key=lambda d: _to_utc(d.get("last_message_at")) or _to_utc(d.get("created_at")) or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True
    )

    total_leads = len(docs)
    contacted_count = 0
    not_contacted_count = 0
    sales_closed_count = 0
    bot_count = 0
    human_count = 0

    stage_counts: dict[str, int] = {}
    staff_counts: dict[str, int] = {}

    staff_stat_map = {}
    for s in staff_docs:
        sid = str(s["_id"])
        sname = s.get("name") or s["email"].split("@")[0].replace(".", " ").replace("_", " ").title()
        staff_stat_map[sid] = {
            "staff_id": sid,
            "name": sname,
            "email": s["email"],
            "staff_type": s.get("staff_type", "general"),
            "timezone": s.get("timezone", tz_name),
            "total_assigned": 0,
            "contacted": 0,
            "not_contacted": 0,
            "follow_up": 0,
            "sales_closed": 0,
            "contact_rate": 0.0,
            "conversion_rate": 0.0,
        }

    for d in docs:
        st = d.get("lead_status", "not contacted").lower().strip()
        if st in ("ready to show up", "ready for showup", "ready for show up"):
            norm_st = "ready to showup"
        elif st in ("no show up", "no showup"):
            norm_st = "no showup"
        elif st in ("follow-up", "followup", "follow up"):
            norm_st = "follow up"
        elif st in ("sales close", "sales-close", "sales closed", "converted"):
            norm_st = "sales close"
        elif st in ("paid", "paid lead", "paid consultation", "paid-lead"):
            norm_st = "paid lead"
        elif st in ("unpaid", "unpaid lead", "unpaid consultation", "unpaid-lead"):
            norm_st = "unpaid lead"
        elif st in ("not interested", "not-interested"):
            norm_st = "not interested"
        elif st in ("junk", "junk lead", "junk leads", "junk-lead", "junk-leads"):
            norm_st = "junk leads"
        elif st in ("not answering", "not-answering", "no answer", "no-answer"):
            norm_st = "not answering"
        elif st in ("contacted", "qualify"):
            norm_st = "contacted"
        elif st in ("capture", "not contacted"):
            norm_st = "not contacted"
        else:
            norm_st = st or "not contacted"

        stage_counts[norm_st] = stage_counts.get(norm_st, 0) + 1

        # A lead is "pending" only if no staff action has been taken on it yet.
        # "not answering" (staff called, no answer) and "junk leads" (staff reviewed it)
        # both mean the lead has already been worked on.
        is_contacted = norm_st != "not contacted"
        if is_contacted:
            contacted_count += 1
        else:
            not_contacted_count += 1

        if norm_st in ("sales close", "converted", "paid lead"):
            sales_closed_count += 1

        if d.get("status") == "bot":
            bot_count += 1
        else:
            human_count += 1

        # Attribute leads to staff members based on their role matching staff panel query logic
        matched_any_staff = False
        for sid, s_entry in staff_stat_map.items():
            stype = s_entry["staff_type"]
            belongs = False
            if stype == "setter":
                belongs = (d.get("setter_id") == sid) or (d.get("assigned_to") == sid)
            elif stype == "closer":
                belongs = (d.get("closer_id") == sid) or (d.get("assigned_to") == sid)
            else:
                belongs = (d.get("assigned_to") == sid) or (d.get("setter_id") == sid) or (d.get("closer_id") == sid)

            if belongs:
                matched_any_staff = True
                s_entry["total_assigned"] += 1
                if is_contacted:
                    s_entry["contacted"] += 1
                else:
                    s_entry["not_contacted"] += 1
                if norm_st == "follow up":
                    s_entry["follow_up"] += 1
                if norm_st in ("sales close", "converted", "paid lead"):
                    s_entry["sales_closed"] += 1

        if not matched_any_staff and not d.get("assigned_to"):
            staff_counts["unassigned"] = staff_counts.get("unassigned", 0) + 1

    contact_rate = round((contacted_count / total_leads * 100), 1) if total_leads > 0 else 0.0
    conversion_rate = round((sales_closed_count / total_leads * 100), 1) if total_leads > 0 else 0.0

    stage_color_palette = {
        "not contacted": "#64748b",
        "contacted": "#3b82f6",
        "not answering": "#f43f5e",
        "follow up": "#f59e0b",
        "ready to showup": "#6366f1",
        "no showup": "#ea580c",
        "negotiable": "#a855f7",
        "sales close": "#10b981",
        "paid lead": "#059669",
        "unpaid lead": "#d97706",
        "not interested": "#71717a",
        "lead lost": "#e11d48",
        "junk leads": "#78716c",
    }
    stage_label_map = {
        "not contacted": "Not Contacted",
        "contacted": "Contacted",
        "not answering": "Not Answering",
        "follow up": "Follow Up",
        "ready to showup": "Ready to Showup",
        "no showup": "No Showup",
        "negotiable": "Negotiable",
        "sales close": "Sales Close",
        "paid lead": "Paid Lead",
        "unpaid lead": "Unpaid Lead",
        "not interested": "Not Interested",
        "lead lost": "Lead Lost",
        "junk leads": "Junk Leads",
    }
    status_distribution = []
    for k, v in stage_counts.items():
        pct = round((v / total_leads * 100), 1) if total_leads > 0 else 0.0
        status_distribution.append(SliceData(
            name=stage_label_map.get(k, k.title()),
            value=v,
            percentage=pct,
            color=stage_color_palette.get(k, "#64748b")
        ))
    status_distribution.sort(key=lambda x: x.value, reverse=True)

    staff_colors = ["#6366f1", "#06b6d4", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6", "#f97316"]
    staff_distribution = []
    color_idx = 0
    for sid, s_entry in staff_stat_map.items():
        count = s_entry["total_assigned"]
        if count > 0:
            pct = round((count / total_leads * 100), 1) if total_leads > 0 else 0.0
            staff_distribution.append(SliceData(
                name=s_entry.get("name") or sid,
                value=count,
                percentage=pct,
                color=staff_colors[color_idx % len(staff_colors)]
            ))
            color_idx += 1

    if staff_counts.get("unassigned", 0) > 0:
        u_count = staff_counts["unassigned"]
        pct = round((u_count / total_leads * 100), 1) if total_leads > 0 else 0.0
        staff_distribution.append(SliceData(
            name="Unassigned",
            value=u_count,
            percentage=pct,
            color="#94a3b8"
        ))
    staff_distribution.sort(key=lambda x: x.value, reverse=True)

    contact_distribution = [
        SliceData(
            name="Contacted",
            value=contacted_count,
            percentage=contact_rate,
            color="#3b82f6"
        ),
        SliceData(
            name="Not Contacted",
            value=not_contacted_count,
            percentage=round(100.0 - contact_rate, 1) if total_leads > 0 else 0.0,
            color="#f43f5e"
        )
    ]

    bot_pct = round((bot_count / total_leads * 100), 1) if total_leads > 0 else 0.0
    human_pct = round((human_count / total_leads * 100), 1) if total_leads > 0 else 0.0
    mode_distribution = [
        SliceData(name="AI Bot Autopilot", value=bot_count, percentage=bot_pct, color="#10b981"),
        SliceData(name="Human Agent", value=human_count, percentage=human_pct, color="#f59e0b"),
    ]

    final_staff_stats = []
    for s in staff_stat_map.values():
        tot = s["total_assigned"]
        s["contact_rate"] = round((s["contacted"] / tot * 100), 1) if tot > 0 else 0.0
        s["conversion_rate"] = round((s["sales_closed"] / tot * 100), 1) if tot > 0 else 0.0
        final_staff_stats.append(StaffLeadStat(**s))
    final_staff_stats.sort(key=lambda x: x.total_assigned, reverse=True)

    leads_out = [_conv_out(d, user_map=user_map) for d in docs[:100]]

    return LeadAnalyticsReport(
        timeframe=timeframe,
        start_date=start_dt.strftime("%Y-%m-%d") if start_dt else None,
        end_date=end_dt.strftime("%Y-%m-%d") if end_dt else None,
        timezone=tz_name,
        total_leads=total_leads,
        contacted_count=contacted_count,
        not_contacted_count=not_contacted_count,
        contact_rate=contact_rate,
        sales_closed_count=sales_closed_count,
        conversion_rate=conversion_rate,
        bot_count=bot_count,
        human_count=human_count,
        status_distribution=status_distribution,
        staff_distribution=staff_distribution,
        contact_distribution=contact_distribution,
        mode_distribution=mode_distribution,
        staff_stats=final_staff_stats,
        leads=leads_out
    )


def personalize_message(template: str, lead_name: str | None) -> str:
    if not template:
        return ""
    name_str = (lead_name or "").strip()
    pattern = re.compile(r'\{\{\s*name\s*\}\}|\{\s*name\s*\}', re.IGNORECASE)
    if name_str:
        return pattern.sub(name_str, template)
    else:
        # If no name provided, replace greetings like "Hi {{name}}," with "Hi there,"
        res = re.sub(r'(?i)\b(hi|hello|hey|dear)\s+\{\{\s*name\s*\}\}', r'\1 there', template)
        res = re.sub(r'(?i)\b(hi|hello|hey|dear)\s+\{\s*name\s*\}', r'\1 there', res)
        res = pattern.sub("", res)
        res = re.sub(r'[ \t]+', ' ', res)
        res = re.sub(r'\s+,', ',', res)
        return res.strip()


@router.post("/bulk-message", response_model=BulkMessageResponse)
async def send_bulk_messages(
    payload: BulkMessageRequest,
    user: dict = Depends(get_current_user),
    tenant: dict = Depends(get_current_tenant),
):
    token = tenant.get("whatsapp_access_token")
    phone_id = tenant.get("whatsapp_phone_number_id")

    if not token or not phone_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="WhatsApp credentials (Access Token and Phone Number ID) are not configured. Please configure them in Settings before sending messages."
        )

    clean_msg = (payload.message or "").strip()
    if not clean_msg:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message text cannot be empty")

    tenant_id_str = str(tenant["_id"])
    now_utc = datetime.now(timezone.utc)
    sender_name = user.get("name") or user.get("email", "").split("@")[0].title()

    # Targets: phone -> { phone, name, conv_id, conv_doc }
    targets: dict[str, dict] = {}

    # 1. From conversation_ids
    if payload.conversation_ids:
        obj_ids = []
        for cid in payload.conversation_ids:
            try:
                obj_ids.append(ObjectId(cid))
            except Exception:
                pass
        if obj_ids:
            conv_docs = await conversations.find({"_id": {"$in": obj_ids}, "tenant_id": tenant_id_str}).to_list(length=5000)
            for c in conv_docs:
                clean_phone = re.sub(r"[^\d]", "", c.get("wa_user_phone", ""))
                if clean_phone:
                    targets[clean_phone] = {
                        "phone": clean_phone,
                        "name": c.get("lead_name"),
                        "conv_id": str(c["_id"]),
                        "conv_doc": c
                    }

    # 2. From direct recipients
    if payload.recipients:
        for r in payload.recipients:
            clean_phone = re.sub(r"[^\d]", "", r.phone)
            if clean_phone:
                if clean_phone not in targets:
                    targets[clean_phone] = {
                        "phone": clean_phone,
                        "name": r.name,
                        "conv_id": r.conversation_id,
                        "conv_doc": None
                    }
                else:
                    if r.name and not targets[clean_phone]["name"]:
                        targets[clean_phone]["name"] = r.name

    if not targets:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No valid recipients specified")

    results: list[BulkMessageRecipientResult] = []
    sent_count = 0
    failed_count = 0

    for phone, target in targets.items():
        if len(phone) < 7:
            results.append(BulkMessageRecipientResult(
                phone=phone,
                name=target.get("name"),
                conversation_id=target.get("conv_id"),
                status="failed",
                error="Invalid phone number (must contain at least 7 digits)",
            ))
            failed_count += 1
            continue

        conv_doc = target.get("conv_doc")
        conv_id = target.get("conv_id")
        lead_name = target.get("name")

        # Find conversation in DB if not already loaded
        if not conv_doc:
            conv_doc = await conversations.find_one({
                "tenant_id": tenant_id_str,
                "$or": [
                    {"wa_user_phone": phone},
                    {"wa_user_phone": f"+{phone}"}
                ]
            })
            if conv_doc:
                conv_id = str(conv_doc["_id"])
                if not lead_name:
                    lead_name = conv_doc.get("lead_name")

        if conv_doc and conv_doc.get("is_blocked"):
            results.append(BulkMessageRecipientResult(
                phone=phone,
                name=lead_name,
                conversation_id=conv_id,
                status="failed",
                error="Contact is blocked",
            ))
            failed_count += 1
            continue

        personalized_body = personalize_message(clean_msg, lead_name)

        # If still no conversation, create one
        if not conv_id:
            init_log = LeadStatusLog(
                id=str(uuid.uuid4()),
                from_status=None,
                to_status="contacted",
                changed_by_name=sender_name,
                changed_by_email=user.get("email"),
                changed_by_role=user.get("role"),
                changed_at=now_utc,
                notes="Conversation created via bulk broadcast",
            )
            new_conv_doc = {
                "tenant_id": tenant_id_str,
                "wa_user_phone": phone,
                "status": "human",
                "lead_status": "contacted",
                "lead_name": lead_name,
                "assigned_to": str(user["_id"]) if user.get("role") == "staff" else None,
                "created_at": now_utc,
                "last_message_at": now_utc,
                "last_message_text": personalized_body[:150],
                "last_message_direction": "out",
                "last_message_status": "pending",
                "has_unread": False,
                "unread_count": 0,
                "lead_status_logs": [init_log.model_dump()],
            }
            ins = await conversations.insert_one(new_conv_doc)
            conv_id = str(ins.inserted_id)
            conv_doc = new_conv_doc

        wa_msg_id = None
        error_msg = None
        status_val = "failed"

        try:
            wa_res = await send_text_message(phone_id, token, phone, personalized_body)
            if isinstance(wa_res, dict):
                wa_msgs = wa_res.get("messages") or []
                if wa_msgs:
                    wa_msg_id = wa_msgs[0].get("id")
            status_val = "sent"
            sent_count += 1
        except httpx.HTTPStatusError as e:
            try:
                err_json = e.response.json()
                error_msg = err_json.get("error", {}).get("message", e.response.text)
            except Exception:
                error_msg = e.response.text or f"HTTP {e.response.status_code}"
            failed_count += 1
            logger.warning("Bulk WhatsApp message failed for %s: %s", phone, error_msg)
        except Exception as e:
            error_msg = str(e)
            failed_count += 1
            logger.warning("Bulk WhatsApp message error for %s: %s", phone, error_msg)

        # Record outbound message in DB
        msg_doc = MessageInDB(
            conversation_id=conv_id,
            tenant_id=tenant_id_str,
            direction="out",
            text=personalized_body,
            wa_message_id=wa_msg_id,
            status=status_val,
            timestamp=now_utc,
        )
        await messages.insert_one(msg_doc.model_dump())

        # Update conversation status
        conv_updates: dict = {
            "last_message_at": now_utc,
            "last_message_text": personalized_body[:150],
            "last_message_direction": "out",
            "last_message_status": status_val,
            "has_unread": False,
        }

        # If lead was not contacted, update status to contacted
        if conv_doc and conv_doc.get("lead_status") in [None, "not contacted"]:
            conv_updates["lead_status"] = "contacted"
            log_item = LeadStatusLog(
                id=str(uuid.uuid4()),
                from_status=conv_doc.get("lead_status"),
                to_status="contacted",
                changed_by_name=sender_name,
                changed_by_email=user.get("email"),
                changed_by_role=user.get("role"),
                changed_at=now_utc,
                notes="Contacted via bulk message",
            )
            await conversations.update_one(
                {"_id": ObjectId(conv_id)},
                {"$set": conv_updates, "$push": {"lead_status_logs": log_item.model_dump()}}
            )
        else:
            await conversations.update_one(
                {"_id": ObjectId(conv_id)},
                {"$set": conv_updates}
            )

        results.append(BulkMessageRecipientResult(
            phone=phone,
            name=lead_name,
            conversation_id=conv_id,
            status=status_val,
            error=error_msg,
            wa_message_id=wa_msg_id,
        ))

        # Brief rate compliance pause between WhatsApp API requests
        await asyncio.sleep(0.1)

    campaign_title = payload.campaign_name.strip() if payload.campaign_name and payload.campaign_name.strip() else f"Broadcast {now_utc.strftime('%b %d, %Y %H:%M')}"
    broadcast_doc = {
        "tenant_id": tenant_id_str,
        "created_by_id": str(user["_id"]),
        "created_by_name": sender_name,
        "campaign_name": campaign_title,
        "message": clean_msg,
        "total": len(targets),
        "sent_count": sent_count,
        "failed_count": failed_count,
        "created_at": now_utc,
        "results": [r.model_dump() for r in results],
    }
    b_ins = await broadcasts.insert_one(broadcast_doc)

    return BulkMessageResponse(
        success=True,
        total=len(targets),
        sent_count=sent_count,
        failed_count=failed_count,
        broadcast_id=str(b_ins.inserted_id),
        message=f"Sent {sent_count} of {len(targets)} message(s) successfully" + (f" ({failed_count} failed)" if failed_count else ""),
        results=results,
    )


@router.get("/broadcasts", response_model=list[BroadcastSummaryOut])
async def list_broadcasts(
    tenant: dict = Depends(get_current_tenant),
):
    tenant_id_str = str(tenant["_id"])
    docs = await broadcasts.find({"tenant_id": tenant_id_str}).sort("created_at", -1).to_list(length=100)
    out = []
    for d in docs:
        out.append(BroadcastSummaryOut(
            id=str(d["_id"]),
            campaign_name=d.get("campaign_name", "Broadcast"),
            message=d.get("message", ""),
            created_by_name=d.get("created_by_name"),
            created_at=d.get("created_at", datetime.now(timezone.utc)),
            total=d.get("total", 0),
            sent_count=d.get("sent_count", 0),
            failed_count=d.get("failed_count", 0),
        ))
    return out


@router.get("/broadcasts/{broadcast_id}", response_model=BroadcastDetailOut)
async def get_broadcast_details(
    broadcast_id: str,
    tenant: dict = Depends(get_current_tenant),
):
    tenant_id_str = str(tenant["_id"])
    if not ObjectId.is_valid(broadcast_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid broadcast ID")
    d = await broadcasts.find_one({"_id": ObjectId(broadcast_id), "tenant_id": tenant_id_str})
    if not d:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Broadcast not found")

    raw_results = d.get("results", [])
    results = [BulkMessageRecipientResult(**r) for r in raw_results]

    return BroadcastDetailOut(
        id=str(d["_id"]),
        campaign_name=d.get("campaign_name", "Broadcast"),
        message=d.get("message", ""),
        created_by_name=d.get("created_by_name"),
        created_at=d.get("created_at", datetime.now(timezone.utc)),
        total=d.get("total", 0),
        sent_count=d.get("sent_count", 0),
        failed_count=d.get("failed_count", 0),
        results=results,
    )


@router.get("/{conversation_id}", response_model=ConversationOut)
async def get_conversation(conversation_id: str, tenant: dict = Depends(get_current_tenant)):
    if not ObjectId.is_valid(conversation_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    conv = await conversations.find_one({"_id": ObjectId(conversation_id), "tenant_id": str(tenant["_id"])})
    if conv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
        
    from app.db import users
    staff_ids = []
    for f in ["assigned_to", "setter_id", "closer_id"]:
        if conv.get(f):
            staff_ids.append(ObjectId(conv[f]))
            
    user_map = {}
    if staff_ids:
        staff_users = await users.find({"_id": {"$in": staff_ids}}).to_list(length=10)
        user_map = _build_user_map(staff_users)
            
    return _conv_out(conv, user_map=user_map)



@router.get("/{conversation_id}/messages", response_model=list[MessageOut])
async def get_conversation_messages(conversation_id: str, tenant: dict = Depends(get_current_tenant)):
    if not ObjectId.is_valid(conversation_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    conv = await conversations.find_one({"_id": ObjectId(conversation_id), "tenant_id": str(tenant["_id"])})
    if conv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    docs = await messages.find({"conversation_id": conversation_id}).sort("timestamp", 1).to_list(length=1000)
    await conversations.update_one(
        {"_id": ObjectId(conversation_id)},
        {"$set": {"has_unread": False, "unread_count": 0}}
    )

    # Determine latest customer activity (either latest incoming message or last_customer_read_at)
    latest_incoming_time = None
    for d in reversed(docs):
        if d.get("direction") == "in":
            latest_incoming_time = _to_utc(d.get("timestamp"))
            break

    last_cust_read = _to_utc(conv.get("last_customer_read_at"))
    cutoff = latest_incoming_time
    if last_cust_read:
        if not cutoff or last_cust_read > cutoff:
            cutoff = last_cust_read

    return [_msg_out(d, customer_read_cutoff=cutoff) for d in docs]


@router.patch("/{conversation_id}/status", response_model=ConversationOut)
async def update_conversation_status(
    conversation_id: str, payload: ConversationStatusUpdate, user: dict = Depends(get_current_user)
):
    tenant_id = user["tenant_id"]
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    conv = await conversations.find_one({"_id": ObjectId(conversation_id), "tenant_id": tenant_id})
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    if "lead_name" in update_data:
        val = update_data["lead_name"]
        update_data["lead_name"] = val.strip() if (val and isinstance(val, str) and val.strip()) else None

    from app.db import users as db_users

    # A manual transfer (including to "unassigned") overrides the auto-assign queue
    if "assigned_to" in update_data:
        update_data["pending_auto_assign"] = False

    # If assigned_to is manually updated, keep role IDs synchronized
    if "assigned_to" in update_data and update_data["assigned_to"]:
        try:
            target_user = await db_users.find_one({"_id": ObjectId(update_data["assigned_to"]), "tenant_id": tenant_id})
            if target_user:
                if target_user.get("staff_type") == "setter":
                    update_data["setter_id"] = update_data["assigned_to"]
                elif target_user.get("staff_type") == "closer":
                    update_data["closer_id"] = update_data["assigned_to"]
        except Exception:
            pass

    staff_name = user.get("name") or user.get("email", "").split("@")[0].replace(".", " ").title()
    staff_role = user.get("staff_type") or user.get("role", "staff")

    # If a setter or closer is updating the lead, ensure role IDs are preserved so they retain tracking
    if user.get("staff_type") == "setter":
        if not conv.get("setter_id"):
            update_data["setter_id"] = str(user["_id"])
    elif user.get("staff_type") == "closer":
        if not conv.get("closer_id"):
            update_data["closer_id"] = str(user["_id"])

    new_lead_status = update_data.get("lead_status")
    status_log_entry = None
    if new_lead_status:
        norm_status = new_lead_status.lower().strip()
        if norm_status in ("ready to show up", "ready for showup", "ready for show up"):
            norm_status = "ready to showup"
        elif norm_status in ("no show up", "no showup"):
            norm_status = "no showup"
        elif norm_status in ("follow-up", "followup", "follow up"):
            norm_status = "follow up"
        elif norm_status in ("sales close", "sales-close", "sales closed"):
            norm_status = "sales close"
        elif norm_status in ("paid", "paid lead", "paid consultation", "paid-lead"):
            norm_status = "paid lead"
        elif norm_status in ("unpaid", "unpaid lead", "unpaid consultation", "unpaid-lead"):
            norm_status = "unpaid lead"
        elif norm_status in ("not interested", "not-interested"):
            norm_status = "not interested"
        elif norm_status in ("not answering", "not-answering", "no answer", "no-answer"):
            norm_status = "not answering"
        elif norm_status in ("junk", "junk lead", "junk leads", "junk-lead", "junk-leads"):
            norm_status = "junk leads"
        update_data["lead_status"] = norm_status

        old_status = conv.get("lead_status", "not contacted")
        if old_status != norm_status:
            status_log_entry = {
                "id": uuid.uuid4().hex[:12],
                "from_status": old_status,
                "to_status": norm_status,
                "changed_by_name": staff_name,
                "changed_by_email": user.get("email"),
                "changed_by_role": staff_role,
                "changed_at": datetime.now(timezone.utc),
                "notes": update_data.get("notes") or None,
            }

        # Automatic closer transfer when status reaches "ready to showup"
        if norm_status == "ready to showup":
            if user.get("staff_type") == "closer":
                # Closer already owns this lead
                update_data["closer_id"] = str(user["_id"])
                update_data["assigned_to"] = str(user["_id"])
            else:
                # If setter worked on it, preserve setter_id
                if not conv.get("setter_id"):
                    if user.get("staff_type") == "setter":
                        update_data["setter_id"] = str(user["_id"])
                    elif conv.get("assigned_to"):
                        assigned_u = await db_users.find_one({"_id": ObjectId(conv["assigned_to"])})
                        if assigned_u and assigned_u.get("staff_type") == "setter":
                            update_data["setter_id"] = conv["assigned_to"]

                # Transfer to closer only if a closer is currently online
                closer_id = conv.get("closer_id")
                if not closer_id:
                    closer_id = await find_available_closer(tenant_id)
                if closer_id:
                    update_data["closer_id"] = closer_id
                    update_data["assigned_to"] = closer_id
                    update_data["pending_closer_transfer"] = False
                else:
                    # Closer is offline: keep with current setter and queue for closer when they come online
                    update_data["pending_closer_transfer"] = True

    if "payment" in update_data and update_data["payment"] is not None:
        p_data = update_data["payment"]
        def _to_float(v):
            if v is None or v == "": return None
            try: return float(v)
            except: return None
        tot = _to_float(p_data.get("total_payment"))
        adv = _to_float(p_data.get("advance_payment"))
        rem = _to_float(p_data.get("remaining_payment"))
        if rem is None and tot is not None and adv is not None:
            rem = max(0.0, tot - adv)
        
        p_record = {
            "total_payment": tot,
            "advance_payment": adv,
            "remaining_payment": rem,
            "purpose": p_data.get("purpose"),
            "notes": p_data.get("notes"),
            "recorded_at": datetime.now(timezone.utc),
            "recorded_by_name": staff_name,
            "recorded_by_email": user.get("email"),
        }
        update_data["payment"] = p_record
        if p_record.get("notes") and "notes" not in update_data:
            update_data["notes"] = p_record["notes"]

    if "is_blocked" in update_data:
        if update_data["is_blocked"]:
            update_data["is_blocked"] = True
            update_data["blocked_at"] = datetime.now(timezone.utc)
            update_data["blocked_by_name"] = staff_name
            update_data["blocked_reason"] = update_data.get("blocked_reason") or "Vague or spam messages"
            update_data["pending_auto_assign"] = False
            status_log_entry = {
                "id": uuid.uuid4().hex[:12],
                "from_status": conv.get("lead_status", "not contacted"),
                "to_status": conv.get("lead_status", "not contacted"),
                "changed_by_name": staff_name,
                "changed_by_email": user.get("email"),
                "changed_by_role": staff_role,
                "changed_at": datetime.now(timezone.utc),
                "notes": f"Chat blocked: {update_data['blocked_reason']}",
            }
        else:
            update_data["is_blocked"] = False
            update_data["blocked_at"] = None
            update_data["blocked_by_name"] = None
            update_data["blocked_reason"] = None
            status_log_entry = {
                "id": uuid.uuid4().hex[:12],
                "from_status": conv.get("lead_status", "not contacted"),
                "to_status": conv.get("lead_status", "not contacted"),
                "changed_by_name": staff_name,
                "changed_by_email": user.get("email"),
                "changed_by_role": staff_role,
                "changed_at": datetime.now(timezone.utc),
                "notes": "Chat unblocked",
            }

    mongo_ops: dict = {"$set": update_data}
    if status_log_entry:
        mongo_ops["$push"] = {"lead_status_logs": status_log_entry}

    result = await conversations.find_one_and_update(
        {"_id": ObjectId(conversation_id), "tenant_id": tenant_id},
        mongo_ops,
        return_document=ReturnDocument.AFTER,
    )
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
        
    staff_ids = []
    for f in ["assigned_to", "setter_id", "closer_id"]:
        if result.get(f):
            try:
                staff_ids.append(ObjectId(result[f]))
            except Exception:
                pass
            
    user_map = {}
    if staff_ids:
        staff_users = await db_users.find({"_id": {"$in": staff_ids}}).to_list(length=10)
        user_map = _build_user_map(staff_users)
        
    return _conv_out(result, user_map=user_map)


@router.post("/{conversation_id}/block", response_model=ConversationOut)
async def block_conversation(
    conversation_id: str,
    payload: BlockChatRequest | None = None,
    user: dict = Depends(get_current_user),
):
    tenant_id = user["tenant_id"]
    try:
        conv = await conversations.find_one({"_id": ObjectId(conversation_id), "tenant_id": tenant_id})
    except Exception:
        conv = None
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    staff_name = user.get("name") or user.get("email", "").split("@")[0].replace(".", " ").title()
    staff_role = user.get("staff_type") or user.get("role", "staff")
    reason = (payload.reason.strip() if payload and payload.reason and payload.reason.strip() else None) or "Vague or spam messages"
    now_utc = datetime.now(timezone.utc)

    status_log_entry = {
        "id": uuid.uuid4().hex[:12],
        "from_status": conv.get("lead_status", "not contacted"),
        "to_status": conv.get("lead_status", "not contacted"),
        "changed_by_name": staff_name,
        "changed_by_email": user.get("email"),
        "changed_by_role": staff_role,
        "changed_at": now_utc,
        "notes": f"Chat blocked: {reason}",
    }

    clean_phone = re.sub(r"[^\d]", "", conv.get("wa_user_phone", ""))
    phone_filters: list[dict] = [{"_id": ObjectId(conversation_id)}]
    if clean_phone:
        phone_filters.extend([{"wa_user_phone": clean_phone}, {"wa_user_phone": f"+{clean_phone}"}])

    await conversations.update_many(
        {"tenant_id": tenant_id, "$or": phone_filters},
        {
            "$set": {
                "is_blocked": True,
                "blocked_at": now_utc,
                "blocked_by_name": staff_name,
                "blocked_reason": reason,
                "pending_auto_assign": False,
            },
            "$push": {"lead_status_logs": status_log_entry}
        }
    )

    result = await conversations.find_one({"_id": ObjectId(conversation_id)})
    from app.db import users as db_users
    staff_ids = []
    for f in ["assigned_to", "setter_id", "closer_id"]:
        if result.get(f):
            try: staff_ids.append(ObjectId(result[f]))
            except Exception: pass
    user_map = {}
    if staff_ids:
        staff_users = await db_users.find({"_id": {"$in": staff_ids}}).to_list(length=10)
        user_map = _build_user_map(staff_users)
    return _conv_out(result, user_map=user_map)


@router.post("/{conversation_id}/unblock", response_model=ConversationOut)
async def unblock_conversation(
    conversation_id: str,
    user: dict = Depends(get_current_user),
):
    tenant_id = user["tenant_id"]
    try:
        conv = await conversations.find_one({"_id": ObjectId(conversation_id), "tenant_id": tenant_id})
    except Exception:
        conv = None
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    staff_name = user.get("name") or user.get("email", "").split("@")[0].replace(".", " ").title()
    staff_role = user.get("staff_type") or user.get("role", "staff")
    now_utc = datetime.now(timezone.utc)

    status_log_entry = {
        "id": uuid.uuid4().hex[:12],
        "from_status": conv.get("lead_status", "not contacted"),
        "to_status": conv.get("lead_status", "not contacted"),
        "changed_by_name": staff_name,
        "changed_by_email": user.get("email"),
        "changed_by_role": staff_role,
        "changed_at": now_utc,
        "notes": "Chat unblocked",
    }

    clean_phone = re.sub(r"[^\d]", "", conv.get("wa_user_phone", ""))
    phone_filters: list[dict] = [{"_id": ObjectId(conversation_id)}]
    if clean_phone:
        phone_filters.extend([{"wa_user_phone": clean_phone}, {"wa_user_phone": f"+{clean_phone}"}])

    await conversations.update_many(
        {"tenant_id": tenant_id, "$or": phone_filters},
        {
            "$set": {
                "is_blocked": False,
                "blocked_at": None,
                "blocked_by_name": None,
                "blocked_reason": None,
            },
            "$push": {"lead_status_logs": status_log_entry}
        }
    )

    result = await conversations.find_one({"_id": ObjectId(conversation_id)})
    from app.db import users as db_users
    staff_ids = []
    for f in ["assigned_to", "setter_id", "closer_id"]:
        if result.get(f):
            try: staff_ids.append(ObjectId(result[f]))
            except Exception: pass
    user_map = {}
    if staff_ids:
        staff_users = await db_users.find({"_id": {"$in": staff_ids}}).to_list(length=10)
        user_map = _build_user_map(staff_users)
    return _conv_out(result, user_map=user_map)


@router.get("/{conversation_id}/status-logs", response_model=list[LeadStatusLog])
async def get_conversation_status_logs(
    conversation_id: str, user: dict = Depends(get_current_user)
):
    tenant_id = user["tenant_id"]
    try:
        conv = await conversations.find_one({"_id": ObjectId(conversation_id), "tenant_id": tenant_id})
    except Exception:
        conv = None
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    
    raw_logs = conv.get("lead_status_logs") or []
    logs: list[LeadStatusLog] = []
    if isinstance(raw_logs, list):
        for entry in raw_logs:
            if isinstance(entry, dict):
                try:
                    logs.append(
                        LeadStatusLog(
                            id=str(entry.get("id")) if entry.get("id") else None,
                            from_status=entry.get("from_status"),
                            to_status=entry.get("to_status", "not contacted"),
                            changed_by_name=entry.get("changed_by_name"),
                            changed_by_email=entry.get("changed_by_email"),
                            changed_by_role=entry.get("changed_by_role"),
                            changed_at=_to_utc(entry.get("changed_at")) or _to_utc(conv.get("created_at")) or datetime.now(timezone.utc),
                            notes=entry.get("notes"),
                        )
                    )
                except Exception:
                    pass
    if not logs:
        logs.append(
            LeadStatusLog(
                id="init",
                from_status=None,
                to_status=conv.get("lead_status", "not contacted"),
                changed_by_name="System",
                changed_by_email=None,
                changed_by_role="System",
                changed_at=_to_utc(conv.get("created_at")) or datetime.now(timezone.utc),
                notes="Initial status on lead capture",
            )
        )
    # Sort newest first
    logs.sort(key=lambda x: x.changed_at, reverse=True)
    return logs


@router.post("/{conversation_id}/messages", response_model=MessageOut)
async def send_manual_message(
    conversation_id: str, payload: MessageCreate, tenant: dict = Depends(get_current_tenant)
):
    conv = await conversations.find_one({"_id": ObjectId(conversation_id), "tenant_id": str(tenant["_id"])})
    if conv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    if conv.get("is_blocked"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This conversation is blocked. Please unblock the contact first before sending messages."
        )

    wa_msg_id = None
    try:
        wa_res = await send_text_message(
            tenant["whatsapp_phone_number_id"], tenant["whatsapp_access_token"], conv["wa_user_phone"], payload.text
        )
        if isinstance(wa_res, dict):
            wa_msgs = wa_res.get("messages") or []
            if wa_msgs:
                wa_msg_id = wa_msgs[0].get("id")
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 401:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="WhatsApp API token is invalid or expired. Please update it in Settings.")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to send message: {e.response.text}")

    msg = MessageInDB(
        conversation_id=conversation_id,
        tenant_id=str(tenant["_id"]),
        direction="out",
        text=payload.text,
        wa_message_id=wa_msg_id,
        status="sent"
    )
    result = await messages.insert_one(msg.model_dump())
    
    now_utc = datetime.now(timezone.utc)
    conv_q = {"$or": [{"_id": ObjectId(conversation_id)}, {"_id": conversation_id}]} if ObjectId.is_valid(conversation_id) else {"_id": conversation_id}
    await conversations.update_one(
        conv_q,
        {
            "$set": {
                "last_message_at": now_utc,
                "last_message_text": payload.text[:150],
                "last_message_direction": "out",
                "last_message_status": "sent",
                "has_unread": False,
                "unread_count": 0,
            }
        },
    )

    new_msg = await messages.find_one({"_id": result.inserted_id})
    return _msg_out(new_msg)


@router.patch("/{conversation_id}/messages/{message_id}", response_model=MessageOut)
async def edit_message(
    conversation_id: str,
    message_id: str,
    payload: MessageUpdate,
    tenant: dict = Depends(get_current_tenant),
):
    conv_q = {"_id": ObjectId(conversation_id), "tenant_id": str(tenant["_id"])} if ObjectId.is_valid(conversation_id) else {"_id": conversation_id, "tenant_id": str(tenant["_id"])}
    conv = await conversations.find_one(conv_q)
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    msg_q = {"_id": ObjectId(message_id), "conversation_id": conversation_id} if ObjectId.is_valid(message_id) else {"_id": message_id, "conversation_id": conversation_id}
    msg = await messages.find_one(msg_q)
    if not msg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

    new_text = payload.text.strip()
    if not new_text and not msg.get("media_url"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message text cannot be empty")

    now_utc = datetime.now(timezone.utc)
    updated_msg = await messages.find_one_and_update(
        msg_q,
        {
            "$set": {
                "text": new_text,
                "is_edited": True,
                "edited_at": now_utc,
            }
        },
        return_document=ReturnDocument.AFTER,
    )

    latest = await messages.find({"conversation_id": conversation_id}).sort("timestamp", -1).limit(1).to_list(1)
    if latest and str(latest[0]["_id"]) == str(updated_msg["_id"]):
        await conversations.update_one(
            conv_q,
            {"$set": {"last_message_text": new_text[:150] or "Attachment"}}
        )

    return _msg_out(updated_msg)


@router.delete("/{conversation_id}/messages/{message_id}")
async def delete_message(
    conversation_id: str,
    message_id: str,
    tenant: dict = Depends(get_current_tenant),
):
    conv_q = {"_id": ObjectId(conversation_id), "tenant_id": str(tenant["_id"])} if ObjectId.is_valid(conversation_id) else {"_id": conversation_id, "tenant_id": str(tenant["_id"])}
    conv = await conversations.find_one(conv_q)
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    msg_q = {"_id": ObjectId(message_id), "conversation_id": conversation_id} if ObjectId.is_valid(message_id) else {"_id": message_id, "conversation_id": conversation_id}
    msg = await messages.find_one(msg_q)
    if not msg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

    await messages.delete_one(msg_q)

    latest = await messages.find({"conversation_id": conversation_id}).sort("timestamp", -1).limit(1).to_list(1)
    if latest:
        last_doc = latest[0]
        preview_text = last_doc.get("text") or ""
        if not preview_text:
            m_type = last_doc.get("media_type")
            if m_type == "image":
                preview_text = "📷 Photo"
            elif m_type == "video":
                preview_text = "🎥 Video"
            elif m_type == "audio":
                preview_text = "🎤 Voice note"
            elif m_type:
                preview_text = "Attachment"
        await conversations.update_one(
            conv_q,
            {
                "$set": {
                    "last_message_at": _to_utc(last_doc.get("timestamp")),
                    "last_message_text": preview_text[:150],
                    "last_message_direction": last_doc.get("direction", "out"),
                    "last_message_status": last_doc.get("status", "sent"),
                }
            }
        )
    else:
        await conversations.update_one(
            conv_q,
            {
                "$set": {
                    "last_message_text": "",
                    "has_unread": False,
                    "unread_count": 0,
                }
            }
        )

    return {"status": "ok", "deleted_id": message_id}


@router.api_route("/media/{filename}", methods=["GET", "HEAD"])
async def get_media_file(filename: str):
    safe_name = os.path.basename(filename)
    file_path = os.path.join(UPLOAD_DIR, safe_name)
    
    # Auto-heal: If file is not present on disk, retrieve it on-demand from WhatsApp Cloud API
    if not os.path.isfile(file_path):
        media_id = safe_name.split("_")[0]
        if media_id.isdigit():
            tenant = None
            try:
                msg = await messages.find_one({
                    "$or": [
                        {"media_url": {"$regex": re.escape(safe_name)}},
                        {"media_filename": safe_name},
                        {"media_url": {"$regex": media_id}}
                    ]
                })
                if msg and msg.get("tenant_id"):
                    t_id = msg["tenant_id"]
                    try:
                        tenant = await tenants.find_one({"_id": ObjectId(t_id)})
                    except Exception:
                        tenant = await tenants.find_one({"_id": t_id})
            except Exception as e:
                logger.warning("Error finding message for media %s: %s", safe_name, e)

            if not tenant:
                tenant = await tenants.find_one({"whatsapp_access_token": {"$ne": None, "$ne": ""}})
            
            if tenant and tenant.get("whatsapp_access_token"):
                try:
                    from app.services.whatsapp_client import download_media
                    file_bytes, _ = await download_media(media_id, tenant["whatsapp_access_token"])
                    os.makedirs(UPLOAD_DIR, exist_ok=True)
                    with open(file_path, "wb") as f:
                        f.write(file_bytes)
                    logger.info("Successfully recovered and cached WhatsApp media %s to %s", safe_name, file_path)
                except Exception as e:
                    logger.error("Failed on-demand download for WhatsApp media %s: %s", safe_name, e)

    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    import mimetypes
    media_type, _ = mimetypes.guess_type(file_path)
    fn = safe_name.lower()
    if fn.endswith(".ogg") or fn.endswith(".opus"):
        media_type = "audio/ogg"
    elif fn.endswith(".m4a") or fn.endswith(".aac"):
        media_type = "audio/mp4"
    elif fn.endswith(".mp3"):
        media_type = "audio/mpeg"
    elif fn.endswith(".wav"):
        media_type = "audio/wav"
    elif fn.endswith(".amr"):
        media_type = "audio/amr"
    elif fn.endswith(".jpg") or fn.endswith(".jpeg"):
        media_type = "image/jpeg"
    elif fn.endswith(".png"):
        media_type = "image/png"
    elif fn.endswith(".webp"):
        media_type = "image/webp"
    elif fn.endswith(".gif"):
        media_type = "image/gif"
    elif fn.endswith(".mp4"):
        media_type = "video/mp4"
    elif fn.endswith(".3gp") or fn.endswith(".3gpp"):
        media_type = "video/3gpp"
    elif fn.endswith(".mov"):
        media_type = "video/quicktime"
    elif fn.endswith(".webm"):
        media_type = "video/webm"
    elif fn.endswith(".pdf"):
        media_type = "application/pdf"
    
    headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=86400",
    }
    return FileResponse(
        file_path, 
        media_type=media_type or "application/octet-stream", 
        content_disposition_type="inline",
        headers=headers
    )


@router.post("/{conversation_id}/attachments", response_model=MessageOut)
async def send_attachment(
    conversation_id: str,
    file: UploadFile = File(...),
    caption: str | None = Form(None),
    tenant: dict = Depends(get_current_tenant),
):
    conv = await conversations.find_one({"_id": ObjectId(conversation_id), "tenant_id": str(tenant["_id"])})
    if conv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    if conv.get("is_blocked"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This conversation is blocked. Please unblock the contact first before sending attachments."
        )

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file uploaded")

    filename = file.filename or "attachment"
    mime_type = file.content_type or "application/octet-stream"

    safe_filename = f"{uuid.uuid4().hex[:12]}_{filename}"
    local_path = os.path.join(UPLOAD_DIR, safe_filename)
    with open(local_path, "wb") as f:
        f.write(file_bytes)

    if mime_type.startswith("image/"):
        media_type = "image"
    elif mime_type.startswith("video/") or filename.lower().endswith((".mp4", ".3gp", ".mov", ".m4v", ".webm")):
        media_type = "video"
        if mime_type == "application/octet-stream" or not mime_type:
            mime_type = "video/mp4"
    elif mime_type.startswith("audio/"):
        media_type = "audio"
    else:
        media_type = "document"
    media_url = f"/conversations/media/{safe_filename}"

    wa_msg_id = None
    try:
        wa_res = await send_media_message(
            phone_number_id=tenant["whatsapp_phone_number_id"],
            access_token=tenant["whatsapp_access_token"],
            to=conv["wa_user_phone"],
            file_bytes=file_bytes,
            filename=filename,
            mime_type=mime_type,
            caption=caption,
        )
        if isinstance(wa_res, dict):
            wa_msgs = wa_res.get("messages") or []
            if wa_msgs:
                wa_msg_id = wa_msgs[0].get("id")
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 401:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="WhatsApp API token is invalid or expired. Please update it in Settings.")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to send attachment via WhatsApp: {e.response.text}")

    msg = MessageInDB(
        conversation_id=conversation_id,
        tenant_id=str(tenant["_id"]),
        direction="out",
        text=caption or filename,
        media_url=media_url,
        media_type=media_type,
        media_filename=filename,
        wa_message_id=wa_msg_id,
        status="sent",
    )
    result = await messages.insert_one(msg.model_dump())

    now_utc = datetime.now(timezone.utc)
    conv_q = {"$or": [{"_id": ObjectId(conversation_id)}, {"_id": conversation_id}]} if ObjectId.is_valid(conversation_id) else {"_id": conversation_id}
    await conversations.update_one(
        conv_q,
        {
            "$set": {
                "last_message_at": now_utc,
                "last_message_text": (caption or filename)[:150],
                "last_message_direction": "out",
                "last_message_status": "sent",
                "has_unread": False,
                "unread_count": 0,
            }
        },
    )

    new_msg = await messages.find_one({"_id": result.inserted_id})
    return _msg_out(new_msg)


@router.post("/bulk-assign", response_model=BulkAssignResponse)
async def bulk_assign_conversations(
    payload: BulkAssignRequest,
    admin: dict = Depends(get_current_admin)
):
    tenant_id = admin["tenant_id"]
    if not payload.conversation_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No conversations selected")

    from app.db import users as db_users
    
    obj_ids = []
    for cid in payload.conversation_ids:
        try:
            obj_ids.append(ObjectId(cid))
        except Exception:
            pass

    if not obj_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid conversation IDs")

    if payload.assigned_to == "unassigned":
        res = await conversations.update_many(
            {"_id": {"$in": obj_ids}, "tenant_id": tenant_id},
            {"$set": {"assigned_to": None, "setter_id": None, "closer_id": None, "pending_auto_assign": False}}
        )
        return BulkAssignResponse(
            success=True,
            modified_count=res.modified_count,
            message=f"Successfully unassigned {res.modified_count} lead(s)"
        )

    if payload.assigned_to == "round_robin":
        from app.services.assignment import get_all_active_staff
        staff_members = await get_all_active_staff(str(tenant_id))
        
        if not staff_members:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No staff are online right now"
            )

        # Only distribute leads that are currently unassigned
        unassigned_convs = await conversations.find({
            "_id": {"$in": obj_ids},
            "tenant_id": tenant_id,
            "assigned_to": None
        }).to_list(length=1000)

        if not unassigned_convs:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="None of the selected leads are unassigned. Split Evenly only distributes unassigned leads."
            )

        modified = 0
        for i, conv_doc in enumerate(unassigned_convs):
            target_staff = staff_members[i % len(staff_members)]
            staff_id_str = str(target_staff["_id"])
            upd = {"assigned_to": staff_id_str, "pending_auto_assign": False}
            if target_staff.get("staff_type") == "setter":
                upd["setter_id"] = staff_id_str
            elif target_staff.get("staff_type") == "closer":
                upd["closer_id"] = staff_id_str

            r = await conversations.update_one(
                {"_id": conv_doc["_id"], "tenant_id": tenant_id, "assigned_to": None},
                {"$set": upd}
            )
            if r.modified_count:
                modified += 1

        names = ", ".join((s.get("name") or s.get("email", "")) for s in staff_members)
        skipped = len(obj_ids) - len(unassigned_convs)
        msg = f"Successfully distributed {modified} unassigned lead(s) evenly among {len(staff_members)} online staff: {names}"
        if skipped > 0:
            msg += f" ({skipped} already-assigned lead(s) were kept unchanged)"
        return BulkAssignResponse(
            success=True,
            modified_count=modified,
            message=msg
        )

    target_staff = await db_users.find_one({
        "_id": ObjectId(payload.assigned_to),
        "tenant_id": tenant_id
    })
    if not target_staff:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Selected staff member not found")

    staff_id_str = str(target_staff["_id"])
    staff_name = target_staff.get("name") or target_staff.get("email")
    staff_type = target_staff.get("staff_type")

    upd = {"assigned_to": staff_id_str, "pending_auto_assign": False}
    if staff_type == "setter":
        upd["setter_id"] = staff_id_str
    elif staff_type == "closer":
        upd["closer_id"] = staff_id_str

    res = await conversations.update_many(
        {"_id": {"$in": obj_ids}, "tenant_id": tenant_id},
        {"$set": upd}
    )

    return BulkAssignResponse(
        success=True,
        modified_count=res.modified_count,
        message=f"Successfully assigned {res.modified_count} lead(s) to {staff_name}"
    )



