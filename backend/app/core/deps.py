from bson import ObjectId
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from app.core.security import decode_access_token
from app.db import tenants, users

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_access_token(token)
    if payload is None or "sub" not in payload:
        raise credentials_error

    user = await users.find_one({"_id": ObjectId(payload["sub"])})
    if user is None:
        raise credentials_error
    return user


async def get_current_tenant(user: dict = Depends(get_current_user)) -> dict:
    tenant = await tenants.find_one({"_id": ObjectId(user["tenant_id"])})
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    return tenant

async def get_current_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role", "admin") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough privileges")
    return user
