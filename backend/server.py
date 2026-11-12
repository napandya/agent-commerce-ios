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
# Mock catalogs (Walmart feed via ACP for ChatGPT, Target via UCP for Gemini)
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
    "gf-socks-6pk": {
        "id": "gf-socks-6pk",
        "name": "Goodfellow & Co Men's No-Show Socks 6pk",
        "variant": "Size 7-12 — Assorted",
        "short": "No-Show Socks 6pk",
        "price": 12.00,
        "compare_at": 15.00,
        "image": "https://images.unsplash.com/photo-1586350977771-b3b0abd50c82?crop=entropy&cs=srgb&fm=jpg&q=85&w=400",
        "retailer": "Target",
    },
    "gf-swim-navy": {
        "id": "gf-swim-navy",
        "name": "Goodfellow & Co Men's 7\" Swim Shorts",
        "variant": "Size L — Navy",
        "short": "Swim Shorts",
        "price": 20.00,
        "compare_at": 25.00,
        "image": "https://images.unsplash.com/photo-1565084888279-aca607ecce0c?crop=entropy&cs=srgb&fm=jpg&q=85&w=400",
        "retailer": "Target",
    },
    "wm-george-sandal-brown": {
        "id": "wm-george-sandal-brown",
        "name": "George Men's Faux Leather Two Band Sandals",
        "variant": "Size 12 — Brown",
        "short": "Size 12 Sandals",
        "price": 19.98,
        "compare_at": 24.98,
        "image": "https://images.unsplash.com/photo-1585120824848-8a5cd41493d2?crop=entropy&cs=srgb&fm=jpg&q=85&w=400",
        "retailer": "Walmart",
    },
    "wm-george-slide-black": {
        "id": "wm-george-slide-black",
        "name": "George Men's Comfort Slide Sandals",
        "variant": "Size 12 — Black",
        "short": "Size 12 Slides",
        "price": 14.97,
        "compare_at": 17.97,
        "image": "https://images.unsplash.com/photo-1603487742131-4160ec999306?crop=entropy&cs=srgb&fm=jpg&q=85&w=400",
        "retailer": "Walmart",
    },
    "wm-aw-socks-6pk": {
        "id": "wm-aw-socks-6pk",
        "name": "Athletic Works Men's Low Cut Socks 6pk",
        "variant": "Size 6-12 — White",
        "short": "Low Cut Socks 6pk",
        "price": 9.97,
        "compare_at": 11.97,
        "image": "https://images.unsplash.com/photo-1586350977771-b3b0abd50c82?crop=entropy&cs=srgb&fm=jpg&q=85&w=400",
        "retailer": "Walmart",
    },
    "wm-george-swim-blue": {
        "id": "wm-george-swim-blue",
        "name": "George Men's 7\" Swim Trunks",
        "variant": "Size L — Blue",
        "short": "Swim Trunks",
        "price": 12.98,
        "compare_at": 15.98,
        "image": "https://images.unsplash.com/photo-1565084888279-aca607ecce0c?crop=entropy&cs=srgb&fm=jpg&q=85&w=400",
        "retailer": "Walmart",
    },
}

AGENT_JOURNEYS = {
    "chatgpt": {"name": "ChatGPT", "app": "Walmart's ACP checkout inside ChatGPT (paid with Apple Pay)", "merchant": "Walmart",
                "protocol": "ACP 2025-09-29", "widget": "Walmart cart", "wallet": "Apple Pay"},
    "gemini": {"name": "Gemini", "app": "Target's UCP checkout inside Gemini (paid with Google Pay)", "merchant": "Target",
               "protocol": "UCP 2026-01 + AP2", "widget": "Target cart", "wallet": "Google Pay"},
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

def catalog_json(retailer: str) -> str:
    return json.dumps([{k: p[k] for k in ("id", "name", "variant", "price")} for p in PRODUCTS.values() if p["retailer"] == retailer])


def system_prompt(agent_id: str, cart: list) -> str:
    j = AGENT_JOURNEYS.get(agent_id, AGENT_JOURNEYS["chatgpt"])
    cart_txt = ", ".join(f"{c.quantity}x {c.product_id}" for c in cart) or "empty"
    return f"""You are {j['name']} using {j['app']} to help a Citi cardholder shop at {j['merchant']}.
Be concise (2-4 short sentences), friendly, and practical.
Available {j['merchant']} products (only these are in stock, delivering to 10848 South Bell Avenue, Chicago):
{catalog_json(j['merchant'])}
Current cart: {cart_txt}
Rules:
- When recommending products, put one tag per product on its own final lines: [[product:<id>]] (max 3).
- When the user explicitly asks to add an item or change its quantity, add a tag [[add:<id>:<total quantity>]]; use quantity 0 to remove.
- Mention that paying with the Citi Custom Cash card earns 5x Citi ThankYou Points when recommending.
- Tell the user they can adjust quantities and tap Checkout in the {j['widget']}.
- For unrelated requests, steer politely back to shopping. Never invent other products."""


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class LineItemIn(BaseModel):
    product_id: str
    quantity: int = Field(default=1, ge=1, le=10)


class ChatRequest(BaseModel):
    session_id: str
    message: str
    agent_id: str = "chatgpt"
    cart: List[LineItemIn] = []


class CheckoutCreate(BaseModel):
    items: List[LineItemIn] = Field(min_length=1, max_length=10)
    tip: float = Field(default=5.0, ge=0, le=100)
    agent_id: str = "chatgpt"


class CheckoutUpdate(BaseModel):
    items: Optional[List[LineItemIn]] = Field(default=None, min_length=1, max_length=10)
    tip: Optional[float] = Field(default=None, ge=0, le=100)


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


def build_lines(items: List[LineItemIn], retailer: str) -> list:
    lines = []
    for it in items:
        p = PRODUCTS.get(it.product_id)
        if not p or p["retailer"] != retailer:
            raise HTTPException(404, f"Product not found at {retailer}: {it.product_id}")
        lines.append({"product": p, "quantity": it.quantity, "line_total": round(p["price"] * it.quantity, 2)})
    return lines


def summarize(lines: list) -> str:
    first = lines[0]
    label = first["product"]["short"] + (f" ×{first['quantity']}" if first["quantity"] > 1 else "")
    return label if len(lines) == 1 else f"{label} + {len(lines) - 1} more"


def compute_totals(lines: list, tip: float) -> dict:
    subtotal = round(sum(l["line_total"] for l in lines), 2)
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

    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"{req.session_id}-{uuid.uuid4()}", system_message=system_prompt(req.agent_id, req.cart)).with_model("openai", "gpt-5.4")

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
    journey = AGENT_JOURNEYS.get(body.agent_id)
    if not journey or not await db.agents.find_one({"id": body.agent_id}):
        raise HTTPException(404, "Agent not found")
    lines = build_lines(body.items, journey["merchant"])
    sid = f"cs_{secrets.token_hex(8)}"
    session = {
        "id": sid, "status": "ready_for_payment", "protocol": journey["protocol"],
        "merchant": journey["merchant"], "agent_id": body.agent_id, "wallet": journey["wallet"],
        "line_items": lines, "summary": summarize(lines), "totals": compute_totals(lines, body.tip), "currency": "USD",
        "fulfillment": {"type": "delivery", "address": "10848 South Bell Avenue, Chicago, IL", "window": "10:16am – 11:17am"},
        "card": CARD, "created_at": now_iso(),
    }
    await db.checkout_sessions.insert_one(dict(session))
    return session


@api.get("/checkout_sessions/{sid}")
async def read_checkout(sid: str):
    return await get_session(sid)


# ACP "update checkout session" / UCP cart update: change items or tip before authorization
@api.patch("/checkout_sessions/{sid}")
async def update_checkout(sid: str, body: CheckoutUpdate):
    s = await get_session(sid)
    if s["status"] != "ready_for_payment":
        raise HTTPException(400, "Checkout is locked after Citi authorization")
    lines = build_lines(body.items, s["merchant"]) if body.items else s["line_items"]
    tip = body.tip if body.tip is not None else s["totals"]["tip"]
    upd = {"line_items": lines, "summary": summarize(lines), "totals": compute_totals(lines, tip)}
    await db.checkout_sessions.update_one({"id": sid}, {"$set": upd})
    return {**s, **upd}


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
        "item": s["summary"], "wallet": s.get("wallet"),
        "item_full": "; ".join(f"{l['quantity']}x {l['product']['name']} ({l['product']['variant']})" for l in s["line_items"]),
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
        "order_id": f"{'TGT' if s['agent_id'] == 'gemini' else 'IC'}-{secrets.randbelow(900000) + 100000}",
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


# ---------------- Spending insights ----------------
def month_shift(dt: datetime, k: int) -> tuple[int, int]:
    idx = dt.year * 12 + (dt.month - 1) - k
    return idx // 12, idx % 12 + 1


SEED_TXNS = [
    (0, 2, "gemini", "Target", "Beach Towel Set", 32.40, "completed", None),
    (0, 5, "chatgpt", "DoorDash", "Dinner order", 41.18, "completed", None),
    (0, 8, "gemini", "Best Buy", "USB-C Charger", 58.99, "declined", "Declined by cardholder"),
    (1, 3, "chatgpt", "Walmart", "Weekly groceries", 86.42, "completed", None),
    (1, 12, "gemini", "Walmart", "Kitchen essentials", 54.10, "completed", None),
    (1, 19, "perplexity", "Best Buy", "Wireless earbuds", 79.99, "completed", None),
    (1, 25, "chatgpt", "Etsy", "Custom mug", 24.00, "completed", None),
    (2, 6, "chatgpt", "Walmart", "Party supplies", 63.75, "completed", None),
    (2, 14, "gemini", "Target", "Running socks", 18.50, "completed", None),
    (2, 22, "perplexity", "Expedia", "Hotel deposit", 120.00, "declined", "Exceeds $100.00 agent spending limit"),
]
AGENT_NAMES = {a["id"]: a["name"] for a in DEFAULT_AGENTS}


async def seed_history() -> None:
    now = datetime.now(timezone.utc)
    for i, (k, day, agent, merchant, item, amount, status, reason) in enumerate(SEED_TXNS):
        y, m = month_shift(now, k)
        d = min(day, now.day) if k == 0 else day
        created = datetime(y, m, d, 0, 30, tzinfo=timezone.utc).isoformat()
        doc = {
            "id": f"seed_{i}", "checkout_session_id": f"seed_cs_{i}", "merchant": merchant, "agent_id": agent,
            "agent_name": AGENT_NAMES[agent], "item": item, "item_full": item, "amount": amount,
            "card_last4": CARD["last4"], "status": status, "reason": reason,
            "auth_code": secrets.token_hex(3).upper() if status == "completed" else None,
            "points_earned": int(amount * POINTS_PER_DOLLAR) if status == "completed" else 0,
            "payment_option": "card" if status == "completed" else None, "created_at": created, "seeded": True,
        }
        await db.transactions.update_one({"id": doc["id"]}, {"$setOnInsert": doc}, upsert=True)


@api.get("/insights")
async def insights(month: Optional[str] = None):
    now = datetime.now(timezone.utc)
    month = month or f"{now.year:04d}-{now.month:02d}"
    if len(month) != 7 or month[4] != "-" or not (month[:4] + month[5:]).isdigit() or not 1 <= int(month[5:]) <= 12:
        raise HTTPException(422, "month must be YYYY-MM")
    rows = await db.transactions.find({"created_at": {"$regex": f"^{month}"}}, {"_id": 0}).to_list(1000)
    spent = [r for r in rows if r["status"] == "completed"]
    by_agent: dict = {}
    by_merchant: dict = {}
    for r in spent:
        a = by_agent.setdefault(r["agent_name"], {"name": r["agent_name"], "amount": 0.0, "count": 0})
        a["amount"] = round(a["amount"] + r["amount"], 2)
        a["count"] += 1
        mm = by_merchant.setdefault(r["merchant"], {"name": r["merchant"], "amount": 0.0, "count": 0})
        mm["amount"] = round(mm["amount"] + r["amount"], 2)
        mm["count"] += 1
    return {
        "month": month,
        "total_spent": round(sum(r["amount"] for r in spent), 2),
        "purchases": len(spent),
        "declined": sum(1 for r in rows if r["status"] == "declined"),
        "points_earned": sum(r.get("points_earned", 0) for r in spent),
        "by_agent": sorted(by_agent.values(), key=lambda x: -x["amount"]),
        "by_merchant": sorted(by_merchant.values(), key=lambda x: -x["amount"]),
    }


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
    await seed_history()


@app.on_event("shutdown")
async def shutdown_db_client():
    app.state.index_task.cancel()
    with suppress(asyncio.CancelledError):
        await app.state.index_task
    client.close()
