from bson import ObjectId
from fastapi import APIRouter, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from fastapi import Depends

from app.core.security import create_access_token, hash_password, verify_password
from app.db import tenants, users
from app.models.user import Token, UserInDB, UserSignup

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=Token)
async def signup(payload: UserSignup):
    tenant = await tenants.find_one({"_id": ObjectId(payload.tenant_id)})
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    if await users.find_one({"email": payload.email}):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    user = UserInDB(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        tenant_id=payload.tenant_id,
    )
    result = await users.insert_one(user.model_dump())
    token = create_access_token(subject=str(result.inserted_id), tenant_id=payload.tenant_id)
    return Token(access_token=token)


import time
from collections import defaultdict
from fastapi import Request

_failed_attempts: dict[str, list[float]] = defaultdict(list)

def _check_rate_limit(key: str, max_attempts: int = 5, window_seconds: int = 60):
    now = time.time()
    _failed_attempts[key] = [t for t in _failed_attempts[key] if now - t < window_seconds]
    if len(_failed_attempts[key]) >= max_attempts:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed login attempts. Please wait 1 minute before trying again.",
        )

def _record_failed(key: str):
    _failed_attempts[key].append(time.time())

def _record_success(key: str):
    if key in _failed_attempts:
        _failed_attempts.pop(key, None)


@router.post("/login", response_model=Token)
async def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends()):
    client_ip = request.client.host if request.client else "unknown"
    rate_key = f"{client_ip}:{form_data.username}"
    _check_rate_limit(rate_key)

    user = await users.find_one({"email": form_data.username})
    if user is None or not verify_password(form_data.password, user["hashed_password"]):
        _record_failed(rate_key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    _record_success(rate_key)
    token = create_access_token(subject=str(user["_id"]), tenant_id=user["tenant_id"])
    return Token(access_token=token)
