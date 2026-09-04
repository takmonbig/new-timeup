"""TIMEUP backend E2E tests via public REACT_APP_BACKEND_URL (mobile auth iter2)."""
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
assert BASE_URL, "REACT_APP_BACKEND_URL not set"

ADMIN_MOBILE = "9999999999"
ADMIN_PASSWORD = "Admin@123"


def _rand_mobile():
    # generate 10-digit mobile not starting with 9999
    while True:
        m = "".join([str(random.randint(0, 9)) for _ in range(10)])
        if not m.startswith("9999"):
            return m


def _register_user():
    mobile = _rand_mobile()
    payload = {
        "full_name": f"TEST User {uuid.uuid4().hex[:6]}",
        "mobile": mobile,
        "password": "TestPass@123",
    }
    r = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    return payload, data["token"], data["user"]["id"], data["user"]


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def user_ctx():
    payload, token, uid, user = _register_user()
    return {"payload": payload, "token": token, "id": uid, "user": user,
            "headers": {"Authorization": f"Bearer {token}"}}


# --------- auth (mobile) ---------
class TestAuth:
    def test_register_returns_username_starting_with_TU(self):
        payload, token, uid, user = _register_user()
        assert token and uid
        assert user["username"].startswith("TU")
        me = requests.get(f"{BASE_URL}/api/auth/me",
                          headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200
        j = me.json()
        assert j["mobile"] == payload["mobile"]
        assert j["role"] == "user"

    def test_duplicate_mobile_rejected(self, user_ctx):
        r = requests.post(f"{BASE_URL}/api/auth/register", json={
            "full_name": "Dup", "mobile": user_ctx["payload"]["mobile"],
            "password": "AnyPass@1",
        })
        assert r.status_code == 400

    def test_login_with_mobile(self, user_ctx):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={
            "mobile": user_ctx["payload"]["mobile"],
            "password": user_ctx["payload"]["password"]})
        assert r.status_code == 200
        assert "token" in r.json()

    def test_login_bad_password(self, user_ctx):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={
            "mobile": user_ctx["payload"]["mobile"], "password": "wrong"})
        assert r.status_code == 401

    def test_register_invalid_mobile(self):
        r = requests.post(f"{BASE_URL}/api/auth/register", json={
            "full_name": "x", "mobile": "12345", "password": "TestPass@123"})
        assert r.status_code == 400

    def test_admin_login_and_role(self, admin_token):
        me = requests.get(f"{BASE_URL}/api/auth/me",
                          headers={"Authorization": f"Bearer {admin_token}"})
        assert me.status_code == 200
        assert me.json()["role"] == "admin"

    def test_non_admin_forbidden_from_admin_endpoints(self, user_ctx):
        r = requests.get(f"{BASE_URL}/api/admin/config", headers=user_ctx["headers"])
        assert r.status_code == 403


# --------- public config ---------
class TestPublicConfig:
    def test_public_config_shape(self):
        r = requests.get(f"{BASE_URL}/api/config/public")
        assert r.status_code == 200
        j = r.json()
        assert "fixed_config" in j and "room_1v1_config" in j
        fc = j["fixed_config"]
        assert fc["min_bet"] == 20
        assert fc["win_multiplier"] == 5
        assert isinstance(fc["targets"], list) and len(fc["targets"]) >= 1
        assert j["room_1v1_config"]["win_multiplier"] == 1.5


# --------- wallet ---------
class TestWallet:
    def test_deposit_credits_main_and_bonus(self, user_ctx):
        w0 = requests.get(f"{BASE_URL}/api/wallet", headers=user_ctx["headers"]).json()
        r = requests.post(f"{BASE_URL}/api/wallet/deposit",
                          headers=user_ctx["headers"], json={"amount": 1000})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["coins"] == 1000
        assert j["bonus"] == 100
        w1 = j["wallet"]
        assert w1["main_balance"] == round(w0["main_balance"] + 1000, 2)
        txns = requests.get(f"{BASE_URL}/api/wallet/transactions",
                            headers=user_ctx["headers"]).json()
        types = [t["type"] for t in txns]
        assert "deposit" in types and "bonus" in types
        d = next(t for t in txns if t["type"] == "deposit")
        assert d["txn_id"].startswith("TXN")
        assert d["balance_after"] - d["balance_before"] == 1000

    def test_deposit_min_enforced(self, user_ctx):
        r = requests.post(f"{BASE_URL}/api/wallet/deposit",
                          headers=user_ctx["headers"], json={"amount": 10})
        assert r.status_code == 400

    def test_withdraw_without_kyc_forbidden(self, user_ctx):
        r = requests.post(f"{BASE_URL}/api/wallet/withdraw",
                          headers=user_ctx["headers"], json={"amount": 300})
        assert r.status_code == 403


# --------- fixed game bet-based ---------
class TestFixedGame:
    def test_bet_below_min_rejected(self, user_ctx):
        requests.post(f"{BASE_URL}/api/wallet/deposit",
                      headers=user_ctx["headers"], json={"amount": 500})
        s = requests.post(f"{BASE_URL}/api/games/fixed/start",
                          headers=user_ctx["headers"], json={"target": 5, "bet": 10})
        assert s.status_code == 400

    def test_win_flow_bet20_target5_prize100(self, user_ctx):
        requests.post(f"{BASE_URL}/api/wallet/deposit",
                      headers=user_ctx["headers"], json={"amount": 500})
        w_before = requests.get(f"{BASE_URL}/api/wallet",
                                headers=user_ctx["headers"]).json()
        s = requests.post(f"{BASE_URL}/api/games/fixed/start",
                          headers=user_ctx["headers"], json={"target": 5, "bet": 20})
        assert s.status_code == 200, s.text
        sess = s.json()
        time.sleep(5.05)
        stop = requests.post(f"{BASE_URL}/api/games/fixed/stop",
                             headers=user_ctx["headers"],
                             json={"session_id": sess["session_id"],
                                   "elapsed": 5.00, "nonce": sess["nonce"]})
        assert stop.status_code == 200, stop.text
        res = stop.json()
        assert res["flagged"] is False
        assert res["won"] is True
        assert res["prize"] == 100
        w_after = res["wallet"]
        assert round(w_after["total_balance"] - w_before["total_balance"], 2) == 80

    def test_loss_when_off_by_more_than_005(self, user_ctx):
        requests.post(f"{BASE_URL}/api/wallet/deposit",
                      headers=user_ctx["headers"], json={"amount": 200})
        s = requests.post(f"{BASE_URL}/api/games/fixed/start",
                          headers=user_ctx["headers"], json={"target": 5, "bet": 20}).json()
        time.sleep(5.05)
        stop = requests.post(f"{BASE_URL}/api/games/fixed/stop",
                             headers=user_ctx["headers"],
                             json={"session_id": s["session_id"],
                                   "elapsed": 5.10, "nonce": s["nonce"]})
        assert stop.status_code == 200
        assert stop.json()["won"] is False

    def test_replay_session_rejected(self, user_ctx):
        s = requests.post(f"{BASE_URL}/api/games/fixed/start",
                          headers=user_ctx["headers"], json={"target": 5, "bet": 20}).json()
        time.sleep(5.05)
        r1 = requests.post(f"{BASE_URL}/api/games/fixed/stop",
                           headers=user_ctx["headers"],
                           json={"session_id": s["session_id"], "elapsed": 5.0, "nonce": s["nonce"]})
        assert r1.status_code == 200
        r2 = requests.post(f"{BASE_URL}/api/games/fixed/stop",
                           headers=user_ctx["headers"],
                           json={"session_id": s["session_id"], "elapsed": 5.0, "nonce": s["nonce"]})
        assert r2.status_code == 409

    def test_concurrent_session_blocked(self, user_ctx):
        s = requests.post(f"{BASE_URL}/api/games/fixed/start",
                          headers=user_ctx["headers"], json={"target": 7, "bet": 20})
        assert s.status_code == 200
        s2 = requests.post(f"{BASE_URL}/api/games/fixed/start",
                           headers=user_ctx["headers"], json={"target": 5, "bet": 20})
        assert s2.status_code == 409
        sess = s.json()
        time.sleep(7.05)
        requests.post(f"{BASE_URL}/api/games/fixed/stop",
                      headers=user_ctx["headers"],
                      json={"session_id": sess["session_id"], "elapsed": 7.0, "nonce": sess["nonce"]})


# --------- rooms 1v1 & multiplayer ---------
class TestRooms:
    def test_1v1_rooms_shape(self):
        r = requests.get(f"{BASE_URL}/api/rooms?mode=1v1")
        assert r.status_code == 200
        rooms = r.json()
        assert len(rooms) >= 8
        for room in rooms:
            assert room["mode"] == "1v1"
            assert room["max_players"] == 2
            assert room["entry_fee"] == 50
            assert room["win_multiplier"] == 1.5

    def test_multiplayer_rooms_shape(self):
        r = requests.get(f"{BASE_URL}/api/rooms?mode=multiplayer")
        assert r.status_code == 200
        rooms = r.json()
        assert len(rooms) >= 3
        for room in rooms:
            assert room["mode"] == "multiplayer"
            assert room["max_players"] >= 5

    def test_join_1v1_deducts_50_and_double_join_blocked(self):
        payload, token, uid, _ = _register_user()
        h = {"Authorization": f"Bearer {token}"}
        requests.post(f"{BASE_URL}/api/wallet/deposit", headers=h, json={"amount": 500})
        rooms = requests.get(f"{BASE_URL}/api/rooms?mode=1v1").json()
        room = rooms[0]
        w0 = requests.get(f"{BASE_URL}/api/wallet", headers=h).json()
        j = requests.post(f"{BASE_URL}/api/rooms/{room['id']}/join", headers=h)
        assert j.status_code == 200, j.text
        w1 = requests.get(f"{BASE_URL}/api/wallet", headers=h).json()
        assert round(w0["total_balance"] - w1["total_balance"], 2) == 50
        j2 = requests.post(f"{BASE_URL}/api/rooms/{room['id']}/join", headers=h)
        assert j2.status_code == 409


# --------- admin ---------
class TestAdmin:
    def test_config_get_and_update_fixed_and_1v1(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        cfg = requests.get(f"{BASE_URL}/api/admin/config", headers=h).json()
        assert "fixed_config" in cfg and "room_1v1_config" in cfg
        original = cfg["fixed_config"]["win_multiplier"]
        cfg["fixed_config"]["win_multiplier"] = 6
        upd = requests.put(f"{BASE_URL}/api/admin/config", headers=h, json={"data": cfg})
        assert upd.status_code == 200
        assert upd.json()["fixed_config"]["win_multiplier"] == 6
        pub = requests.get(f"{BASE_URL}/api/config/public").json()
        assert pub["fixed_config"]["win_multiplier"] == 6
        # restore
        cfg["fixed_config"]["win_multiplier"] = original
        requests.put(f"{BASE_URL}/api/admin/config", headers=h, json={"data": cfg})

    def test_save_config_no_crash_without_fixed_challenges(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        cfg = requests.get(f"{BASE_URL}/api/admin/config", headers=h).json()
        cfg.pop("fixed_challenges", None)  # simulate old admin UI absent
        upd = requests.put(f"{BASE_URL}/api/admin/config", headers=h, json={"data": cfg})
        assert upd.status_code == 200

    def test_users_list_and_kyc_and_withdraw(self, admin_token):
        h_admin = {"Authorization": f"Bearer {admin_token}"}
        payload, token, uid, _ = _register_user()
        hu = {"Authorization": f"Bearer {token}"}
        requests.post(f"{BASE_URL}/api/wallet/deposit", headers=hu, json={"amount": 1000})
        requests.post(f"{BASE_URL}/api/kyc", headers=hu, json={
            "full_name": "T User", "document_type": "aadhaar", "document_number": "1234"})
        lst = requests.get(f"{BASE_URL}/api/admin/users?search=TU", headers=h_admin)
        assert lst.status_code == 200
        act = requests.post(f"{BASE_URL}/api/admin/users/{uid}/action",
                            headers=h_admin, json={"action": "verify_kyc"})
        assert act.status_code == 200
        wd = requests.post(f"{BASE_URL}/api/wallet/withdraw", headers=hu, json={"amount": 300})
        assert wd.status_code == 200
        txn_id = wd.json()["transaction"]["txn_id"]
        appr = requests.post(f"{BASE_URL}/api/admin/withdrawals/{txn_id}/action",
                             headers=h_admin, json={"action": "approve"})
        assert appr.status_code == 200
        # reject refunds
        wd2 = requests.post(f"{BASE_URL}/api/wallet/withdraw", headers=hu, json={"amount": 300})
        txn_id2 = wd2.json()["transaction"]["txn_id"]
        b0 = requests.get(f"{BASE_URL}/api/wallet", headers=hu).json()["total_balance"]
        requests.post(f"{BASE_URL}/api/admin/withdrawals/{txn_id2}/action",
                      headers=h_admin, json={"action": "reject"})
        b1 = requests.get(f"{BASE_URL}/api/wallet", headers=hu).json()["total_balance"]
        assert round(b1 - b0, 2) == 300

    def test_suspend_and_reactivate(self, admin_token):
        h_admin = {"Authorization": f"Bearer {admin_token}"}
        payload, token, uid, _ = _register_user()
        hu = {"Authorization": f"Bearer {token}"}
        assert requests.post(f"{BASE_URL}/api/admin/users/{uid}/action",
                             headers=h_admin, json={"action": "suspend"}).status_code == 200
        assert requests.get(f"{BASE_URL}/api/auth/me", headers=hu).status_code == 403
        assert requests.post(f"{BASE_URL}/api/admin/users/{uid}/action",
                             headers=h_admin, json={"action": "reactivate"}).status_code == 200
        assert requests.get(f"{BASE_URL}/api/auth/me", headers=hu).status_code == 200

    def test_admin_stats(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        s = requests.get(f"{BASE_URL}/api/admin/stats", headers=h)
        assert s.status_code == 200
