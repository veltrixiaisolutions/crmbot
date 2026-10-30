"""
Meta Embedded Signup router.

The frontend runs the Facebook SDK's Embedded Signup popup (FB.login with our
ES config) and POSTs the returned code here. See services/meta_onboarding.py
for what happens with it.

  POST /meta/embedded-signup                  public — also used during signup,
                                              before a tenant/login exists
  POST /meta/embedded-signup/{id}/attach      links a completed signup to the
                                              logged-in tenant (settings page)
  POST /meta/data-deletion                    Meta's data deletion callback
  GET  /meta/data-deletion/{code}             status shown on /data-deletion

Graph API docs:
  https://developers.facebook.com/docs/whatsapp/embedded-signup/
"""

import base64
import hashlib
import hmac
import json
import logging
import secrets
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Form, HTTPException, status
from pydantic import BaseModel

from app.config import settings
from app.core.deps import get_current_tenant
from app.db import data_deletion_requests, tenants
from app.services.meta_onboarding import complete_embedded_signup, consume_onboarding, request_coexistence_sync

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/meta", tags=["meta"])


def _require_meta_config():
    if not settings.meta_app_id or not settings.meta_app_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "META_APP_ID and META_APP_SECRET are not configured on this server. "
                "Please add them to the backend .env file."
            ),
        )


# ---------------------------------------------------------------------------
# schemas
# ---------------------------------------------------------------------------

class EmbeddedSignupRequest(BaseModel):
    """
    `code` comes from the FB.login callback. `waba_id` / `phone_number_id`
    come from the WA_EMBEDDED_SIGNUP postMessage, when it arrived in time —
    the backend looks them up otherwise.
    """
    code: str
    onboarding_type: Literal["cloud_api", "coexistence"] = "cloud_api"
    waba_id: str | None = None
    phone_number_id: str | None = None


class EmbeddedSignupResult(BaseModel):
    onboarding_id: str
    phone_number_id: str
    waba_id: str
    display_phone_number: str
    verified_name: str
    onboarding_type: str


class AttachResult(BaseModel):
    phone_number_id: str
    display_phone_number: str


# ---------------------------------------------------------------------------
# endpoints
# ---------------------------------------------------------------------------

@router.post("/embedded-signup", response_model=EmbeddedSignupResult)
async def embedded_signup(payload: EmbeddedSignupRequest):
    """
    Unauthenticated because public signup connects WhatsApp before the
    account is created. The code is only redeemable by our app secret and
    expires within seconds, so it can't be replayed by a third party.
    """
    _require_meta_config()
    result = await complete_embedded_signup(
        payload.code, payload.onboarding_type, payload.waba_id, payload.phone_number_id
    )
    return EmbeddedSignupResult(**result)


@router.post("/embedded-signup/{onboarding_id}/attach", response_model=AttachResult)
async def attach_embedded_signup(onboarding_id: str, tenant: dict = Depends(get_current_tenant)):
    fields = await consume_onboarding(onboarding_id)
    await tenants.update_one({"_id": tenant["_id"]}, {"$set": fields})
    await request_coexistence_sync(fields)
    logger.info("Tenant %s connected WhatsApp phone_id=%s", tenant["_id"], fields["whatsapp_phone_number_id"])
    return AttachResult(
        phone_number_id=fields["whatsapp_phone_number_id"],
        display_phone_number=fields["meta_phone_display"],
    )


@router.get("/config")
async def get_meta_config():
    """
    Returns the Meta App ID and ES Config ID (both public) needed by the
    frontend Facebook JS SDK. Public because the signup page needs it before
    login. The App Secret is never sent to the frontend.
    """
    return {
        "app_id": settings.meta_app_id or "",
        "es_config_id": settings.meta_es_config_id or "",
        "graph_version": settings.whatsapp_api_version,
        "configured": bool(settings.meta_app_id and settings.meta_app_secret and settings.meta_es_config_id),
    }


def _parse_signed_request(signed_request: str) -> dict:
    """Decode and verify a Meta signed_request (HMAC-SHA256 with the app secret)."""
    def b64decode(part: str) -> bytes:
        return base64.urlsafe_b64decode(part + "=" * (-len(part) % 4))

    try:
        encoded_sig, payload = signed_request.split(".", 1)
        sig = b64decode(encoded_sig)
        data = json.loads(b64decode(payload))
    except (ValueError, json.JSONDecodeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Malformed signed_request")

    expected = hmac.new(settings.meta_app_secret.encode(), payload.encode(), hashlib.sha256).digest()
    if str(data.get("algorithm", "")).upper() != "HMAC-SHA256" or not hmac.compare_digest(sig, expected):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signed_request signature")
    return data


@router.post("/data-deletion")
async def data_deletion_callback(signed_request: str = Form(...)):
    """
    Meta User Data Deletion Callback. Meta POSTs a signed_request when a person
    removes our app from their Facebook account and asks for their data to be
    deleted. We never store Facebook user IDs or profile data, so there is
    nothing keyed to that person to erase; the request is logged so it can be
    shown on the status page. Business data is deleted on request via the
    contact address on /data-deletion.
    """
    _require_meta_config()
    data = _parse_signed_request(signed_request)
    code = secrets.token_hex(8)
    await data_deletion_requests.insert_one({
        "confirmation_code": code,
        "facebook_user_id": data.get("user_id"),
        "status": "completed",
        "received_at": datetime.now(timezone.utc),
    })
    logger.info("Meta data deletion request received, confirmation_code=%s", code)
    return {
        "url": f"{settings.public_app_url.rstrip('/')}/data-deletion?code={code}",
        "confirmation_code": code,
    }


@router.get("/data-deletion/{confirmation_code}")
async def data_deletion_status(confirmation_code: str):
    doc = await data_deletion_requests.find_one({"confirmation_code": confirmation_code})
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown confirmation code")
    return {
        "confirmation_code": confirmation_code,
        "status": doc["status"],
        "received_at": doc["received_at"],
    }
