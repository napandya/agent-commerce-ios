"""Iteration 3: multi-item checkout (ACP/UCP), PATCH session, chat SSE tags, insights, seed history."""
import json
import os
import uuid
from datetime import datetime, timezone

import pytest
import requests


def _base():
    url = os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    if not url:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL"):
                    url = line.split("=", 1)[1].strip().strip('"')
    return url.rstrip("/")


BASE = _base() + "/api"
IDS_FILE = "/tmp/created_cs_ids.txt"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    yield sess
    sess.patch(f"{BASE}/agents/chatgpt", json={"enabled": True, "limit": 250})
    sess.patch(f"{BASE}/agents/gemini", json={"enabled": True, "limit": 150})
    sess.patch(f"{BASE}/agents/perplexity", json={"enabled": False, "limit": 100})


def create(s, items, agent="chatgpt", tip=5.0):
    r = s.post(f"{BASE}/checkout_sessions", json={"items": items, "tip": tip, "agent_id": agent})
    if r.status_code == 200:
        with open(IDS_FILE, "a") as f:
            f.write(r.json()["id"] + "\n")
    return r


# --- checkout create ---
def test_create_multi_chatgpt(s):
    r = create(s, [{"product_id": "gf-saul-taupe", "quantity": 2}, {"product_id": "gf-socks-6pk", "quantity": 1}])
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["merchant"] == "Target via Instacart"
    assert d["protocol"].startswith("ACP")
    assert len(d["line_items"]) == 2
    assert d["line_items"][0]["line_total"] == 59.98
    t = d["totals"]
    assert t["subtotal"] == 71.98
    exp = round(71.98 + 7.99 + max(2.5, round(71.98 * 0.04, 2)) + 0.15 + 5.0 + round(71.98 * 0.13271, 2), 2)
    assert abs(t["total"] - exp) < 0.011
    assert d["summary"] == "Size 12 Sandals ×2 + 1 more"
    g = s.get(f"{BASE}/checkout_sessions/{d['id']}").json()
    assert g["totals"]["total"] == t["total"]


def test_create_gemini_merchant(s):
    r = create(s, [{"product_id": "gf-swim-navy", "quantity": 1}], agent="gemini")
    assert r.status_code == 200
    assert r.json()["merchant"] == "Target"
    assert "UCP" in r.json()["protocol"]


@pytest.mark.parametrize("payload,code", [
    ({"items": []}, 422),
    ({"items": [{"product_id": "gf-saul-taupe", "quantity": 0}]}, 422),
    ({"items": [{"product_id": "gf-saul-taupe", "quantity": 11}]}, 422),
    ({"items": [{"product_id": "nope", "quantity": 1}]}, 404),
    ({"items": [{"product_id": "gf-saul-taupe", "quantity": 1}], "agent_id": "nope"}, 404),
])
def test_create_validation(s, payload, code):
    r = s.post(f"{BASE}/checkout_sessions", json=payload)
    assert r.status_code == code, r.text


# --- PATCH ---
def test_patch_items_and_tip(s):
    d = create(s, [{"product_id": "gf-saul-taupe", "quantity": 1}]).json()
    r = s.patch(f"{BASE}/checkout_sessions/{d['id']}", json={"tip": 6.5})
    assert r.status_code == 200 and r.json()["totals"]["tip"] == 6.5
    assert round(r.json()["totals"]["total"] - d["totals"]["total"], 2) == 1.5
    r = s.patch(f"{BASE}/checkout_sessions/{d['id']}", json={"items": [{"product_id": "gf-saul-taupe", "quantity": 3}]})
    assert r.json()["totals"]["subtotal"] == 89.97 and r.json()["totals"]["tip"] == 6.5
    g = s.get(f"{BASE}/checkout_sessions/{d['id']}").json()
    assert g["line_items"][0]["quantity"] == 3 and g["totals"]["tip"] == 6.5
    assert s.patch(f"{BASE}/checkout_sessions/{d['id']}", json={"items": []}).status_code == 422
    assert s.patch(f"{BASE}/checkout_sessions/cs_missing", json={"tip": 1}).status_code == 404


def test_patch_locked_after_authorize(s):
    d = create(s, [{"product_id": "gf-socks-6pk", "quantity": 1}]).json()
    a = s.post(f"{BASE}/citi/authorize", json={"checkout_session_id": d["id"], "decision": "approve"})
    assert a.json()["status"] == "approved"
    r = s.patch(f"{BASE}/checkout_sessions/{d['id']}", json={"tip": 0})
    assert r.status_code == 400


# --- full flows ---
def test_full_gemini_flow_tgt_order(s):
    d = create(s, [{"product_id": "gf-swim-navy", "quantity": 2}, {"product_id": "gf-socks-6pk", "quantity": 1}], agent="gemini").json()
    a = s.post(f"{BASE}/citi/authorize", json={"checkout_session_id": d["id"], "decision": "approve"}).json()
    assert a["status"] == "approved" and a["merchant"] == "Target" and "2x" in a["item_full"]
    tk = s.post(f"{BASE}/agentpay/tokenize", json={"checkout_session_id": d["id"]}).json()
    assert tk["scope"]["merchant"] == "Target" and tk["scope"]["max_amount"] == d["totals"]["total"]
    c = s.post(f"{BASE}/checkout_sessions/{d['id']}/complete", json={"payment_option": "card"})
    assert c.status_code == 200 and c.json()["order_id"].startswith("TGT-")
    assert c.json()["points_earned"] == int(d["totals"]["total"] * 5)


def test_chatgpt_flow_ic_order_and_decline(s):
    d = create(s, [{"product_id": "gf-saul-black", "quantity": 1}]).json()
    s.post(f"{BASE}/citi/authorize", json={"checkout_session_id": d["id"], "decision": "approve"})
    s.post(f"{BASE}/agentpay/tokenize", json={"checkout_session_id": d["id"]})
    c = s.post(f"{BASE}/checkout_sessions/{d['id']}/complete", json={})
    assert c.json()["order_id"].startswith("IC-")
    d2 = create(s, [{"product_id": "gf-saul-black", "quantity": 1}]).json()
    a = s.post(f"{BASE}/citi/authorize", json={"checkout_session_id": d2["id"], "decision": "decline"}).json()
    assert a["status"] == "declined"
    assert s.post(f"{BASE}/checkout_sessions/{d2['id']}/complete", json={}).status_code == 400


def test_gemini_over_limit_declined(s):
    d = create(s, [{"product_id": "gf-slide-brown", "quantity": 5}], agent="gemini").json()
    assert d["totals"]["total"] > 150
    a = s.post(f"{BASE}/citi/authorize", json={"checkout_session_id": d["id"], "decision": "approve"}).json()
    assert a["status"] == "declined" and "150" in a["reason"]


# --- insights ---
def test_insights_current_month(s):
    r = s.get(f"{BASE}/insights")
    assert r.status_code == 200
    d = r.json()
    now = datetime.now(timezone.utc)
    assert d["month"] == f"{now.year:04d}-{now.month:02d}"
    txns = [t for t in s.get(f"{BASE}/transactions").json() if t["created_at"].startswith(d["month"])]
    comp = [t for t in txns if t["status"] == "completed"]
    assert abs(d["total_spent"] - round(sum(t["amount"] for t in comp), 2)) < 0.011
    assert d["purchases"] == len(comp)
    assert d["declined"] == len([t for t in txns if t["status"] == "declined"])
    assert sum(a["amount"] for a in d["by_agent"]) == pytest.approx(d["total_spent"], abs=0.02)


def test_insights_prev_months_seeded(s):
    now = datetime.now(timezone.utc)
    idx = now.year * 12 + now.month - 1
    for k, n in ((1, 4), (2, 2)):
        y, m = divmod(idx - k, 12)
        d = s.get(f"{BASE}/insights", params={"month": f"{y:04d}-{m + 1:02d}"}).json()
        assert d["purchases"] >= n, d
    ids = {t["id"] for t in s.get(f"{BASE}/transactions").json()}
    assert {f"seed_{i}" for i in range(10)} <= ids


@pytest.mark.parametrize("m", ["2026-1", "202601", "abcd-ef", "2026/01"])
def test_insights_bad_format(s, m):
    assert s.get(f"{BASE}/insights", params={"month": m}).status_code == 422


# --- chat SSE ---
def test_chat_stream_gemini_tags(s):
    r = s.post(f"{BASE}/chat/stream", json={"session_id": f"TEST_{uuid.uuid4()}", "agent_id": "gemini",
               "message": "Add 2 of the navy swim shorts to my cart please", "cart": []}, stream=True, timeout=90)
    assert r.status_code == 200
    full, done = "", False
    for line in r.iter_lines(decode_unicode=True):
        if line and line.startswith("data: "):
            ev = json.loads(line[6:])
            full += ev.get("delta", "")
            assert "error" not in ev, ev
            if ev.get("done"):
                done = True
                break
    print(full)
    assert done
    assert "[[add:gf-swim-navy:2]]" in full or "[[product:gf-swim-navy]]" in full
