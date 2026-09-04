"""Iteration 3 tests: daily streak, weekly leaderboard, bot fill for 1v1 rooms,
   and admin config for bot/streak/leaderboard."""
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


@pytest.fixture(scope="session")
def admin_h():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def user_h():
    _, tok, uid = _register()
    return {"Authorization": f"Bearer {tok}"}, uid


# ---------- Daily Streak ----------
class TestStreak:
    def test_streak_get_shape(self, user_h):
        h, _ = user_h
        r = requests.get(f"{BASE_URL}/api/streak", headers=h)
        assert r.status_code == 200
        j = r.json()
        assert set(["enabled", "daily_bonus", "streak", "can_claim", "last_claim"]).issubset(j.keys())
        assert j["daily_bonus"] == 5

    def test_claim_credits_5_bonus_and_increments_streak(self, user_h):
        h, _ = user_h
        w0 = requests.get(f"{BASE_URL}/api/wallet", headers=h).json()
        c = requests.post(f"{BASE_URL}/api/streak/claim", headers=h)
        assert c.status_code == 200, c.text
        j = c.json()
        assert j["bonus"] == 5
        assert j["streak"] == 1
        assert j["can_claim"] is False
        w1 = j["wallet"]
        assert round(w1["bonus_balance"] - w0["bonus_balance"], 2) == 5

        # can_claim now False
        st = requests.get(f"{BASE_URL}/api/streak", headers=h).json()
        assert st["can_claim"] is False
        assert st["streak"] == 1

    def test_double_claim_returns_409(self, user_h):
        h, _ = user_h
        r = requests.post(f"{BASE_URL}/api/streak/claim", headers=h)
        assert r.status_code == 409


# ---------- Leaderboard ----------
class TestLeaderboard:
    def test_leaderboard_shape_and_promos(self, user_h):
        h, _ = user_h
        r = requests.get(f"{BASE_URL}/api/leaderboard/weekly", headers=h)
        assert r.status_code == 200
        entries = r.json()
        assert isinstance(entries, list) and len(entries) >= 5
        # sorted desc by coins
        coins = [e["coins"] for e in entries]
        assert coins == sorted(coins, reverse=True)
        for i, e in enumerate(entries):
            assert e["rank"] == i + 1
            assert "name" in e and "coins" in e and "is_you" in e

    def test_admin_toggle_leaderboard_off_removes_promos(self, admin_h, user_h):
        # baseline
        h, _ = user_h
        base = requests.get(f"{BASE_URL}/api/leaderboard/weekly", headers=h).json()
        base_len = len(base)

        cfg = requests.get(f"{BASE_URL}/api/admin/config", headers=admin_h).json()
        assert "leaderboard_config" in cfg
        original = cfg["leaderboard_config"].get("enabled", True)
        cfg["leaderboard_config"]["enabled"] = False
        upd = requests.put(f"{BASE_URL}/api/admin/config", headers=admin_h, json={"data": cfg})
        assert upd.status_code == 200

        off = requests.get(f"{BASE_URL}/api/leaderboard/weekly", headers=h).json()
        assert len(off) < base_len or len(off) == 0

        # restore
        cfg["leaderboard_config"]["enabled"] = original
        requests.put(f"{BASE_URL}/api/admin/config", headers=admin_h, json={"data": cfg})


# ---------- Admin config merges new sections ----------
class TestAdminConfigNewSections:
    def test_admin_config_contains_new_sections(self, admin_h):
        cfg = requests.get(f"{BASE_URL}/api/admin/config", headers=admin_h).json()
        assert "bot_config" in cfg
        assert "streak_config" in cfg
        assert "leaderboard_config" in cfg
        bc = cfg["bot_config"]
        for k in ("enabled", "fill_1v1", "fill_multiplayer", "join_delay_seconds", "error_range"):
            assert k in bc

    def test_update_bot_config_persists(self, admin_h):
        cfg = requests.get(f"{BASE_URL}/api/admin/config", headers=admin_h).json()
        orig = cfg["bot_config"]["join_delay_seconds"]
        cfg["bot_config"]["join_delay_seconds"] = 4
        u = requests.put(f"{BASE_URL}/api/admin/config", headers=admin_h, json={"data": cfg})
        assert u.status_code == 200
        assert u.json()["bot_config"]["join_delay_seconds"] == 4
        # restore
        cfg["bot_config"]["join_delay_seconds"] = orig
        requests.put(f"{BASE_URL}/api/admin/config", headers=admin_h, json={"data": cfg})


# ---------- Bot fill in 1v1 room ----------
class TestBotFill1v1:
    def test_bot_fills_1v1_room_and_finalizes(self):
        # Fresh user, deposit, find open 1v1 room
        pay, tok, uid = _register()
        h = {"Authorization": f"Bearer {tok}"}
        requests.post(f"{BASE_URL}/api/wallet/deposit", headers=h, json={"amount": 500})

        rooms = requests.get(f"{BASE_URL}/api/rooms?mode=1v1").json()
        open_room = None
        for r in rooms:
            if r.get("current_players", 0) == 0 and r.get("status") == "OPEN":
                open_room = r
                break
        if not open_room:
            pytest.skip("no open 1v1 room with 0 players")

        j = requests.post(f"{BASE_URL}/api/rooms/{open_room['id']}/join", headers=h)
        assert j.status_code == 200, j.text

        # Wait up to 20s for bot to join and room to go LIVE
        room_id = open_room["id"]
        state = None
        for _ in range(25):
            time.sleep(1)
            r = requests.get(f"{BASE_URL}/api/rooms/{room_id}", headers=h)
            if r.status_code != 200:
                continue
            state = r.json()
            if state.get("status") in ("LIVE", "COMPLETED") and state.get("current_players", 0) >= 2:
                break
        assert state is not None
        assert state.get("current_players", 0) >= 2, f"bot did not fill: {state}"
        assert state.get("status") in ("LIVE", "COMPLETED"), f"room not live/completed: {state.get('status')}"

        # Wait for finalize (bot auto-submits; may need target-seconds + finalize loop)
        target = state.get("target", 5)
        # Give bot enough time to submit near target + finalize loop (5s cadence)
        wait_budget = int(target) + 15
        for _ in range(wait_budget):
            time.sleep(1)
            r = requests.get(f"{BASE_URL}/api/rooms/{room_id}", headers=h).json()
            if r.get("status") == "COMPLETED":
                state = r
                break
            # if room is LIVE, we (human) can stop too, but bot alone submission
            # combined with human timeout should still trigger finalize eventually.
            # However if only 1 of 2 submitted, finalize won't trigger until timeout.
            # Human stop:
            if r.get("status") == "LIVE":
                # try to stop as human once
                requests.post(f"{BASE_URL}/api/rooms/{room_id}/stop",
                              headers=h, json={"elapsed": float(target)})
        assert state.get("status") == "COMPLETED", f"room did not finalize: {state.get('status')}"
        players = state.get("players", [])
        assert len(players) >= 2
        # At least one player has a prize (winner)
        assert any(p.get("prize", 0) > 0 for p in players), "no winner assigned"
