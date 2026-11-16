"""Iteration 4: Wayfair furniture + Citi Offers (Mastercard Offers) statement-credit pilot."""
import json
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL").rstrip("/")
CREATED = "/tmp/created_cart_refs.txt"
OFFER_ID = "mco_wayfair_pilot_10"


@pytest.fixture
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


def mk_cart(s, items, agent="chatgpt"):
    r = s.post(f"{BASE_URL}/api/carts", json={"agent_id": agent, "items": items})
    assert r.status_code == 200, r.text
    c = r.json()
    with open(CREATED, "a") as f:
        f.write(c["cart_ref"] + "\n")
    return c


# Products catalog
def test_products(s):
    r = s.get(f"{BASE_URL}/api/products")
    assert r.status_code == 200
    ids = {p["id"]: p for p in r.json()}
    assert set(ids) == {"wf-arnav-sectional", "wf-etta-velvet", "wf-zipcode-loveseat", "wf-lark-leather"}
    assert ids["wf-arnav-sectional"]["price"] == 1249.99
    assert ids["wf-lark-leather"]["clearance"] is True


# Live LLM chat streaming for both agents
@pytest.mark.parametrize("agent", ["chatgpt", "gemini"])
def test_chat_stream(s, agent):
    r = s.post(f"{BASE_URL}/api/chat/stream", json={"session_id": f"TEST_{uuid.uuid4()}", "agent_id": agent,
               "message": "Show me sofas for my living room"}, stream=True, timeout=90)
    assert r.status_code == 200
    full, done, err = "", False, None
    for line in r.iter_lines(decode_unicode=True):
        if line and line.startswith("data: "):
            ev = json.loads(line[6:])
            full += ev.get("delta", "")
            done = done or ev.get("done", False)
            err = err or ev.get("error")
    assert err is None, err
    assert done
    assert "[[product:" in full, full


# Cart creation / validation
def test_create_cart_and_get(s):
    c = mk_cart(s, [{"product_id": "wf-etta-velvet", "quantity": 1}], "gemini")
    assert c["cart_ref"].startswith("wf_cart_") and c["protocol"] == "UCP" and c["offer_status"] == "unchecked"
    assert c["totals"]["subtotal"] == 699.99
    g = s.get(f"{BASE_URL}/api/carts/{c['cart_ref']}")
    assert g.status_code == 200 and g.json()["summary"] == "Celeste Velvet Sofa"


def test_create_cart_invalid(s):
    assert s.post(f"{BASE_URL}/api/carts", json={"agent_id": "chatgpt", "items": [{"product_id": "nope"}]}).status_code == 404
    assert s.post(f"{BASE_URL}/api/carts", json={"agent_id": "chatgpt", "items": []}).status_code == 422
    assert s.post(f"{BASE_URL}/api/carts", json={"agent_id": "perplexity", "items": [{"product_id": "wf-etta-velvet"}]}).status_code == 422
    assert s.get(f"{BASE_URL}/api/carts/wf_cart_missing").status_code == 404


# Offer eligibility per sofa
@pytest.mark.parametrize("pid,eligible,credit", [
    ("wf-arnav-sectional", True, 125.0), ("wf-etta-velvet", True, 70.0),
    ("wf-zipcode-loveseat", False, 0), ("wf-lark-leather", False, 0)])
def test_lookup_eligibility(s, pid, eligible, credit):
    c = mk_cart(s, [{"product_id": pid, "quantity": 1}])
    r = s.post(f"{BASE_URL}/api/citi/offers/lookup", json={"cart_ref": c["cart_ref"]})
    assert r.status_code == 200
    d = r.json()
    assert d["eligible"] is eligible
    assert d["card"]["last4"] == "4680"
    if eligible:
        assert d["offer"]["id"] == OFFER_ID and d["offer"]["credit"] == credit
    else:
        assert d["offer"] is None and d["reason"]
        if pid == "wf-lark-leather":
            assert "Clearance" in d["reason"]
        bad = s.post(f"{BASE_URL}/api/citi/offers/activate", json={"cart_ref": c["cart_ref"], "offer_id": OFFER_ID})
        assert bad.status_code == 400


def test_credit_capped_at_150(s):
    c = mk_cart(s, [{"product_id": "wf-arnav-sectional", "quantity": 2}])
    d = s.post(f"{BASE_URL}/api/citi/offers/lookup", json={"cart_ref": c["cart_ref"]}).json()
    assert d["offer"]["credit"] == 150.0


def test_lookup_missing_cart(s):
    assert s.post(f"{BASE_URL}/api/citi/offers/lookup", json={"cart_ref": "nope"}).status_code == 404


# Activation (idempotent), PATCH reset, place order w/ statement credit, insights
def test_activate_patch_place_order(s):
    c = mk_cart(s, [{"product_id": "wf-arnav-sectional", "quantity": 1}])
    ref = c["cart_ref"]
    # activate before lookup -> 400
    assert s.post(f"{BASE_URL}/api/citi/offers/activate", json={"cart_ref": ref, "offer_id": OFFER_ID}).status_code == 400
    s.post(f"{BASE_URL}/api/citi/offers/lookup", json={"cart_ref": ref})
    assert s.post(f"{BASE_URL}/api/citi/offers/activate", json={"cart_ref": ref, "offer_id": "wrong"}).status_code == 400
    a1 = s.post(f"{BASE_URL}/api/citi/offers/activate", json={"cart_ref": ref, "offer_id": OFFER_ID}).json()
    a2 = s.post(f"{BASE_URL}/api/citi/offers/activate", json={"cart_ref": ref, "offer_id": OFFER_ID}).json()
    assert a1["activation_id"] == a2["activation_id"] and a1["credit"] == 125.0
    assert s.get(f"{BASE_URL}/api/carts/{ref}").json()["offer_status"] == "activated"
    # PATCH resets offer
    p = s.patch(f"{BASE_URL}/api/carts/{ref}", json={"items": [{"product_id": "wf-etta-velvet", "quantity": 2}]})
    assert p.status_code == 200
    g = s.get(f"{BASE_URL}/api/carts/{ref}").json()
    assert g["offer_status"] == "unchecked" and g["activation"] is None and g["totals"]["subtotal"] == 1399.98
    s.post(f"{BASE_URL}/api/citi/offers/lookup", json={"cart_ref": ref})
    s.post(f"{BASE_URL}/api/citi/offers/activate", json={"cart_ref": ref, "offer_id": OFFER_ID})
    before = s.get(f"{BASE_URL}/api/insights").json()["statement_credits"]
    o = s.post(f"{BASE_URL}/api/carts/{ref}/place_order")
    assert o.status_code == 200
    od = o.json()
    assert od["statement_credit"] == 140.0 and od["offer_activated"] and od["order_id"].startswith("WF-")
    assert s.post(f"{BASE_URL}/api/carts/{ref}/place_order").json()["order_id"] == od["order_id"]
    assert s.patch(f"{BASE_URL}/api/carts/{ref}", json={"items": [{"product_id": "wf-etta-velvet"}]}).status_code == 400
    txns = [t for t in s.get(f"{BASE_URL}/api/transactions").json() if t.get("cart_ref") == ref]
    assert len(txns) == 1 and txns[0]["statement_credit"] == 140.0 and txns[0]["merchant"] == "Wayfair"
    after = s.get(f"{BASE_URL}/api/insights").json()["statement_credits"]
    assert round(after - before, 2) == 140.0


def test_place_order_no_offer(s):
    c = mk_cart(s, [{"product_id": "wf-zipcode-loveseat", "quantity": 1}], "gemini")
    o = s.post(f"{BASE_URL}/api/carts/{c['cart_ref']}/place_order").json()
    assert o["statement_credit"] == 0.0 and o["offer_activated"] is False and o["wallet"] == "Google Pay"


def test_place_order_agent_paused(s):
    c = mk_cart(s, [{"product_id": "wf-etta-velvet", "quantity": 1}])
    try:
        assert s.patch(f"{BASE_URL}/api/agents/chatgpt", json={"enabled": False}).status_code == 200
        r = s.post(f"{BASE_URL}/api/carts/{c['cart_ref']}/place_order")
        assert r.status_code == 403 and "paused" in r.json()["detail"]
    finally:
        s.patch(f"{BASE_URL}/api/agents/chatgpt", json={"enabled": True, "limit": 2000})
    assert s.post(f"{BASE_URL}/api/carts/{c['cart_ref']}/place_order").status_code == 200
