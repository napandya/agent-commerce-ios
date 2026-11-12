"""Citi Agentic Commerce mock API regression tests (ACP / Agent Pay / Citi authorize / agents / chat SSE)."""
import json
import os
import uuid

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


BASE_URL = _base()


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    yield sess
    # restore chatgpt agent
    sess.patch(f"{BASE_URL}/api/agents/chatgpt", json={"enabled": True, "limit": 250})


CREATED_IDS = []


def _checkout(s, pid="gf-saul-taupe"):
    r = s.post(f"{BASE_URL}/api/checkout_sessions", json={"items": [{"product_id": pid, "quantity": 1}]})
    assert r.status_code == 200, r.text
    CREATED_IDS.append(r.json()["id"])
    with open("/tmp/created_cs_ids.txt", "a") as f:
        f.write(r.json()["id"] + "\n")
    return r.json()


# Products
def test_products(s):
    r = s.get(f"{BASE_URL}/api/products")
    assert r.status_code == 200
    ids = {p["id"] for p in r.json()}
    assert {"gf-saul-taupe", "gf-saul-black", "gf-slide-brown"} <= ids


# Chat SSE (real LLM)
def test_chat_stream_product_tag(s):
    r = s.post(f"{BASE_URL}/api/chat/stream",
               json={"session_id": f"TEST_{uuid.uuid4().hex[:8]}", "message": "Find me size 12 men's sandals in taupe from Target"},
               stream=True, timeout=90)
    assert r.status_code == 200
    assert "text/event-stream" in r.headers.get("content-type", "")
    full, done, err = "", False, None
    for line in r.iter_lines(decode_unicode=True):
        if line and line.startswith("data: "):
            d = json.loads(line[6:])
            full += d.get("delta", "")
            done = done or d.get("done", False)
            err = err or d.get("error")
    assert err is None, err
    assert done
    assert "[[product:" in full, full
    print("LLM reply:", full)


# ACP checkout totals
def test_checkout_totals_taupe(s):
    cs = _checkout(s)
    assert cs["status"] == "ready_for_payment"
    assert cs["totals"]["total"] == 49.61
    g = s.get(f"{BASE_URL}/api/checkout_sessions/{cs['id']}")
    assert g.status_code == 200 and g.json()["totals"]["total"] == 49.61


def test_checkout_invalid_product(s):
    r = s.post(f"{BASE_URL}/api/checkout_sessions", json={"items": [{"product_id": "nope", "quantity": 1}]})
    assert r.status_code == 404


def test_checkout_session_404(s):
    assert s.get(f"{BASE_URL}/api/checkout_sessions/cs_doesnotexist").status_code == 404


# Agent Pay tokenize (now requires Citi authorization first)
def test_tokenize_before_authorize_400(s):
    cs = _checkout(s)
    r = s.post(f"{BASE_URL}/api/agentpay/tokenize", json={"checkout_session_id": cs["id"]})
    assert r.status_code == 400, r.text
    assert s.get(f"{BASE_URL}/api/checkout_sessions/{cs['id']}").json().get("agent_token") is None


def test_tokenize_after_authorize(s):
    cs = _checkout(s)
    a = s.post(f"{BASE_URL}/api/citi/authorize", json={"checkout_session_id": cs["id"], "decision": "approve"})
    assert a.json()["status"] == "approved"
    r = s.post(f"{BASE_URL}/api/agentpay/tokenize", json={"checkout_session_id": cs["id"]})
    assert r.status_code == 200
    t = r.json()
    assert t["agentic_token"].startswith("mc_atk_")
    assert t["scope"]["max_amount"] == 49.61
    g = s.get(f"{BASE_URL}/api/checkout_sessions/{cs['id']}").json()
    assert g["status"] == "authorized" and g["agent_token"]["agentic_token"] == t["agentic_token"]


def test_tokenize_after_decline_400(s):
    cs = _checkout(s)
    s.post(f"{BASE_URL}/api/citi/authorize", json={"checkout_session_id": cs["id"], "decision": "decline"})
    assert s.post(f"{BASE_URL}/api/agentpay/tokenize", json={"checkout_session_id": cs["id"]}).status_code == 400


# Authorize + complete happy paths
@pytest.mark.parametrize("opt", ["card", "flex_pay", "points"])
def test_authorize_approve_and_complete(s, opt):
    cs = _checkout(s)
    a = s.post(f"{BASE_URL}/api/citi/authorize", json={"checkout_session_id": cs["id"], "decision": "approve"})
    assert a.status_code == 200
    assert a.json()["status"] == "approved", a.json()
    assert a.json()["auth_code"]
    assert s.post(f"{BASE_URL}/api/agentpay/tokenize", json={"checkout_session_id": cs["id"]}).status_code == 200
    c = s.post(f"{BASE_URL}/api/checkout_sessions/{cs['id']}/complete", json={"payment_option": opt})
    assert c.status_code == 200
    o = c.json()
    assert o["status"] == "completed" and o["order_id"].startswith("IC-")
    if opt == "points":
        assert o["points_earned"] == 0 and o["points_redeemed"] == 4961
    else:
        assert o["points_earned"] == 248
    if opt == "flex_pay":
        assert o["flex_monthly"] == round(49.61 / 6, 2)
    txns = s.get(f"{BASE_URL}/api/transactions").json()
    t = next(x for x in txns if x["checkout_session_id"] == cs["id"])
    assert t["status"] == "completed" and t["payment_option"] == opt


def test_decline_and_complete_fails(s):
    cs = _checkout(s)
    a = s.post(f"{BASE_URL}/api/citi/authorize", json={"checkout_session_id": cs["id"], "decision": "decline"})
    assert a.json()["status"] == "declined" and a.json()["reason"] == "Declined by cardholder"
    c = s.post(f"{BASE_URL}/api/checkout_sessions/{cs['id']}/complete", json={"payment_option": "card"})
    assert c.status_code == 400


def test_complete_without_authorize_fails(s):
    cs = _checkout(s)
    c = s.post(f"{BASE_URL}/api/checkout_sessions/{cs['id']}/complete", json={"payment_option": "card"})
    assert c.status_code == 400


def test_invalid_decision_422(s):
    cs = _checkout(s)
    r = s.post(f"{BASE_URL}/api/citi/authorize", json={"checkout_session_id": cs["id"], "decision": "maybe"})
    assert r.status_code == 422


# Agent controls
def test_agents_list(s):
    r = s.get(f"{BASE_URL}/api/agents")
    assert r.status_code == 200
    ids = {a["id"] for a in r.json()}
    assert {"chatgpt", "gemini", "perplexity"} <= ids
    assert all("_id" not in a for a in r.json())


def test_limit_enforcement(s):
    p = s.patch(f"{BASE_URL}/api/agents/chatgpt", json={"limit": 40})
    assert p.status_code == 200 and p.json()["limit"] == 40
    cs = _checkout(s)
    a = s.post(f"{BASE_URL}/api/citi/authorize", json={"checkout_session_id": cs["id"], "decision": "approve"}).json()
    assert a["status"] == "declined" and "limit" in a["reason"].lower(), a
    s.patch(f"{BASE_URL}/api/agents/chatgpt", json={"limit": 250})


def test_disabled_agent_declined(s):
    s.patch(f"{BASE_URL}/api/agents/chatgpt", json={"enabled": False})
    cs = _checkout(s)
    a = s.post(f"{BASE_URL}/api/citi/authorize", json={"checkout_session_id": cs["id"], "decision": "approve"}).json()
    assert a["status"] == "declined" and "not permitted" in a["reason"]
    s.patch(f"{BASE_URL}/api/agents/chatgpt", json={"enabled": True})


def test_revoke_and_reenable(s):
    r = s.post(f"{BASE_URL}/api/agents/chatgpt/revoke")
    assert r.status_code == 200 and r.json()["revoked"] is True and r.json()["enabled"] is False
    cs = _checkout(s)
    a = s.post(f"{BASE_URL}/api/citi/authorize", json={"checkout_session_id": cs["id"], "decision": "approve"}).json()
    assert a["status"] == "declined"
    e = s.patch(f"{BASE_URL}/api/agents/chatgpt", json={"enabled": True, "limit": 250}).json()
    assert e["enabled"] is True and e["revoked"] is False and e["limit"] == 250
    ag = next(x for x in s.get(f"{BASE_URL}/api/agents").json() if x["id"] == "chatgpt")
    assert ag["enabled"] and not ag["revoked"] and ag["limit"] == 250


def test_agent_404_and_validation(s):
    assert s.patch(f"{BASE_URL}/api/agents/nope", json={"limit": 10}).status_code == 404
    assert s.post(f"{BASE_URL}/api/agents/nope/revoke").status_code == 404
    assert s.patch(f"{BASE_URL}/api/agents/chatgpt", json={"limit": -5}).status_code == 422


def test_transactions_no_objectid(s):
    r = s.get(f"{BASE_URL}/api/transactions")
    assert r.status_code == 200 and isinstance(r.json(), list)
    assert all("_id" not in t for t in r.json())


# Edge: re-authorizing a completed session should not reset completed txn (code review finding)
def test_reauthorize_completed_session(s):
    cs = _checkout(s)
    s.post(f"{BASE_URL}/api/citi/authorize", json={"checkout_session_id": cs["id"], "decision": "approve"})
    s.post(f"{BASE_URL}/api/checkout_sessions/{cs['id']}/complete", json={"payment_option": "card"})
    s.post(f"{BASE_URL}/api/citi/authorize", json={"checkout_session_id": cs["id"], "decision": "approve"})
    t = next(x for x in s.get(f"{BASE_URL}/api/transactions").json() if x["checkout_session_id"] == cs["id"])
    assert t["status"] == "completed", f"completed txn overwritten to {t['status']}, points={t['points_earned']}"


def test_complete_idempotent(s):
    cs = _checkout(s)
    s.post(f"{BASE_URL}/api/citi/authorize", json={"checkout_session_id": cs["id"], "decision": "approve"})
    c1 = s.post(f"{BASE_URL}/api/checkout_sessions/{cs['id']}/complete", json={"payment_option": "card"}).json()
    c2 = s.post(f"{BASE_URL}/api/checkout_sessions/{cs['id']}/complete", json={"payment_option": "points"})
    assert c2.status_code in (200, 409)
    if c2.status_code == 200:
        assert c2.json()["order_id"] == c1["order_id"] and c2.json()["payment_option"] == "card"
    t = next(x for x in s.get(f"{BASE_URL}/api/transactions").json() if x["checkout_session_id"] == cs["id"])
    assert t["order_id"] == c1["order_id"] and t["payment_option"] == "card" and t["points_earned"] == 248


def test_authorize_canceled_session_unchanged(s):
    cs = _checkout(s)
    d = s.post(f"{BASE_URL}/api/citi/authorize", json={"checkout_session_id": cs["id"], "decision": "decline"}).json()
    a = s.post(f"{BASE_URL}/api/citi/authorize", json={"checkout_session_id": cs["id"], "decision": "approve"}).json()
    assert a["status"] == "declined" and a["id"] == d["id"]
    assert s.get(f"{BASE_URL}/api/checkout_sessions/{cs['id']}").json()["status"] == "canceled"


@pytest.mark.parametrize("qty,tip", [(0, 5), (-1, 5), (1, -1), (21, 5)])
def test_checkout_validation_422(s, qty, tip):
    r = s.post(f"{BASE_URL}/api/checkout_sessions", json={"items": [{"product_id": "gf-saul-taupe", "quantity": qty}], "tip": tip})
    assert r.status_code == 422, r.text


def test_checkout_unknown_agent_404(s):
    r = s.post(f"{BASE_URL}/api/checkout_sessions", json={"items": [{"product_id": "gf-saul-taupe", "quantity": 1}], "agent_id": "nope"})
    assert r.status_code == 404


def test_agent_limit_over_max_422(s):
    assert s.patch(f"{BASE_URL}/api/agents/gemini", json={"limit": 20000}).status_code == 422
    assert next(x for x in s.get(f"{BASE_URL}/api/agents").json() if x["id"] == "gemini")["limit"] == 150
