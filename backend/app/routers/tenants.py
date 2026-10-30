from bson import ObjectId
from fastapi import APIRouter, Depends

from app.core.deps import get_current_tenant
from app.db import tenants
from app.models.tenant import TenantCreate, TenantInDB, TenantOut, TenantUpdate
from app.services.meta_onboarding import consume_onboarding, request_coexistence_sync

router = APIRouter(prefix="/tenants", tags=["tenants"])


def _to_out(doc: dict) -> TenantOut:
    tz = doc.get("timezone") or doc.get("business_hours", {}).get("timezone", "America/New_York")
    return TenantOut(
        id=str(doc["_id"]),
        business_name=doc["business_name"],
        whatsapp_phone_number_id=doc.get("whatsapp_phone_number_id", ""),
        waba_id=doc.get("waba_id"),
        meta_connected=doc.get("meta_connected", False),
        system_prompt=doc.get("system_prompt", ""),
        escalation_contact=doc.get("escalation_contact"),
        business_hours=doc.get("business_hours") or {},
        timezone=tz,
        created_at=doc["created_at"],
    )


@router.post("", response_model=TenantOut)
async def create_tenant(payload: TenantCreate):
    """Onboard a new business. Unauthenticated by design — this is step one of
    onboarding, before a dashboard login exists. Lock down with an agency-level
    API key before exposing this publicly in production."""
    doc = TenantInDB(**payload.model_dump()).model_dump(exclude={"meta_onboarding_id"})
    meta_fields = await consume_onboarding(payload.meta_onboarding_id) if payload.meta_onboarding_id else {}
    doc.update(meta_fields)
    result = await tenants.insert_one(doc)
    await request_coexistence_sync(meta_fields)
    doc = await tenants.find_one({"_id": result.inserted_id})
    return _to_out(doc)


@router.get("/me", response_model=TenantOut)
async def get_my_tenant(tenant: dict = Depends(get_current_tenant)):
    return _to_out(tenant)


@router.patch("/me", response_model=TenantOut)
async def update_my_tenant(payload: TenantUpdate, tenant: dict = Depends(get_current_tenant)):
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if "business_hours" in updates and isinstance(updates["business_hours"], dict) and "timezone" in updates["business_hours"]:
        updates["timezone"] = updates["business_hours"]["timezone"]
    elif "timezone" in updates and updates["timezone"]:
        if "business_hours" not in updates:
            updates["business_hours.timezone"] = updates["timezone"]
    if updates:
        await tenants.update_one({"_id": tenant["_id"]}, {"$set": updates})
    doc = await tenants.find_one({"_id": tenant["_id"]})
    return _to_out(doc)
