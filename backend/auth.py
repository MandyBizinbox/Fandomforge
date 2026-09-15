"""Authentication: JWT email/password + Emergent Google OAuth session."""
import os
import jwt
import bcrypt
import requests
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException, Header, APIRouter, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from typing import Optional
from models import User, UserCreate, UserLogin, TokenResponse, uid, utcnow

JWT_SECRET = os.environ.get("JWT_SECRET", "fandomforge-dev-secret-change-me")
JWT_ALG = "HS256"
JWT_EXPIRES_MIN = 60 * 24 * 7

bearer = HTTPBearer(auto_error=False)
OWNER_BYPASS_ROLES = {"owner", "super_admin"}


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def create_token(user_id: str, email: str, role: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRES_MIN)
    payload = {"sub": user_id, "email": email, "role": role, "exp": exp}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_db_from_request(request: Request):
    return request.app.state.db


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
) -> User:
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(credentials.credentials)
    db = request.app.state.db
    user_doc = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")
    user_doc.pop("password_hash", None)
    user = User(**user_doc)
    request.state.user = user
    return user


def require_role(*roles: str):
    async def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles and user.role not in OWNER_BYPASS_ROLES:
            raise HTTPException(status_code=403, detail=f"Requires role: {roles}")
        return user
    return checker


async def optional_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
) -> Optional[User]:
    if not credentials:
        return None
    try:
        return await get_current_user(request, credentials)
    except HTTPException:
        return None


# ---------------- ROUTES ----------------
auth_router = APIRouter(prefix="/auth")


@auth_router.post("/register", response_model=TokenResponse)
async def register(payload: UserCreate, request: Request):
    db = request.app.state.db
    existing = await db.users.find_one({"email": payload.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    role = payload.role if payload.role in ("buyer", "creator", "printer") else "buyer"
    user = User(email=payload.email, name=payload.name, role=role)
    doc = user.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    doc["password_hash"] = hash_password(payload.password)
    await db.users.insert_one(doc)
    token = create_token(user.id, user.email, user.role)
    return TokenResponse(access_token=token, user=user)


@auth_router.post("/login", response_model=TokenResponse)
async def login(payload: UserLogin, request: Request):
    db = request.app.state.db
    doc = await db.users.find_one({"email": payload.email}, {"_id": 0})
    if not doc or not verify_password(payload.password, doc.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if doc.get("status") == "suspended":
        raise HTTPException(status_code=403, detail="Account suspended")
    doc.pop("password_hash", None)
    user = User(**doc)
    token = create_token(user.id, user.email, user.role)
    return TokenResponse(access_token=token, user=user)


@auth_router.get("/me", response_model=User)
async def me(user: User = Depends(get_current_user)):
    return user


@auth_router.post("/google/session", response_model=TokenResponse)
async def google_session_exchange(
    request: Request,
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID"),
):
    """Exchange Emergent Google OAuth session_id for our JWT token."""
    if not x_session_id:
        raise HTTPException(status_code=400, detail="Missing X-Session-ID")
    try:
        resp = requests.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": x_session_id},
            timeout=10,
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session")
        data = resp.json()
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Emergent auth error: {e}")

    email = data.get("email")
    name = data.get("name") or email.split("@")[0]
    picture = data.get("picture")
    if not email:
        raise HTTPException(status_code=401, detail="No email from Google")

    db = request.app.state.db
    doc = await db.users.find_one({"email": email}, {"_id": 0})
    if not doc:
        user = User(email=email, name=name, role="buyer", avatar_url=picture)
        new_doc = user.model_dump()
        new_doc["created_at"] = new_doc["created_at"].isoformat()
        new_doc["password_hash"] = ""
        new_doc["google_linked"] = True
        await db.users.insert_one(new_doc)
    else:
        doc.pop("password_hash", None)
        if picture and not doc.get("avatar_url"):
            await db.users.update_one({"id": doc["id"]}, {"$set": {"avatar_url": picture}})
            doc["avatar_url"] = picture
        user = User(**doc)
    token = create_token(user.id, user.email, user.role)
    return TokenResponse(access_token=token, user=user)


class RoleSwitchRequest:
    pass
