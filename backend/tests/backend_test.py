"""PAZER backend E2E tests via public REACT_APP_BACKEND_URL."""
import os
import time
import uuid
import pytest
import requests
from pathlib import Path

# Load frontend .env for REACT_APP_BACKEND_URL
FRONTEND_ENV = Path(__file__).resolve().parents[2] / "frontend" / ".env"
BASE_URL = None
for line in FRONTEND_ENV.read_text().splitlines():
    if line.startswith("REACT_APP_BACKEND_URL="):
        BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
        break
assert BASE_URL, "REACT_APP_BACKEND_URL not set"

ADMIN_EMAIL = "admin@pazer.com"
ADMIN_PASSWORD = "Admin@123"


# --------- fixtures ---------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


def _register_user():
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "username": f"TEST_u_{suffix}",
        "email": f"TEST_{suffix}@example.com",
        "password": "TestPass@123",
        "display_name": f"Tester {suffix}",
    }
    r = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    return payload, data["token"], data["user"]["id"]


@pytest.fixture(scope="module")
def user_ctx():
    payload, token, uid = _register_user()
    return {"payload": payload, "token": token, "id": uid,
            "headers": {"Authorization": f"Bearer {token}"}}


# --------- auth tests ---------
class TestAuth:
    def test_register_returns_user_and_token(self):
        payload, token, uid = _register_user()
        assert token and uid
        # /auth/me
        me = requests.get(f"{BASE_URL}/api/auth/me",
                          headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200
        j = me.json()
        assert j["email"] == payload["email"].lower()
        assert j["role"] == "user"
        assert j["main_balance"] == 0.0

    def test_duplicate_email_rejected(self, user_ctx):
        r = requests.post(f"{BASE_URL}/api/auth/register", json={
            "username": "TEST_dup_" + uuid.uuid4().hex[:6],
            "email": user_ctx["payload"]["email"],
            "password": "AnyPass@1",
        })
        assert r.status_code == 400

    def test_login_bad_password(self, user_ctx):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": user_ctx["payload"]["email"], "password": "wrong"})
        assert r.status_code == 401

    def test_me_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    def test_admin_login_and_role(self, admin_token):
        me = requests.get(f"{BASE_URL}/api/auth/me",
                          headers={"Authorization": f"Bearer {admin_token}"})
        assert me.status_code == 200
        assert me.json()["role"] == "admin"

    def test_non_admin_forbidden_from_admin_endpoints(self, user_ctx):
        r = requests.get(f"{BASE_URL}/api/admin/config", headers=user_ctx["headers"])
        assert r.status_code == 403


# --------- wallet tests ---------
class TestWallet:
    def test_deposit_credits_main_and_bonus(self, user_ctx):
        # baseline
        w0 = requests.get(f"{BASE_URL}/api/wallet", headers=user_ctx["headers"]).json()
        r = requests.post(f"{BASE_URL}/api/wallet/deposit",
                          headers=user_ctx["headers"],
                          json={"amount": 1000})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["coins"] == 1000
        assert j["bonus"] == 100  # 10% default
        w1 = j["wallet"]
        assert w1["main_balance"] == round(w0["main_balance"] + 1000, 2)
        assert w1["bonus_balance"] == round(w0["bonus_balance"] + 100, 2)
        # txns
        txns = requests.get(f"{BASE_URL}/api/wallet/transactions",
                            headers=user_ctx["headers"]).json()
        types = [t["type"] for t in txns]
        assert "deposit" in types and "bonus" in types
        d = next(t for t in txns if t["type"] == "deposit")
        assert d["txn_id"].startswith("TXN")
        assert "balance_before" in d and "balance_after" in d
        assert d["balance_after"] - d["balance_before"] == 1000

    def test_deposit_min_enforced(self, user_ctx):
        r = requests.post(f"{BASE_URL}/api/wallet/deposit",
                          headers=user_ctx["headers"], json={"amount": 10})
        assert r.status_code == 400

    def test_withdraw_without_kyc_forbidden(self, user_ctx):
        r = requests.post(f"{BASE_URL}/api/wallet/withdraw",
                          headers=user_ctx["headers"], json={"amount": 300})
        assert r.status_code == 403


# --------- fixed game tests ---------
class TestFixedGame:
    def test_public_config_has_challenges(self):
        r = requests.get(f"{BASE_URL}/api/config/public")
        assert r.status_code == 200
        j = r.json()
        assert len(j["fixed_challenges"]) >= 1

    def test_full_win_flow_target_5(self, user_ctx):
        # ensure balance
        requests.post(f"{BASE_URL}/api/wallet/deposit",
                      headers=user_ctx["headers"], json={"amount": 500})
        w_before = requests.get(f"{BASE_URL}/api/wallet",
                                headers=user_ctx["headers"]).json()
        s = requests.post(f"{BASE_URL}/api/games/fixed/start",
                          headers=user_ctx["headers"], json={"target": 5})
        assert s.status_code == 200, s.text
        sess = s.json()
        session_id, nonce = sess["session_id"], sess["nonce"]
        # wait ~target seconds server-side
        time.sleep(5.0)
        stop = requests.post(f"{BASE_URL}/api/games/fixed/stop",
                             headers=user_ctx["headers"],
                             json={"session_id": session_id, "elapsed": 5.0, "nonce": nonce})
        assert stop.status_code == 200, stop.text
        result = stop.json()
        assert result["flagged"] is False
        assert result["won"] is True
        assert result["prize"] == 500
        w_after = result["wallet"]
        # entry 100 debited, prize 500 credited => +400 net
        assert round(w_after["total_balance"] - w_before["total_balance"], 2) == 400

    def test_replay_session_rejected(self, user_ctx):
        # start then stop, then stop again with same session -> 409
        s = requests.post(f"{BASE_URL}/api/games/fixed/start",
                          headers=user_ctx["headers"], json={"target": 5}).json()
        time.sleep(5.0)
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
                          headers=user_ctx["headers"], json={"target": 7})
        assert s.status_code == 200
        # try another before stopping
        s2 = requests.post(f"{BASE_URL}/api/games/fixed/start",
                          headers=user_ctx["headers"], json={"target": 5})
        assert s2.status_code == 409
        # clean up
        sess = s.json()
        time.sleep(7.0)
        requests.post(f"{BASE_URL}/api/games/fixed/stop",
                      headers=user_ctx["headers"],
                      json={"session_id": sess["session_id"], "elapsed": 7.0, "nonce": sess["nonce"]})

    def test_anticheat_flagged_on_mismatch(self, user_ctx):
        s = requests.post(f"{BASE_URL}/api/games/fixed/start",
                          headers=user_ctx["headers"], json={"target": 5}).json()
        # stop immediately with elapsed=5 -> server elapsed ~0 -> flagged
        r = requests.post(f"{BASE_URL}/api/games/fixed/stop",
                          headers=user_ctx["headers"],
                          json={"session_id": s["session_id"], "elapsed": 5.0, "nonce": s["nonce"]})
        assert r.status_code == 200
        assert r.json()["flagged"] is True
        assert r.json()["won"] is False

    def test_history_and_stats(self, user_ctx):
        h = requests.get(f"{BASE_URL}/api/games/history", headers=user_ctx["headers"])
        assert h.status_code == 200
        assert isinstance(h.json(), list) and len(h.json()) >= 1
        st = requests.get(f"{BASE_URL}/api/stats", headers=user_ctx["headers"])
        assert st.status_code == 200
        s = st.json()
        assert s["games_played"] >= 1
        assert "win_rate" in s


# --------- rooms tests ---------
class TestRooms:
    def test_list_open_rooms(self):
        r = requests.get(f"{BASE_URL}/api/rooms")
        assert r.status_code == 200
        rooms = r.json()
        assert isinstance(rooms, list)
        assert len(rooms) >= 1

    def test_join_room_debits_and_double_join_blocked(self):
        payload, token, uid = _register_user()
        headers = {"Authorization": f"Bearer {token}"}
        # deposit
        requests.post(f"{BASE_URL}/api/wallet/deposit", headers=headers, json={"amount": 500})
        rooms = requests.get(f"{BASE_URL}/api/rooms").json()
        assert rooms
        room = rooms[0]
        w_before = requests.get(f"{BASE_URL}/api/wallet", headers=headers).json()
        j = requests.post(f"{BASE_URL}/api/rooms/{room['id']}/join", headers=headers)
        assert j.status_code == 200, j.text
        updated = j.json()
        assert any(p["user_id"] == uid for p in updated["players"])
        w_after = requests.get(f"{BASE_URL}/api/wallet", headers=headers).json()
        assert round(w_before["total_balance"] - w_after["total_balance"], 2) == room["entry_fee"]
        # double-join
        j2 = requests.post(f"{BASE_URL}/api/rooms/{room['id']}/join", headers=headers)
        assert j2.status_code == 409


# --------- admin tests ---------
class TestAdmin:
    def test_config_get_and_update(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        cfg = requests.get(f"{BASE_URL}/api/admin/config", headers=h).json()
        original = cfg["wallet"]["bonus_percentage"]
        new = 15 if original != 15 else 12
        cfg["wallet"]["bonus_percentage"] = new
        upd = requests.put(f"{BASE_URL}/api/admin/config", headers=h, json={"data": cfg})
        assert upd.status_code == 200
        assert upd.json()["wallet"]["bonus_percentage"] == new
        # reflected in public
        pub = requests.get(f"{BASE_URL}/api/config/public").json()
        assert pub["wallet"]["bonus_percentage"] == new
        # restore
        cfg["wallet"]["bonus_percentage"] = original
        requests.put(f"{BASE_URL}/api/admin/config", headers=h, json={"data": cfg})

    def test_users_list_and_kyc_verify_and_withdraw_flow(self, admin_token):
        h_admin = {"Authorization": f"Bearer {admin_token}"}
        # create user, deposit, submit kyc
        payload, token, uid = _register_user()
        hu = {"Authorization": f"Bearer {token}"}
        requests.post(f"{BASE_URL}/api/wallet/deposit", headers=hu, json={"amount": 1000})
        requests.post(f"{BASE_URL}/api/kyc", headers=hu, json={
            "full_name": "T User", "document_type": "aadhaar", "document_number": "1234"})
        # admin lists users w/ search
        lst = requests.get(f"{BASE_URL}/api/admin/users?search=TEST_", headers=h_admin)
        assert lst.status_code == 200
        assert any(u["id"] == uid for u in lst.json())
        # verify kyc
        act = requests.post(f"{BASE_URL}/api/admin/users/{uid}/action",
                            headers=h_admin, json={"action": "verify_kyc"})
        assert act.status_code == 200
        assert act.json()["kyc_status"] == "verified"
        # user now withdraws -> pending txn
        wd = requests.post(f"{BASE_URL}/api/wallet/withdraw", headers=hu, json={"amount": 300})
        assert wd.status_code == 200
        txn_id = wd.json()["transaction"]["txn_id"]
        # admin approve
        appr = requests.post(f"{BASE_URL}/api/admin/withdrawals/{txn_id}/action",
                             headers=h_admin, json={"action": "approve"})
        assert appr.status_code == 200
        # create another withdrawal and reject -> should refund
        wd2 = requests.post(f"{BASE_URL}/api/wallet/withdraw", headers=hu, json={"amount": 300})
        assert wd2.status_code == 200
        txn_id2 = wd2.json()["transaction"]["txn_id"]
        bal_before = requests.get(f"{BASE_URL}/api/wallet", headers=hu).json()["total_balance"]
        rej = requests.post(f"{BASE_URL}/api/admin/withdrawals/{txn_id2}/action",
                            headers=h_admin, json={"action": "reject"})
        assert rej.status_code == 200
        bal_after = requests.get(f"{BASE_URL}/api/wallet", headers=hu).json()["total_balance"]
        assert round(bal_after - bal_before, 2) == 300  # refund

    def test_suspend_and_reactivate(self, admin_token):
        h_admin = {"Authorization": f"Bearer {admin_token}"}
        payload, token, uid = _register_user()
        hu = {"Authorization": f"Bearer {token}"}
        # suspend
        r = requests.post(f"{BASE_URL}/api/admin/users/{uid}/action",
                          headers=h_admin, json={"action": "suspend"})
        assert r.status_code == 200
        # suspended user should get 403 on authed
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=hu)
        assert me.status_code == 403
        # reactivate
        r = requests.post(f"{BASE_URL}/api/admin/users/{uid}/action",
                          headers=h_admin, json={"action": "reactivate"})
        assert r.status_code == 200
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=hu)
        assert me.status_code == 200

    def test_admin_stats_and_audit_logs(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        s = requests.get(f"{BASE_URL}/api/admin/stats", headers=h)
        assert s.status_code == 200
        for k in ("total_users", "total_games", "active_rooms",
                  "total_deposits", "total_prizes_paid"):
            assert k in s.json()
        al = requests.get(f"{BASE_URL}/api/admin/audit-logs", headers=h)
        assert al.status_code == 200
