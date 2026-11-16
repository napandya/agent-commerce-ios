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
    "carts": [IndexModel([("cart_ref", ASCENDING)], name="cart_ref", unique=True)],
    "transactions": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("created_at", DESCENDING)], name="created_desc"),
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
# Mock Wayfair catalog — Citi offer eligibility depends on the sofa
# ---------------------------------------------------------------------------
IMG = "https://images.unsplash.com/{}?crop=entropy&cs=srgb&fm=jpg&q=85&w=400"
PRODUCTS = {
    "wf-arnav-sectional": {
        "id": "wf-arnav-sectional", "brand": "Wade Logan", "name": "Wade Logan Arnav 3-Piece Sectional Sofa",
        "variant": "112\" — Charcoal Gray", "short": "Arnav Sectional", "price": 1249.99, "compare_at": 1599.99,
        "clearance": False, "image": IMG.format("photo-1555041469-a586c61ea9bc"), "retailer": "Wayfair",
    },
    "wf-etta-velvet": {
        "id": "wf-etta-velvet", "brand": "Etta Avenue", "name": "Etta Avenue Celeste Velvet Sofa",
        "variant": "84\" — Emerald Green", "short": "Celeste Velvet Sofa", "price": 699.99, "compare_at": 899.99,
        "clearance": False, "image": IMG.format("photo-1493663284031-b7e3aefcae8e"), "retailer": "Wayfair",
    },
    "wf-zipcode-loveseat": {
        "id": "wf-zipcode-loveseat", "brand": "Zipcode Design", "name": "Zipcode Design Mila Loveseat",
        "variant": "62\" — Oatmeal Beige", "short": "Mila Loveseat", "price": 389.99, "compare_at": 449.99,
        "clearance": False, "image": IMG.format("photo-1550254478-ead40cc54513"), "retailer": "Wayfair",
    },
    "wf-lark-leather": {
        "id": "wf-lark-leather", "brand": "Lark Manor", "name": "Lark Manor Haddon Leather Sofa (Clearance)",
        "variant": "86\" — Cognac", "short": "Haddon Leather Sofa", "price": 649.00, "compare_at": 1099.00,
        "clearance": True, "image": IMG.format("photo-1540574163026-643ea20ade25"), "retailer": "Wayfair",
    },
}

AGENT_JOURNEYS = {
    "chatgpt": {"name": "ChatGPT", "app": "the Wayfair app inside ChatGPT",
                "model": ("openai", "gpt-5.4"), "wallet": "Apple Pay"},
    "gemini": {"name": "Gemini", "app": "Wayfair checkout inside Gemini",
               "model": ("gemini", "gemini-3-flash-preview"), "wallet": "Google Pay"},
}

OFFER = {
    "id": "mco_wayfair_pilot_10",
    "title": "10% back at Wayfair",
    "headline": "Get 10% back as a statement credit, up to $150",
    "program": "Retailer-wide statement credit pilot",
    "funded_by": "Wayfair via Mastercard Offers",
    "min_spend": 500.0, "rate": 0.10, "max_credit": 150.0,
    "terms": [
        "Spend $500+ on eligible Wayfair purchases in one order",
        "Clearance and open-box items are excluded",
        "Credit posts to your statement within 5 business days of shipping",
        "Valid for 30 days after activation · one use per card",
    ],
}

TAX_RATE = 0.1025
POINTS_PER_DOLLAR = 1
CARD = {"brand": "Mastercard", "last4": "4680", "product": "Citi Custom Cash® Card"}
DEFAULT_AGENTS = [
    {"id": "chatgpt", "name": "ChatGPT", "provider": "OpenAI", "enabled": True, "limit": 2000.0},
    {"id": "gemini", "name": "Gemini", "provider": "Google", "enabled": True, "limit": 2000.0},
    {"id": "perplexity", "name": "Perplexity", "provider": "Perplexity AI", "enabled": False, "limit": 100.0},
]
CATALOG_JSON = json.dumps([{k: p[k] for k in ("id", "name", "variant", "price", "clearance")} for p in PRODUCTS.values()])


def system_prompt(agent_id: str, cart: list) -> str:
    j = AGENT_JOURNEYS.get(agent_id, AGENT_JOURNEYS["chatgpt"])
    cart_txt = ", ".join(f"{c.quantity}x {c.product_id}" for c in cart) or "empty"
    return f"""You are {j['name']} using {j['app']} to help a Citi cardholder shop for furniture at Wayfair.
Be concise (2-4 short sentences), warm, and practical. Reply in plain text only — no markdown, asterisks or bullet symbols.
Available Wayfair sofas (only these are in stock, delivering to 10848 South Bell Avenue, Chicago):
{CATALOG_JSON}
Current cart: {cart_txt}
Rules:
- When recommending products, put one tag per product on its own final lines: [[product:<id>]] (max 3).
- When the user explicitly asks to add an item or change its quantity, add a tag [[add:<id>:<total quantity>]]; use quantity 0 to remove.
- Tell the user they can tap "Check Citi offers" in the Wayfair cart to see if a Citi card offer applies before buying.
- Never promise an offer or quote offer amounts — Citi decides eligibility.
- For unrelated requests, steer politely back to furniture shopping. Never invent other products."""


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class LineItemIn(BaseModel):
    product_id: str
    quantity: int = Field(default=1, ge=1, le=5)


class ChatRequest(BaseModel):
    session_id: str
    message: str
    agent_id: Literal["chatgpt", "gemini"] = "chatgpt"
    cart: List[LineItemIn] = []


class CartCreate(BaseModel):
    agent_id: Literal["chatgpt", "gemini"]
    items: List[LineItemIn] = Field(min_length=1, max_length=10)


class CartUpdate(BaseModel):
    items: List[LineItemIn] = Field(min_length=1, max_length=10)


class CartRef(BaseModel):
    cart_ref: str


class DeclineRequest(BaseModel):
    reason: str


class ActivateRequest(BaseModel):
    cart_ref: str
    offer_id: str


class AgentUpdate(BaseModel):
    enabled: Optional[bool] = None
    limit: Optional[float] = Field(default=None, ge=0, le=10000)


def build_lines(items: List[LineItemIn]) -> list:
    lines = []
    for it in items:
        p = PRODUCTS.get(it.product_id)
        if not p:
            raise HTTPException(404, f"Product not found at Wayfair: {it.product_id}")
        lines.append({"product": p, "quantity": it.quantity, "line_total": round(p["price"] * it.quantity, 2)})
    return lines


def summarize(lines: list) -> str:
    first = lines[0]
    label = first["product"]["short"] + (f" ×{first['quantity']}" if first["quantity"] > 1 else "")
    return label if len(lines) == 1 else f"{label} + {len(lines) - 1} more"


def compute_totals(lines: list) -> dict:
    subtotal = round(sum(l["line_total"] for l in lines), 2)
    tax = round(subtotal * TAX_RATE, 2)
    return {"subtotal": subtotal, "shipping": 0.0, "tax": tax, "total": round(subtotal + tax, 2)}


def evaluate_offer(lines: list) -> dict:
    eligible_spend = round(sum(l["line_total"] for l in lines if not l["product"]["clearance"]), 2)
    has_clearance = any(l["product"]["clearance"] for l in lines)
    if eligible_spend >= OFFER["min_spend"]:
        credit = round(min(OFFER["max_credit"], eligible_spend * OFFER["rate"]), 2)
        return {"eligible": True, "eligible_spend": eligible_spend, "credit": credit, "reason": None}
    reason = (
        "Clearance items are excluded from the Wayfair offer"
        if has_clearance and eligible_spend == 0
        else f"The Wayfair offer needs $500+ in eligible items (cart has ${eligible_spend:,.2f})"
    )
    return {"eligible": False, "eligible_spend": eligible_spend, "credit": 0.0, "reason": reason}


async def ensure_agents() -> None:
    for a in DEFAULT_AGENTS:
        await db.agents.update_one({"id": a["id"]}, {"$setOnInsert": {**a, "connected_at": now_iso(), "revoked": False}}, upsert=True)


async def get_cart(ref: str) -> dict:
    c = await db.carts.find_one({"cart_ref": ref}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Cart not found")
    return c


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

    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"{req.session_id}-{uuid.uuid4()}", system_message=system_prompt(req.agent_id, req.cart)).with_model(*AGENT_JOURNEYS[req.agent_id]["model"])

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


# ---------------- Wayfair cart ----------------
@api.post("/carts")
async def create_cart(body: CartCreate):
    lines = build_lines(body.items)
    cart = {
        "cart_ref": f"wf_cart_{secrets.token_hex(6)}", "status": "open", "retailer": "Wayfair",
        "agent_id": body.agent_id,
        "wallet": AGENT_JOURNEYS[body.agent_id]["wallet"],
        "line_items": lines, "summary": summarize(lines), "totals": compute_totals(lines),
        "offer_status": "unchecked", "offer": None, "activation": None, "created_at": now_iso(),
    }
    await db.carts.insert_one(dict(cart))
    return cart


@api.get("/carts/{ref}")
async def read_cart(ref: str):
    return await get_cart(ref)


@api.patch("/carts/{ref}")
async def update_cart(ref: str, body: CartUpdate):
    c = await get_cart(ref)
    if c["status"] != "open":
        raise HTTPException(400, "Order already placed")
    lines = build_lines(body.items)
    upd = {"line_items": lines, "summary": summarize(lines), "totals": compute_totals(lines),
           "offer_status": "unchecked", "offer": None, "activation": None}
    await db.carts.update_one({"cart_ref": ref}, {"$set": upd})
    return {**c, **upd}


# ---------------- Citi Offers ↔ Mastercard Offers ----------------
@api.post("/citi/offers/lookup")
async def lookup_offers(body: CartRef):
    c = await get_cart(body.cart_ref)
    if c.get("activation"):
        return {"cart_ref": c["cart_ref"], "eligible": True, "offer": c["offer"], "card": CARD, "reason": None,
                "mastercard_request_id": c["offer"]["mastercard_request_id"], "already_activated": True}
    result = evaluate_offer(c["line_items"])
    req_id = f"mco_req_{secrets.token_hex(5)}"
    offer = {**OFFER, "credit": result["credit"], "eligible_spend": result["eligible_spend"], "mastercard_request_id": req_id} if result["eligible"] else None
    await db.carts.update_one({"cart_ref": c["cart_ref"]}, {"$set": {"offer_status": "eligible" if offer else "no_match", "offer": offer}})
    return {"cart_ref": c["cart_ref"], "eligible": result["eligible"], "offer": offer, "card": CARD,
            "reason": result["reason"], "mastercard_request_id": req_id, "already_activated": False}


@api.post("/citi/offers/activate")
async def activate_offer(body: ActivateRequest):
    c = await get_cart(body.cart_ref)
    if c.get("activation"):
        return c["activation"]
    if c["offer_status"] != "eligible" or not c.get("offer") or c["offer"]["id"] != body.offer_id:
        raise HTTPException(400, "No eligible offer to activate for this cart")
    activation = {"activation_id": f"mco_act_{secrets.token_hex(6)}", "offer_id": body.offer_id,
                  "card_last4": CARD["last4"], "credit": c["offer"]["credit"], "activated_at": now_iso()}
    await db.carts.update_one({"cart_ref": c["cart_ref"]}, {"$set": {"activation": activation, "offer_status": "activated"}})
    return activation


# ---------------- Place order back in the Wayfair cart ----------------
@api.post("/carts/{ref}/place_order")
async def place_order(ref: str):
    c = await get_cart(ref)
    if c["status"] == "ordered":
        return c["order"]
    agent = await db.agents.find_one({"id": c["agent_id"]}, {"_id": 0})
    if not agent or not agent.get("enabled") or agent.get("revoked"):
        raise HTTPException(403, f"{AGENT_JOURNEYS[c['agent_id']]['name']} is paused in Citi Agent Controls")
    total = c["totals"]["total"]
    if total > agent.get("limit", 0):
        raise HTTPException(403, f"Order exceeds the ${agent['limit']:,.2f} limit set for {agent['name']} in Citi Agent Controls")
    credit = c["activation"]["credit"] if c.get("activation") else 0.0
    order = {
        "order_id": f"WF-{secrets.randbelow(9000000) + 1000000}", "amount": total, "wallet": c["wallet"],
        "card_last4": CARD["last4"], "statement_credit": credit, "offer_activated": bool(c.get("activation")),
        "points_earned": int(total * POINTS_PER_DOLLAR), "eta": "Delivery in 5–7 days",
    }
    txn = {
        "id": f"txn_{secrets.token_hex(6)}", "cart_ref": ref, "merchant": "Wayfair", "agent_id": c["agent_id"],
        "agent_name": AGENT_JOURNEYS[c["agent_id"]]["name"], "item": c["summary"],
        "item_full": "; ".join(f"{l['quantity']}x {l['product']['name']}" for l in c["line_items"]),
        "amount": total, "card_last4": CARD["last4"], "status": "completed", "reason": None,
        "points_earned": order["points_earned"], "statement_credit": credit, "wallet": c["wallet"],
        "order_id": order["order_id"], "created_at": now_iso(),
    }
    await db.transactions.insert_one(dict(txn))
    await db.carts.update_one({"cart_ref": ref}, {"$set": {"status": "ordered", "order": order}})
    return order

@api.post("/carts/{ref}/decline")
async def decline_payment(ref: str, body: DeclineRequest):
    c = await get_cart(ref)
    txn = {
        "id": f"txn_{secrets.token_hex(6)}", "cart_ref": ref, "merchant": "Wayfair", "agent_id": c["agent_id"],
        "agent_name": AGENT_JOURNEYS[c["agent_id"]]["name"], "item": c["summary"],
        "item_full": "; ".join(f"{l['quantity']}x {l['product']['name']}" for l in c["line_items"]),
        "amount": c["totals"]["total"], "card_last4": CARD["last4"], "status": "declined", "reason": body.reason,
        "points_earned": 0, "statement_credit": 0.0, "wallet": c["wallet"], "created_at": now_iso(),
    }
    await db.transactions.insert_one(dict(txn))
    txn.pop("_id", None)
    return txn


@api.get("/transactions")
async def list_transactions():
    return await db.transactions.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)


# ---------------- Spending insights ----------------
def month_shift(dt: datetime, k: int) -> tuple[int, int]:
    idx = dt.year * 12 + (dt.month - 1) - k
    return idx // 12, idx % 12 + 1


SEED_TXNS = [
    (0, 2, "gemini", "Wayfair", "Throw pillow set", 32.40, "completed", None),
    (0, 5, "chatgpt", "Wayfair", "Table lamp", 41.18, "completed", None),
    (0, 8, "gemini", "Wayfair", "Bar stools (2)", 158.99, "declined", "Declined by cardholder"),
    (1, 3, "chatgpt", "Wayfair", "Area rug 5x8", 186.42, "completed", None),
    (1, 12, "gemini", "Wayfair", "Bookshelf", 154.10, "completed", None),
    (1, 19, "perplexity", "Wayfair", "Wall mirror", 79.99, "completed", None),
    (1, 25, "chatgpt", "Wayfair", "Curtain panels", 24.00, "completed", None),
    (2, 6, "chatgpt", "Wayfair", "Coffee table", 263.75, "completed", None),
    (2, 14, "gemini", "Wayfair", "Bath towel set", 18.50, "completed", None),
    (2, 22, "perplexity", "Wayfair", "Accent chair", 120.00, "declined", "Exceeds $100.00 agent spending limit"),
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
        await db.transactions.update_one({"id": doc["id"]}, {"$set": doc}, upsert=True)


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
        "statement_credits": round(sum(r.get("statement_credit", 0) for r in spent), 2),
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
