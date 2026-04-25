"""
Authoritative server-side game state for coop rooms.

This is the source of truth for shared multiplayer dungeons:
- Map, enemies, items, FOV, combat all run on the server.
- Clients in coop mode send `action` intents and receive `state` snapshots.
- Solo mode is unaffected (clients run their own engine).
"""

from __future__ import annotations
import random
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple

# ---------- Constants (mirror frontend tiles.js) ----------
MAP_W = 300
MAP_H = 180
T_WALL = 0
T_FLOOR = 1
T_STAIRS = 3
MAX_DEPTH = 6

# ---------- Class & enemy definitions (mirror entities.js / spells.js) ----------
CLASSES: Dict[str, Dict[str, Any]] = {
    "warrior": {"maxHp": 40, "maxMp": 10, "atk": 6, "def": 3, "crit": 0.10, "range": 1, "dmg": (4, 8)},
    "mage":    {"maxHp": 25, "maxMp": 30, "atk": 4, "def": 1, "crit": 0.18, "range": 4, "dmg": (5, 10)},
    "rogue":   {"maxHp": 30, "maxMp": 15, "atk": 5, "def": 2, "crit": 0.25, "range": 1, "dmg": (3, 9)},
    "ranger":  {"maxHp": 32, "maxMp": 12, "atk": 5, "def": 2, "crit": 0.15, "range": 5, "dmg": (3, 8)},
}

ENEMIES: Dict[str, Dict[str, Any]] = {
    "rat":      {"name": "Dire Rat",     "tier": 1, "hp": 6,   "atk": 2,  "def": 0, "xp": 3,   "dmg": (1, 3)},
    "goblin":   {"name": "Goblin",       "tier": 1, "hp": 10,  "atk": 3,  "def": 1, "xp": 6,   "dmg": (1, 4)},
    "skeleton": {"name": "Skeleton",     "tier": 2, "hp": 14,  "atk": 4,  "def": 2, "xp": 10,  "dmg": (2, 5)},
    "orc":      {"name": "Orc Warrior",  "tier": 2, "hp": 20,  "atk": 5,  "def": 3, "xp": 14,  "dmg": (2, 6)},
    "wraith":   {"name": "Wraith",       "tier": 3, "hp": 16,  "atk": 7,  "def": 1, "xp": 20,  "dmg": (3, 7)},
    "troll":    {"name": "Troll",        "tier": 3, "hp": 32,  "atk": 8,  "def": 4, "xp": 28,  "dmg": (3, 8)},
    "golem":    {"name": "Stone Golem",  "tier": 4, "hp": 50,  "atk": 10, "def": 6, "xp": 45,  "dmg": (4, 10)},
    "wyvern":   {"name": "Wyvern",       "tier": 4, "hp": 55,  "atk": 12, "def": 3, "xp": 55,  "dmg": (5, 11)},
    "lich":     {"name": "Echo Lich",    "tier": 5, "hp": 220, "atk": 14, "def": 5, "xp": 250, "dmg": (6, 14), "boss": True},
}

ITEMS: Dict[str, Dict[str, Any]] = {
    "potion": {"name": "Health Potion", "value": 18, "kind": "potion"},
    "mana":   {"name": "Mana Phial",    "value": 14, "kind": "mana"},
    "gold":   {"name": "Gold",          "value": 0,  "kind": "gold"},
    "scroll": {"name": "Scroll of Echoes", "value": 20, "kind": "scroll"},
}

SPELLS: Dict[str, Dict[str, Any]] = {
    "heal":     {"mp": 8,  "amount": 18},
    "light":    {"mp": 5,  "turns": 15, "fov": 4},
    "haste":    {"mp": 10, "turns": 10},
    "fireball": {"mp": 12, "damage": 12, "radius": 1},
    "rope":     {"mp": 15},
}

XP_PER_LEVEL = lambda lvl: 10 + lvl * 8 + int(lvl * lvl * 1.5)

def spawn_table(depth: int) -> List[Tuple[str, int]]:
    if depth == 1: return [("rat", 5), ("goblin", 3)]
    if depth == 2: return [("rat", 3), ("goblin", 5), ("skeleton", 2)]
    if depth == 3: return [("goblin", 3), ("skeleton", 4), ("orc", 3), ("wraith", 1)]
    if depth == 4: return [("skeleton", 3), ("orc", 4), ("wraith", 3), ("troll", 2)]
    if depth == 5: return [("orc", 3), ("wraith", 3), ("troll", 4), ("golem", 2), ("wyvern", 2)]
    return [("troll", 2), ("golem", 3), ("wyvern", 3)]


def biome_for_depth(depth: int) -> str:
    if depth <= 2: return "stone"
    if depth <= 4: return "catacombs"
    return "infernal"


# ---------- BSP dungeon generation ----------
class _BSPNode:
    def __init__(self, x, y, w, h):
        self.x, self.y, self.w, self.h = x, y, w, h
        self.left = None
        self.right = None
        self.room = None

    def is_leaf(self) -> bool:
        return self.left is None and self.right is None

    def get_rooms(self) -> List[dict]:
        if self.room: return [self.room]
        out = []
        if self.left:  out += self.left.get_rooms()
        if self.right: out += self.right.get_rooms()
        return out


def _split(node, rng: random.Random, min_size=8) -> bool:
    can_h = node.w > node.h * 1.25
    can_v = node.h > node.w * 1.25
    if can_h and not can_v: split_h = False
    elif can_v and not can_h: split_h = True
    else: split_h = rng.random() < 0.5

    if split_h:
        max_v = node.h - min_size
        if max_v <= min_size: return False
        s = rng.randint(min_size, max_v)
        node.left = _BSPNode(node.x, node.y, node.w, s)
        node.right = _BSPNode(node.x, node.y + s, node.w, node.h - s)
    else:
        max_v = node.w - min_size
        if max_v <= min_size: return False
        s = rng.randint(min_size, max_v)
        node.left = _BSPNode(node.x, node.y, s, node.h)
        node.right = _BSPNode(node.x + s, node.y, node.w - s, node.h)
    return True


def _make_room(node, rng):
    pad, min_room = 1, 5
    max_w = max(min_room, node.w - pad * 2)
    max_h = max(min_room, node.h - pad * 2)
    w = rng.randint(min_room, max_w)
    h = rng.randint(min_room, max_h)
    x = node.x + pad + rng.randint(0, max(0, max_w - w))
    y = node.y + pad + rng.randint(0, max(0, max_h - h))
    node.room = {"x": x, "y": y, "w": w, "h": h, "cx": x + w // 2, "cy": y + h // 2}


def _carve_corridor(grid, ax, ay, bx, by, rng):
    if rng.random() < 0.5:
        for x in range(min(ax, bx), max(ax, bx) + 1): grid[ay][x] = T_FLOOR
        for y in range(min(ay, by), max(ay, by) + 1): grid[y][bx] = T_FLOOR
    else:
        for y in range(min(ay, by), max(ay, by) + 1): grid[y][ax] = T_FLOOR
        for x in range(min(ax, bx), max(ax, bx) + 1): grid[by][x] = T_FLOOR


def _connect(node, rng, grid):
    if node.is_leaf(): return
    _connect(node.left, rng, grid)
    _connect(node.right, rng, grid)
    la = node.left.get_rooms()
    lb = node.right.get_rooms()
    if not la or not lb: return
    a = rng.choice(la); b = rng.choice(lb)
    _carve_corridor(grid, a["cx"], a["cy"], b["cx"], b["cy"], rng)


def generate_dungeon(seed: int, depth: int):
    rng = random.Random(seed * 9719 + depth * 7)
    grid = [[T_WALL] * MAP_W for _ in range(MAP_H)]
    root = _BSPNode(1, 1, MAP_W - 2, MAP_H - 2)
    queue = [root]
    iters = 0
    while queue and iters < 200:
        n = queue.pop(0)
        if _split(n, rng):
            queue.append(n.left); queue.append(n.right)
        iters += 1

    leaves = []
    def _collect(nn):
        if nn.is_leaf(): leaves.append(nn)
        else:
            _collect(nn.left); _collect(nn.right)
    _collect(root)
    for leaf in leaves: _make_room(leaf, rng)
    for leaf in leaves:
        if leaf.room:
            r = leaf.room
            for y in range(r["y"], r["y"] + r["h"]):
                for x in range(r["x"], r["x"] + r["w"]):
                    grid[y][x] = T_FLOOR
    _connect(root, rng, grid)

    rooms = [l.room for l in leaves if l.room]
    start = rooms[0]
    far = rooms[-1]
    best = -1
    for r in rooms:
        d = abs(r["cx"] - start["cx"]) + abs(r["cy"] - start["cy"])
        if d > best: best = d; far = r
    if depth < MAX_DEPTH:
        grid[far["cy"]][far["cx"]] = T_STAIRS

    # ensure border walls
    for x in range(MAP_W): grid[0][x] = T_WALL; grid[MAP_H-1][x] = T_WALL
    for y in range(MAP_H): grid[y][0] = T_WALL; grid[y][MAP_W-1] = T_WALL

    return grid, rooms, (start["cx"], start["cy"]), (far["cx"], far["cy"]), rng


def is_walkable(grid, x, y) -> bool:
    if y < 0 or y >= MAP_H or x < 0 or x >= MAP_W: return False
    return grid[y][x] in (T_FLOOR, T_STAIRS)


# ---------- FOV (simple radius + LOS) ----------
def compute_fov(grid, ox: int, oy: int, radius: int) -> Set[Tuple[int, int]]:
    """Approximate shadowcasting via Bresenham LOS to each tile within radius."""
    vis: Set[Tuple[int, int]] = set()
    vis.add((ox, oy))
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            if dx*dx + dy*dy > radius*radius:
                continue
            tx, ty = ox + dx, oy + dy
            if tx < 0 or ty < 0 or tx >= MAP_W or ty >= MAP_H: continue
            if _line_clear(grid, ox, oy, tx, ty):
                vis.add((tx, ty))
    return vis


def _line_clear(grid, x0, y0, x1, y1) -> bool:
    """Bresenham; line of sight ends at first wall (wall itself counts as visible)."""
    dx = abs(x1 - x0); dy = abs(y1 - y0)
    sx = 1 if x0 < x1 else -1
    sy = 1 if y0 < y1 else -1
    err = dx - dy
    cx, cy = x0, y0
    while True:
        if (cx, cy) != (x0, y0):
            if grid[cy][cx] == T_WALL:
                return (cx, cy) == (x1, y1)
        if cx == x1 and cy == y1: return True
        e2 = 2 * err
        if e2 > -dy: err -= dy; cx += sx
        if e2 < dx:  err += dx; cy += sy


# ---------- Combat ----------
def roll_dice(rng: random.Random, mn: int, mx: int) -> int:
    return rng.randint(mn, mx)


def resolve_attack(rng, atk_dmg: Tuple[int, int], crit_chance: float, def_value: int, bonus: int = 0):
    is_crit = rng.random() < crit_chance
    dmg = roll_dice(rng, *atk_dmg) + bonus
    dmg = max(1, dmg - def_value)
    if is_crit: dmg = int(dmg * 1.75)
    return dmg, is_crit


# ---------- GameRoom ----------
@dataclass
class Player:
    pid: str
    name: str
    cls: str
    x: int = 0
    y: int = 0
    hp: float = 0
    max_hp: float = 0
    mp: float = 0
    max_mp: float = 0
    atk: int = 0
    deff: int = 0
    crit: float = 0.05
    range_: int = 1
    dmg: Tuple[int, int] = (1, 4)
    level: int = 1
    xp: int = 0
    next_xp: int = 0
    gold: int = 0
    inv_potions: int = 0
    inv_manas: int = 0
    light_turns: int = 0
    haste_turns: int = 0
    kills: int = 0
    score: int = 0
    alive: bool = True
    actions_this_turn: int = 0
    last_seen_visible: Set[Tuple[int, int]] = field(default_factory=set)
    explored: Set[Tuple[int, int]] = field(default_factory=set)

    @classmethod
    def make(cls_, pid: str, name: str, cls_key: str) -> "Player":
        c = CLASSES.get(cls_key, CLASSES["warrior"])
        p = cls_(
            pid=pid, name=name, cls=cls_key,
            hp=c["maxHp"], max_hp=c["maxHp"],
            mp=c["maxMp"], max_mp=c["maxMp"],
            atk=c["atk"], deff=c["def"], crit=c["crit"],
            range_=c["range"], dmg=tuple(c["dmg"]),
            level=1, xp=0, next_xp=XP_PER_LEVEL(1),
        )
        return p

    @property
    def fov_radius(self) -> int:
        return 9 + (4 if self.light_turns > 0 else 0)

    @property
    def extra_actions(self) -> int:
        e = 0
        if self.level >= 4: e = 1
        if self.level >= 8: e = 2
        if self.level >= 12: e = 3
        if self.haste_turns > 0: e += 1
        return e


class GameRoom:
    def __init__(self, code: str, seed: int):
        self.code = code
        self.seed = seed
        self.depth = 0
        self.players: Dict[str, Player] = {}
        self.enemies: List[dict] = []
        self.items: List[dict] = []
        self.grid: List[List[int]] = []
        self.rooms: List[dict] = []
        self.exit: Tuple[int, int] = (0, 0)
        self.start: Tuple[int, int] = (0, 0)
        self.rng: random.Random = random.Random(seed)
        self.log: List[dict] = []
        self.turn = 0
        self.victory = False
        self.created_at = time.time()
        self._init_floor(1)

    # ---------- floor ----------
    def _init_floor(self, depth: int):
        self.depth = depth
        self.grid, self.rooms, self.start, self.exit, self.rng = generate_dungeon(self.seed, depth)
        # spawn enemies
        self.enemies = []
        table = spawn_table(depth)
        target = (6 + depth * 2) * 6
        attempts = 0
        while len(self.enemies) < target and attempts < target * 4:
            attempts += 1
            r = self.rng.choice(self.rooms)
            if r is self.rooms[0]: continue
            x = self.rng.randint(r["x"] + 1, r["x"] + r["w"] - 2)
            y = self.rng.randint(r["y"] + 1, r["y"] + r["h"] - 2)
            if not is_walkable(self.grid, x, y): continue
            if any(e["x"] == x and e["y"] == y for e in self.enemies): continue
            kind = _weighted(self.rng, table)
            base = ENEMIES[kind]
            self.enemies.append({
                "id": f"e{len(self.enemies)}_{depth}",
                "kind": kind, "name": base["name"], "tier": base["tier"],
                "x": x, "y": y,
                "hp": base["hp"], "maxHp": base["hp"],
                "atk": base["atk"], "def": base["def"], "dmg": base["dmg"], "xp": base["xp"],
                "boss": base.get("boss", False),
                "alerted": False,
            })
        if depth == MAX_DEPTH:
            br = self.rooms[-1]
            base = ENEMIES["lich"]
            self.enemies.append({
                "id": "boss",
                "kind": "lich", "name": base["name"], "tier": 5,
                "x": br["cx"], "y": br["cy"],
                "hp": base["hp"], "maxHp": base["hp"],
                "atk": base["atk"], "def": base["def"], "dmg": base["dmg"], "xp": base["xp"],
                "boss": True, "alerted": False,
            })
        # items
        self.items = []
        item_count = int((4 + depth * 1.5) * 5)
        item_pool = ["potion", "potion", "mana", "gold", "gold", "scroll"]
        attempts = 0
        while len(self.items) < item_count and attempts < item_count * 3:
            attempts += 1
            r = self.rng.choice(self.rooms)
            x = self.rng.randint(r["x"] + 1, r["x"] + r["w"] - 2)
            y = self.rng.randint(r["y"] + 1, r["y"] + r["h"] - 2)
            if not is_walkable(self.grid, x, y): continue
            if any(it["x"] == x and it["y"] == y for it in self.items): continue
            kind = self.rng.choice(item_pool)
            amt = self.rng.randint(5, 15 + depth * 3) if kind == "gold" else ITEMS[kind]["value"]
            self.items.append({"kind": kind, "x": x, "y": y, "amount": amt, "name": ITEMS[kind]["name"]})

        # respawn living players to start
        for p in self.players.values():
            if not p.alive: continue
            p.x, p.y = self.start
            p.actions_this_turn = 0
            p.explored = set()
            self._update_fov(p)
        self._log(f"The crypt deepens — floor {depth}, {len(self.rooms)} chambers.")

    def biome(self) -> str:
        return biome_for_depth(self.depth)

    # ---------- players ----------
    def add_player(self, pid: str, name: str, cls: str) -> Player:
        cls_key = cls if cls in CLASSES else "warrior"
        p = Player.make(pid, name, cls_key)
        p.x, p.y = self.start
        self.players[pid] = p
        self._update_fov(p)
        self._log(f"{name} the {cls_key.title()} enters the crypt.")
        return p

    def remove_player(self, pid: str):
        if pid in self.players:
            name = self.players[pid].name
            self.players.pop(pid)
            self._log(f"{name} departs the crypt.")

    # ---------- actions ----------
    def handle(self, pid: str, msg: dict):
        p = self.players.get(pid)
        if not p or not p.alive: return None
        kind = msg.get("kind")
        if kind == "move":
            self._action_move(p, int(msg.get("dx", 0)), int(msg.get("dy", 0)))
        elif kind == "wait":
            self._end_action(p)
        elif kind == "spell":
            self._cast_spell(p, str(msg.get("id", "")))
        elif kind == "use_potion":
            self._use_potion(p)
        elif kind == "use_mana":
            self._use_mana(p)
        else:
            return None
        return True

    def _action_move(self, p: Player, dx: int, dy: int):
        if not (dx or dy): return
        nx, ny = p.x + dx, p.y + dy
        # adjacent enemy?
        adj = next((e for e in self.enemies if e["hp"] > 0 and e["x"] == nx and e["y"] == ny), None)
        if adj:
            self._melee(p, adj)
        elif p.cls in ("mage", "ranger") and (p.cls == "ranger" or p.mp >= 3):
            # ranged auto-cast in direction
            shot = self._ranged(p, dx, dy)
            if not shot:
                if is_walkable(self.grid, nx, ny):
                    p.x, p.y = nx, ny
                else:
                    self._log(f"{p.name} bumps the stone.")
        else:
            if is_walkable(self.grid, nx, ny):
                p.x, p.y = nx, ny
            else:
                self._log(f"{p.name} bumps the stone.")
        # check stairs auto-descend
        if self.grid[p.y][p.x] == T_STAIRS and self.depth < MAX_DEPTH:
            self._init_floor(self.depth + 1)
            return
        # pickup
        self._try_pickup(p)
        self._end_action(p)

    def _melee(self, p: Player, e: dict):
        bonus = p.atk - CLASSES[p.cls]["atk"]
        dmg, crit = resolve_attack(self.rng, p.dmg, p.crit, e["def"], bonus=bonus)
        e["hp"] -= dmg
        self._log(f"{p.name} strikes {e['name']} for {dmg}{' (crit!)' if crit else ''}.")
        if e["hp"] <= 0:
            self._kill(p, e)

    def _ranged(self, p: Player, dx: int, dy: int) -> bool:
        rng_max = p.range_
        for r in range(1, rng_max + 1):
            tx, ty = p.x + dx * r, p.y + dy * r
            if not is_walkable(self.grid, tx, ty): break
            tgt = next((e for e in self.enemies if e["hp"] > 0 and e["x"] == tx and e["y"] == ty), None)
            if tgt:
                bonus = (p.atk - CLASSES[p.cls]["atk"]) + 1
                dmg, crit = resolve_attack(self.rng, p.dmg, p.crit, tgt["def"], bonus=bonus)
                tgt["hp"] -= dmg
                if p.cls == "mage": p.mp = max(0, p.mp - 3)
                self._log(f"{p.name} hits {tgt['name']} from afar for {dmg}{' (crit!)' if crit else ''}.")
                if tgt["hp"] <= 0:
                    self._kill(p, tgt)
                return True
        return False

    def _kill(self, p: Player, e: dict):
        e["hp"] = 0
        p.kills += 1
        p.xp += e["xp"]
        p.score += e["xp"] * (1 + self.depth)
        self._log(f"{e['name']} falls to silence (+{e['xp']} XP for {p.name}).")
        if self.rng.random() < 0.3:
            kind = self.rng.choice(["potion", "mana", "gold"])
            amt = self.rng.randint(5, 15) if kind == "gold" else ITEMS[kind]["value"]
            self.items.append({"kind": kind, "x": e["x"], "y": e["y"], "amount": amt, "name": ITEMS[kind]["name"]})
        self.enemies = [en for en in self.enemies if en["hp"] > 0]
        # level up (auto-allocate +5 max HP each time on server-coop for simplicity)
        while p.xp >= p.next_xp:
            p.xp -= p.next_xp
            p.level += 1
            p.next_xp = XP_PER_LEVEL(p.level)
            p.max_hp += 5; p.hp = min(p.max_hp, p.hp + 5)
            self._log(f"{p.name} ascends to level {p.level}.")
        if e.get("boss"):
            self.victory = True
            self._log(f"The Echo Lich crumbles. {p.name} delivers the final blow.")

    def _try_pickup(self, p: Player):
        idx = next((i for i, it in enumerate(self.items) if it["x"] == p.x and it["y"] == p.y), -1)
        if idx == -1: return
        it = self.items.pop(idx)
        if it["kind"] == "gold":
            p.gold += it["amount"]; p.score += it["amount"]
            self._log(f"{p.name} picks up {it['amount']} gold.")
        elif it["kind"] == "scroll":
            p.xp += it["amount"]
            while p.xp >= p.next_xp:
                p.xp -= p.next_xp; p.level += 1; p.next_xp = XP_PER_LEVEL(p.level)
                p.max_hp += 5; p.hp = min(p.max_hp, p.hp + 5)
                self._log(f"{p.name} ascends to level {p.level}.")
        elif it["kind"] == "potion":
            p.inv_potions += 1
        elif it["kind"] == "mana":
            p.inv_manas += 1
        self._log(f"{p.name} picks up {it['name']}.")

    def _use_potion(self, p: Player):
        if p.inv_potions <= 0: return
        p.inv_potions -= 1
        p.hp = min(p.max_hp, p.hp + 18)
        self._log(f"{p.name} quaffs a potion (+18 HP).")
        self._end_action(p)

    def _use_mana(self, p: Player):
        if p.inv_manas <= 0: return
        p.inv_manas -= 1
        p.mp = min(p.max_mp, p.mp + 14)
        self._log(f"{p.name} drinks a mana phial (+14 MP).")
        self._end_action(p)

    def _cast_spell(self, p: Player, sid: str):
        s = SPELLS.get(sid)
        if not s: return
        if p.mp < s["mp"]: return
        if sid == "heal":
            p.hp = min(p.max_hp, p.hp + s["amount"])
            self._log(f"{p.name} weaves Mend (+{s['amount']} HP).")
        elif sid == "light":
            p.light_turns = s["turns"]
            self._log(f"{p.name} ignites Candleflame.")
        elif sid == "haste":
            p.haste_turns = s["turns"]
            self._log(f"{p.name} steps quickly.")
        elif sid == "fireball":
            tgt = None; best = 9999
            vis = compute_fov(self.grid, p.x, p.y, p.fov_radius)
            for e in self.enemies:
                if e["hp"] <= 0: continue
                if (e["x"], e["y"]) not in vis: continue
                d = abs(e["x"] - p.x) + abs(e["y"] - p.y)
                if d < best: best = d; tgt = e
            if not tgt: return
            for e in self.enemies:
                if e["hp"] <= 0: continue
                if abs(e["x"] - tgt["x"]) <= s["radius"] and abs(e["y"] - tgt["y"]) <= s["radius"]:
                    dmg = max(3, s["damage"] + int(p.level * 1.5) - e["def"])
                    e["hp"] -= dmg
                    if e["hp"] <= 0: self._kill(p, e)
            self._log(f"{p.name} unleashes Ember Burst near {tgt['name']}.")
        elif sid == "rope":
            # teleport to known stairs (server tracks per-player explored)
            if (self.exit[0], self.exit[1]) not in p.explored: return
            p.x, p.y = self.exit
            self._log(f"{p.name} snaps to the stairway with Binding Rope.")
        p.mp -= s["mp"]
        self._end_action(p)

    def _end_action(self, p: Player):
        p.actions_this_turn += 1
        allowed = 1 + p.extra_actions
        if p.actions_this_turn >= allowed:
            self._enemies_act()
            p.actions_this_turn = 0
            if p.light_turns > 0: p.light_turns -= 1
            if p.haste_turns > 0: p.haste_turns -= 1
            p.mp = min(p.max_mp, p.mp + 0.08)
            self.turn += 1
        self._update_fov(p)

    def _update_fov(self, p: Player):
        vis = compute_fov(self.grid, p.x, p.y, p.fov_radius)
        p.last_seen_visible = vis
        for c in vis:
            p.explored.add(c)

    def _enemies_act(self):
        if not self.players: return
        living = [p for p in self.players.values() if p.alive]
        if not living: return
        for e in self.enemies:
            if e["hp"] <= 0: continue
            # find closest living player
            target = min(living, key=lambda pp: abs(pp.x - e["x"]) + abs(pp.y - e["y"]))
            if not e["alerted"]:
                if (e["x"], e["y"]) in target.last_seen_visible:
                    e["alerted"] = True
                else:
                    continue
            dx = target.x - e["x"]; dy = target.y - e["y"]
            dist = abs(dx) + abs(dy)
            if dist == 1:
                dmg, crit = resolve_attack(self.rng, e["dmg"], 0.05, target.deff)
                target.hp -= dmg
                self._log(f"{e['name']} strikes {target.name} for {dmg}{' (crit)' if crit else ''}.")
                if target.hp <= 0:
                    target.hp = 0; target.alive = False
                    self._log(f"{target.name} falls. Their echo fades.")
            elif dist <= 12:
                sx = (1 if dx > 0 else (-1 if dx < 0 else 0))
                sy = (1 if dy > 0 else (-1 if dy < 0 else 0))
                tries = [(sx, 0), (0, sy), (sx, sy)] if abs(dx) > abs(dy) else [(0, sy), (sx, 0), (sx, sy)]
                for mx, my in tries:
                    nx, ny = e["x"] + mx, e["y"] + my
                    if any(p.x == nx and p.y == ny and p.alive for p in self.players.values()): continue
                    if not is_walkable(self.grid, nx, ny): continue
                    if any(en is not e and en["hp"] > 0 and en["x"] == nx and en["y"] == ny for en in self.enemies): continue
                    e["x"], e["y"] = nx, ny
                    break

    def _log(self, msg: str):
        self.log.append({"msg": msg, "turn": self.turn, "t": time.time()})
        if len(self.log) > 80: self.log = self.log[-80:]

    # ---------- snapshots ----------
    def map_payload(self) -> dict:
        # Encode each row as a hex string (0/1/3 → digits 0-9). 3 ints fit in single nibble.
        rows = []
        for row in self.grid:
            rows.append("".join(str(t) for t in row))
        return {"depth": self.depth, "biome": self.biome(),
                "w": MAP_W, "h": MAP_H,
                "rows": rows, "exit": list(self.exit), "victory_only": self.depth == MAX_DEPTH}

    def state_for(self, pid: str) -> dict:
        me = self.players.get(pid)
        if me is None: return {}
        vis = me.last_seen_visible
        # only send entities visible to this player, plus self
        visible_enemies = [
            {"id": e["id"], "kind": e["kind"], "x": e["x"], "y": e["y"],
             "hp": e["hp"], "maxHp": e["maxHp"], "boss": e.get("boss", False)}
            for e in self.enemies if e["hp"] > 0 and (e["x"], e["y"]) in vis
        ]
        visible_items = [
            {"kind": it["kind"], "x": it["x"], "y": it["y"]}
            for it in self.items if (it["x"], it["y"]) in vis
        ]
        # other players (always visible if same depth)
        others = []
        for p in self.players.values():
            if p.pid == pid: continue
            others.append({"id": p.pid, "name": p.name, "cls": p.cls, "x": p.x, "y": p.y, "hp": p.hp, "maxHp": p.max_hp, "alive": p.alive})
        explored_list = list(me.explored)
        visible_list = list(vis)
        return {
            "type": "state",
            "depth": self.depth,
            "turn": self.turn,
            "victory": self.victory,
            "you": {
                "id": me.pid, "name": me.name, "cls": me.cls,
                "x": me.x, "y": me.y,
                "hp": me.hp, "maxHp": me.max_hp,
                "mp": me.mp, "maxMp": me.max_mp,
                "level": me.level, "xp": me.xp, "nextXp": me.next_xp,
                "atk": me.atk, "def": me.deff,
                "kills": me.kills, "score": me.score, "gold": me.gold,
                "potions": me.inv_potions, "manas": me.inv_manas,
                "lightTurns": me.light_turns, "hasteTurns": me.haste_turns,
                "extraActions": me.extra_actions, "actionsThisTurn": me.actions_this_turn,
                "fov": me.fov_radius, "alive": me.alive,
            },
            "players": others,
            "enemies": visible_enemies,
            "items": visible_items,
            "explored": explored_list,
            "visible": visible_list,
            "log": self.log[-12:],
        }


# ---------- helpers ----------
def _weighted(rng: random.Random, table: List[Tuple[str, int]]) -> str:
    total = sum(w for _, w in table)
    r = rng.random() * total
    for k, w in table:
        r -= w
        if r <= 0: return k
    return table[0][0]
