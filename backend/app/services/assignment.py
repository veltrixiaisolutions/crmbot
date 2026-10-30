"""Lead auto-assignment and queue distribution.

Business Rules:
1. Leads are NEVER transferred or auto-assigned unless the target staff (setter or closer) is ONLINE.
2. If all setters/closers are offline, leads stay in the queue as unassigned (pending_auto_assign=True).
3. 5-Minute Warm-up: When a setter or closer marks themselves Online for the first time in a day,
   queued leads are held for 5 minutes to let them settle in, after which leads in the queue are
   automatically distributed to them evenly.
4. Closer handoff (ready to showup): If no closer is online, the lead remains with the setter and is
   flagged with pending_closer_transfer=True. When a closer comes online (and completes their 5m warm-up),
   the lead automatically transfers to the closer.
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from bson import ObjectId

from app.db import conversations, users

logger = logging.getLogger(__name__)

ACTIVE_WINDOW = timedelta(minutes=3)
WARMUP_WINDOW = timedelta(minutes=5)
ACTIVE_STATUSES = ("online", "in_meet")


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def is_staff_active(doc: dict) -> bool:
    """True if staff is set to online/in_meet and hasn't timed out their heartbeat."""
    if doc.get("role") != "staff" or doc.get("status") not in ACTIVE_STATUSES:
        return False
    last_seen = _as_utc(doc.get("last_seen_at"))
    if last_seen:
        return bool(last_seen >= datetime.now(timezone.utc) - ACTIVE_WINDOW)
    return True


def is_staff_eligible_for_leads(doc: dict, now: datetime | None = None) -> bool:
    """True if staff is active AND has passed their 5-minute first login warm-up."""
    if not is_staff_active(doc):
        return False
    if now is None:
        now = datetime.now(timezone.utc)

    today_str = now.strftime("%Y-%m-%d")
    if doc.get("first_online_date") == today_str and doc.get("first_online_at"):
        first_at = _as_utc(doc["first_online_at"])
        if first_at and (now - first_at) < WARMUP_WINDOW:
            # Still in 5-minute warm-up window
            return False

    return True


async def get_all_active_staff(tenant_id: str) -> list[dict]:
    """Every active staff member (used for admin manual actions)."""
    cutoff = datetime.now(timezone.utc) - ACTIVE_WINDOW
    return await users.find({
        "tenant_id": tenant_id,
        "role": "staff",
        "status": {"$in": list(ACTIVE_STATUSES)},
        "$or": [
            {"last_seen_at": {"$gte": cutoff}},
            {"last_seen_at": None},
            {"last_seen_at": {"$exists": False}}
        ]
    }).sort("_id", 1).to_list(length=100)


async def get_active_staff(tenant_id: str) -> list[dict]:
    """Returns online staff who are eligible to receive leads (past 5-min warm-up)."""
    cutoff = datetime.now(timezone.utc) - ACTIVE_WINDOW
    base = {
        "tenant_id": tenant_id,
        "role": "staff",
        "$or": [
            {"last_seen_at": {"$gte": cutoff}},
            {"last_seen_at": None},
            {"last_seen_at": {"$exists": False}}
        ]
    }
    candidates = []
    # Prefer online setters/closers, then in-meeting setters/closers, then any active staff
    for extra in (
        {"status": "online", "staff_type": {"$in": ["setter", "closer"]}},
        {"status": "in_meet", "staff_type": {"$in": ["setter", "closer"]}},
        {"status": {"$in": ["online", "in_meet"]}},
    ):
        found = await users.find({**base, **extra}).to_list(length=100)
        now = datetime.now(timezone.utc)
        eligible = [u for u in found if is_staff_eligible_for_leads(u, now)]
        if eligible:
            return eligible
    return []


async def get_active_closers(tenant_id: str) -> list[dict]:
    """Returns online closers who are eligible to receive leads (past 5-min warm-up)."""
    cutoff = datetime.now(timezone.utc) - ACTIVE_WINDOW
    found = await users.find({
        "tenant_id": tenant_id,
        "role": "staff",
        "staff_type": "closer",
        "status": {"$in": list(ACTIVE_STATUSES)},
        "$or": [
            {"last_seen_at": {"$gte": cutoff}},
            {"last_seen_at": None},
            {"last_seen_at": {"$exists": False}}
        ]
    }).to_list(length=100)
    now = datetime.now(timezone.utc)
    return [u for u in found if is_staff_eligible_for_leads(u, now)]


async def _pick_staff(tenant_id: str, candidates: list[dict]) -> dict:
    min_dt = datetime.min.replace(tzinfo=timezone.utc)
    staff_ids = [str(s["_id"]) for s in candidates]
    counts = await conversations.aggregate([
        {"$match": {"tenant_id": tenant_id, "assigned_to": {"$in": staff_ids}}},
        {"$group": {"_id": "$assigned_to", "count": {"$sum": 1}, "last_assigned": {"$max": "$created_at"}}},
    ]).to_list(length=100)
    count_map = {c["_id"]: c.get("count", 0) for c in counts}
    last_map = {c["_id"]: c.get("last_assigned") for c in counts}

    def least_busy(lst: list[dict]) -> dict:
        return min(lst, key=lambda s: (count_map.get(str(s["_id"]), 0), last_map.get(str(s["_id"])) or min_dt))

    setters = [s for s in candidates if s.get("staff_type") == "setter"]
    closers = [s for s in candidates if s.get("staff_type") == "closer"]

    if setters and closers:
        last_conv = await conversations.find_one(
            {"tenant_id": tenant_id, "assigned_to": {"$ne": None}}, sort=[("created_at", -1)]
        )
        last_type = None
        if last_conv and last_conv.get("assigned_to"):
            try:
                last_user = await users.find_one({"_id": ObjectId(last_conv["assigned_to"])})
                if last_user:
                    last_type = last_user.get("staff_type")
            except Exception:
                pass
        if last_type == "setter":
            return least_busy(closers)
        if last_type == "closer":
            return least_busy(setters)
        ls, lc = least_busy(setters), least_busy(closers)
        return lc if count_map.get(str(lc["_id"]), 0) < count_map.get(str(ls["_id"]), 0) else ls
    if setters:
        return least_busy(setters)
    if closers:
        return least_busy(closers)
    return least_busy(candidates)


async def auto_assign_conversation(tenant_id: str, conv: dict) -> dict | None:
    """Assign `conv` to an active online staff member. If nobody is online or staff is in
    warm-up, the lead stays unassigned in the queue."""
    if conv.get("is_blocked"):
        return None

    candidates = await get_active_staff(tenant_id)
    if not candidates:
        await conversations.update_one(
            {"_id": conv["_id"], "assigned_to": None},
            {"$set": {"pending_auto_assign": True}},
        )
        conv["pending_auto_assign"] = True
        logger.info("No active online staff for tenant %s; lead %s held in queue", tenant_id, conv["_id"])
        return None

    user = await _pick_staff(tenant_id, candidates)
    uid = str(user["_id"])
    upd: dict = {"assigned_to": uid, "pending_auto_assign": False}
    if not conv.get("lead_status") or conv.get("lead_status") in ("capture",):
        upd["lead_status"] = "not contacted"
    if user.get("staff_type") == "setter":
        upd["setter_id"] = uid
    elif user.get("staff_type") == "closer":
        upd["closer_id"] = uid

    # Only assign if still unassigned (avoids races between concurrent workers)
    res = await conversations.update_one({"_id": conv["_id"], "assigned_to": None}, {"$set": upd})
    if res.modified_count:
        conv.update(upd)
        return user
    return None


async def assign_pending_leads(tenant_id: str) -> int:
    """Distribute queued leads to staff who are online and past their 5-min warm-up."""
    # 1. Distribute new unassigned leads in queue
    pending_unassigned = await conversations.find(
        {"tenant_id": tenant_id, "assigned_to": None, "pending_auto_assign": True, "is_blocked": {"$ne": True}}
    ).sort("created_at", 1).to_list(length=500)
    assigned = 0
    for conv in pending_unassigned:
        if await auto_assign_conversation(tenant_id, conv):
            assigned += 1
        else:
            break  # No eligible active staff available

    # 2. Distribute leads waiting for closer (ready to showup)
    closers = await get_active_closers(tenant_id)
    if closers:
        pending_closer_convs = await conversations.find({
            "tenant_id": tenant_id,
            "lead_status": "ready to showup",
            "is_blocked": {"$ne": True},
            "$or": [
                {"closer_id": None},
                {"pending_closer_transfer": True}
            ]
        }).sort("created_at", 1).to_list(length=100)
        for conv in pending_closer_convs:
            closer = await _pick_staff(tenant_id, closers)
            cid = str(closer["_id"])
            res = await conversations.update_one(
                {"_id": conv["_id"], "tenant_id": tenant_id},
                {"$set": {"closer_id": cid, "assigned_to": cid, "pending_closer_transfer": False}}
            )
            if res.modified_count:
                assigned += 1

    if assigned:
        logger.info("Assigned %d queued lead(s) for tenant %s", assigned, tenant_id)
    return assigned


def schedule_warmup_assignment(tenant_id: str, delay_seconds: int = 300):
    """Spawns an async task to automatically run assign_pending_leads after delay_seconds (5 min)."""
    async def _runner():
        try:
            await asyncio.sleep(delay_seconds)
            await assign_pending_leads(tenant_id)
        except Exception as e:
            logger.error("Warmup assignment runner failed: %s", e)

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_runner())
    except RuntimeError:
        pass
