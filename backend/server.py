from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import asyncio
import logging
import uuid
import secrets
import random
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict

from fastapi import FastAPI, APIRouter, Request, Response, HTTPException, Depends, WebSocket, WebSocketDisconnect
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from pydantic import BaseModel, EmailStr, Field

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("pazer")

app = FastAPI(title="PAZER API")
api = APIRouter(prefix="/api")

LATENCY_BOUND = 2.5  # seconds tolerated between server-measured and client-reported elapsed
ROOM_PLAY_WINDOW = 60  # seconds players get to stop once a room goes LIVE

# ---------------------------------------------------------------------------
# Default configuration
# ---------------------------------------------------------------------------
DEFAULT_CONFIG = {
    "id": "global",
    "coin_value_inr": 1,
    "game_enabled": True,
    "real_money_enabled": False,
    "wallet": {
        "min_deposit": 100,
        "max_deposit": 100000,
        "bonus_enabled": True,
        "bonus_percentage": 10,
        "max_bonus": 1000,
        "min_withdrawal": 200,
        "max_withdrawal": 50000,
    },
    "fixed_config": {
        "enabled": True,
        "min_bet": 20,
        "max_bet": 5000,
        "win_multiplier": 5,
        "targets": [5, 7, 10, 14, 16, 21, 26, 31],
    },
    "room_config": {
        "entry_fee": 50,
        "min_players": 5,
        "max_players": 25,
        "room_duration_minutes": 30,
        "platform_fee_percent": 20,
        "num_winners": 1,
        "runner_up_percent": 0,
        "auto_room_count": 6,
        "room_targets": [5, 10, 15, 20, 25, 30],
    },
    "room_1v1_config": {
        "enabled": True,
        "entry_fee": 50,
        "win_multiplier": 1.5,
        "room_duration_minutes": 30,
        "targets": [5, 8, 10, 13, 15, 18, 20, 23, 25, 30],
    },
    "bot_config": {
        "enabled": True,
        "fill_1v1": True,
        "fill_multiplayer": True,
        "join_delay_seconds": 3,
        "error_range": 0.25,
    },
    "streak_config": {
        "enabled": True,
        "daily_bonus": 5,
    },
    "leaderboard_config": {
        "enabled": True,
        "auto_generate": True,
        "fake_count": 8,
        "min_win": 500,
        "max_win": 25000,
        "name_pool": ["Palak", "Rohan", "Aisha", "Vikram", "Neha", "Arjun", "Sana", "Karan",
                      "Priya", "Dev", "Meera", "Aditya", "Riya", "Sahil", "Yash", "Isha",
                      "Kabir", "Manish", "Simran", "Rahul", "Diya", "Nikhil", "Pooja", "Kavya"],
        "manual_entries": [],
    },
}


BOT_NAMES = ["Aarav", "Ishaan", "Ananya", "Vivaan", "Diya", "Kiara", "Reyansh", "Saanvi",
             "Advik", "Myra", "Kabir", "Aadhya", "Vihaan", "Anika", "Arnav", "Navya",
             "Shaurya", "Aaradhya", "Krish", "Prisha", "Rudra", "Tara", "Veer", "Zara"]


async def get_config() -> dict:
    cfg = await db.config.find_one({"id": "global"}, {"_id": 0})
    if not cfg:
        await db.config.insert_one(dict(DEFAULT_CONFIG))
        return dict(DEFAULT_CONFIG)
    # merge any newly-added top-level keys without wiping admin customisations
    missing = {k: v for k, v in DEFAULT_CONFIG.items() if k not in cfg}
    if missing:
        await db.config.update_one({"id": "global"}, {"$set": missing})
        cfg.update(missing)
    return cfg


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "type": "access",
               "exp": datetime.now(timezone.utc) + timedelta(hours=12)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "type": "refresh",
               "exp": datetime.now(timezone.utc) + timedelta(days=7)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access: str, refresh: str):
    response.set_cookie("access_token", access, httponly=True, secure=True,
                        samesite="none", max_age=43200, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True,
                        samesite="none", max_age=604800, path="/")


def serialize_user(user: dict) -> dict:
    user = dict(user)
    user["id"] = str(user.pop("_id"))
    user.pop("password_hash", None)
    return user


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
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        if user.get("status") == "suspended":
            raise HTTPException(status_code=403, detail="Account suspended")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ---------------------------------------------------------------------------
# Wallet ledger helpers
# ---------------------------------------------------------------------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def record_txn(user_id: str, ttype: str, amount: float, wallet: str,
                     balance_before: float, balance_after: float,
                     status: str = "success", meta: Optional[dict] = None) -> dict:
    txn = {
        "id": str(uuid.uuid4()),
        "txn_id": "TXN" + uuid.uuid4().hex[:12].upper(),
        "user_id": user_id,
        "type": ttype,
        "amount": round(amount, 2),
        "coins": round(amount, 2),
        "wallet": wallet,
        "status": status,
        "balance_before": round(balance_before, 2),
        "balance_after": round(balance_after, 2),
        "created_at": now_iso(),
        "meta": meta or {},
    }
    await db.transactions.insert_one(dict(txn))
    txn.pop("_id", None)
    return txn


async def get_user_by_id(user_id: str) -> dict:
    return await db.users.find_one({"_id": ObjectId(user_id)})


async def debit_wallet(user: dict, amount: float, ttype: str, meta: dict = None):
    """Debit combined balance: main first, then bonus. Returns list of txns."""
    main = user.get("main_balance", 0.0)
    bonus = user.get("bonus_balance", 0.0)
    total = main + bonus
    if total < amount:
        raise HTTPException(status_code=400, detail="Insufficient balance")
    before = total
    from_main = min(main, amount)
    from_bonus = amount - from_main
    new_main = main - from_main
    new_bonus = bonus - from_bonus
    await db.users.update_one({"_id": user["_id"]},
                              {"$set": {"main_balance": new_main, "bonus_balance": new_bonus}})
    txn = await record_txn(str(user["_id"]), ttype, -amount, "combined",
                           before, new_main + new_bonus, meta=meta)
    user["main_balance"] = new_main
    user["bonus_balance"] = new_bonus
    return txn


async def credit_wallet(user_id: str, amount: float, ttype: str, wallet: str = "main",
                        status: str = "success", meta: dict = None):
    user = await get_user_by_id(user_id)
    main = user.get("main_balance", 0.0)
    bonus = user.get("bonus_balance", 0.0)
    before = main + bonus
    if wallet == "bonus":
        new_bonus = bonus + amount
        await db.users.update_one({"_id": user["_id"]}, {"$set": {"bonus_balance": new_bonus}})
        after = main + new_bonus
    else:
        new_main = main + amount
        await db.users.update_one({"_id": user["_id"]}, {"$set": {"main_balance": new_main}})
        after = new_main + bonus
    return await record_txn(user_id, ttype, amount, wallet, before, after, status=status, meta=meta)


# ---------------------------------------------------------------------------
# Pydantic request models
# ---------------------------------------------------------------------------
class RegisterReq(BaseModel):
    full_name: str
    mobile: str
    password: str


class LoginReq(BaseModel):
    mobile: str
    password: str


class ForgotReq(BaseModel):
    mobile: str


class ResetReq(BaseModel):
    token: str
    password: str


class DepositReq(BaseModel):
    amount: float
    method: Optional[str] = "demo_upi"


class WithdrawReq(BaseModel):
    amount: float
    account: Optional[str] = "demo-account"


class KycReq(BaseModel):
    full_name: str
    document_type: str
    document_number: str
    dob: Optional[str] = None


class FixedStartReq(BaseModel):
    target: float
    bet: float


class FixedStopReq(BaseModel):
    session_id: str
    elapsed: float
    nonce: str


class RoomStopReq(BaseModel):
    elapsed: float


# ---------------------------------------------------------------------------
# WebSocket manager
# ---------------------------------------------------------------------------
class ConnectionManager:
    def __init__(self):
        self.rooms: Dict[str, List[WebSocket]] = {}

    async def connect(self, room_id: str, ws: WebSocket):
        await ws.accept()
        self.rooms.setdefault(room_id, []).append(ws)

    def disconnect(self, room_id: str, ws: WebSocket):
        if room_id in self.rooms and ws in self.rooms[room_id]:
            self.rooms[room_id].remove(ws)

    async def broadcast(self, room_id: str, message: dict):
        for ws in list(self.rooms.get(room_id, [])):
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect(room_id, ws)


manager = ConnectionManager()


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------
@api.post("/auth/register")
async def register(body: RegisterReq, response: Response):
    mobile = body.mobile.strip()
    if not mobile.isdigit() or len(mobile) < 10:
        raise HTTPException(status_code=400, detail="Enter a valid mobile number")
    if await db.users.find_one({"mobile": mobile}):
        raise HTTPException(status_code=400, detail="Mobile number already registered")
    username = "TU" + secrets.token_hex(4).upper()
    doc = {
        "username": username,
        "mobile": mobile,
        "password_hash": hash_password(body.password),
        "display_name": body.full_name.strip(),
        "full_name": body.full_name.strip(),
        "role": "user",
        "status": "active",
        "kyc_status": "not_submitted",
        "profile_picture": None,
        "main_balance": 0.0,
        "bonus_balance": 0.0,
        "stats": {"games_played": 0, "games_won": 0, "total_entries": 0.0, "total_prizes": 0.0},
        "created_at": now_iso(),
    }
    res = await db.users.insert_one(doc)
    uid = str(res.inserted_id)
    access, refresh = create_access_token(uid, mobile), create_refresh_token(uid)
    set_auth_cookies(response, access, refresh)
    user = await db.users.find_one({"_id": res.inserted_id})
    return {"user": serialize_user(user), "token": access}


@api.post("/auth/login")
async def login(body: LoginReq, request: Request, response: Response):
    mobile = body.mobile.strip()
    ip = request.client.host if request.client else "unknown"
    ident = f"{ip}:{mobile}"
    attempt = await db.login_attempts.find_one({"identifier": ident})
    if attempt and attempt.get("locked_until"):
        locked = datetime.fromisoformat(attempt["locked_until"])
        if locked > datetime.now(timezone.utc):
            raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")
    user = await db.users.find_one({"mobile": mobile})
    if not user or not verify_password(body.password, user["password_hash"]):
        count = (attempt["count"] if attempt else 0) + 1
        upd = {"identifier": ident, "count": count}
        if count >= 5:
            upd["locked_until"] = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
        await db.login_attempts.update_one({"identifier": ident}, {"$set": upd}, upsert=True)
        raise HTTPException(status_code=401, detail="Invalid mobile or password")
    await db.login_attempts.delete_one({"identifier": ident})
    uid = str(user["_id"])
    access, refresh = create_access_token(uid, mobile), create_refresh_token(uid)
    set_auth_cookies(response, access, refresh)
    return {"user": serialize_user(user), "token": access}


@api.post("/auth/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Logged out"}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return serialize_user(user)


@api.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        access = create_access_token(str(user["_id"]), user.get("mobile", ""))
        response.set_cookie("access_token", access, httponly=True, secure=True,
                            samesite="none", max_age=43200, path="/")
        return {"token": access}
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


@api.post("/auth/forgot-password")
async def forgot_password(body: ForgotReq):
    user = await db.users.find_one({"mobile": body.mobile.strip()})
    if user:
        token = secrets.token_urlsafe(32)
        await db.password_reset_tokens.insert_one({
            "token": token, "user_id": str(user["_id"]),
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)),
            "used": False,
        })
        logger.info(f"[PASSWORD RESET] token for {body.mobile}: {token}")
    return {"message": "If the mobile exists, a reset code has been sent."}


@api.post("/auth/reset-password")
async def reset_password(body: ResetReq):
    rec = await db.password_reset_tokens.find_one({"token": body.token})
    if not rec or rec.get("used"):
        raise HTTPException(status_code=400, detail="Invalid or used token")
    await db.users.update_one({"_id": ObjectId(rec["user_id"])},
                              {"$set": {"password_hash": hash_password(body.password)}})
    await db.password_reset_tokens.update_one({"token": body.token}, {"$set": {"used": True}})
    return {"message": "Password updated"}


# ---------------------------------------------------------------------------
# Profile / KYC
# ---------------------------------------------------------------------------
class ProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    mobile: Optional[str] = None
    profile_picture: Optional[str] = None


@api.put("/profile")
async def update_profile(body: ProfileUpdate, user: dict = Depends(get_current_user)):
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    if upd:
        await db.users.update_one({"_id": user["_id"]}, {"$set": upd})
    return serialize_user(await get_user_by_id(str(user["_id"])))


@api.post("/kyc")
async def submit_kyc(body: KycReq, user: dict = Depends(get_current_user)):
    await db.users.update_one({"_id": user["_id"]}, {"$set": {
        "kyc_status": "pending",
        "kyc_data": body.model_dump(),
        "kyc_submitted_at": now_iso(),
    }})
    return {"message": "KYC submitted for review", "kyc_status": "pending"}


# ---------------------------------------------------------------------------
# Wallet endpoints
# ---------------------------------------------------------------------------
@api.get("/wallet")
async def get_wallet(user: dict = Depends(get_current_user)):
    u = await get_user_by_id(str(user["_id"]))
    return {
        "main_balance": round(u.get("main_balance", 0), 2),
        "bonus_balance": round(u.get("bonus_balance", 0), 2),
        "total_balance": round(u.get("main_balance", 0) + u.get("bonus_balance", 0), 2),
    }


@api.get("/wallet/transactions")
async def get_transactions(user: dict = Depends(get_current_user), type: Optional[str] = None):
    q = {"user_id": str(user["_id"])}
    if type:
        q["type"] = type
    txns = await db.transactions.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return txns


@api.post("/wallet/deposit")
async def deposit(body: DepositReq, user: dict = Depends(get_current_user)):
    cfg = await get_config()
    w = cfg["wallet"]
    if body.amount < w["min_deposit"]:
        raise HTTPException(status_code=400, detail=f"Minimum deposit is {w['min_deposit']}")
    if body.amount > w["max_deposit"]:
        raise HTTPException(status_code=400, detail=f"Maximum deposit is {w['max_deposit']}")
    coins = body.amount * cfg["coin_value_inr"]
    deposit_txn = await credit_wallet(str(user["_id"]), coins, "deposit", "main",
                                      meta={"method": body.method, "inr": body.amount})
    bonus = 0.0
    bonus_txn = None
    if w["bonus_enabled"] and w["bonus_percentage"] > 0:
        bonus = min(coins * w["bonus_percentage"] / 100.0, w["max_bonus"])
        if bonus > 0:
            bonus_txn = await credit_wallet(str(user["_id"]), bonus, "bonus", "bonus",
                                            meta={"reason": "deposit_bonus", "percent": w["bonus_percentage"]})
    wallet = await get_wallet(user)
    return {"message": "Deposit successful", "coins": coins, "bonus": bonus,
            "wallet": wallet, "transactions": [t for t in [deposit_txn, bonus_txn] if t]}


@api.post("/wallet/withdraw")
async def withdraw(body: WithdrawReq, user: dict = Depends(get_current_user)):
    cfg = await get_config()
    w = cfg["wallet"]
    u = await get_user_by_id(str(user["_id"]))
    if u.get("kyc_status") != "verified":
        raise HTTPException(status_code=403, detail="KYC verification required before withdrawal")
    if body.amount < w["min_withdrawal"]:
        raise HTTPException(status_code=400, detail=f"Minimum withdrawal is {w['min_withdrawal']}")
    if body.amount > w["max_withdrawal"]:
        raise HTTPException(status_code=400, detail=f"Maximum withdrawal is {w['max_withdrawal']}")
    if u.get("main_balance", 0) < body.amount:
        raise HTTPException(status_code=400, detail="Insufficient main wallet balance")
    before = u["main_balance"] + u.get("bonus_balance", 0)
    new_main = u["main_balance"] - body.amount
    await db.users.update_one({"_id": u["_id"]}, {"$set": {"main_balance": new_main}})
    txn = await record_txn(str(user["_id"]), "withdrawal", -body.amount, "main",
                           before, new_main + u.get("bonus_balance", 0),
                           status="pending", meta={"account": body.account})
    return {"message": "Withdrawal request submitted for review", "transaction": txn,
            "wallet": await get_wallet(user)}


# ---------------------------------------------------------------------------
# Fixed-time challenge
# ---------------------------------------------------------------------------
@api.get("/config/public")
async def public_config():
    cfg = await get_config()
    return {
        "coin_value_inr": cfg["coin_value_inr"],
        "game_enabled": cfg["game_enabled"],
        "real_money_enabled": cfg["real_money_enabled"],
        "wallet": cfg["wallet"],
        "fixed_config": cfg["fixed_config"],
        "room_config": cfg["room_config"],
        "room_1v1_config": cfg["room_1v1_config"],
    }


@api.post("/games/fixed/start")
async def fixed_start(body: FixedStartReq, user: dict = Depends(get_current_user)):
    cfg = await get_config()
    if not cfg["game_enabled"] or not cfg["fixed_config"].get("enabled"):
        raise HTTPException(status_code=403, detail="Challenge is currently disabled")
    fc = cfg["fixed_config"]
    if body.target not in fc["targets"]:
        raise HTTPException(status_code=404, detail="Target time not available")
    bet = round(float(body.bet), 2)
    if bet < fc["min_bet"]:
        raise HTTPException(status_code=400, detail=f"Minimum bet is {fc['min_bet']} coins")
    if bet > fc["max_bet"]:
        raise HTTPException(status_code=400, detail=f"Maximum bet is {fc['max_bet']} coins")
    u = await get_user_by_id(str(user["_id"]))
    if u.get("main_balance", 0) + u.get("bonus_balance", 0) < bet:
        raise HTTPException(status_code=400, detail="Insufficient balance for this bet")
    active = await db.game_sessions.find_one({"user_id": str(user["_id"]), "status": "active"})
    if active:
        raise HTTPException(status_code=409, detail="You already have an active game session")
    nonce = secrets.token_urlsafe(16)
    prize = round(bet * fc["win_multiplier"], 2)
    await debit_wallet(u, bet, "game_entry", meta={"mode": "fixed", "target": body.target})
    session = {
        "id": str(uuid.uuid4()),
        "user_id": str(user["_id"]),
        "mode": "fixed",
        "target": body.target,
        "entry_fee": bet,
        "prize": prize,
        "win_multiplier": fc["win_multiplier"],
        "nonce": nonce,
        "status": "active",
        "server_start": datetime.now(timezone.utc).timestamp(),
        "created_at": now_iso(),
    }
    await db.game_sessions.insert_one(dict(session))
    await db.users.update_one({"_id": u["_id"]}, {"$inc": {"stats.total_entries": bet}})
    return {"session_id": session["id"], "nonce": nonce, "target": body.target,
            "entry_fee": bet, "prize": prize}


@api.post("/games/fixed/stop")
async def fixed_stop(body: FixedStopReq, user: dict = Depends(get_current_user)):
    session = await db.game_sessions.find_one({"id": body.session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session["user_id"] != str(user["_id"]):
        raise HTTPException(status_code=403, detail="Not your session")
    if session["status"] != "active":
        raise HTTPException(status_code=409, detail="Session already completed")
    if session["nonce"] != body.nonce:
        raise HTTPException(status_code=403, detail="Invalid session token")
    if body.elapsed <= 0 or body.elapsed > 120:
        raise HTTPException(status_code=400, detail="Invalid elapsed time")
    server_elapsed = datetime.now(timezone.utc).timestamp() - session["server_start"]
    flagged = abs(server_elapsed - body.elapsed) > LATENCY_BOUND
    recorded = round(body.elapsed, 3)
    diff = round(abs(recorded - session["target"]), 3)
    # WIN: must stop exactly at the target time (matches at 2-decimal display)
    won = round(recorded, 2) == round(session["target"], 2) and not flagged
    prize = session["prize"] if won else 0.0

    await db.game_sessions.update_one({"id": session["id"]}, {"$set": {
        "status": "completed", "recorded": recorded, "diff": diff,
        "won": won, "prize_awarded": prize, "flagged": flagged,
        "server_elapsed": round(server_elapsed, 3), "stopped_at": now_iso(),
    }})
    game_record = {
        "id": str(uuid.uuid4()),
        "game_id": "GM" + uuid.uuid4().hex[:10].upper(),
        "user_id": str(user["_id"]),
        "mode": "fixed",
        "target": session["target"],
        "recorded": recorded,
        "diff": diff,
        "entry_fee": session["entry_fee"],
        "prize": prize,
        "result": "won" if won else "lost",
        "flagged": flagged,
        "created_at": now_iso(),
    }
    await db.games.insert_one(dict(game_record))
    inc = {"stats.games_played": 1}
    if won:
        inc["stats.games_won"] = 1
        inc["stats.total_prizes"] = prize
        await credit_wallet(str(user["_id"]), prize, "prize", "main",
                            meta={"mode": "fixed", "game_id": game_record["game_id"]})
    await db.users.update_one({"_id": user["_id"]}, {"$inc": inc})
    game_record.pop("_id", None)
    return {"recorded": recorded, "target": session["target"], "diff": diff,
            "won": won, "prize": prize, "flagged": flagged, "game": game_record,
            "wallet": await get_wallet(user)}


@api.get("/games/history")
async def game_history(user: dict = Depends(get_current_user), result: Optional[str] = None):
    q = {"user_id": str(user["_id"])}
    if result:
        q["result"] = result
    return await db.games.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)


@api.get("/stats")
async def user_stats(user: dict = Depends(get_current_user)):
    u = await get_user_by_id(str(user["_id"]))
    s = u.get("stats", {})
    played = s.get("games_played", 0)
    won = s.get("games_won", 0)
    return {
        "games_played": played,
        "games_won": won,
        "games_lost": played - won,
        "win_rate": round(won / played * 100, 1) if played else 0.0,
        "total_entries": round(s.get("total_entries", 0), 2),
        "total_prizes": round(s.get("total_prizes", 0), 2),
    }


# ---------------------------------------------------------------------------
# Daily login streak
# ---------------------------------------------------------------------------
def today_str() -> str:
    return datetime.now(timezone.utc).date().isoformat()


@api.get("/streak")
async def get_streak(user: dict = Depends(get_current_user)):
    cfg = await get_config()
    sc = cfg.get("streak_config", {})
    u = await get_user_by_id(str(user["_id"]))
    last = u.get("streak_last_claim")
    return {
        "enabled": sc.get("enabled", True),
        "daily_bonus": sc.get("daily_bonus", 5),
        "streak": u.get("streak_count", 0),
        "can_claim": sc.get("enabled", True) and last != today_str(),
        "last_claim": last,
    }


@api.post("/streak/claim")
async def claim_streak(user: dict = Depends(get_current_user)):
    cfg = await get_config()
    sc = cfg.get("streak_config", {})
    if not sc.get("enabled", True):
        raise HTTPException(status_code=403, detail="Daily rewards are disabled")
    u = await get_user_by_id(str(user["_id"]))
    today = today_str()
    if u.get("streak_last_claim") == today:
        raise HTTPException(status_code=409, detail="Already claimed today")
    yesterday = (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()
    streak = u.get("streak_count", 0) + 1 if u.get("streak_last_claim") == yesterday else 1
    bonus = sc.get("daily_bonus", 5)
    await db.users.update_one({"_id": u["_id"]}, {"$set": {"streak_last_claim": today, "streak_count": streak}})
    await credit_wallet(str(user["_id"]), bonus, "bonus", "bonus",
                        meta={"reason": "daily_streak", "streak": streak})
    return {"claimed": True, "streak": streak, "bonus": bonus, "can_claim": False,
            "wallet": await get_wallet(user)}


# ---------------------------------------------------------------------------
# Weekly leaderboard (real winners + auto-changing promotional entries)
# ---------------------------------------------------------------------------
@api.get("/leaderboard/weekly")
async def weekly_leaderboard(user: dict = Depends(get_current_user)):
    cfg = await get_config()
    lc = cfg.get("leaderboard_config", {})
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    agg = await db.games.aggregate([
        {"$match": {"created_at": {"$gte": week_ago}, "prize": {"$gt": 0}}},
        {"$group": {"_id": "$user_id", "coins": {"$sum": "$prize"}}},
        {"$match": {"_id": {"$regex": "^[0-9a-fA-F]{24}$"}}},
        {"$lookup": {
            "from": "users",
            "let": {"uid": {"$toObjectId": "$_id"}},
            "pipeline": [
                {"$match": {"$expr": {"$eq": ["$_id", "$$uid"]}}},
                {"$project": {"display_name": 1, "username": 1, "role": 1}},
            ],
            "as": "user",
        }},
        {"$unwind": "$user"},
        {"$match": {"user.role": {"$ne": "admin"}}},
        {"$sort": {"coins": -1}}, {"$limit": 30},
    ]).to_list(30)
    my_id = str(user["_id"])
    entries = [{
        "name": a["user"].get("display_name") or a["user"].get("username"),
        "coins": round(a["coins"], 2),
        "is_you": a["_id"] == my_id,
    } for a in agg]
    # promotional entries (manual + auto-generated, stable per day)
    if lc.get("enabled", True):
        for e in lc.get("manual_entries", []):
            entries.append({"name": e.get("name", "Player"), "coins": e.get("coins", 0), "is_you": False})
        if lc.get("auto_generate", True):
            rng = random.Random(int(today_str().replace("-", "")))
            pool = lc.get("name_pool", []) or ["Player"]
            k = min(lc.get("fake_count", 8), len(pool))
            for name in rng.sample(pool, k):
                coins = rng.randint(lc.get("min_win", 500), lc.get("max_win", 25000))
                entries.append({"name": name, "coins": round(coins / 50) * 50, "is_you": False})
    entries.sort(key=lambda x: x["coins"], reverse=True)
    return [{"rank": i + 1, **e} for i, e in enumerate(entries[:25])]


# ---------------------------------------------------------------------------
# Multiplayer rooms
# ---------------------------------------------------------------------------
def room_public(room: dict) -> dict:
    r = dict(room)
    r.pop("_id", None)
    r["current_players"] = len(r.get("participants", []))
    r["prize_pool"] = round(r["current_players"] * r["entry_fee"], 2)
    r["players"] = [{"user_id": p["user_id"], "username": p["username"],
                     "submitted": p.get("submitted", False),
                     "recorded": p.get("recorded"), "diff": p.get("diff"),
                     "rank": p.get("rank"), "prize": p.get("prize", 0)}
                    for p in r.get("participants", [])]
    r.pop("participants", None)
    return r


async def create_room(target: float, cfg: dict, mode: str = "multiplayer") -> dict:
    if mode == "1v1":
        rc = cfg["room_1v1_config"]
        entry_fee = rc["entry_fee"]
        min_players, max_players = 2, 2
        win_multiplier = rc["win_multiplier"]
        duration = rc["room_duration_minutes"]
        platform_fee_percent, num_winners = 0, 1
    else:
        rc = cfg["room_config"]
        entry_fee = rc["entry_fee"]
        min_players, max_players = rc["min_players"], rc["max_players"]
        win_multiplier = None
        duration = rc["room_duration_minutes"]
        platform_fee_percent, num_winners = rc["platform_fee_percent"], rc["num_winners"]
    room = {
        "id": str(uuid.uuid4()),
        "room_code": ("V1" if mode == "1v1" else "RM") + uuid.uuid4().hex[:6].upper(),
        "mode": mode,
        "target": target,
        "entry_fee": entry_fee,
        "min_players": min_players,
        "max_players": max_players,
        "win_multiplier": win_multiplier,
        "platform_fee_percent": platform_fee_percent,
        "num_winners": num_winners,
        "runner_up_percent": rc.get("runner_up_percent", 0),
        "status": "OPEN",
        "participants": [],
        "join_deadline": (datetime.now(timezone.utc) + timedelta(minutes=duration)).isoformat(),
        "live_deadline": None,
        "winner": None,
        "created_at": now_iso(),
    }
    await db.rooms.insert_one(dict(room))
    return room


@api.get("/rooms")
async def list_rooms(status: Optional[str] = None, mode: str = "multiplayer"):
    q = {"mode": mode}
    if status:
        q["status"] = status.upper()
    else:
        q["status"] = {"$in": ["OPEN", "FULL", "STARTING", "LIVE"]}
    rooms = await db.rooms.find(q).sort("target", 1).to_list(100)
    return [room_public(r) for r in rooms]


@api.get("/rooms/completed")
async def completed_rooms(mode: str = "multiplayer"):
    rooms = await db.rooms.find({"mode": mode, "status": {"$in": ["COMPLETED", "CANCELLED", "REFUNDED"]}}) \
        .sort("created_at", -1).to_list(50)
    return [room_public(r) for r in rooms]


@api.get("/rooms/{room_id}")
async def get_room(room_id: str):
    room = await db.rooms.find_one({"id": room_id})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return room_public(room)


@api.post("/rooms/{room_id}/join")
async def join_room(room_id: str, user: dict = Depends(get_current_user)):
    room = await db.rooms.find_one({"id": room_id})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if room["status"] not in ("OPEN", "FULL"):
        raise HTTPException(status_code=409, detail="Room not open for joining")
    if any(p["user_id"] == str(user["_id"]) for p in room["participants"]):
        raise HTTPException(status_code=409, detail="Already joined this room")
    if len(room["participants"]) >= room["max_players"]:
        raise HTTPException(status_code=409, detail="Room is full")
    u = await get_user_by_id(str(user["_id"]))
    if u.get("main_balance", 0) + u.get("bonus_balance", 0) < room["entry_fee"]:
        raise HTTPException(status_code=400, detail="Insufficient balance")
    await debit_wallet(u, room["entry_fee"], "game_entry",
                       meta={"mode": "room", "room_id": room_id, "target": room["target"]})
    await db.users.update_one({"_id": u["_id"]}, {"$inc": {"stats.total_entries": room["entry_fee"]}})
    participant = {"user_id": str(user["_id"]), "username": u["username"],
                   "joined_at": now_iso(), "submitted": False, "nonce": secrets.token_urlsafe(12)}
    new_status = "FULL" if len(room["participants"]) + 1 >= room["max_players"] else room["status"]
    await db.rooms.update_one({"id": room_id},
                              {"$push": {"participants": participant}, "$set": {"status": new_status}})
    updated = await db.rooms.find_one({"id": room_id})
    await manager.broadcast(room_id, {"event": "player_joined", "room": room_public(updated)})
    return room_public(updated)


@api.post("/rooms/{room_id}/stop")
async def room_stop(room_id: str, body: RoomStopReq, user: dict = Depends(get_current_user)):
    room = await db.rooms.find_one({"id": room_id})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if room["status"] != "LIVE":
        raise HTTPException(status_code=409, detail="Room is not live")
    part = next((p for p in room["participants"] if p["user_id"] == str(user["_id"])), None)
    if not part:
        raise HTTPException(status_code=403, detail="You are not in this room")
    if part.get("submitted"):
        raise HTTPException(status_code=409, detail="Already submitted")
    if body.elapsed <= 0 or body.elapsed > 120:
        raise HTTPException(status_code=400, detail="Invalid elapsed time")
    server_elapsed = datetime.now(timezone.utc).timestamp() - room["live_start"]
    flagged = abs(server_elapsed - body.elapsed) > LATENCY_BOUND
    recorded = round(body.elapsed, 3)
    diff = round(abs(recorded - room["target"]), 3)
    await db.rooms.update_one(
        {"id": room_id, "participants.user_id": str(user["_id"])},
        {"$set": {"participants.$.submitted": True, "participants.$.recorded": recorded,
                  "participants.$.diff": diff, "participants.$.flagged": flagged,
                  "participants.$.stopped_at": datetime.now(timezone.utc).timestamp()}})
    updated = await db.rooms.find_one({"id": room_id})
    await manager.broadcast(room_id, {"event": "player_stopped", "room": room_public(updated)})
    # if everyone submitted, finalize early
    if all(p.get("submitted") for p in updated["participants"]):
        await finalize_room(updated)
    return {"recorded": recorded, "diff": diff, "flagged": flagged}


async def finalize_room(room: dict):
    room = await db.rooms.find_one({"id": room["id"]})
    if room["status"] not in ("LIVE",):
        return
    cfg = await get_config()
    participants = room["participants"]
    submitted = [p for p in participants if p.get("submitted") and not p.get("flagged")]
    # rank: smallest diff, tie -> earliest stop
    submitted.sort(key=lambda p: (p["diff"], p.get("stopped_at", float("inf"))))
    gross = len(participants) * room["entry_fee"]
    is_1v1 = room.get("mode") == "1v1"
    if is_1v1:
        # winner gets a fixed multiplier of their entry (e.g. 1.5x)
        prize_pool = round(room["entry_fee"] * (room.get("win_multiplier") or 1.5), 2)
        platform_fee = round(gross - prize_pool, 2)
        num_winners = 1 if submitted else 0
    else:
        platform_fee = gross * room["platform_fee_percent"] / 100.0
        prize_pool = gross - platform_fee
        num_winners = min(room["num_winners"], len(submitted))
    for i, p in enumerate(submitted):
        p["rank"] = i + 1
        p["prize"] = 0.0
    winner_name = None
    if num_winners >= 1 and submitted:
        if num_winners == 1:
            submitted[0]["prize"] = round(prize_pool, 2)
        else:
            share = prize_pool / num_winners
            for i in range(num_winners):
                submitted[i]["prize"] = round(share, 2)
        winner_name = submitted[0]["username"]
    # pay winners and record games
    for p in participants:
        won = p.get("prize", 0) > 0
        if p.get("is_bot"):
            continue  # bots have no wallet/stats
        if won:
            await credit_wallet(p["user_id"], p["prize"], "prize", "main",
                                meta={"mode": "room", "room_id": room["id"]})
        game_record = {
            "id": str(uuid.uuid4()), "game_id": "GM" + uuid.uuid4().hex[:10].upper(),
            "user_id": p["user_id"], "mode": "room", "room_code": room["room_code"],
            "target": room["target"], "recorded": p.get("recorded"),
            "diff": p.get("diff"), "entry_fee": room["entry_fee"],
            "prize": p.get("prize", 0), "rank": p.get("rank"),
            "result": "won" if won else "lost", "created_at": now_iso(),
        }
        await db.games.insert_one(dict(game_record))
        inc = {"stats.games_played": 1}
        if won:
            inc["stats.games_won"] = 1
            inc["stats.total_prizes"] = p["prize"]
        await db.users.update_one({"_id": ObjectId(p["user_id"])}, {"$inc": inc})
    await db.rooms.update_one({"id": room["id"]}, {"$set": {
        "status": "COMPLETED", "participants": participants,
        "winner": winner_name, "prize_pool": round(prize_pool, 2),
        "platform_fee": round(platform_fee, 2), "completed_at": now_iso(),
    }})
    final = await db.rooms.find_one({"id": room["id"]})
    await manager.broadcast(room["id"], {"event": "completed", "room": room_public(final)})


async def refund_room(room: dict):
    for p in room["participants"]:
        await credit_wallet(p["user_id"], room["entry_fee"], "refund", "main",
                            status="refunded",
                            meta={"reason": "room_cancelled", "room_id": room["id"]})
    await db.rooms.update_one({"id": room["id"]}, {"$set": {
        "status": "REFUNDED", "cancelled_at": now_iso(),
        "cancel_reason": "Minimum players not reached"}})
    final = await db.rooms.find_one({"id": room["id"]})
    await manager.broadcast(room["id"], {"event": "cancelled", "room": room_public(final)})


@api.websocket("/ws/rooms/{room_id}")
async def room_ws(websocket: WebSocket, room_id: str):
    await manager.connect(room_id, websocket)
    try:
        room = await db.rooms.find_one({"id": room_id})
        if room:
            await websocket.send_json({"event": "state", "room": room_public(room)})
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(room_id, websocket)
    except Exception:
        manager.disconnect(room_id, websocket)


# ---------------------------------------------------------------------------
# Room manager background loop
# ---------------------------------------------------------------------------
async def room_manager_loop():
    while True:
        try:
            cfg = await get_config()
            now = datetime.now(timezone.utc)
            bot_cfg = cfg.get("bot_config", {})
            error_range = bot_cfg.get("error_range", 0.25)

            # ---- Bot fill: fill rooms that already have a real player ----
            if bot_cfg.get("enabled"):
                fill_rooms = await db.rooms.find({"status": {"$in": ["OPEN", "FULL"]}}).to_list(200)
                for room in fill_rooms:
                    parts = room["participants"]
                    humans = [p for p in parts if not p.get("is_bot")]
                    if not humans:
                        continue
                    if room["mode"] == "1v1" and not bot_cfg.get("fill_1v1", True):
                        continue
                    if room["mode"] == "multiplayer" and not bot_cfg.get("fill_multiplayer", True):
                        continue
                    target_count = 2 if room["mode"] == "1v1" else room["min_players"]
                    if len(parts) >= target_count:
                        continue
                    earliest = min(datetime.fromisoformat(h["joined_at"]) for h in humans)
                    if (now - earliest).total_seconds() < bot_cfg.get("join_delay_seconds", 3):
                        continue
                    used = {p["username"] for p in parts}
                    while len(parts) < target_count:
                        name = random.choice([n for n in BOT_NAMES if n not in used] or BOT_NAMES)
                        used.add(name)
                        parts.append({"user_id": "bot_" + uuid.uuid4().hex[:8], "username": name,
                                      "is_bot": True, "joined_at": now_iso(), "submitted": False})
                    new_status = "FULL" if len(parts) >= room["max_players"] else room["status"]
                    upd = {"participants": parts, "status": new_status}
                    # start immediately once the bot fill reaches the required count
                    upd["join_deadline"] = now.isoformat()
                    await db.rooms.update_one({"id": room["id"]}, {"$set": upd})

            # ---- transition OPEN/FULL rooms that are ready ----
            open_rooms = await db.rooms.find({"status": {"$in": ["OPEN", "FULL"]}}).to_list(200)
            for room in open_rooms:
                deadline = datetime.fromisoformat(room["join_deadline"])
                ready = len(room["participants"]) >= room["max_players"] or now >= deadline
                if not ready:
                    continue
                if len(room["participants"]) >= room["min_players"]:
                    live_start = datetime.now(timezone.utc).timestamp()
                    parts = room["participants"]
                    # bots stop instantly with a configurable spread around the target
                    for p in parts:
                        if p.get("is_bot") and not p.get("submitted"):
                            rec = max(0.05, round(room["target"] + random.gauss(0, error_range), 3))
                            p["recorded"] = rec
                            p["diff"] = round(abs(rec - room["target"]), 3)
                            p["flagged"] = False
                            p["submitted"] = True
                            p["stopped_at"] = live_start + rec
                    await db.rooms.update_one({"id": room["id"]}, {"$set": {
                        "status": "LIVE", "live_start": live_start, "participants": parts,
                        "live_deadline": (now + timedelta(seconds=ROOM_PLAY_WINDOW)).isoformat()}})
                    upd = await db.rooms.find_one({"id": room["id"]})
                    await manager.broadcast(room["id"], {"event": "started", "room": room_public(upd)})
                elif now >= deadline:
                    await refund_room(room)

            # ---- finalize LIVE rooms (all submitted or window passed) ----
            live_rooms = await db.rooms.find({"status": "LIVE"}).to_list(200)
            for room in live_rooms:
                ld = datetime.fromisoformat(room["live_deadline"]) if room.get("live_deadline") else None
                all_done = room["participants"] and all(p.get("submitted") for p in room["participants"])
                if all_done or (ld and now >= ld):
                    await finalize_room(room)
            # ensure auto rooms exist per target (multiplayer)
            rc = cfg["room_config"]
            for target in rc["room_targets"]:
                exists = await db.rooms.find_one({"mode": "multiplayer", "target": target, "status": {"$in": ["OPEN", "FULL"]}})
                if not exists:
                    await create_room(target, cfg, "multiplayer")
            # ensure auto 1v1 rooms exist per target
            v1 = cfg.get("room_1v1_config", {})
            if v1.get("enabled", True):
                for target in v1.get("targets", []):
                    exists = await db.rooms.find_one({"mode": "1v1", "target": target, "status": {"$in": ["OPEN", "FULL"]}})
                    if not exists:
                        await create_room(target, cfg, "1v1")
        except Exception as e:
            logger.error(f"room loop error: {e}")
        await asyncio.sleep(5)


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------
@api.get("/admin/config")
async def admin_get_config(admin: dict = Depends(require_admin)):
    return await get_config()


class ConfigUpdate(BaseModel):
    data: dict


@api.put("/admin/config")
async def admin_update_config(body: ConfigUpdate, admin: dict = Depends(require_admin)):
    body.data.pop("id", None)
    await db.config.update_one({"id": "global"}, {"$set": body.data}, upsert=True)
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()), "admin_id": str(admin["_id"]),
        "action": "update_config", "detail": list(body.data.keys()), "created_at": now_iso()})
    return await get_config()


@api.get("/admin/users")
async def admin_users(admin: dict = Depends(require_admin), search: Optional[str] = None):
    q = {}
    if search:
        q = {"$or": [{"username": {"$regex": search, "$options": "i"}},
                     {"mobile": {"$regex": search, "$options": "i"}},
                     {"display_name": {"$regex": search, "$options": "i"}}]}
    users = await db.users.find(q).sort("created_at", -1).to_list(500)
    return [serialize_user(u) for u in users]


@api.get("/admin/users/{user_id}")
async def admin_user_detail(user_id: str, admin: dict = Depends(require_admin)):
    u = await get_user_by_id(user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    txns = await db.transactions.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    games = await db.games.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"user": serialize_user(u), "transactions": txns, "games": games}


class UserActionReq(BaseModel):
    action: str  # suspend, reactivate, flag, verify_kyc, reject_kyc


@api.post("/admin/users/{user_id}/action")
async def admin_user_action(user_id: str, body: UserActionReq, admin: dict = Depends(require_admin)):
    mapping = {
        "suspend": {"status": "suspended"},
        "reactivate": {"status": "active"},
        "flag": {"flagged": True},
        "unflag": {"flagged": False},
        "verify_kyc": {"kyc_status": "verified"},
        "reject_kyc": {"kyc_status": "rejected"},
    }
    if body.action not in mapping:
        raise HTTPException(status_code=400, detail="Unknown action")
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": mapping[body.action]})
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()), "admin_id": str(admin["_id"]),
        "action": body.action, "target_user": user_id, "created_at": now_iso()})
    return serialize_user(await get_user_by_id(user_id))


@api.get("/admin/withdrawals")
async def admin_withdrawals(admin: dict = Depends(require_admin)):
    return await db.transactions.find({"type": "withdrawal"}, {"_id": 0}).sort("created_at", -1).to_list(200)


class WithdrawalAction(BaseModel):
    action: str  # approve / reject


@api.post("/admin/withdrawals/{txn_id}/action")
async def admin_withdrawal_action(txn_id: str, body: WithdrawalAction, admin: dict = Depends(require_admin)):
    txn = await db.transactions.find_one({"txn_id": txn_id, "type": "withdrawal"})
    if not txn or txn["status"] != "pending":
        raise HTTPException(status_code=404, detail="Pending withdrawal not found")
    if body.action == "approve":
        await db.transactions.update_one({"txn_id": txn_id}, {"$set": {"status": "success"}})
    elif body.action == "reject":
        await credit_wallet(txn["user_id"], abs(txn["amount"]), "refund", "main",
                            status="refunded", meta={"reason": "withdrawal_rejected"})
        await db.transactions.update_one({"txn_id": txn_id}, {"$set": {"status": "rejected"}})
    else:
        raise HTTPException(status_code=400, detail="Unknown action")
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()), "admin_id": str(admin["_id"]),
        "action": f"withdrawal_{body.action}", "txn_id": txn_id, "created_at": now_iso()})
    return {"message": f"Withdrawal {body.action}d"}


@api.get("/admin/stats")
async def admin_stats(admin: dict = Depends(require_admin)):
    total_users = await db.users.count_documents({"role": "user"})
    total_games = await db.games.count_documents({})
    active_rooms = await db.rooms.count_documents({"status": {"$in": ["OPEN", "FULL", "LIVE", "STARTING"]}})
    deposits = await db.transactions.aggregate([
        {"$match": {"type": "deposit"}}, {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    prizes = await db.transactions.aggregate([
        {"$match": {"type": "prize"}}, {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    return {
        "total_users": total_users,
        "total_games": total_games,
        "active_rooms": active_rooms,
        "total_deposits": round(deposits[0]["total"], 2) if deposits else 0,
        "total_prizes_paid": round(prizes[0]["total"], 2) if prizes else 0,
    }


@api.get("/admin/audit-logs")
async def admin_audit_logs(admin: dict = Depends(require_admin)):
    return await db.audit_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)


@api.get("/")
async def root():
    return {"message": "TIMEUP API", "status": "ok"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
async def seed_admin():
    mobile = os.environ.get("ADMIN_MOBILE", "9999999999")
    password = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"mobile": mobile})
    if not existing:
        await db.users.insert_one({
            "username": "admin", "mobile": mobile, "password_hash": hash_password(password),
            "display_name": "TIMEUP Admin", "full_name": "TIMEUP Admin", "role": "admin", "status": "active",
            "kyc_status": "verified", "main_balance": 0.0, "bonus_balance": 0.0,
            "stats": {"games_played": 0, "games_won": 0, "total_entries": 0.0, "total_prizes": 0.0},
            "created_at": now_iso(),
        })
    elif not verify_password(password, existing["password_hash"]):
        await db.users.update_one({"mobile": mobile}, {"$set": {"password_hash": hash_password(password)}})


@app.on_event("startup")
async def startup():
    try:
        await db.users.drop_index("email_1")
    except Exception:
        pass
    await db.users.create_index("mobile", unique=True, sparse=True)
    await db.users.create_index("username")
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.login_attempts.create_index("identifier")
    await db.transactions.create_index("user_id")
    await db.games.create_index("user_id")
    await db.rooms.create_index("status")
    await seed_admin()
    await get_config()
    asyncio.create_task(room_manager_loop())
    logger.info("TIMEUP API started")


@app.on_event("shutdown")
async def shutdown():
    client.close()
