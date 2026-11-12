import asyncio
import json
import os
import logging
import secrets
import uuid
from contextlib import suppress
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Literal

from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from pymongo import ASCENDING, DESCENDING, IndexModel
from starlette.middleware.cors import CORSMiddleware

from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]
EMERGENT_LLM_KEY = os.environ['EMERGENT_LLM_KEY']

INDEXES: dict[str, list[IndexModel]] = {
    "chat_messages": [IndexModel([("session_id", ASCENDING), ("created_at", ASCENDING)], name="session_created")],
    "checkout_sessions": [IndexModel([("id", ASCENDING)], name="id", unique=True)],
    "transactions": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("created_at", DESCENDING)], name="created_desc"),
        IndexModel([("checkout_session_id", ASCENDING)], name="checkout_session_id"),
    ],
    "agents": [IndexModel([("id", ASCENDING)], name="id", unique=True)],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:
                logging.getLogger(__name__).error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Mock catalog (Instacart / Target via UCP product feed)
# ---------------------------------------------------------------------------
PRODUCTS = {
    "gf-saul-taupe": {
        "id": "gf-saul-taupe",
        "name": "Goodfellow & Co Men's Saul Suede Two Band Sandals",
        "variant": "Size 12 — Taupe",
        "short": "Size 12 Sandals",
        "price": 29.99,
        "compare_at": 45.00,
        "image": "https://images.unsplash.com/photo-1585120824848-8a5cd41493d2?crop=entropy&cs=srgb&fm=jpg&q=85&w=400",
        "retailer": "Target",
    },
    "gf-saul-black": {
        "id": "gf-saul-black",
        "name": "Goodfellow & Co Men's Saul Suede Two Band Sandals",
        "variant": "Size 12 — Black",
        "short": "Size 12 Sandals",
        "price": 29.99,
        "compare_at": 45.00,
        "image": "https://images.unsplash.com/photo-1603487742131-4160ec999306?crop=entropy&cs=srgb&fm=jpg&q=85&w=400",
        "retailer": "Target",
    },
    "gf-slide-brown": {
        "id": "gf-slide-brown",
        "name": "Goodfellow & Co Men's Leather Slide Sandals",
        "variant": "Size 12 — Brown",
        "short": "Size 12 Slides",
        "price": 34.99,
        "compare_at": 40.00,
        "image": "https://images.unsplash.com/photo-1562273138-f46be4ebdf33?crop=entropy&cs=srgb&fm=jpg&q=85&w=400",
        "retailer": "Target",
    },
}

DELIVERY_FEE = 7.99
BAG_FEE = 0.15
TAX_RATE = 0.13271
POINTS_PER_DOLLAR = 5
CARD = {"brand": "Mastercard", "last4": "4680", "product": "Citi Custom Cash® Card"}
DEFAULT_AGENTS = [
    {"id": "chatgpt", "name": "ChatGPT", "provider": "OpenAI", "protocol": "ACP", "enabled": True, "limit": 250.0},
    {"id": "gemini", "name": "Gemini", "provider": "Google", "protocol": "UCP / AP2", "enabled": True, "limit": 150.0},
    {"id": "perplexity", "name": "Perplexity", "provider": "Perplexity AI", "protocol": "Agent Pay", "enabled": False, "limit": 100.0},
]

SYSTEM_PROMPT = f"""You are ChatGPT using the Instacart app to help a Citi cardholder shop at Target.
Be concise (2-4 short sentences), friendly, and practical.
Available products (only these are in stock at Target via Instacart, ship to 10848 South Bell Avenue, Chicago):
{json.dumps([{k: p[k] for k in ("id", "name", "variant", "price")} for p in PRODUCTS.values()])}
Rules:
- When you recommend or the user asks to add a product, include exactly one tag on its own final line: [[product:<id>]] using an id from the list.
- Mention that paying with the Citi Custom Cash card earns 5x Citi ThankYou Points on Instacart when recommending.
- Tell the user they can tap Checkout in the Instacart widget.
- For unrelated requests, steer politely back to shopping. Never invent other products."""


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class ChatRequest(BaseModel):
    session_id: str
    message: str


class CheckoutCreate(BaseModel):
    product_id: str
    quantity: int = Field(default=1, ge=1, le=20)
    tip: float = Field(default=5.0, ge=0, le=100)
    agent_id: str = "chatgpt"


class TokenizeRequest(BaseModel):
    checkout_session_id: str


class AuthorizeRequest(BaseModel):
    checkout_session_id: str
    decision: Literal["approve", "decline"]


class CompleteRequest(BaseModel):
    payment_option: Literal["card", "flex_pay", "points"] = "card"


class AgentUpdate(BaseModel):
    enabled: Optional[bool] = None
    limit: Optional[float] = Field(default=None, ge=0, le=10000)


def compute_totals(price: float, qty: int, tip: float) -> dict:
    subtotal = round(price * qty, 2)
    service = round(max(2.50, subtotal * 0.04), 2)
    tax = round(subtotal * TAX_RATE, 2)
    total = round(subtotal + DELIVERY_FEE + service + BAG_FEE + tip + tax, 2)
    return {
        "subtotal": subtotal, "delivery_fee": DELIVERY_FEE, "service_fee": service,
        "bag_fee": BAG_FEE, "tip": tip, "tax": tax, "total": total,
    }


async def ensure_agents() -> None:
    for a in DEFAULT_AGENTS:
        await db.agents.update_one({"id": a["id"]}, {"$setOnInsert": {**a, "connected_at": now_iso(), "revoked": False}}, upsert=True)


async def get_session(sid: str) -> dict:
    s = await db.checkout_sessions.find_one({"id": sid}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Checkout session not found")
    return s


app = FastAPI()


@app.get("/health", include_in_schema=False)
@app.head("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}


api = APIRouter(prefix="/api")


@api.get("/")
async def root():
    return {"message": "Citi Agentic Commerce API"}


@api.get("/products")
async def list_products():
    return list(PRODUCTS.values())


# ---------------- Live ChatGPT-style chat (SSE) ----------------
@api.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    history = await db.chat_messages.find({"session_id": req.session_id}, {"_id": 0}).sort("created_at", 1).to_list(40)
    context = "\n".join(f"{m['role'].upper()}: {m['text']}" for m in history)
    prompt = (f"Conversation so far:\n{context}\n\nUSER: {req.message}" if context else req.message)
    await db.chat_messages.insert_one({"session_id": req.session_id, "role": "user", "text": req.message, "created_at": now_iso()})

    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"{req.session_id}-{uuid.uuid4()}", system_message=SYSTEM_PROMPT).with_model("openai", "gpt-5.4")

    async def gen():
        full = ""
        try:
            async for ev in chat.stream_message(UserMessage(text=prompt)):
                if isinstance(ev, TextDelta):
                    full += ev.content
                    yield f"data: {json.dumps({'delta': ev.content})}\n\n"
                elif isinstance(ev, StreamDone):
                    break
        except Exception as exc:
            logging.getLogger(__name__).error("chat stream failed: %s", exc)
            yield f"data: {json.dumps({'error': 'The assistant is unavailable right now. Please try again.'})}\n\n"
            return
        await db.chat_messages.insert_one({"session_id": req.session_id, "role": "assistant", "text": full, "created_at": now_iso()})
        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ---------------- ACP: checkout session ----------------
@api.post("/checkout_sessions")
async def create_checkout(body: CheckoutCreate):
    p = PRODUCTS.get(body.product_id)
    if not p:
        raise HTTPException(404, "Product not found")
    if not await db.agents.find_one({"id": body.agent_id}):
        raise HTTPException(404, "Agent not found")
    totals = compute_totals(p["price"], body.quantity, body.tip)
    sid = f"cs_{secrets.token_hex(8)}"
    session = {
        "id": sid, "status": "ready_for_payment", "protocol": "ACP 2025-09-29",
        "merchant": "Target via Instacart", "agent_id": body.agent_id,
        "product": p, "quantity": body.quantity, "totals": totals, "currency": "USD",
        "fulfillment": {"type": "delivery", "address": "10848 South Bell Avenue, Chicago, IL", "window": "10:16am – 11:17am"},
        "card": CARD, "created_at": now_iso(),
    }
    await db.checkout_sessions.insert_one(dict(session))
    return session


@api.get("/checkout_sessions/{sid}")
async def read_checkout(sid: str):
    return await get_session(sid)


# ---------------- Mastercard Agent Pay: agentic token ----------------
@api.post("/agentpay/tokenize")
async def tokenize(body: TokenizeRequest):
    s = await get_session(body.checkout_session_id)
    if s["status"] != "authorized":
        raise HTTPException(400, "Citi has not authorized this purchase")
    token = {
        "agentic_token": f"mc_atk_{secrets.token_hex(6)}",
        "token_pan_last4": str(5000 + secrets.randbelow(4999)),
        "funding_pan_last4": CARD["last4"],
        "agent_id": s["agent_id"],
        "scope": {"merchant": s["merchant"], "max_amount": s["totals"]["total"], "currency": "USD", "single_use": True},
        "cryptogram": secrets.token_urlsafe(18),
        "expires_in": 900,
    }
    await db.checkout_sessions.update_one({"id": s["id"]}, {"$set": {"agent_token": token}})
    return token


# ---------------- Citi issuer authorization ----------------
@api.post("/citi/authorize")
async def citi_authorize(body: AuthorizeRequest):
    s = await get_session(body.checkout_session_id)
    if s["status"] != "ready_for_payment":
        existing = await db.transactions.find_one({"checkout_session_id": s["id"]}, {"_id": 0})
        if existing:
            return existing
    agent = await db.agents.find_one({"id": s["agent_id"]}, {"_id": 0})
    amount = s["totals"]["total"]
    status, reason = "approved", None
    if body.decision == "decline":
        status, reason = "declined", "Declined by cardholder"
    elif not agent or not agent.get("enabled") or agent.get("revoked"):
        status, reason = "declined", f"{s['agent_id']} is not permitted to shop on this card"
    elif amount > agent.get("limit", 0):
        status, reason = "declined", f"Exceeds ${agent['limit']:.2f} agent spending limit"

    existing = await db.transactions.find_one({"checkout_session_id": s["id"]}, {"_id": 0})
    txn = {
        "id": existing["id"] if existing else f"txn_{secrets.token_hex(6)}",
        "checkout_session_id": s["id"], "merchant": s["merchant"],
        "agent_id": s["agent_id"], "agent_name": agent["name"] if agent else s["agent_id"],
        "item": s["product"]["short"], "item_full": f"{s['product']['name']} ({s['product']['variant']})",
        "amount": amount, "card_last4": CARD["last4"], "status": status, "reason": reason,
        "auth_code": secrets.token_hex(3).upper() if status == "approved" else None,
        "points_earned": 0, "payment_option": None,
        "created_at": existing["created_at"] if existing else now_iso(),
    }
    await db.transactions.update_one({"id": txn["id"]}, {"$set": txn}, upsert=True)
    await db.checkout_sessions.update_one({"id": s["id"]}, {"$set": {"status": "authorized" if status == "approved" else "canceled"}})
    return txn


# ---------------- ACP: complete checkout ----------------
@api.post("/checkout_sessions/{sid}/complete")
async def complete_checkout(sid: str, body: CompleteRequest):
    s = await get_session(sid)
    txn = await db.transactions.find_one({"checkout_session_id": sid}, {"_id": 0})
    if s["status"] == "completed" and s.get("order") and txn:
        return {**s["order"], "amount": s["totals"]["total"], "transaction_id": txn["id"]}
    if not txn or txn["status"] != "approved":
        raise HTTPException(400, "Purchase was not authorized by Citi")
    total = s["totals"]["total"]
    points = 0 if body.payment_option == "points" else int(total * POINTS_PER_DOLLAR)
    order = {
        "order_id": f"IC-{secrets.randbelow(900000) + 100000}",
        "status": "completed", "points_earned": points,
        "points_redeemed": int(round(total * 100)) if body.payment_option == "points" else 0,
        "payment_option": body.payment_option,
        "flex_monthly": round(total / 6, 2) if body.payment_option == "flex_pay" else None,
        "eta": "Delivery by 11:45am",
    }
    await db.transactions.update_one({"id": txn["id"]}, {"$set": {"status": "completed", "points_earned": points, "payment_option": body.payment_option, "order_id": order["order_id"]}})
    await db.checkout_sessions.update_one({"id": sid}, {"$set": {"status": "completed", "order": order}})
    return {**order, "amount": total, "transaction_id": txn["id"]}


@api.get("/transactions")
async def list_transactions():
    return await db.transactions.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)


# ---------------- Citi agent controls ----------------
@api.get("/agents")
async def list_agents():
    await ensure_agents()
    return await db.agents.find({}, {"_id": 0}).to_list(50)


@api.patch("/agents/{aid}")
async def update_agent(aid: str, body: AgentUpdate):
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    if body.enabled:
        upd["revoked"] = False
    res = await db.agents.find_one_and_update({"id": aid}, {"$set": upd}, projection={"_id": 0}, return_document=True)
    if not res:
        raise HTTPException(404, "Agent not found")
    return res


@api.post("/agents/{aid}/revoke")
async def revoke_agent(aid: str):
    res = await db.agents.find_one_and_update({"id": aid}, {"$set": {"revoked": True, "enabled": False}}, projection={"_id": 0}, return_document=True)
    if not res:
        raise HTTPException(404, "Agent not found")
    return res


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')


@app.on_event("startup")
async def startup():
    app.state.index_task = asyncio.create_task(ensure_indexes())
    await ensure_agents()


@app.on_event("shutdown")
async def shutdown_db_client():
    app.state.index_task.cancel()
    with suppress(asyncio.CancelledError):
        await app.state.index_task
    client.close()
