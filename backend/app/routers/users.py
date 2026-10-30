from fastapi import APIRouter, Depends, HTTPException, status
from app.core.deps import get_current_user, get_current_admin
from app.db import users, attendance, tenants
from app.models.user import (
    UserOut, 
    StaffCreate, 
    StaffUpdate, 
    AdminCreate, 
    AdminUpdate, 
    UserInDB, 
    StaffStatus, 
    AttendanceEventOut, 
    AttendanceDailySummary
)
from app.core.security import hash_password
from app.services.assignment import is_staff_active
from bson import ObjectId
from pymongo import ReturnDocument

router = APIRouter(prefix="/users", tags=["users"])

from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

def _get_tz(tz_name: str | None):
    if tz_name:
        try:
            return ZoneInfo(tz_name)
        except Exception:
            pass
    try:
        return ZoneInfo("UTC")
    except Exception:
        return timezone.utc

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

def _user_out(doc: dict, stats: dict = None) -> UserOut:
    status_updated_at = _to_utc(doc.get("status_updated_at"))
    created_at = _to_utc(doc.get("created_at"))

    derived_name = doc.get("name") or doc["email"].split("@")[0].replace(".", " ").replace("_", " ").title()

    return UserOut(
        id=str(doc["_id"]),
        name=derived_name,
        email=doc["email"],
        tenant_id=doc["tenant_id"],
        role=doc.get("role", "admin"),
        status=doc.get("status", "offline"),
        status_updated_at=status_updated_at,
        staff_type=doc.get("staff_type", "general"),
        timezone=doc.get("timezone", "America/New_York"),
        created_at=created_at,
        today_active_seconds=stats["active"] if stats else 0,
        today_break_seconds=stats["break"] if stats else 0,
        today_meet_seconds=stats.get("meet", 0) if stats else 0,
        is_active=is_staff_active(doc),
    )

@router.get("/me", response_model=UserOut)
async def get_me(user: dict = Depends(get_current_user)):
    stats = await calculate_daily_stats(str(user["_id"]), user)
    return _user_out(user, stats)

@router.post("/staff", response_model=UserOut)
async def create_staff(payload: StaffCreate, admin: dict = Depends(get_current_admin)):
    if await users.find_one({"email": payload.email}):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    tenant_doc = await tenants.find_one({"_id": ObjectId(admin["tenant_id"])})
    default_tz = tenant_doc.get("timezone", "America/New_York") if tenant_doc else "America/New_York"
    staff_tz = payload.timezone or default_tz

    staff = UserInDB(
        name=payload.name or payload.email.split("@")[0].replace(".", " ").replace("_", " ").title(),
        email=payload.email,
        hashed_password=hash_password(payload.password),
        tenant_id=admin["tenant_id"],
        role="staff",
        staff_type=payload.staff_type,
        timezone=staff_tz,
    )
    result = await users.insert_one(staff.model_dump())
    new_user = await users.find_one({"_id": result.inserted_id})
    stats = await calculate_daily_stats(str(new_user["_id"]), new_user, tz_name=staff_tz)
    return _user_out(new_user, stats)

@router.patch("/staff/{user_id}", response_model=UserOut)
async def update_staff(user_id: str, payload: StaffUpdate, admin: dict = Depends(get_current_admin)):
    from bson import ObjectId
    update_data = payload.model_dump(exclude_unset=True)
    if "password" in update_data:
        update_data["hashed_password"] = hash_password(update_data.pop("password"))
        
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields provided for update")
        
    result = await users.find_one_and_update(
        {"_id": ObjectId(user_id), "tenant_id": admin["tenant_id"], "role": "staff"},
        {"$set": update_data},
        return_document=ReturnDocument.AFTER,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Staff not found")
        
    stats = await calculate_daily_stats(user_id, result, tz_name=result.get("timezone"))
    return _user_out(result, stats)

@router.delete("/staff/{user_id}")
async def delete_staff(user_id: str, admin: dict = Depends(get_current_admin)):
    from bson import ObjectId
    result = await users.delete_one({"_id": ObjectId(user_id), "tenant_id": admin["tenant_id"], "role": "staff"})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Staff not found")
    return {"status": "ok"}


# --- Admin Management Endpoints ---

@router.get("/admins", response_model=list[UserOut])
async def list_admins(admin: dict = Depends(get_current_admin)):
    docs = await users.find({"tenant_id": admin["tenant_id"], "role": "admin"}).to_list(length=100)
    return [_user_out(doc) for doc in docs]


@router.post("/admins", response_model=UserOut)
async def create_admin(payload: AdminCreate, admin: dict = Depends(get_current_admin)):
    if await users.find_one({"email": payload.email}):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    tenant_doc = await tenants.find_one({"_id": ObjectId(admin["tenant_id"])})
    default_tz = tenant_doc.get("timezone", "America/New_York") if tenant_doc else "America/New_York"

    new_admin = UserInDB(
        name=payload.name or payload.email.split("@")[0].replace(".", " ").replace("_", " ").title(),
        email=payload.email,
        hashed_password=hash_password(payload.password),
        tenant_id=admin["tenant_id"],
        role="admin",
        status="online",
        timezone=default_tz,
    )
    result = await users.insert_one(new_admin.model_dump())
    new_user = await users.find_one({"_id": result.inserted_id})
    return _user_out(new_user)


@router.patch("/admins/{user_id}", response_model=UserOut)
async def update_admin(user_id: str, payload: AdminUpdate, admin: dict = Depends(get_current_admin)):
    from bson import ObjectId
    update_data = payload.model_dump(exclude_unset=True)
    if "password" in update_data and update_data["password"]:
        update_data["hashed_password"] = hash_password(update_data.pop("password"))
    elif "password" in update_data:
        update_data.pop("password")

    if "email" in update_data and update_data["email"]:
        existing = await users.find_one({"email": update_data["email"], "_id": {"$ne": ObjectId(user_id)}})
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    if not update_data:
        raise HTTPException(status_code=400, detail="No fields provided for update")

    result = await users.find_one_and_update(
        {"_id": ObjectId(user_id), "tenant_id": admin["tenant_id"], "role": "admin"},
        {"$set": update_data},
        return_document=ReturnDocument.AFTER,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Admin account not found")

    return _user_out(result)


@router.delete("/admins/{user_id}")
async def delete_admin(user_id: str, admin: dict = Depends(get_current_admin)):
    from bson import ObjectId
    if str(admin["_id"]) == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="You cannot delete your own admin account while logged in."
        )

    admin_count = await users.count_documents({"tenant_id": admin["tenant_id"], "role": "admin"})
    if admin_count <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Cannot delete the only admin account for this business."
        )

    result = await users.delete_one({"_id": ObjectId(user_id), "tenant_id": admin["tenant_id"], "role": "admin"})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Admin account not found")
    return {"status": "ok"}


async def calculate_daily_stats(
    user_id: str, 
    user_doc: dict, 
    target_date: str | None = None, 
    tz_name: str | None = None
) -> dict:
    tz = _get_tz(tz_name or user_doc.get("timezone"))
    now = datetime.now(tz)
    
    if target_date:
        try:
            d = datetime.strptime(target_date, "%Y-%m-%d").date()
        except Exception:
            d = now.date()
    else:
        d = now.date()
        
    start_of_day = datetime(d.year, d.month, d.day, 0, 0, 0, tzinfo=tz)
    end_of_day = start_of_day + timedelta(days=1)
    
    if start_of_day > now:
        return {"active": 0, "break": 0, "meet": 0}

    cutoff_time = min(now, end_of_day)

    events = user_doc.get("attendance_events", [])
    if not events:
        return {"active": 0, "break": 0, "meet": 0}
    
    normalized_events = []
    for evt in events:
        ts = _to_utc(evt.get("timestamp"))
        if ts:
            normalized_events.append({
                "event_type": evt.get("event_type"),
                "timestamp": ts.astimezone(tz),
            })
            
    normalized_events.sort(key=lambda x: x["timestamp"])
    
    last_event = None
    today_events = []
    
    for evt in normalized_events:
        if evt["timestamp"] < start_of_day:
            last_event = evt
        elif evt["timestamp"] < end_of_day:
            today_events.append(evt)
            
    active_sec = 0.0
    break_sec = 0.0
    meet_sec = 0.0
    
    current_state = "offline"
    if last_event:
        if last_event["event_type"] in ("login", "break_end", "meet_end"):
            current_state = "online"
        elif last_event["event_type"] == "break_start":
            current_state = "break"
        elif last_event["event_type"] == "meet_start":
            current_state = "in_meet"
            
    last_time = start_of_day
    
    for evt in today_events:
        evt_time = min(evt["timestamp"], cutoff_time)
        duration = max(0.0, (evt_time - last_time).total_seconds())
        if current_state == "online":
            active_sec += duration
        elif current_state == "break":
            break_sec += duration
        elif current_state == "in_meet":
            meet_sec += duration
            
        if evt["event_type"] in ("login", "break_end", "meet_end"):
            current_state = "online"
        elif evt["event_type"] == "break_start":
            current_state = "break"
        elif evt["event_type"] == "meet_start":
            current_state = "in_meet"
        elif evt["event_type"] == "logout":
            current_state = "offline"
            
        last_time = evt_time
        if last_time >= cutoff_time:
            break
        
    final_duration = max(0.0, (cutoff_time - last_time).total_seconds())
    if current_state == "online":
        active_sec += final_duration
    elif current_state == "break":
        break_sec += final_duration
    elif current_state == "in_meet":
        meet_sec += final_duration
        
    return {"active": int(active_sec), "break": int(break_sec), "meet": int(meet_sec)}

@router.get("/staff", response_model=list[UserOut])
async def list_staff(date: str | None = None, admin: dict = Depends(get_current_admin)):
    docs = await users.find({"tenant_id": admin["tenant_id"], "role": "staff"}).to_list(length=100)
    tenant_doc = await tenants.find_one({"_id": ObjectId(admin["tenant_id"])})
    default_tz = tenant_doc.get("timezone", "America/New_York") if tenant_doc else "America/New_York"

    results = []
    for doc in docs:
        staff_tz = doc.get("timezone") or default_tz
        stats = await calculate_daily_stats(str(doc["_id"]), doc, target_date=date, tz_name=staff_tz)
        res = _user_out(doc, stats)
        res.timezone = staff_tz
        results.append(res)
    return results

from pydantic import BaseModel
class StatusUpdate(BaseModel):
    status: StaffStatus

@router.post("/status", response_model=UserOut)
async def update_status(payload: StatusUpdate, user: dict = Depends(get_current_user)):
    if user.get("role") != "staff":
        raise HTTPException(status_code=403, detail="Only staff can update status")

    event_map = {
        "online": "login",
        "break": "break_start",
        "in_meet": "meet_start",
        "offline": "logout"
    }
    
    event_type = event_map[payload.status]
    if user.get("status") == "break" and payload.status == "online":
        event_type = "break_end"
    elif user.get("status") == "in_meet" and payload.status == "online":
        event_type = "meet_end"

    now = datetime.now(timezone.utc)
    new_event = {
        "event_type": event_type,
        "timestamp": now
    }
    
    today_str = now.strftime("%Y-%m-%d")
    is_first_today = False
    set_fields = {
        "status": payload.status,
        "status_updated_at": now,
        "last_seen_at": now if payload.status != "offline" else None,
    }
    if payload.status in ("online", "in_meet"):
        if user.get("first_online_date") != today_str:
            set_fields["first_online_date"] = today_str
            set_fields["first_online_at"] = now
            is_first_today = True

    await users.update_one(
        {"_id": user["_id"]},
        {
            "$set": set_fields,
            "$push": {"attendance_events": new_event}
        }
    )

    if payload.status in ("online", "in_meet"):
        from app.services.assignment import assign_pending_leads, schedule_warmup_assignment
        if is_first_today:
            # First login today: wait 5 minutes to let them settle in before assigning queued leads
            schedule_warmup_assignment(str(user["tenant_id"]), delay_seconds=300)
        else:
            # Already logged in today and past warm-up: immediately distribute queued leads
            await assign_pending_leads(str(user["tenant_id"]))
    
    updated = await users.find_one({"_id": user["_id"]})
    stats = await calculate_daily_stats(str(user["_id"]), updated)
    return _user_out(updated, stats)


@router.post("/heartbeat")
async def heartbeat(user: dict = Depends(get_current_user)):
    """Called periodically by an open staff dashboard. Staff without a recent
    heartbeat are treated as offline for lead assignment, even if their saved
    status still says "online" (e.g. browser closed without logging out)."""
    if user.get("role") != "staff":
        return {"status": "ignored"}
    now = datetime.now(timezone.utc)
    await users.update_one({"_id": user["_id"]}, {"$set": {"last_seen_at": now}})
    if user.get("status") in ("online", "in_meet"):
        from app.services.assignment import assign_pending_leads
        await assign_pending_leads(str(user["tenant_id"]))
    return {"status": "ok"}

def _att_out(doc: dict, user_id: str, index: int, tz_name: str | None = None) -> AttendanceEventOut:
    ts = _to_utc(doc.get("timestamp"))
    tz = _get_tz(tz_name)
    local_str = None
    if ts:
        local_str = ts.astimezone(tz).strftime("%I:%M:%S %p %Z")
    return AttendanceEventOut(
        id=f"{user_id}_{index}",
        user_id=user_id,
        event_type=doc.get("event_type", "unknown"),
        timestamp=ts or datetime.now(timezone.utc),
        local_time=local_str
    )

@router.get("/staff/{user_id}/attendance", response_model=AttendanceDailySummary)
async def get_staff_attendance(
    user_id: str, 
    date: str | None = None,
    tz: str | None = None,
    admin: dict = Depends(get_current_admin)
):
    target_user = await users.find_one({"_id": ObjectId(user_id), "tenant_id": admin["tenant_id"]})
    if not target_user:
        raise HTTPException(status_code=404, detail="Staff member not found")
        
    tenant_doc = await tenants.find_one({"_id": ObjectId(admin["tenant_id"])})
    default_tz = tenant_doc.get("timezone", "America/New_York") if tenant_doc else "America/New_York"
    staff_tz = tz or target_user.get("timezone") or default_tz

    stats = await calculate_daily_stats(user_id, target_user, target_date=date, tz_name=staff_tz)

    tz_obj = _get_tz(staff_tz)
    now_tz = datetime.now(tz_obj)
    if date:
        try:
            d = datetime.strptime(date, "%Y-%m-%d").date()
        except Exception:
            d = now_tz.date()
    else:
        d = now_tz.date()

    start_of_day = datetime(d.year, d.month, d.day, 0, 0, 0, tzinfo=tz_obj)
    end_of_day = start_of_day + timedelta(days=1)

    all_events = target_user.get("attendance_events", [])
    day_events = []
    for i, evt in enumerate(all_events):
        ts = _to_utc(evt.get("timestamp"))
        if ts:
            local_ts = ts.astimezone(tz_obj)
            if start_of_day <= local_ts < end_of_day:
                day_events.append((local_ts, evt, i))

    day_events.sort(key=lambda x: x[0], reverse=True)
    events_out = [_att_out(evt, user_id, i, staff_tz) for _, evt, i in day_events]

    return AttendanceDailySummary(
        date=d.isoformat(),
        timezone=staff_tz,
        active_seconds=stats["active"],
        break_seconds=stats["break"],
        meet_seconds=stats["meet"],
        events=events_out
    )
