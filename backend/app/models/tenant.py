from datetime import datetime, timezone

from pydantic import BaseModel, Field


class BusinessHours(BaseModel):
    timezone: str = "UTC"
    open_time: str = "09:00"
    close_time: str = "18:00"
    days_open: list[str] = Field(
        default_factory=lambda: ["mon", "tue", "wed", "thu", "fri"]
    )


class TenantCreate(BaseModel):
    business_name: str
    whatsapp_phone_number_id: str = ""
    whatsapp_access_token: str = ""
    waba_id: str | None = None
    meta_connected: bool = False
    # From POST /meta/embedded-signup; fills the WhatsApp fields above when set
    meta_onboarding_id: str | None = None
    system_prompt: str = "You are a helpful assistant for this business. Answer using the provided business knowledge."
    escalation_contact: str | None = None
    business_hours: BusinessHours = Field(default_factory=BusinessHours)
    timezone: str = "America/New_York"


class TenantUpdate(BaseModel):
    business_name: str | None = None
    whatsapp_phone_number_id: str | None = None
    whatsapp_access_token: str | None = None
    waba_id: str | None = None
    meta_connected: bool | None = None
    system_prompt: str | None = None
    escalation_contact: str | None = None
    business_hours: BusinessHours | None = None
    timezone: str | None = None


class TenantOut(BaseModel):
    id: str
    business_name: str
    whatsapp_phone_number_id: str
    waba_id: str | None = None
    meta_connected: bool = False
    system_prompt: str
    escalation_contact: str | None = None
    business_hours: BusinessHours
    timezone: str = "America/New_York"
    created_at: datetime


class TenantInDB(TenantCreate):
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
