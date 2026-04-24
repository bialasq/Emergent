from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import logging
import uuid
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field, ConfigDict

# --- Configuration ---
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = 60 * 12  # 12h for convenience in a game session
REFRESH_TOKEN_DAYS = 30

app = FastAPI(title="Dungeon of Echoes API")
api_router = APIRouter(prefix="/api")

# --- Helpers ---
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_token(user_id: str, email: str, kind: str) -> str:
    if kind == "access":
        exp = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_MINUTES)
    else:
        exp = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_DAYS)
    payload = {"sub": user_id, "email": email, "type": kind, "exp": exp}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access: str, refresh: str):
    response.set_cookie(
        "access_token", access, httponly=True, secure=True,
        samesite="none", max_age=ACCESS_TOKEN_MINUTES * 60, path="/",
    )
    response.set_cookie(
        "refresh_token", refresh, httponly=True, secure=True,
        samesite="none", max_age=REFRESH_TOKEN_DAYS * 86400, path="/",
    )


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_optional_user(request: Request) -> Optional[dict]:
    try:
        return await get_current_user(request)
    except HTTPException:
        return None


# --- Models ---
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=100)
    username: str = Field(min_length=2, max_length=32)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    username: str
    created_at: str


class RunSubmit(BaseModel):
    seed: int
    character_class: Literal["warrior", "mage"]
    character_name: str = Field(min_length=1, max_length=32)
    depth: int = Field(ge=1)
    score: int = Field(ge=0)
    kills: int = Field(ge=0)
    duration_seconds: int = Field(ge=0)
    outcome: Literal["dead", "victory", "abandoned"]
    level: int = Field(ge=1)
    guest_id: Optional[str] = None


class LeaderboardEntry(BaseModel):
    rank: int
    username: str
    character_class: str
    character_name: str
    depth: int
    level: int
    score: int
    kills: int
    duration_seconds: int
    outcome: str
    created_at: str
    is_guest: bool


# --- Auth endpoints ---
@api_router.post("/auth/register")
async def register(body: RegisterRequest, response: Response):
    email = body.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    existing_name = await db.users.find_one({"username_lower": body.username.lower().strip()})
    if existing_name:
        raise HTTPException(status_code=400, detail="Username taken")

    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "email": email,
        "username": body.username.strip(),
        "username_lower": body.username.lower().strip(),
        "password_hash": hash_password(body.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)

    access = create_token(user_id, email, "access")
    refresh = create_token(user_id, email, "refresh")
    set_auth_cookies(response, access, refresh)

    return {
        "id": user_id,
        "email": email,
        "username": body.username.strip(),
        "created_at": doc["created_at"],
    }


@api_router.post("/auth/login")
async def login(body: LoginRequest, request: Request, response: Response):
    email = body.email.lower().strip()
    ip = request.client.host if request.client else "unknown"
    identifier = f"{ip}:{email}"

    # brute force check
    attempt = await db.login_attempts.find_one({"identifier": identifier})
    if attempt and attempt.get("count", 0) >= 5:
        locked_until = attempt.get("locked_until")
        if locked_until and datetime.fromisoformat(locked_until) > datetime.now(timezone.utc):
            raise HTTPException(status_code=429, detail="Too many failed attempts. Try later.")

    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        locked_until = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {"$inc": {"count": 1}, "$set": {"locked_until": locked_until}},
            upsert=True,
        )
        raise HTTPException(status_code=401, detail="Invalid credentials")

    await db.login_attempts.delete_one({"identifier": identifier})

    access = create_token(user["id"], user["email"], "access")
    refresh = create_token(user["id"], user["email"], "refresh")
    set_auth_cookies(response, access, refresh)

    return {
        "id": user["id"],
        "email": user["email"],
        "username": user["username"],
        "created_at": user["created_at"],
    }


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@api_router.get("/auth/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return UserOut(**user)


@api_router.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token")
        access = create_token(payload["sub"], payload["email"], "access")
        response.set_cookie(
            "access_token", access, httponly=True, secure=True,
            samesite="none", max_age=ACCESS_TOKEN_MINUTES * 60, path="/",
        )
        return {"ok": True}
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")


# --- Runs / Leaderboard ---
@api_router.post("/runs")
async def submit_run(body: RunSubmit, user: Optional[dict] = Depends(get_optional_user)):
    run_id = str(uuid.uuid4())
    is_guest = user is None
    doc = {
        "id": run_id,
        "user_id": user["id"] if user else None,
        "username": user["username"] if user else (body.guest_id or "Wanderer"),
        "is_guest": is_guest,
        "seed": body.seed,
        "character_class": body.character_class,
        "character_name": body.character_name.strip()[:32],
        "depth": body.depth,
        "score": body.score,
        "kills": body.kills,
        "duration_seconds": body.duration_seconds,
        "outcome": body.outcome,
        "level": body.level,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.runs.insert_one(doc)
    return {"id": run_id, "ok": True}


@api_router.get("/leaderboard", response_model=List[LeaderboardEntry])
async def leaderboard(limit: int = 50, character_class: Optional[str] = None):
    limit = max(1, min(limit, 100))
    query: dict = {}
    if character_class in ("warrior", "mage"):
        query["character_class"] = character_class
    cursor = db.runs.find(query, {"_id": 0}).sort(
        [("score", -1), ("depth", -1), ("created_at", 1)]
    ).limit(limit)
    entries: List[LeaderboardEntry] = []
    rank = 1
    async for r in cursor:
        entries.append(LeaderboardEntry(
            rank=rank,
            username=r.get("username", "Wanderer"),
            character_class=r["character_class"],
            character_name=r["character_name"],
            depth=r["depth"],
            level=r.get("level", 1),
            score=r["score"],
            kills=r["kills"],
            duration_seconds=r["duration_seconds"],
            outcome=r["outcome"],
            created_at=r["created_at"],
            is_guest=r.get("is_guest", False),
        ))
        rank += 1
    return entries


@api_router.get("/runs/me")
async def my_runs(user: dict = Depends(get_current_user)):
    cursor = db.runs.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).limit(50)
    return await cursor.to_list(50)


@api_router.get("/")
async def root():
    return {"message": "Dungeon of Echoes API", "status": "ok"}


# --- Wire up ---
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def on_startup():
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("username_lower", unique=True)
        await db.users.create_index("id", unique=True)
        await db.runs.create_index([("score", -1), ("depth", -1)])
        await db.runs.create_index("user_id")
        await db.login_attempts.create_index("identifier")
        logger.info("Indexes ready")
    except Exception as e:
        logger.warning(f"Index creation warning: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
