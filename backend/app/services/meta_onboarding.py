"""
Meta Embedded Signup completion.

Turns the short-lived code returned by the Facebook SDK into a working
WhatsApp connection for a client business:

  1. Exchange the code for a business integration token (does not expire).
  2. Resolve the client's WABA / phone number if the popup didn't report them.
  3. Subscribe our app to the WABA so incoming messages reach /webhook.
  4. Register the number on the Cloud API (new numbers only — coexistence
     numbers are already live in the WhatsApp Business app).

The result is parked in `meta_onboardings` until it is attached to a tenant,
because during public signup the tenant doesn't exist yet.

Docs: https://developers.facebook.com/docs/whatsapp/embedded-signup/
"""

import logging
import secrets
from datetime import datetime, timedelta, timezone

import httpx
from bson import ObjectId
from fastapi import HTTPException, status

from app.config import settings
from app.db import meta_onboardings

logger = logging.getLogger(__name__)

GRAPH_BASE = "https://graph.facebook.com"
PENDING_TTL = timedelta(hours=1)
CLOUD_API = "cloud_api"
COEXISTENCE = "coexistence"


async def _graph(method: str, path: str, *, params: dict | None = None, json: dict | None = None) -> dict:
    url = f"{GRAPH_BASE}/{settings.whatsapp_api_version}/{path}"
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.request(method, url, params=params, json=json)
    data = r.json()
    if "error" in data:
        err = data["error"]
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Meta Graph API error {err.get('code')}: {err.get('error_user_msg') or err.get('message')}",
        )
    return data


async def _exchange_code(code: str) -> str:
    data = await _graph(
        "GET",
        "oauth/access_token",
        params={"client_id": settings.meta_app_id, "client_secret": settings.meta_app_secret, "code": code},
    )
    token = data.get("access_token")
    if not token:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Meta returned no access token for the signup code.")
    return token


async def _shared_waba_id(token: str) -> str:
    data = await _graph(
        "GET",
        "debug_token",
        params={"input_token": token, "access_token": f"{settings.meta_app_id}|{settings.meta_app_secret}"},
    )
    for scope in data.get("data", {}).get("granular_scopes", []):
        if scope.get("scope") == "whatsapp_business_management" and scope.get("target_ids"):
            return scope["target_ids"][0]
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="Meta did not share a WhatsApp Business Account with this app.",
    )


async def _only_phone_number_id(waba_id: str, token: str) -> str:
    data = await _graph("GET", f"{waba_id}/phone_numbers", params={"fields": "id", "access_token": token})
    numbers = data.get("data", [])
    if len(numbers) != 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Expected one phone number on WhatsApp account {waba_id}, found {len(numbers)}. "
                   "Run the Meta signup again and select a phone number.",
        )
    return numbers[0]["id"]


async def complete_embedded_signup(
    code: str,
    onboarding_type: str,
    waba_id: str | None = None,
    phone_number_id: str | None = None,
) -> dict:
    token = await _exchange_code(code)
    waba_id = waba_id or await _shared_waba_id(token)
    phone_number_id = phone_number_id or await _only_phone_number_id(waba_id, token)

    # Without this Meta never forwards the client's messages to our webhook.
    await _graph("POST", f"{waba_id}/subscribed_apps", params={"access_token": token})

    pin = None
    if onboarding_type != COEXISTENCE:
        pin = f"{secrets.randbelow(10**6):06d}"
        await _graph(
            "POST",
            f"{phone_number_id}/register",
            params={"access_token": token},
            json={"messaging_product": "whatsapp", "pin": pin},
        )

    info = await _graph(
        "GET",
        phone_number_id,
        params={"fields": "display_phone_number,verified_name", "access_token": token},
    )

    doc = {
        "access_token": token,
        "waba_id": waba_id,
        "phone_number_id": phone_number_id,
        "registration_pin": pin,
        "onboarding_type": onboarding_type,
        "display_phone_number": info.get("display_phone_number", ""),
        "verified_name": info.get("verified_name", ""),
        "expires_at": datetime.now(timezone.utc) + PENDING_TTL,
    }
    result = await meta_onboardings.insert_one(doc)
    logger.info(
        "Embedded Signup completed (%s): phone_id=%s waba=%s", onboarding_type, phone_number_id, waba_id
    )
    return {
        "onboarding_id": str(result.inserted_id),
        "phone_number_id": phone_number_id,
        "waba_id": waba_id,
        "display_phone_number": doc["display_phone_number"],
        "verified_name": doc["verified_name"],
        "onboarding_type": onboarding_type,
    }


async def request_coexistence_sync(tenant_fields: dict) -> None:
    """
    Ask Meta to send a coexistence number's WhatsApp Business app contacts and
    chat history (arrive as smb_app_state_sync / history webhooks). Meta only
    allows this within 24h of onboarding, so it runs right after the tenant
    exists. Failures are logged, not raised — the connection itself works.
    """
    if tenant_fields.get("meta_onboarding_type") != COEXISTENCE:
        return
    phone_number_id = tenant_fields["whatsapp_phone_number_id"]
    for sync_type in ("smb_app_state_sync", "history"):
        try:
            await _graph(
                "POST",
                f"{phone_number_id}/smb_app_data",
                params={"access_token": tenant_fields["whatsapp_access_token"]},
                json={"messaging_product": "whatsapp", "sync_type": sync_type},
            )
        except HTTPException as exc:
            logger.warning("Coexistence %s request failed for phone_id=%s: %s", sync_type, phone_number_id, exc.detail)


async def consume_onboarding(onboarding_id: str) -> dict:
    """Remove a completed signup and return the tenant fields it sets."""
    doc = None
    if ObjectId.is_valid(onboarding_id):
        doc = await meta_onboardings.find_one_and_delete(
            {"_id": ObjectId(onboarding_id), "expires_at": {"$gt": datetime.now(timezone.utc)}}
        )
    if doc is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="WhatsApp connection expired or not found. Please connect WhatsApp again.",
        )
    return {
        "whatsapp_phone_number_id": doc["phone_number_id"],
        "whatsapp_access_token": doc["access_token"],
        "waba_id": doc["waba_id"],
        "meta_connected": True,
        "meta_onboarding_type": doc["onboarding_type"],
        "meta_phone_display": doc["display_phone_number"],
        "meta_verified_name": doc["verified_name"],
        "whatsapp_registration_pin": doc["registration_pin"],
    }
