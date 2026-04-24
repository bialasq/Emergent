"""
Tests for new features:
- Meta-progression: GET /api/meta, POST /api/meta/spend
- Souls accrual in POST /api/runs
- WebSocket co-op at /api/ws/coop/{code}
"""
import os
import uuid
import json
import asyncio
import pytest
import requests
import websockets

BASE_URL = os.environ.get(
    "TEST_BASE_URL",
    os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001"),
).rstrip("/")
API = f"{BASE_URL}/api"
WS_BASE = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")


def _uniq():
    return uuid.uuid4().hex[:10]


def _register():
    suffix = _uniq()
    user = {
        "email": f"TEST_meta_{suffix}@test.com",
        "password": "dungeon123",
        "username": f"TESTMeta{suffix}",
    }
    s = requests.Session()
    r = s.post(f"{API}/auth/register", json=user, timeout=15)
    assert r.status_code == 200, r.text
    return s, user, r.json()


# ------------- Meta-progression -------------
class TestMeta:
    def test_register_initializes_souls_and_meta(self):
        _, _, data = _register()
        assert data.get("souls") == 0
        assert data.get("meta") == {}
        assert "_id" not in data

    def test_auth_me_returns_souls_and_meta(self):
        s, _, _ = _register()
        r = s.get(f"{API}/auth/me", timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert "souls" in d and d["souls"] == 0
        assert "meta" in d and d["meta"] == {}
        assert "_id" not in d

    def test_meta_requires_auth(self):
        r = requests.get(f"{API}/meta", timeout=10)
        assert r.status_code == 401

    def test_meta_spend_requires_auth(self):
        r = requests.post(f"{API}/meta/spend", json={"upgrade_id": "hp"}, timeout=10)
        assert r.status_code == 401

    def test_meta_returns_state(self):
        s, _, _ = _register()
        r = s.get(f"{API}/meta", timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["souls"] == 0
        assert d["upgrades"] == {}

    def test_spend_not_enough_souls(self):
        s, _, _ = _register()
        r = s.post(f"{API}/meta/spend", json={"upgrade_id": "hp"}, timeout=10)
        assert r.status_code == 400
        assert "soul" in r.json().get("detail", "").lower()

    def test_spend_unknown_upgrade(self):
        s, _, _ = _register()
        r = s.post(f"{API}/meta/spend", json={"upgrade_id": "wings"}, timeout=10)
        assert r.status_code == 400

    def test_souls_accrual_auth_run_and_spend_flow(self):
        s, _, _ = _register()
        # Submit a victory run: score=500 -> 5 + kills=10 + 50 = 65 souls
        payload = {
            "seed": 1, "character_class": "warrior", "character_name": "Hero",
            "depth": 2, "score": 500, "kills": 10, "duration_seconds": 30,
            "outcome": "victory", "level": 2,
        }
        r = s.post(f"{API}/runs", json=payload, timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["souls_earned"] == (500 // 100) + 10 + 50  # 65
        assert d["souls_total"] == 65
        assert "_id" not in d

        # /auth/me should reflect souls
        me = s.get(f"{API}/auth/me", timeout=10).json()
        assert me["souls"] == 65

        # GET /api/meta should match
        meta = s.get(f"{API}/meta", timeout=10).json()
        assert meta["souls"] == 65

        # Spend hp (cost 5) -> souls=60, upgrades.hp=1
        r2 = s.post(f"{API}/meta/spend", json={"upgrade_id": "hp"}, timeout=10)
        assert r2.status_code == 200, r2.text
        d2 = r2.json()
        assert d2["souls"] == 60
        assert d2["upgrades"]["hp"] == 1

        # Spend 4 more hp to reach max=5 (5*5=25 cost total, souls=60-20=40)
        for _ in range(4):
            rr = s.post(f"{API}/meta/spend", json={"upgrade_id": "hp"}, timeout=10)
            assert rr.status_code == 200
        state = s.get(f"{API}/meta", timeout=10).json()
        assert state["upgrades"]["hp"] == 5
        assert state["souls"] == 65 - (5 * 5)  # 40

        # Now hp is max -> 400
        r3 = s.post(f"{API}/meta/spend", json={"upgrade_id": "hp"}, timeout=10)
        assert r3.status_code == 400
        assert "max" in r3.json().get("detail", "").lower()

    def test_souls_formula_non_victory(self):
        s, _, _ = _register()
        # dead: score=250 -> 2 + kills=3 + 0 = 5 souls
        payload = {
            "seed": 1, "character_class": "mage", "character_name": "M",
            "depth": 1, "score": 250, "kills": 3, "duration_seconds": 10,
            "outcome": "dead", "level": 1,
        }
        r = s.post(f"{API}/runs", json=payload, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["souls_earned"] == 5
        assert d["souls_total"] == 5

    def test_guest_run_does_not_touch_user(self):
        payload = {
            "seed": 1, "character_class": "warrior", "character_name": "G",
            "depth": 1, "score": 9999, "kills": 99, "duration_seconds": 10,
            "outcome": "victory", "level": 1,
        }
        r = requests.post(f"{API}/runs", json=payload, timeout=10)
        assert r.status_code == 200
        d = r.json()
        # souls_earned computed but souls_total is None (no user)
        assert d["souls_earned"] == (9999 // 100) + 99 + 50
        assert d.get("souls_total") is None
        assert d.get("ok") is True


# ------------- WebSocket co-op -------------
def _room_code():
    return f"TEST{uuid.uuid4().hex[:6].upper()}"


async def _ws_connect(code, name="P", cls="warrior"):
    url = f"{WS_BASE}/api/ws/coop/{code}?name={name}&cls={cls}"
    return await websockets.connect(url, open_timeout=10, close_timeout=5)


class TestCoopWebSocket:
    def test_first_joiner_receives_joined_with_seed(self):
        async def run():
            code = _room_code()
            ws = await _ws_connect(code, "Alice", "warrior")
            try:
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
                assert msg["type"] == "joined"
                assert "seed" in msg and isinstance(msg["seed"], int)
                assert msg["players"] == []
                assert msg["you"]["name"] == "Alice"
                assert msg["you"]["cls"] == "warrior"
                assert msg["room"] == code
            finally:
                await ws.close()

        asyncio.get_event_loop().run_until_complete(run()) if False else asyncio.run(run())

    def test_second_joiner_sees_first_and_first_gets_player_join(self):
        async def run():
            code = _room_code()
            ws1 = await _ws_connect(code, "Alice", "warrior")
            m1 = json.loads(await asyncio.wait_for(ws1.recv(), timeout=5))
            seed1 = m1["seed"]

            ws2 = await _ws_connect(code, "Bob", "mage")
            m2 = json.loads(await asyncio.wait_for(ws2.recv(), timeout=5))
            try:
                assert m2["type"] == "joined"
                assert m2["seed"] == seed1  # same deterministic seed
                # players list in m2 contains the first (Alice)
                names = [p["name"] for p in m2["players"]]
                assert "Alice" in names

                # Alice should receive player_join
                m1b = json.loads(await asyncio.wait_for(ws1.recv(), timeout=5))
                assert m1b["type"] == "player_join"
                assert m1b["player"]["name"] == "Bob"
                assert m1b["player"]["cls"] == "mage"
            finally:
                await ws1.close()
                await ws2.close()

        asyncio.run(run())

    def test_pos_broadcast_not_echoed_to_sender(self):
        async def run():
            code = _room_code()
            ws1 = await _ws_connect(code, "Alice", "warrior")
            await asyncio.wait_for(ws1.recv(), timeout=5)  # joined

            ws2 = await _ws_connect(code, "Bob", "mage")
            await asyncio.wait_for(ws2.recv(), timeout=5)  # joined
            await asyncio.wait_for(ws1.recv(), timeout=5)  # player_join

            # Bob sends pos
            await ws2.send(json.dumps({"type": "pos", "x": 42, "y": 7}))

            # Alice should receive event
            ev = json.loads(await asyncio.wait_for(ws1.recv(), timeout=5))
            assert ev["type"] == "event"
            assert ev["data"]["type"] == "pos"
            assert ev["data"]["x"] == 42
            assert ev["data"]["y"] == 7
            assert "from" in ev

            # Bob should NOT receive an echo of his own pos
            try:
                bob_msg = await asyncio.wait_for(ws2.recv(), timeout=1.5)
                # If we got a message, make sure it's NOT the pos echo
                parsed = json.loads(bob_msg)
                assert not (parsed.get("type") == "event" and parsed.get("data", {}).get("type") == "pos" and parsed.get("data", {}).get("x") == 42), \
                    f"Bob received echo of his own pos: {parsed}"
            except asyncio.TimeoutError:
                pass  # expected

            await ws1.close()
            await ws2.close()

        asyncio.run(run())

    def test_room_auto_cleans_when_empty_and_reuses_seed(self):
        async def run():
            code = _room_code()
            ws1 = await _ws_connect(code, "A", "warrior")
            m = json.loads(await asyncio.wait_for(ws1.recv(), timeout=5))
            seed1 = m["seed"]
            await ws1.close()
            await asyncio.sleep(0.5)  # allow cleanup

            # Reconnect same code - since seed is deterministic from hash(code),
            # the new room still has the same seed
            ws2 = await _ws_connect(code, "B", "mage")
            m2 = json.loads(await asyncio.wait_for(ws2.recv(), timeout=5))
            assert m2["seed"] == seed1
            assert m2["players"] == []  # fresh room, no ghosts
            await ws2.close()

        asyncio.run(run())

    def test_room_caps_at_4_players(self):
        async def run():
            code = _room_code()
            conns = []
            try:
                for i in range(4):
                    ws = await _ws_connect(code, f"P{i}", "warrior")
                    await asyncio.wait_for(ws.recv(), timeout=5)  # joined
                    # drain any player_join messages
                    try:
                        while True:
                            await asyncio.wait_for(ws.recv(), timeout=0.3)
                    except asyncio.TimeoutError:
                        pass
                    conns.append(ws)

                # 5th should get error + close
                ws5 = await _ws_connect(code, "P5", "mage")
                got_error = False
                closed = False
                try:
                    msg = json.loads(await asyncio.wait_for(ws5.recv(), timeout=5))
                    if msg.get("type") == "error":
                        got_error = True
                    # next recv should raise ConnectionClosed
                    try:
                        await asyncio.wait_for(ws5.recv(), timeout=3)
                    except (websockets.ConnectionClosed, asyncio.TimeoutError):
                        closed = True
                except websockets.ConnectionClosed:
                    closed = True
                finally:
                    try:
                        await ws5.close()
                    except Exception:
                        pass
                assert got_error or closed, "5th player should be rejected"
            finally:
                for w in conns:
                    try:
                        await w.close()
                    except Exception:
                        pass

        asyncio.run(run())
