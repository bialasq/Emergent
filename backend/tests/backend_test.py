"""
Backend tests for Dungeon of Echoes.
Tests auth (register/login/me/refresh/logout), runs submission (guest + auth),
leaderboard (sort/filter/limit), brute-force lockout, and MongoDB ObjectId leak.
"""
import os
import uuid
import time
import pytest
import requests

# Use external URL to validate ingress routing, but allow override via env
BASE_URL = os.environ.get("TEST_BASE_URL", os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001")).rstrip("/")
API = f"{BASE_URL}/api"


def _uniq():
    return uuid.uuid4().hex[:10]


@pytest.fixture(scope="module")
def fresh_user():
    suffix = _uniq()
    return {
        "email": f"TEST_hero_{suffix}@test.com",
        "password": "dungeon123",
        "username": f"TESTHero{suffix}",
    }


@pytest.fixture(scope="module")
def registered_session(fresh_user):
    s = requests.Session()
    r = s.post(f"{API}/auth/register", json=fresh_user, timeout=15)
    assert r.status_code == 200, f"register failed {r.status_code} {r.text}"
    return s, fresh_user, r


# --------- Root ---------
class TestRoot:
    def test_root_ok(self):
        r = requests.get(f"{API}/", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data.get("status") == "ok"
        assert "message" in data


# --------- Auth ---------
class TestAuthRegister:
    def test_register_sets_cookies_and_returns_user(self, registered_session, fresh_user):
        _, _, r = registered_session
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == fresh_user["email"].lower()
        assert data["username"] == fresh_user["username"]
        assert "id" in data and isinstance(data["id"], str)
        assert "_id" not in data
        # Cookies set
        cookie_names = {c.name for c in r.cookies}
        assert "access_token" in cookie_names, f"cookies: {cookie_names}"
        assert "refresh_token" in cookie_names

    def test_register_rejects_duplicate_email(self, fresh_user):
        body = {
            "email": fresh_user["email"],
            "password": fresh_user["password"],
            "username": fresh_user["username"] + "X",
        }
        r = requests.post(f"{API}/auth/register", json=body, timeout=10)
        assert r.status_code == 400

    def test_register_rejects_duplicate_username(self, fresh_user):
        body = {
            "email": f"TEST_other_{_uniq()}@test.com",
            "password": fresh_user["password"],
            "username": fresh_user["username"],
        }
        r = requests.post(f"{API}/auth/register", json=body, timeout=10)
        assert r.status_code == 400

    def test_register_rejects_invalid_email(self):
        r = requests.post(f"{API}/auth/register", json={
            "email": "not-an-email",
            "password": "abcdef",
            "username": f"u{_uniq()}",
        }, timeout=10)
        assert r.status_code == 422

    def test_register_rejects_short_password(self):
        r = requests.post(f"{API}/auth/register", json={
            "email": f"TEST_short_{_uniq()}@test.com",
            "password": "abc",
            "username": f"u{_uniq()}",
        }, timeout=10)
        assert r.status_code == 422


class TestAuthLoginMeRefreshLogout:
    def test_login_success_sets_cookies(self, fresh_user):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={
            "email": fresh_user["email"],
            "password": fresh_user["password"],
        }, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["email"] == fresh_user["email"].lower()
        assert "_id" not in data
        assert "access_token" in s.cookies
        assert "refresh_token" in s.cookies

    def test_me_requires_auth(self):
        r = requests.get(f"{API}/auth/me", timeout=10)
        assert r.status_code == 401

    def test_me_returns_user_when_authenticated(self, fresh_user):
        s = requests.Session()
        lg = s.post(f"{API}/auth/login", json={
            "email": fresh_user["email"], "password": fresh_user["password"]
        }, timeout=10)
        assert lg.status_code == 200, f"login failed: {lg.status_code} {lg.text} cookies={list(s.cookies.keys())}"
        r = s.get(f"{API}/auth/me", timeout=10)
        assert r.status_code == 200, f"/me failed: {r.status_code} {r.text} cookies={list(s.cookies.keys())}"
        data = r.json()
        assert data["email"] == fresh_user["email"].lower()
        assert data["username"] == fresh_user["username"]
        assert "_id" not in data
        assert "password_hash" not in data

    def test_refresh_issues_new_access(self, fresh_user):
        s = requests.Session()
        s.post(f"{API}/auth/login", json={
            "email": fresh_user["email"], "password": fresh_user["password"]
        }, timeout=10)
        old_access = s.cookies.get("access_token")
        # Drop access_token to force refresh path and ensure refresh sets a fresh one
        s.cookies.pop("access_token", None)
        r = s.post(f"{API}/auth/refresh", timeout=10)
        assert r.status_code == 200
        assert r.json().get("ok") is True
        assert "access_token" in s.cookies
        # /me should work with the newly-refreshed access token
        r2 = s.get(f"{API}/auth/me", timeout=10)
        assert r2.status_code == 200

    def test_logout_clears_cookies(self, fresh_user):
        s = requests.Session()
        s.post(f"{API}/auth/login", json={
            "email": fresh_user["email"], "password": fresh_user["password"]
        }, timeout=10)
        r = s.post(f"{API}/auth/logout", timeout=10)
        assert r.status_code == 200
        # After logout, /me should fail
        r2 = s.get(f"{API}/auth/me", timeout=10)
        assert r2.status_code == 401


class TestLoginWrongPassword:
    def test_wrong_password_401(self, fresh_user):
        # Use a fresh, isolated email to avoid lockout affecting other tests
        # Register a dedicated user just for wrong-pwd check
        suffix = _uniq()
        u = {
            "email": f"TEST_wrong_{suffix}@test.com",
            "password": "correctpw1",
            "username": f"TESTWrong{suffix}",
        }
        rr = requests.post(f"{API}/auth/register", json=u, timeout=10)
        assert rr.status_code == 200
        r = requests.post(f"{API}/auth/login", json={
            "email": u["email"], "password": "wrongpass",
        }, timeout=10)
        assert r.status_code == 401


class TestBruteForceLockout:
    def test_lockout_after_5_failures(self):
        suffix = _uniq()
        u = {
            "email": f"TEST_bf_{suffix}@test.com",
            "password": "correctpw1",
            "username": f"TESTBF{suffix}",
        }
        rr = requests.post(f"{API}/auth/register", json=u, timeout=10)
        assert rr.status_code == 200

        statuses = []
        sess = requests.Session()
        for _ in range(6):
            r = sess.post(f"{API}/auth/login", json={
                "email": u["email"], "password": "wrong",
            }, timeout=10)
            statuses.append(r.status_code)
        # After 5 failures, 6th (or later) should be 429
        assert 429 in statuses, f"Expected 429 in {statuses}"


# --------- Runs & Leaderboard ---------
class TestRunsAndLeaderboard:
    def test_submit_guest_run(self):
        payload = {
            "seed": 12345,
            "character_class": "warrior",
            "character_name": "GuestWarrior",
            "depth": 3,
            "score": 250,
            "kills": 10,
            "duration_seconds": 120,
            "outcome": "dead",
            "level": 2,
            "guest_id": "Wanderer-TEST",
        }
        r = requests.post(f"{API}/runs", json=payload, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert "id" in data
        assert "_id" not in data

    def test_submit_guest_default_username(self):
        payload = {
            "seed": 1, "character_class": "mage", "character_name": "GM",
            "depth": 1, "score": 10, "kills": 0, "duration_seconds": 5,
            "outcome": "abandoned", "level": 1,
        }
        r = requests.post(f"{API}/runs", json=payload, timeout=10)
        assert r.status_code == 200

    def test_submit_authenticated_run(self, fresh_user):
        s = requests.Session()
        s.post(f"{API}/auth/login", json={
            "email": fresh_user["email"], "password": fresh_user["password"]
        }, timeout=10)
        payload = {
            "seed": 777, "character_class": "mage", "character_name": "Archmage",
            "depth": 6, "score": 9999, "kills": 50, "duration_seconds": 600,
            "outcome": "victory", "level": 10,
        }
        r = s.post(f"{API}/runs", json=payload, timeout=10)
        assert r.status_code == 200

        # runs/me should return this run
        r2 = s.get(f"{API}/runs/me", timeout=10)
        assert r2.status_code == 200
        runs = r2.json()
        assert isinstance(runs, list)
        assert any(x.get("character_name") == "Archmage" and x.get("score") == 9999 for x in runs)
        for x in runs:
            assert "_id" not in x

    def test_runs_me_requires_auth(self):
        r = requests.get(f"{API}/runs/me", timeout=10)
        assert r.status_code == 401

    def test_submit_invalid_outcome(self):
        payload = {
            "seed": 1, "character_class": "warrior", "character_name": "X",
            "depth": 1, "score": 1, "kills": 0, "duration_seconds": 1,
            "outcome": "quit",  # invalid
            "level": 1,
        }
        r = requests.post(f"{API}/runs", json=payload, timeout=10)
        assert r.status_code == 422

    def test_submit_invalid_character_class(self):
        payload = {
            "seed": 1, "character_class": "rogue", "character_name": "X",
            "depth": 1, "score": 1, "kills": 0, "duration_seconds": 1,
            "outcome": "dead", "level": 1,
        }
        r = requests.post(f"{API}/runs", json=payload, timeout=10)
        assert r.status_code == 422

    def test_leaderboard_sorted(self):
        r = requests.get(f"{API}/leaderboard?limit=50", timeout=10)
        assert r.status_code == 200
        entries = r.json()
        assert isinstance(entries, list)
        # Ensure sort by score desc, depth desc
        for i in range(len(entries) - 1):
            a, b = entries[i], entries[i + 1]
            assert (a["score"], a["depth"]) >= (b["score"], b["depth"])
            assert a["rank"] == i + 1
            assert "_id" not in a

    def test_leaderboard_filter_warrior(self):
        r = requests.get(f"{API}/leaderboard?character_class=warrior", timeout=10)
        assert r.status_code == 200
        for e in r.json():
            assert e["character_class"] == "warrior"

    def test_leaderboard_filter_mage(self):
        r = requests.get(f"{API}/leaderboard?character_class=mage", timeout=10)
        assert r.status_code == 200
        for e in r.json():
            assert e["character_class"] == "mage"

    def test_leaderboard_limit_respected_and_capped(self):
        r = requests.get(f"{API}/leaderboard?limit=2", timeout=10)
        assert r.status_code == 200
        assert len(r.json()) <= 2
        # cap at 100 should not 500
        r2 = requests.get(f"{API}/leaderboard?limit=9999", timeout=10)
        assert r2.status_code == 200
        assert len(r2.json()) <= 100


# --------- MongoDB indexes check (via server logs or by attempting dup) ---------
class TestIndexes:
    def test_unique_username_lower_case_insensitive(self):
        suffix = _uniq()
        base = f"TESTCase{suffix}"
        u1 = {
            "email": f"TEST_case1_{suffix}@test.com",
            "password": "abcdef1",
            "username": base.lower(),
        }
        r1 = requests.post(f"{API}/auth/register", json=u1, timeout=10)
        assert r1.status_code == 200
        u2 = {
            "email": f"TEST_case2_{suffix}@test.com",
            "password": "abcdef1",
            "username": base.upper(),  # same lowercase key
        }
        r2 = requests.post(f"{API}/auth/register", json=u2, timeout=10)
        assert r2.status_code == 400
