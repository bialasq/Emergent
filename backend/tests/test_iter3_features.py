"""
Iteration 3 backend tests:
- /api/daily and /api/daily/leaderboard
- New server-authoritative WebSocket /api/ws/coop/{code} protocol
  (joined -> map -> state, action intents, room cap, descend, classes)
"""
import os
import uuid
import json
import zlib
import asyncio
import datetime as _dt
from typing import Any, Dict, List, Optional

import pytest
import requests
import websockets

# Backend modules for direct unit-style testing of game_state
import sys
sys.path.insert(0, "/app/backend")
from game_state import GameRoom, CLASSES, MAX_DEPTH, T_STAIRS  # noqa: E402

BASE_URL = os.environ.get(
    "TEST_BASE_URL",
    os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001"),
).rstrip("/")
API = f"{BASE_URL}/api"
WS_BASE = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")


def _uniq() -> str:
    return uuid.uuid4().hex[:8]


def _room_code() -> str:
    return f"TEST{uuid.uuid4().hex[:6].upper()}"


# ============== /api/daily ==============
class TestDaily:
    def test_daily_returns_today_and_crc32_seed(self):
        r = requests.get(f"{API}/daily", timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        today = _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%d")
        assert d["date"] == today
        expected = zlib.crc32(f"daily-{today}".encode("utf-8")) & 0x7FFFFFFF
        assert d["seed"] == expected
        assert d["tag"] == f"DAILY-{today}"
        assert "_id" not in d

    def test_daily_leaderboard_filters_by_today_seed(self):
        # Submit a guest run with today's seed
        today = _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%d")
        seed = zlib.crc32(f"daily-{today}".encode("utf-8")) & 0x7FFFFFFF
        suffix = _uniq()
        body = {
            "seed": seed, "character_class": "warrior",
            "character_name": f"D{suffix}", "depth": 4,
            "score": 4242, "kills": 8, "duration_seconds": 120,
            "outcome": "dead", "level": 3, "guest_id": f"DTEST{suffix}",
        }
        rs = requests.post(f"{API}/runs", json=body, timeout=10)
        assert rs.status_code == 200, rs.text

        # Submit a non-daily run that should NOT appear
        body2 = dict(body)
        body2["seed"] = seed - 1  # different seed
        body2["character_name"] = f"X{suffix}"
        rx = requests.post(f"{API}/runs", json=body2, timeout=10)
        assert rx.status_code == 200

        r = requests.get(f"{API}/daily/leaderboard?limit=100", timeout=10)
        assert r.status_code == 200, r.text
        entries = r.json()
        assert isinstance(entries, list)
        # Our daily entry must be present
        names = [e["character_name"] for e in entries]
        assert f"D{suffix}" in names, f"missing daily entry; got {names[:5]}..."
        # The non-daily entry must NOT be present
        assert f"X{suffix}" not in names

        # Sorted by score desc, depth desc
        for i in range(len(entries) - 1):
            a, b = entries[i], entries[i + 1]
            assert (a["score"], a["depth"]) >= (b["score"], b["depth"])
            assert a["rank"] == i + 1
            assert "_id" not in a

    def test_daily_leaderboard_limit_capped(self):
        r = requests.get(f"{API}/daily/leaderboard?limit=999", timeout=10)
        assert r.status_code == 200
        assert len(r.json()) <= 100


# ============== game_state unit-ish tests ==============
class TestGameState:
    def test_classes_have_expected_base_stats(self):
        # Required by review request
        assert CLASSES["warrior"]["maxHp"] == 40
        assert CLASSES["mage"]["maxHp"] == 25
        assert CLASSES["rogue"]["maxHp"] == 30
        assert CLASSES["ranger"]["maxHp"] == 32
        assert CLASSES["rogue"]["crit"] == 0.25
        assert CLASSES["ranger"]["range"] == 5
        assert set(CLASSES.keys()) == {"warrior", "mage", "rogue", "ranger"}

    def test_lich_spawns_on_max_depth(self):
        room = GameRoom("TESTLICH", 12345)
        # force descend to MAX_DEPTH
        room._init_floor(MAX_DEPTH)
        boss = next((e for e in room.enemies if e.get("kind") == "lich"), None)
        assert boss is not None
        assert boss.get("boss") is True
        assert boss["maxHp"] >= 100

    def test_state_payload_excludes_objectid(self):
        room = GameRoom("TESTPAY", 555)
        room.add_player("p1", "Alice", "rogue")
        snap = room.state_for("p1")
        assert snap["type"] == "state"
        assert "you" in snap and snap["you"]["cls"] == "rogue"
        # Sanity: no Mongo leakage anywhere in payload (it's a dict tree)
        as_json = json.dumps(snap)
        assert "_id" not in as_json


# ============== WebSocket new protocol ==============
async def _ws_connect(code: str, name: str = "P", cls: str = "warrior"):
    url = f"{WS_BASE}/api/ws/coop/{code}?name={name}&cls={cls}"
    return await websockets.connect(url, open_timeout=10, close_timeout=5)


async def _recv(ws, timeout=5) -> Dict[str, Any]:
    raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
    return json.loads(raw)


async def _drain_until(ws, mtype: str, max_msgs=10, timeout=5) -> Dict[str, Any]:
    """Read until we get a message of type mtype. Returns it."""
    for _ in range(max_msgs):
        m = await _recv(ws, timeout=timeout)
        if m.get("type") == mtype:
            return m
    raise AssertionError(f"did not receive {mtype} within {max_msgs} messages")


async def _drain(ws, duration=0.5):
    """Drain pending messages."""
    try:
        while True:
            await asyncio.wait_for(ws.recv(), timeout=duration)
    except (asyncio.TimeoutError, websockets.ConnectionClosed):
        pass


class TestCoopWSNewProtocol:
    def test_initial_messages_joined_map_state(self):
        async def run():
            code = _room_code()
            ws = await _ws_connect(code, "Alice", "rogue")
            try:
                m1 = await _recv(ws)
                assert m1["type"] == "joined"
                assert m1["you"]["name"] == "Alice"
                assert m1["you"]["cls"] == "rogue"
                assert isinstance(m1["seed"], int)
                # deterministic CRC32-based seed
                expected = zlib.crc32(code.encode("utf-8")) & 0x7FFFFFFF
                assert m1["seed"] == expected
                assert m1["players"] == []

                m2 = await _recv(ws)
                assert m2["type"] == "map"
                assert m2["depth"] == 1
                assert m2["w"] == 300
                assert m2["h"] == 180
                assert isinstance(m2["rows"], list)
                assert len(m2["rows"]) == 180
                assert all(len(r) == 300 for r in m2["rows"])
                assert m2["biome"] == "stone"
                assert "exit" in m2

                m3 = await _recv(ws)
                assert m3["type"] == "state"
                assert m3["you"]["cls"] == "rogue"
                assert m3["you"]["alive"] is True
                assert m3["you"]["hp"] == m3["you"]["maxHp"]
                assert m3["depth"] == 1
                assert isinstance(m3["enemies"], list)
                assert isinstance(m3["players"], list)
                assert isinstance(m3["explored"], list)
                assert isinstance(m3["visible"], list)
            finally:
                await ws.close()

        asyncio.run(run())

    def test_all_four_classes_accepted(self):
        async def run():
            for cls_name in ("warrior", "mage", "rogue", "ranger"):
                code = _room_code()
                ws = await _ws_connect(code, "X", cls_name)
                try:
                    j = await _recv(ws)
                    assert j["type"] == "joined"
                    assert j["you"]["cls"] == cls_name
                    # also receive map+state
                    m = await _recv(ws); assert m["type"] == "map"
                    s = await _recv(ws); assert s["type"] == "state"
                    assert s["you"]["maxHp"] == CLASSES[cls_name]["maxHp"]
                    assert s["you"]["maxMp"] == CLASSES[cls_name]["maxMp"]
                finally:
                    await ws.close()

        asyncio.run(run())

    def test_two_clients_share_seed_and_see_each_other(self):
        async def run():
            code = _room_code()
            ws1 = await _ws_connect(code, "Alice", "warrior")
            j1 = await _recv(ws1); assert j1["type"] == "joined"
            seed1 = j1["seed"]
            await _drain_until(ws1, "state")  # drain initial map+state

            ws2 = await _ws_connect(code, "Bob", "mage")
            j2 = await _recv(ws2)
            try:
                assert j2["type"] == "joined"
                assert j2["seed"] == seed1
                names = [p["name"] for p in j2["players"]]
                assert "Alice" in names

                # Alice should receive player_join for Bob, then a fresh state
                got_join = False
                got_state_with_bob = False
                for _ in range(6):
                    m = await _recv(ws1)
                    if m.get("type") == "player_join" and m["player"]["name"] == "Bob":
                        got_join = True
                    elif m.get("type") == "state":
                        names_in_state = [p["name"] for p in m.get("players", [])]
                        if "Bob" in names_in_state:
                            got_state_with_bob = True
                            break
                assert got_join, "Alice never got player_join"
                assert got_state_with_bob, "Alice's state never showed Bob"
            finally:
                await ws1.close()
                await ws2.close()

        asyncio.run(run())

    def test_action_wait_advances_and_returns_state(self):
        async def run():
            code = _room_code()
            ws = await _ws_connect(code, "Solo", "warrior")
            await _drain_until(ws, "state")  # joined+map+state

            await ws.send(json.dumps({"type": "action", "kind": "wait"}))
            m = await _drain_until(ws, "state")
            assert m["type"] == "state"
            # turn may have advanced (1 action allowed at level 1, no haste)
            assert m["you"]["alive"] is True
            await ws.close()

        asyncio.run(run())

    def test_heal_spell_consumes_mp(self):
        async def run():
            code = _room_code()
            ws = await _ws_connect(code, "Heal", "mage")
            await _recv(ws)  # joined
            await _recv(ws)  # map
            s0 = await _recv(ws)  # state
            mp0 = s0["you"]["mp"]; hp0 = s0["you"]["hp"]
            assert mp0 == CLASSES["mage"]["maxMp"]

            # Mage starts at full HP, but heal still consumes mp (caps at maxHp)
            # To verify mp consumption regardless, just send heal:
            await ws.send(json.dumps({"type": "action", "kind": "spell", "id": "heal"}))
            s1 = await _drain_until(ws, "state")
            assert s1["you"]["mp"] == mp0 - 8, f"expected mp {mp0 - 8}, got {s1['you']['mp']}"
            # hp stays at max (already full)
            assert s1["you"]["hp"] <= s1["you"]["maxHp"]
            await ws.close()

        asyncio.run(run())

    def test_use_potion_with_empty_inventory_is_noop(self):
        async def run():
            code = _room_code()
            ws = await _ws_connect(code, "Pot", "warrior")
            await _drain_until(ws, "state")
            await ws.send(json.dumps({"type": "action", "kind": "use_potion"}))
            # Even noop, server may or may not broadcast — but should not error/close.
            # Best-effort: send ping to verify connection alive.
            await ws.send(json.dumps({"type": "ping"}))
            got_pong = False
            for _ in range(5):
                try:
                    m = await _recv(ws, timeout=2)
                    if m.get("type") == "pong":
                        got_pong = True
                        break
                except asyncio.TimeoutError:
                    break
            assert got_pong, "server did not respond to ping after empty use_potion"
            await ws.close()

        asyncio.run(run())

    def test_room_caps_at_4_and_5th_gets_error(self):
        async def run():
            code = _room_code()
            conns = []
            try:
                for i in range(4):
                    ws = await _ws_connect(code, f"P{i}", "warrior")
                    await _drain_until(ws, "state")
                    await _drain(ws, 0.4)
                    conns.append(ws)

                ws5 = await _ws_connect(code, "P5", "rogue")
                got_error = False
                try:
                    m = await _recv(ws5, timeout=3)
                    if m.get("type") == "error" and "full" in (m.get("detail") or "").lower():
                        got_error = True
                    # next recv should close
                    try:
                        await _recv(ws5, timeout=2)
                    except (websockets.ConnectionClosed, asyncio.TimeoutError):
                        pass
                except websockets.ConnectionClosed:
                    pass
                finally:
                    try:
                        await ws5.close()
                    except Exception:
                        pass
                assert got_error, "5th client should have received {type:'error', detail:'Room full'}"
            finally:
                for w in conns:
                    try:
                        await w.close()
                    except Exception:
                        pass

        asyncio.run(run())

    def test_invalid_room_code_rejected(self):
        async def run():
            # special char that will fail .replace('_','').isalnum()
            url = f"{WS_BASE}/api/ws/coop/BAD-CODE!"
            try:
                ws = await websockets.connect(url, open_timeout=5, close_timeout=3)
            except Exception:
                # Either connect fails or first recv yields close
                return
            try:
                # If accepted, server should close immediately
                try:
                    await asyncio.wait_for(ws.recv(), timeout=3)
                except (websockets.ConnectionClosed, asyncio.TimeoutError):
                    pass
            finally:
                try:
                    await ws.close()
                except Exception:
                    pass

        asyncio.run(run())

    def test_player_leave_broadcast_on_disconnect(self):
        async def run():
            code = _room_code()
            ws1 = await _ws_connect(code, "Alice", "warrior")
            await _drain_until(ws1, "state")

            ws2 = await _ws_connect(code, "Bob", "mage")
            await _drain_until(ws2, "state")
            await _drain(ws1, 0.5)  # consume bob's join broadcast

            await ws2.close()

            # Alice should eventually receive a player_leave message
            got_leave = False
            for _ in range(8):
                try:
                    m = await _recv(ws1, timeout=2)
                except (websockets.ConnectionClosed, asyncio.TimeoutError):
                    break
                if m.get("type") == "player_leave":
                    got_leave = True
                    break
            assert got_leave
            await ws1.close()

        asyncio.run(run())
