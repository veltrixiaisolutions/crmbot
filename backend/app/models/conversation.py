from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field

ConversationStatus = Literal["bot", "human"]
LeadStatus = str

class PaymentDetails(BaseModel):
    total_payment: float | None = None
    advance_payment: float | None = None
    remaining_payment: float | None = None
    purpose: str | None = None
    notes: str | None = None
    recorded_at: datetime | None = None
    recorded_by_name: str | None = None
    recorded_by_email: str | None = None


class LeadStatusLog(BaseModel):
    id: str | None = None
    from_status: str | None = None
    to_status: str
    changed_by_name: str | None = None
    changed_by_email: str | None = None
    changed_by_role: str | None = None
    changed_at: datetime
    notes: str | None = None


class ConversationOut(BaseModel):
    id: str
    tenant_id: str
    wa_user_phone: str
    status: ConversationStatus
    lead_status: LeadStatus = "not contacted"
    lead_name: str | None = None
    assigned_to: str | None = None
    assigned_name: str | None = None
    assigned_email: str | None = None
    setter_name: str | None = None
    setter_email: str | None = None
    closer_name: str | None = None
    closer_email: str | None = None
    notes: str | None = None
    payment: PaymentDetails | None = None
    lead_status_logs: list[LeadStatusLog] = []
    last_message_at: datetime
    created_at: datetime
    last_message_text: str | None = None
    last_message_direction: str | None = None
    last_message_status: str | None = None
    last_customer_read_at: datetime | None = None
    has_unread: bool = False
    unread_count: int = 0
    is_blocked: bool = False
    blocked_at: datetime | None = None
    blocked_by_name: str | None = None
    blocked_reason: str | None = None



class ConversationInDB(BaseModel):
    tenant_id: str
    wa_user_phone: str
    status: ConversationStatus = "bot"
    lead_status: LeadStatus = "not contacted"
    lead_name: str | None = None
    assigned_to: str | None = None
    setter_id: str | None = None
    closer_id: str | None = None
    notes: str | None = None
    payment: PaymentDetails | None = None
    lead_status_logs: list[LeadStatusLog] = []
    last_message_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_customer_read_at: datetime | None = None
    last_message_text: str | None = None
    last_message_direction: str | None = None
    last_message_status: str | None = None
    has_unread: bool = False
    unread_count: int = 0
    is_blocked: bool = False
    blocked_at: datetime | None = None
    blocked_by_name: str | None = None
    blocked_reason: str | None = None


class ConversationStatusUpdate(BaseModel):
    status: ConversationStatus | None = None
    lead_status: LeadStatus | None = None
    lead_name: str | None = None
    assigned_to: str | None = None
    setter_id: str | None = None
    closer_id: str | None = None
    notes: str | None = None
    payment: PaymentDetails | None = None
    is_blocked: bool | None = None
    blocked_reason: str | None = None


class BlockChatRequest(BaseModel):
    reason: str | None = "Vague or spam messages"


class NewChatRequest(BaseModel):
    wa_user_phone: str
    lead_name: str | None = None
    initial_message: str | None = None
    assigned_to: str | None = None
    notes: str | None = None



class BulkAssignRequest(BaseModel):
    conversation_ids: list[str]
    assigned_to: str


class BulkAssignResponse(BaseModel):
    success: bool
    modified_count: int
    message: str


class BulkRecipient(BaseModel):
    phone: str
    name: str | None = None
    conversation_id: str | None = None


class BulkMessageRequest(BaseModel):
    conversation_ids: list[str] = Field(default_factory=list)
    recipients: list[BulkRecipient] = Field(default_factory=list)
    message: str
    campaign_name: str | None = None


class BulkMessageRecipientResult(BaseModel):
    phone: str
    name: str | None = None
    conversation_id: str | None = None
    status: str  # "sent" or "failed"
    error: str | None = None
    wa_message_id: str | None = None


class BulkMessageResponse(BaseModel):
    success: bool
    total: int
    sent_count: int
    failed_count: int
    broadcast_id: str | None = None
    message: str
    results: list[BulkMessageRecipientResult]


class BroadcastSummaryOut(BaseModel):
    id: str
    campaign_name: str
    message: str
    created_by_name: str | None = None
    created_at: datetime
    total: int
    sent_count: int
    failed_count: int


class BroadcastDetailOut(BroadcastSummaryOut):
    results: list[BulkMessageRecipientResult]


class SliceData(BaseModel):
    name: str
    value: int
    percentage: float
    color: str


class StaffLeadStat(BaseModel):
    staff_id: str
    name: str
    email: str
    staff_type: str
    timezone: str = "America/New_York"
    total_assigned: int
    contacted: int
    not_contacted: int
    follow_up: int
    sales_closed: int
    contact_rate: float
    conversion_rate: float


class LeadAnalyticsReport(BaseModel):
    timeframe: str
    start_date: str | None = None
    end_date: str | None = None
    timezone: str
    total_leads: int
    contacted_count: int
    not_contacted_count: int
    contact_rate: float
    sales_closed_count: int
    conversion_rate: float
    bot_count: int
    human_count: int
    status_distribution: list[SliceData]
    staff_distribution: list[SliceData]
    contact_distribution: list[SliceData]
    mode_distribution: list[SliceData]
    staff_stats: list[StaffLeadStat]
    leads: list[ConversationOut] = []


