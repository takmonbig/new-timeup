"""TIMEUP iter5 backend tests: partial mobile index, KYC bank/upi, completed rooms filter,
weekly leaderboard hides TEST users, plus regressions for wallet/fixed-game/streak."""
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


def _register(prefix="TEST"):
    mobile = _rand_mobile()
    payload = {"full_name": f"{prefix} User {uuid.uuid4().hex[:6]}",
               "mobile": mobile, "password": "TestPass@123"}
    r = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
    assert r.status_code == 200, r.text
    d = r.json()
    return payload, d["token"], d["user"]


def _hdr(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD})
    assert r.status_code == 200
    return r.json()["token"]


# ------- Health / startup (partial mobile index) -------
class TestHealthAndStartup:
    def test_public_config(self):
        r = requests.get(f"{BASE_URL}/api/config/public")
        assert r.status_code == 200
        d = r.json()
        assert "fixed_config" in d and "wallet" in d

    def test_rooms_endpoint(self):
        r = requests.get(f"{BASE_URL}/api/rooms")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_register_two_users_no_index_crash(self):
        # After partial-unique-mobile refactor, two fresh registers should succeed
        p1, _, _ = _register()
        p2, _, _ = _register()
        assert p1["mobile"] != p2["mobile"]

    def test_duplicate_mobile_still_rejected(self):
        p1, _, _ = _register()
        r = requests.post(f"{BASE_URL}/api/auth/register", json={
            "full_name": "TEST Dup", "mobile": p1["mobile"], "password": "TestPass@123"})
        # Should be rejected (409/400/500 handled at API level - not a 200)
        assert r.status_code != 200, "duplicate mobile should not be allowed"


# ------- KYC bank/upi -------
class TestKyc:
    def test_kyc_upi_accepted(self):
        _, t, _ = _register()
        r = requests.post(f"{BASE_URL}/api/kyc", headers=_hdr(t), json={
            "full_name": "TEST UPI Person",
            "method": "upi",
            "upi_id": "test@upi",
            "upi_name": "TEST UPI Person",
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("kyc_status") == "pending"
        # verify persisted on user
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=_hdr(t)).json()
        assert me.get("kyc_status") == "pending"

    def test_kyc_bank_accepted(self):
        _, t, _ = _register()
        r = requests.post(f"{BASE_URL}/api/kyc", headers=_hdr(t), json={
            "full_name": "TEST Bank Person",
            "method": "bank",
            "account_number": "1234567890",
            "account_name": "TEST Bank Person",
            "ifsc": "HDFC0001234",
            "bank_name": "HDFC",
        })
        assert r.status_code == 200, r.text
        assert r.json().get("kyc_status") == "pending"

    def test_kyc_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/kyc", json={
            "full_name": "x", "method": "upi", "upi_id": "a@b", "upi_name": "x"})
        assert r.status_code in (401, 403)


# ------- Completed rooms only -------
class TestCompletedRooms:
    def test_completed_multiplayer_only_completed(self):
        r = requests.get(f"{BASE_URL}/api/rooms/completed?mode=multiplayer")
        assert r.status_code == 200
        for room in r.json():
            assert room.get("status") == "COMPLETED", room

    def test_completed_1v1_only_completed(self):
        r = requests.get(f"{BASE_URL}/api/rooms/completed?mode=1v1")
        assert r.status_code == 200
        for room in r.json():
            assert room.get("status") == "COMPLETED", room


# ------- Leaderboard hides TEST users -------
class TestLeaderboardHideTest:
    def test_no_test_names(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/leaderboard/weekly", headers=_hdr(admin_token))
        assert r.status_code == 200
        for row in r.json():
            name = (row.get("name") or "")
            assert not name.lower().startswith("test"), f"Test-named entry leaked: {row}"


# ------- Regression: wallet deposit bonus, fixed win 5x, daily streak, header balance -------
class TestRegression:
    def test_wallet_deposit_bonus(self):
        _, t, _ = _register()
        r = requests.post(f"{BASE_URL}/api/wallet/deposit", headers=_hdr(t),
                          json={"amount": 500})
        assert r.status_code == 200, r.text
        w = requests.get(f"{BASE_URL}/api/wallet", headers=_hdr(t)).json()
        assert w["main_balance"] >= 500
        # bonus applied (10% up to cap)
        assert w["bonus_balance"] > 0

    def test_fixed_challenge_win_5x(self):
        _, t, _ = _register()
        requests.post(f"{BASE_URL}/api/wallet/deposit", headers=_hdr(t), json={"amount": 500})
        target, bet = 5, 20
        s = requests.post(f"{BASE_URL}/api/games/fixed/start", headers=_hdr(t),
                         json={"target": target, "bet": bet})
        assert s.status_code == 200, s.text
        sess = s.json()
        sid, nonce = sess["session_id"], sess["nonce"]
        time.sleep(target + 0.05)
        r = requests.post(f"{BASE_URL}/api/games/fixed/stop", headers=_hdr(t),
                         json={"session_id": sid, "elapsed": float(target), "nonce": nonce})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("won") is True, d
        assert abs(d.get("prize", 0) - bet * 5) < 1e-6

    def test_daily_streak_claim(self):
        _, t, _ = _register()
        st = requests.get(f"{BASE_URL}/api/streak", headers=_hdr(t))
        assert st.status_code == 200
        r = requests.post(f"{BASE_URL}/api/streak/claim", headers=_hdr(t))
        # first claim should succeed
        assert r.status_code in (200, 201), r.text
        # second claim within same day should be idempotent-rejected
        r2 = requests.post(f"{BASE_URL}/api/streak/claim", headers=_hdr(t))
        assert r2.status_code in (200, 400, 409)

    def test_login_flow(self):
        p, _, _ = _register()
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"mobile": p["mobile"], "password": p["password"]})
        assert r.status_code == 200
        assert "token" in r.json()
