from datetime import datetime, timezone

from pydantic import BaseModel, EmailStr, Field
from typing import Literal

StaffStatus = Literal["offline", "online", "break", "in_meet"]
StaffType = Literal["general", "setter", "closer"]
AttendanceEventType = Literal["login", "break_start", "break_end", "meet_start", "meet_end", "logout"]


class UserSignup(BaseModel):
    name: str | None = None
    email: EmailStr
    password: str
    tenant_id: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    name: str | None = None
    email: EmailStr
    tenant_id: str
    role: Literal["admin", "staff"]
    status: StaffStatus = "offline"
    status_updated_at: datetime | None = None
    staff_type: StaffType = "general"
    timezone: str = "America/New_York"
    created_at: datetime
    today_active_seconds: int = 0
    today_break_seconds: int = 0
    today_meet_seconds: int = 0
    is_active: bool = False  # online/in_meet AND dashboard heartbeat within the last few minutes


class UserInDB(BaseModel):
    name: str | None = None
    email: EmailStr
    hashed_password: str
    tenant_id: str
    role: Literal["admin", "staff"] = "admin"
    status: StaffStatus = "offline"
    status_updated_at: datetime | None = None
    staff_type: StaffType = "general"
    timezone: str = "America/New_York"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StaffCreate(BaseModel):
    name: str | None = None
    email: EmailStr
    password: str
    staff_type: StaffType = "general"
    timezone: str | None = None

class StaffUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    password: str | None = None
    staff_type: StaffType | None = None
    timezone: str | None = None


class AdminCreate(BaseModel):
    name: str | None = None
    email: EmailStr
    password: str


class AdminUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    password: str | None = None



class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class AttendanceEventInDB(BaseModel):
    user_id: str
    tenant_id: str
    event_type: AttendanceEventType
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class AttendanceEventOut(BaseModel):
    id: str
    user_id: str
    event_type: AttendanceEventType
    timestamp: datetime
    local_time: str | None = None

class AttendanceDailySummary(BaseModel):
    date: str
    timezone: str
    active_seconds: int = 0
    break_seconds: int = 0
    meet_seconds: int = 0
    events: list[AttendanceEventOut] = Field(default_factory=list)
