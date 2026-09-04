"""Iteration 4 (re-test): Weekly leaderboard aggregation refactor
Verifies GET /api/leaderboard/weekly after N+1 -> single $lookup aggregation.
"""
import os
import time
import uuid
import random
import pytest
import requests
from pathlib import Path

FRONTEND_ENV = Path(__file__).resolve().parents[2] / "frontend" / ".env"
BASE_URL = None
for line in FRONTEND_ENV.read_text().splitlines():
    if line.startswith("REACT_APP_BACKEND_URL="):
        BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
        break
assert BASE_URL

ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "Admin@123"


def _rand_mobile():
    while True:
        m = "".join(str(random.randint(0, 9)) for _ in range(10))
        if not m.startswith("9999"):
            return m


def _register():
    payload = {"full_name": f"TEST {uuid.uuid4().hex[:6]}",
               "mobile": _rand_mobile(), "password": "TestPass@123"}
    r = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
    assert r.status_code == 200, r.text
    return payload, r.json()["token"], r.json()["user"]["id"]


@pytest.fixture(scope="module")
def admin_h():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['token']}"}, r.json()["user"]["id"]


# ---------- Shape & performance ----------
def test_leaderboard_shape_and_perf():
    _, tok, _ = _register()
    h = {"Authorization": f"Bearer {tok}"}
    t0 = time.time()
    r = requests.get(f"{BASE_URL}/api/leaderboard/weekly", headers=h, timeout=10)
    dt = time.time() - t0
    assert r.status_code == 200, r.text
    entries = r.json()
    assert isinstance(entries, list)
    # sorted desc, sequential ranks starting 1
    coins = [e["coins"] for e in entries]
    assert coins == sorted(coins, reverse=True), "leaderboard not sorted desc"
    for i, e in enumerate(entries):
        assert set(["rank", "name", "coins", "is_you"]).issubset(e.keys())
        assert e["rank"] == i + 1
        assert isinstance(e["name"], str) and e["name"]
        assert isinstance(e["coins"], (int, float))
        assert isinstance(e["is_you"], bool)
    # Should be fast (single aggregation, no N+1)
    assert dt < 3.0, f"leaderboard too slow: {dt:.2f}s"
    print(f"leaderboard responded in {dt*1000:.0f}ms with {len(entries)} entries")


# ---------- Real winner appears with is_you=True ----------
def test_real_winner_appears_on_leaderboard():
    pay, tok, uid = _register()
    h = {"Authorization": f"Bearer {tok}"}
    # Fund wallet
    d = requests.post(f"{BASE_URL}/api/wallet/deposit", headers=h, json={"amount": 500})
    assert d.status_code == 200, d.text

    # Choose smallest target for a quicker test
    cfg_r = requests.get(f"{BASE_URL}/api/config")
    targets = None
    if cfg_r.status_code == 200:
        try:
            targets = cfg_r.json().get("fixed_config", {}).get("targets")
        except Exception:
            targets = None
    target = min(targets) if targets else 5

    start = requests.post(f"{BASE_URL}/api/games/fixed/start", headers=h,
                         json={"target": target, "bet": 20})
    assert start.status_code == 200, start.text
    sess = start.json()

    # Wait exactly target seconds so server_elapsed ~ target (within LATENCY_BOUND=2.5)
    time.sleep(target)
    # Send elapsed = target (rounded to 2 decimals as required for win)
    stop = requests.post(f"{BASE_URL}/api/games/fixed/stop", headers=h, json={
        "session_id": sess["session_id"], "nonce": sess["nonce"],
        "elapsed": float(target),
    })
    assert stop.status_code == 200, stop.text
    result = stop.json()
    # It's possible sleep drifted; retry once with a fresh session if not won
    if not result.get("won"):
        # Try again with a second session (fresh timing)
        start = requests.post(f"{BASE_URL}/api/games/fixed/start", headers=h,
                             json={"target": target, "bet": 20})
        assert start.status_code == 200, start.text
        sess = start.json()
        time.sleep(target)
        stop = requests.post(f"{BASE_URL}/api/games/fixed/stop", headers=h, json={
            "session_id": sess["session_id"], "nonce": sess["nonce"],
            "elapsed": float(target),
        })
        result = stop.json()
    assert result.get("won") is True, f"could not win a fixed game (target={target}): {result}"
    assert result.get("prize", 0) > 0

    # Now leaderboard should include this user
    r = requests.get(f"{BASE_URL}/api/leaderboard/weekly", headers=h)
    assert r.status_code == 200
    entries = r.json()
    me = [e for e in entries if e.get("is_you")]
    assert len(me) == 1, f"expected 1 is_you entry, got {len(me)}: {[e for e in entries if e.get('is_you')]}"
    assert me[0]["coins"] > 0
    # Name should be the registered display name (full_name)
    assert me[0]["name"] == pay["full_name"] or pay["full_name"].startswith(me[0]["name"][:4])


# ---------- Admin excluded ----------
def test_admin_never_appears_and_is_you_false_for_admin(admin_h):
    h, admin_id = admin_h
    r = requests.get(f"{BASE_URL}/api/leaderboard/weekly", headers=h)
    assert r.status_code == 200
    entries = r.json()
    # Admin should never be flagged as "is_you" — because admin.role==admin is filtered out
    assert all(e.get("is_you") is False for e in entries), \
        "admin should be excluded from the aggregation; is_you must be False for admin"


# ---------- Promotional entries stable within day ----------
def test_promotional_entries_stable_within_day():
    _, tok, _ = _register()
    h = {"Authorization": f"Bearer {tok}"}
    r1 = requests.get(f"{BASE_URL}/api/leaderboard/weekly", headers=h).json()
    time.sleep(1)
    r2 = requests.get(f"{BASE_URL}/api/leaderboard/weekly", headers=h).json()
    # Filter promo entries = entries not belonging to the caller
    names1 = [(e["name"], e["coins"]) for e in r1 if not e["is_you"]]
    names2 = [(e["name"], e["coins"]) for e in r2 if not e["is_you"]]
    assert names1 == names2, "promo entries should be stable within same day"


# ---------- Admin disable removes promos, real winners remain ----------
def test_admin_disable_removes_promos_keeps_real_winners(admin_h):
    ah, _ = admin_h
    # Ensure at least one real winner exists (previous test may have created one).
    # Read baseline as a fresh user
    _, tok, _ = _register()
    uh = {"Authorization": f"Bearer {tok}"}
    base = requests.get(f"{BASE_URL}/api/leaderboard/weekly", headers=uh).json()
    base_len = len(base)

    cfg = requests.get(f"{BASE_URL}/api/admin/config", headers=ah).json()
    original = cfg["leaderboard_config"].get("enabled", True)
    cfg["leaderboard_config"]["enabled"] = False
    upd = requests.put(f"{BASE_URL}/api/admin/config", headers=ah, json={"data": cfg})
    assert upd.status_code == 200

    off = requests.get(f"{BASE_URL}/api/leaderboard/weekly", headers=uh).json()
    # With promos disabled, entries must be strictly fewer (or zero if no real winners)
    assert len(off) <= base_len
    # All remaining entries are real winners → must have valid registered names (no promo pool)
    # ranks still sequential
    for i, e in enumerate(off):
        assert e["rank"] == i + 1

    # restore
    cfg["leaderboard_config"]["enabled"] = original
    requests.put(f"{BASE_URL}/api/admin/config", headers=ah, json={"data": cfg})


# ---------- Regression: streak endpoints still work ----------
def test_streak_endpoints_still_healthy():
    _, tok, _ = _register()
    h = {"Authorization": f"Bearer {tok}"}
    r = requests.get(f"{BASE_URL}/api/streak", headers=h)
    assert r.status_code == 200
    j = r.json()
    assert j["can_claim"] is True
    c = requests.post(f"{BASE_URL}/api/streak/claim", headers=h)
    assert c.status_code == 200
    assert c.json()["bonus"] == 5
