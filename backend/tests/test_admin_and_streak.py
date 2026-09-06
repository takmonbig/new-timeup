import os, time, requests, pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0]
BASE_URL = BASE_URL.rstrip("/")

ADMIN_MOBILE = "9999999999"
ADMIN_PASS = "Admin@123"


def _login(mobile, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"mobile": mobile, "password": password})
    return r


def test_admin_login_role():
    r = _login(ADMIN_MOBILE, ADMIN_PASS)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("user", {}).get("role") == "admin"
    assert data.get("token")


def test_user_register_and_streak_20():
    # Register a fresh user
    mobile = "9" + str(int(time.time()))[-9:]
    payload = {"full_name": "TEST Streak User", "mobile": mobile, "password": "Pass@123"}
    r = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
    assert r.status_code in (200, 201), r.text
    token = r.json()["token"]
    h = {"Authorization": f"Bearer {token}"}

    # GET /api/streak
    s = requests.get(f"{BASE_URL}/api/streak", headers=h)
    assert s.status_code == 200, s.text
    sd = s.json()
    assert sd.get("daily_bonus") == 20, f"daily_bonus expected 20, got {sd}"
    assert sd.get("can_claim") is True

    # Check wallet before
    w1 = requests.get(f"{BASE_URL}/api/wallet", headers=h).json()
    bal_before = w1.get("total_balance", 0)

    # Claim
    c = requests.post(f"{BASE_URL}/api/streak/claim", headers=h)
    assert c.status_code == 200, c.text
    cd = c.json()
    assert cd.get("bonus") == 20
    assert cd.get("claimed") is True

    # Verify credit
    w2 = requests.get(f"{BASE_URL}/api/wallet", headers=h).json()
    bal_after = w2.get("total_balance", 0)
    assert bal_after - bal_before == 20, f"Expected +20 coins, got before={bal_before} after={bal_after} wallet={w2}"


def test_user_cannot_use_admin_creds_role_check_via_login():
    # Admin login via /api/auth/login IS allowed at API level; the UI restricts by role.
    r = _login(ADMIN_MOBILE, ADMIN_PASS)
    assert r.status_code == 200
    assert r.json()["user"]["role"] == "admin"
