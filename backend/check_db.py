import asyncio
from app.db import tenants, conversations
from bson import ObjectId

async def main():
    conv = await conversations.find_one({"_id": ObjectId("6aa5a4e3469653f0d8f876f0")})
    if not conv:
        print("Conversation not found")
        return
    tenant = await tenants.find_one({"_id": ObjectId(conv["tenant_id"])})
    if not tenant:
        print("Tenant not found")
        return
    print(f"wa_user_phone: {conv.get('wa_user_phone')}")
    print(f"has token: {bool(tenant.get('whatsapp_access_token'))}")
    print(f"has phone id: {bool(tenant.get('whatsapp_phone_number_id'))}")

asyncio.run(main())
