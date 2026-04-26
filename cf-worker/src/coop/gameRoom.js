// Authoritative coop game state — ported from backend/game_state.py (parity of rules).
import { Prng } from "./prng.js";

export const MAP_W = 300;
export const MAP_H = 180;
const T_WALL = 0;
const T_FLOOR = 1;
const T_STAIRS = 3;
const MAX_DEPTH = 5;

const CLASSES = {
  warrior: { maxHp: 40, maxMp: 10, atk: 6, def: 3, crit: 0.1, range: 1, dmg: [4, 8] },
  mage: { maxHp: 25, maxMp: 30, atk: 4, def: 1, crit: 0.18, range: 4, dmg: [5, 10] },
  rogue: { maxHp: 30, maxMp: 15, atk: 5, def: 2, crit: 0.25, range: 1, dmg: [3, 9] },
  ranger: { maxHp: 32, maxMp: 12, atk: 5, def: 2, crit: 0.15, range: 5, dmg: [3, 8] },
};

const ENEMIES = {
  rat: { name: "Dire Rat", tier: 1, hp: 6, atk: 2, def: 0, xp: 3, dmg: [1, 3] },
  goblin: { name: "Goblin", tier: 1, hp: 10, atk: 3, def: 1, xp: 6, dmg: [1, 4] },
  skeleton: { name: "Skeleton", tier: 2, hp: 14, atk: 4, def: 2, xp: 10, dmg: [2, 5] },
  orc: { name: "Orc Warrior", tier: 2, hp: 20, atk: 5, def: 3, xp: 14, dmg: [2, 6] },
  wraith: { name: "Wraith", tier: 3, hp: 16, atk: 7, def: 1, xp: 20, dmg: [3, 7] },
  troll: { name: "Troll", tier: 3, hp: 32, atk: 8, def: 4, xp: 28, dmg: [3, 8] },
  golem: { name: "Stone Golem", tier: 4, hp: 50, atk: 10, def: 6, xp: 45, dmg: [4, 10] },
  wyvern: { name: "Wyvern", tier: 4, hp: 55, atk: 12, def: 3, xp: 55, dmg: [5, 11] },
  lich: { name: "Echo Lich", tier: 5, hp: 120, atk: 14, def: 5, xp: 150, dmg: [6, 14], boss: true },
};

const ITEMS = {
  potion: { name: "Health Potion", value: 18, kind: "potion" },
  mana: { name: "Mana Phial", value: 14, kind: "mana" },
  gold: { name: "Gold", value: 0, kind: "gold" },
  scroll: { name: "Scroll of Echoes", value: 20, kind: "scroll" },
};

const SPELLS = {
  heal: { mp: 8, amount: 18 },
  light: { mp: 5, turns: 15, fov: 4 },
  haste: { mp: 10, turns: 10 },
  fireball: { mp: 12, damage: 12, radius: 1 },
  rope: { mp: 15 },
};

function xpPerLevel(lvl) {
  return 10 + lvl * 8 + Math.floor(lvl * lvl * 1.5);
}

function spawnTable(depth) {
  if (depth === 1) return [["rat", 5], ["goblin", 3]];
  if (depth === 2) return [["rat", 3], ["goblin", 5], ["skeleton", 2]];
  if (depth === 3) return [["goblin", 3], ["skeleton", 4], ["orc", 3], ["wraith", 1]];
  if (depth === 4) return [["skeleton", 3], ["orc", 4], ["wraith", 3], ["troll", 2]];
  if (depth === 5) return [["orc", 3], ["wraith", 3], ["troll", 4], ["golem", 2], ["wyvern", 2]];
  return [["troll", 2], ["golem", 3], ["wyvern", 3]];
}

function biomeForDepth(depth) {
  if (depth <= 2) return "stone";
  if (depth <= 4) return "catacombs";
  return "infernal";
}

class BSPNode {
  constructor(x, y, w, h) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.left = null;
    this.right = null;
    this.room = null;
  }
  isLeaf() {
    return !this.left && !this.right;
  }
  getRooms() {
    if (this.room) return [this.room];
    const out = [];
    if (this.left) out.push(...this.left.getRooms());
    if (this.right) out.push(...this.right.getRooms());
    return out;
  }
}

function split(node, rng, minSize = 8) {
  const canH = node.w > node.h * 1.25;
  const canV = node.h > node.w * 1.25;
  let splitH;
  if (canH && !canV) splitH = false;
  else if (canV && !canH) splitH = true;
  else splitH = rng.random() < 0.5;

  if (splitH) {
    const maxV = node.h - minSize;
    if (maxV <= minSize) return false;
    const s = rng.int(minSize, maxV);
    node.left = new BSPNode(node.x, node.y, node.w, s);
    node.right = new BSPNode(node.x, node.y + s, node.w, node.h - s);
  } else {
    const maxV = node.w - minSize;
    if (maxV <= minSize) return false;
    const s = rng.int(minSize, maxV);
    node.left = new BSPNode(node.x, node.y, s, node.h);
    node.right = new BSPNode(node.x + s, node.y, node.w - s, node.h);
  }
  return true;
}

function makeRoom(node, rng) {
  const pad = 1;
  const minRoom = 5;
  const maxW = Math.max(minRoom, node.w - pad * 2);
  const maxH = Math.max(minRoom, node.h - pad * 2);
  const w = rng.int(minRoom, maxW);
  const h = rng.int(minRoom, maxH);
  const x = node.x + pad + rng.int(0, Math.max(0, maxW - w));
  const y = node.y + pad + rng.int(0, Math.max(0, maxH - h));
  node.room = { x, y, w, h, cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2) };
}

function carveCorridor(grid, ax, ay, bx, by, rng) {
  if (rng.random() < 0.5) {
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) grid[ay][x] = T_FLOOR;
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) grid[y][bx] = T_FLOOR;
  } else {
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) grid[y][ax] = T_FLOOR;
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) grid[by][x] = T_FLOOR;
  }
}

function connect(node, rng, grid) {
  if (node.isLeaf()) return;
  connect(node.left, rng, grid);
  connect(node.right, rng, grid);
  const la = node.left.getRooms();
  const lb = node.right.getRooms();
  if (!la.length || !lb.length) return;
  const a = rng.choice(la);
  const b = rng.choice(lb);
  carveCorridor(grid, a.cx, a.cy, b.cx, b.cy, rng);
}

function generateDungeon(seed, depth) {
  const rng = new Prng((seed * 9719 + depth * 7) >>> 0);
  const grid = Array.from({ length: MAP_H }, () => new Array(MAP_W).fill(T_WALL));
  const root = new BSPNode(1, 1, MAP_W - 2, MAP_H - 2);
  const queue = [root];
  let iters = 0;
  while (queue.length && iters < 200) {
    const n = queue.shift();
    if (split(n, rng)) {
      queue.push(n.left, n.right);
    }
    iters++;
  }
  const leaves = [];
  function collect(nn) {
    if (nn.isLeaf()) leaves.push(nn);
    else {
      collect(nn.left);
      collect(nn.right);
    }
  }
  collect(root);
  for (const leaf of leaves) makeRoom(leaf, rng);
  for (const leaf of leaves) {
    if (leaf.room) {
      const r = leaf.room;
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          grid[y][x] = T_FLOOR;
        }
      }
    }
  }
  connect(root, rng, grid);
  const rooms = leaves.map((l) => l.room).filter(Boolean);
  const start = rooms[0];
  let far = rooms[rooms.length - 1];
  let best = -1;
  for (const r of rooms) {
    const d = Math.abs(r.cx - start.cx) + Math.abs(r.cy - start.cy);
    if (d > best) {
      best = d;
      far = r;
    }
  }
  if (depth < MAX_DEPTH) grid[far.cy][far.cx] = T_STAIRS;
  for (let x = 0; x < MAP_W; x++) {
    grid[0][x] = T_WALL;
    grid[MAP_H - 1][x] = T_WALL;
  }
  for (let y = 0; y < MAP_H; y++) {
    grid[y][0] = T_WALL;
    grid[y][MAP_W - 1] = T_WALL;
  }
  return { grid, rooms, start: [start.cx, start.cy], exit: [far.cx, far.cy], rng };
}

function isWalkable(grid, x, y) {
  if (y < 0 || y >= MAP_H || x < 0 || x >= MAP_W) return false;
  const t = grid[y][x];
  return t === T_FLOOR || t === T_STAIRS;
}

function lineClear(grid, x0, y0, x1, y1) {
  let dx = Math.abs(x1 - x0);
  let dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let cx = x0;
  let cy = y0;
  while (true) {
    if (cx !== x0 || cy !== y0) {
      if (grid[cy][cx] === T_WALL) {
        return cx === x1 && cy === y1;
      }
    }
    if (cx === x1 && cy === y1) return true;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      cx += sx;
    }
    if (e2 < dx) {
      err += dx;
      cy += sy;
    }
  }
}

function computeFov(grid, ox, oy, radius) {
  /** @type {Set<string>} */
  const vis = new Set();
  vis.add(`${ox},${oy}`);
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const tx = ox + dx;
      const ty = oy + dy;
      if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
      if (lineClear(grid, ox, oy, tx, ty)) vis.add(`${tx},${ty}`);
    }
  }
  return vis;
}

function rollDice(rng, mn, mx) {
  return rng.int(mn, mx);
}

function resolveAttack(rng, atkDmg, critChance, defValue, bonus = 0) {
  const isCrit = rng.random() < critChance;
  let dmg = rollDice(rng, atkDmg[0], atkDmg[1]) + bonus;
  dmg = Math.max(1, dmg - defValue);
  if (isCrit) dmg = Math.floor(dmg * 1.75);
  return [dmg, isCrit];
}

function weighted(rng, table) {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let r = rng.random() * total;
  for (const [k, w] of table) {
    r -= w;
    if (r <= 0) return k;
  }
  return table[0][0];
}

function makePlayer(pid, name, clsKey) {
  const c = CLASSES[clsKey] || CLASSES.warrior;
  return {
    pid,
    name,
    cls: clsKey,
    x: 0,
    y: 0,
    hp: c.maxHp,
    max_hp: c.maxHp,
    mp: c.maxMp,
    max_mp: c.maxMp,
    atk: c.atk,
    deff: c.def,
    crit: c.crit,
    range_: c.range,
    dmg: [...c.dmg],
    level: 1,
    xp: 0,
    next_xp: xpPerLevel(1),
    gold: 0,
    inv_potions: 0,
    inv_manas: 0,
    light_turns: 0,
    haste_turns: 0,
    kills: 0,
    score: 0,
    alive: true,
    actions_this_turn: 0,
    round_done: false,
    last_seen_visible: new Set(),
    explored: new Set(),
  };
}

function fovRadius(p) {
  return 9 + (p.light_turns > 0 ? 4 : 0);
}

function extraActions(p) {
  let e = 0;
  if (p.level >= 4) e = 1;
  if (p.level >= 8) e = 2;
  if (p.level >= 12) e = 3;
  if (p.haste_turns > 0) e += 1;
  return e;
}

export class GameRoom {
  /** @param {string} code @param {number} seed */
  constructor(code, seed) {
    this.code = code;
    this.seed = seed;
    this.depth = 0;
    /** @type {Record<string, ReturnType<typeof makePlayer>>} */
    this.players = {};
    this.enemies = [];
    this.items = [];
    this.grid = [];
    this.rooms = [];
    this.exit = [0, 0];
    this.start = [0, 0];
    /** @type {Prng} */
    this.rng = new Prng(seed);
    this.log = [];
    this.turn = 0;
    this.victory = false;
    this.created_at = Date.now() / 1000;
    this._initFloor(1);
  }

  _initFloor(depth) {
    this.depth = depth;
    const d = generateDungeon(this.seed, depth);
    this.grid = d.grid;
    this.rooms = d.rooms;
    this.start = d.start;
    this.exit = d.exit;
    this.rng = d.rng;
    this.enemies = [];
    const table = spawnTable(depth);
    const target = (6 + depth * 2) * 6;
    let attempts = 0;
    while (this.enemies.length < target && attempts < target * 4) {
      attempts++;
      const r = this.rng.choice(this.rooms);
      if (r === this.rooms[0]) continue;
      const x = this.rng.int(r.x + 1, r.x + r.w - 2);
      const y = this.rng.int(r.y + 1, r.y + r.h - 2);
      if (!isWalkable(this.grid, x, y)) continue;
      if (this.enemies.some((e) => e.x === x && e.y === y)) continue;
      const kind = weighted(this.rng, table);
      const base = ENEMIES[kind];
      this.enemies.push({
        id: `e${this.enemies.length}_${depth}`,
        kind,
        name: base.name,
        tier: base.tier,
        x,
        y,
        hp: base.hp,
        maxHp: base.hp,
        atk: base.atk,
        def: base.def,
        dmg: [...base.dmg],
        xp: base.xp,
        boss: !!base.boss,
        alerted: false,
      });
    }
    if (depth === MAX_DEPTH) {
      const br = this.rooms[this.rooms.length - 1];
      const base = ENEMIES.lich;
      this.enemies.push({
        id: "boss",
        kind: "lich",
        name: base.name,
        tier: 5,
        x: br.cx,
        y: br.cy,
        hp: base.hp,
        maxHp: base.hp,
        atk: base.atk,
        def: base.def,
        dmg: [...base.dmg],
        xp: base.xp,
        boss: true,
        alerted: false,
      });
    }
    this.items = [];
    const itemCount = Math.floor((4 + depth * 1.5) * 5);
    const itemPool = ["potion", "potion", "mana", "gold", "gold", "scroll"];
    attempts = 0;
    while (this.items.length < itemCount && attempts < itemCount * 3) {
      attempts++;
      const r = this.rng.choice(this.rooms);
      const x = this.rng.int(r.x + 1, r.x + r.w - 2);
      const y = this.rng.int(r.y + 1, r.y + r.h - 2);
      if (!isWalkable(this.grid, x, y)) continue;
      if (this.items.some((it) => it.x === x && it.y === y)) continue;
      const kind = this.rng.choice(itemPool);
      const amt = kind === "gold" ? this.rng.int(5, 15 + depth * 3) : ITEMS[kind].value;
      this.items.push({ kind, x, y, amount: amt, name: ITEMS[kind].name });
    }
    for (const p of Object.values(this.players)) {
      if (!p.alive) continue;
      p.x = this.start[0];
      p.y = this.start[1];
      p.actions_this_turn = 0;
      p.round_done = false;
      p.explored = new Set();
      this._updateFov(p);
    }
    this._log(`The crypt deepens — floor ${depth}, ${this.rooms.length} chambers.`);
  }

  biome() {
    return biomeForDepth(this.depth);
  }

  addPlayer(pid, name, cls) {
    const clsKey = ["warrior", "mage", "rogue", "ranger"].includes(cls) ? cls : "warrior";
    const p = makePlayer(pid, name, clsKey);
    p.x = this.start[0];
    p.y = this.start[1];
    this.players[pid] = p;
    for (const op of Object.values(this.players)) {
      op.round_done = false;
      op.actions_this_turn = 0;
    }
    this._updateFov(p);
    this._log(`${name} the ${clsKey.charAt(0).toUpperCase() + clsKey.slice(1)} enters the crypt.`);
    return p;
  }

  removePlayer(pid) {
    if (!this.players[pid]) return;
    const name = this.players[pid].name;
    delete this.players[pid];
    this._log(`${name} departs the crypt.`);
    for (const op of Object.values(this.players)) {
      if (op.alive) {
        op.round_done = false;
        op.actions_this_turn = 0;
      }
    }
  }

  handle(pid, msg) {
    const p = this.players[pid];
    if (!p || !p.alive) return null;
    const kind = msg.kind;
    if (kind === "move") this._actionMove(p, Number(msg.dx) || 0, Number(msg.dy) || 0);
    else if (kind === "wait") this._endAction(p);
    else if (kind === "spell") this._castSpell(p, String(msg.id || ""));
    else if (kind === "use_potion") this._usePotion(p);
    else if (kind === "use_mana") this._useMana(p);
    else return null;
    return true;
  }

  _actionMove(p, dx, dy) {
    if (!dx && !dy) return;
    const nx = p.x + dx;
    const ny = p.y + dy;
    const adj = this.enemies.find((e) => e.hp > 0 && e.x === nx && e.y === ny);
    if (adj) this._melee(p, adj);
    else if ((p.cls === "mage" || p.cls === "ranger") && (p.cls === "ranger" || p.mp >= 3)) {
      const shot = this._ranged(p, dx, dy);
      if (!shot) {
        if (isWalkable(this.grid, nx, ny)) {
          p.x = nx;
          p.y = ny;
        } else this._log(`${p.name} bumps the stone.`);
      }
    } else {
      if (isWalkable(this.grid, nx, ny)) {
        p.x = nx;
        p.y = ny;
      } else this._log(`${p.name} bumps the stone.`);
    }
    if (this.grid[p.y][p.x] === T_STAIRS && this.depth < MAX_DEPTH) {
      this._initFloor(this.depth + 1);
      return;
    }
    this._tryPickup(p);
    this._endAction(p);
  }

  _melee(p, e) {
    const bonus = p.atk - CLASSES[p.cls].atk;
    const [dmg, crit] = resolveAttack(this.rng, p.dmg, p.crit, e.def, bonus);
    e.hp -= dmg;
    this._log(`${p.name} strikes ${e.name} for ${dmg}${crit ? " (crit!)" : ""}.`);
    if (e.hp <= 0) this._kill(p, e);
  }

  _ranged(p, dx, dy) {
    for (let r = 1; r <= p.range_; r++) {
      const tx = p.x + dx * r;
      const ty = p.y + dy * r;
      if (!isWalkable(this.grid, tx, ty)) break;
      const tgt = this.enemies.find((e) => e.hp > 0 && e.x === tx && e.y === ty);
      if (tgt) {
        const bonus = p.atk - CLASSES[p.cls].atk + 1;
        const [dmg, crit] = resolveAttack(this.rng, p.dmg, p.crit, tgt.def, bonus);
        tgt.hp -= dmg;
        if (p.cls === "mage") p.mp = Math.max(0, p.mp - 3);
        this._log(`${p.name} hits ${tgt.name} from afar for ${dmg}${crit ? " (crit!)" : ""}.`);
        if (tgt.hp <= 0) this._kill(p, tgt);
        return true;
      }
    }
    return false;
  }

  _kill(p, e) {
    e.hp = 0;
    p.kills += 1;
    p.xp += e.xp;
    p.score += e.xp * (1 + this.depth);
    this._log(`${e.name} falls to silence (+${e.xp} XP for ${p.name}).`);
    if (this.rng.random() < 0.3) {
      const kind = this.rng.choice(["potion", "mana", "gold"]);
      const amt = kind === "gold" ? this.rng.int(5, 15) : ITEMS[kind].value;
      this.items.push({ kind, x: e.x, y: e.y, amount: amt, name: ITEMS[kind].name });
    }
    this.enemies = this.enemies.filter((en) => en.hp > 0);
    while (p.xp >= p.next_xp) {
      p.xp -= p.next_xp;
      p.level += 1;
      p.next_xp = xpPerLevel(p.level);
      p.max_hp += 5;
      p.hp = Math.min(p.max_hp, p.hp + 5);
      this._log(`${p.name} ascends to level ${p.level}.`);
    }
    if (e.boss) {
      this.victory = true;
      this._log(`The Echo Lich crumbles. ${p.name} delivers the final blow.`);
    }
  }

  _tryPickup(p) {
    const idx = this.items.findIndex((it) => it.x === p.x && it.y === p.y);
    if (idx === -1) return;
    const it = this.items.splice(idx, 1)[0];
    if (it.kind === "gold") {
      p.gold += it.amount;
      p.score += it.amount;
      this._log(`${p.name} picks up ${it.amount} gold.`);
    } else if (it.kind === "scroll") {
      p.xp += it.amount;
      while (p.xp >= p.next_xp) {
        p.xp -= p.next_xp;
        p.level += 1;
        p.next_xp = xpPerLevel(p.level);
        p.max_hp += 5;
        p.hp = Math.min(p.max_hp, p.hp + 5);
        this._log(`${p.name} ascends to level ${p.level}.`);
      }
    } else if (it.kind === "potion") p.inv_potions += 1;
    else if (it.kind === "mana") p.inv_manas += 1;
    this._log(`${p.name} picks up ${it.name}.`);
  }

  _usePotion(p) {
    if (p.inv_potions <= 0) return;
    p.inv_potions -= 1;
    p.hp = Math.min(p.max_hp, p.hp + 18);
    this._log(`${p.name} quaffs a potion (+18 HP).`);
    this._endAction(p);
  }

  _useMana(p) {
    if (p.inv_manas <= 0) return;
    p.inv_manas -= 1;
    p.mp = Math.min(p.max_mp, p.mp + 14);
    this._log(`${p.name} drinks a mana phial (+14 MP).`);
    this._endAction(p);
  }

  _castSpell(p, sid) {
    const s = SPELLS[sid];
    if (!s) return;
    if (p.mp < s.mp) return;
    if (sid === "heal") {
      p.hp = Math.min(p.max_hp, p.hp + s.amount);
      this._log(`${p.name} weaves Mend (+${s.amount} HP).`);
    } else if (sid === "light") {
      p.light_turns = s.turns;
      this._log(`${p.name} ignites Candleflame.`);
    } else if (sid === "haste") {
      p.haste_turns = s.turns;
      this._log(`${p.name} steps quickly.`);
    } else if (sid === "fireball") {
      let tgt = null;
      let best = 9999;
      const vis = computeFov(this.grid, p.x, p.y, fovRadius(p));
      for (const e of this.enemies) {
        if (e.hp <= 0) continue;
        if (!vis.has(`${e.x},${e.y}`)) continue;
        const d = Math.abs(e.x - p.x) + Math.abs(e.y - p.y);
        if (d < best) {
          best = d;
          tgt = e;
        }
      }
      if (!tgt) return;
      for (const e of this.enemies) {
        if (e.hp <= 0) continue;
        if (Math.abs(e.x - tgt.x) <= s.radius && Math.abs(e.y - tgt.y) <= s.radius) {
          const dmg = Math.max(3, s.damage + Math.floor(p.level * 1.5) - e.def);
          e.hp -= dmg;
          if (e.hp <= 0) this._kill(p, e);
        }
      }
      this._log(`${p.name} unleashes Ember Burst near ${tgt.name}.`);
    } else if (sid === "rope") {
      if (!p.explored.has(`${this.exit[0]},${this.exit[1]}`)) return;
      p.x = this.exit[0];
      p.y = this.exit[1];
      this._log(`${p.name} snaps to the stairway with Binding Rope.`);
    }
    p.mp -= s.mp;
    this._endAction(p);
  }

  _endAction(p) {
    p.actions_this_turn += 1;
    const allowed = 1 + extraActions(p);
    if (p.actions_this_turn < allowed) {
      this._updateFov(p);
      return;
    }
    p.actions_this_turn = 0;
    p.round_done = true;
    const living = Object.values(this.players).filter((x) => x.alive);
    if (!living.length) return;
    if (!living.every((x) => x.round_done)) {
      this._updateFov(p);
      return;
    }
    for (const x of living) x.round_done = false;
    this._enemiesAct();
    const living2 = Object.values(this.players).filter((x) => x.alive);
    for (const x of living2) {
      if (x.light_turns > 0) x.light_turns -= 1;
      if (x.haste_turns > 0) x.haste_turns -= 1;
      x.mp = Math.min(x.max_mp, x.mp + 0.08);
    }
    this.turn += 1;
    for (const x of living2) this._updateFov(x);
  }

  _updateFov(p) {
    const vis = computeFov(this.grid, p.x, p.y, fovRadius(p));
    p.last_seen_visible = vis;
    for (const c of vis) p.explored.add(c);
  }

  _enemiesAct() {
    const players = Object.values(this.players);
    if (!players.length) return;
    let living = players.filter((p) => p.alive);
    if (!living.length) return;
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      let target = living[0];
      let bestD = 99999;
      for (const pp of living) {
        const d = Math.abs(pp.x - e.x) + Math.abs(pp.y - e.y);
        if (d < bestD) {
          bestD = d;
          target = pp;
        }
      }
      if (!e.alerted) {
        if (!target.last_seen_visible.has(`${e.x},${e.y}`)) continue;
        e.alerted = true;
      }
      const dx = target.x - e.x;
      const dy = target.y - e.y;
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist === 1) {
        const [dmg, crit] = resolveAttack(this.rng, e.dmg, 0.05, target.deff);
        target.hp -= dmg;
        this._log(`${e.name} strikes ${target.name} for ${dmg}${crit ? " (crit)" : ""}.`);
        if (target.hp <= 0) {
          target.hp = 0;
          target.alive = false;
          this._log(`${target.name} falls. Their echo fades.`);
        }
      } else if (dist <= 12) {
        const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0;
        const sy = dy > 0 ? 1 : dy < 0 ? -1 : 0;
        const tries =
          Math.abs(dx) > Math.abs(dy)
            ? [
                [sx, 0],
                [0, sy],
                [sx, sy],
              ]
            : [
                [0, sy],
                [sx, 0],
                [sx, sy],
              ];
        for (const [mx, my] of tries) {
          const nx = e.x + mx;
          const ny = e.y + my;
          if (players.some((pl) => pl.alive && pl.x === nx && pl.y === ny)) continue;
          if (!isWalkable(this.grid, nx, ny)) continue;
          if (this.enemies.some((en) => en !== e && en.hp > 0 && en.x === nx && en.y === ny)) continue;
          e.x = nx;
          e.y = ny;
          break;
        }
      }
    }
  }

  _log(msg) {
    this.log.push({ msg, turn: this.turn, t: Date.now() / 1000 });
    if (this.log.length > 80) this.log = this.log.slice(-80);
  }

  mapPayload() {
    const rows = [];
    for (const row of this.grid) {
      rows.push(row.join(""));
    }
    return {
      depth: this.depth,
      biome: this.biome(),
      w: MAP_W,
      h: MAP_H,
      rows,
      exit: [...this.exit],
      victory_only: this.depth === MAX_DEPTH,
    };
  }

  stateFor(pid) {
    const me = this.players[pid];
    if (!me) return {};
    const vis = me.last_seen_visible;
    const visibleEnemies = this.enemies
      .filter((e) => e.hp > 0 && vis.has(`${e.x},${e.y}`))
      .map((e) => ({
        id: e.id,
        kind: e.kind,
        x: e.x,
        y: e.y,
        hp: e.hp,
        maxHp: e.maxHp,
        boss: !!e.boss,
      }));
    const visibleItems = this.items
      .filter((it) => vis.has(`${it.x},${it.y}`))
      .map((it) => ({ kind: it.kind, x: it.x, y: it.y }));
    const others = [];
    for (const p of Object.values(this.players)) {
      if (p.pid === pid) continue;
      others.push({
        id: p.pid,
        name: p.name,
        cls: p.cls,
        x: p.x,
        y: p.y,
        hp: p.hp,
        maxHp: p.max_hp,
        mp: p.mp,
        maxMp: p.max_mp,
        alive: p.alive,
      });
    }
    const exploredList = [...me.explored].map((k) => k.split(",").map(Number));
    const visibleList = [...vis].map((k) => k.split(",").map(Number));
    const living = Object.values(this.players).filter((x) => x.alive);
    const waitingForAllies =
      me.round_done && living.some((x) => x.pid !== pid && !x.round_done);
    return {
      type: "state",
      depth: this.depth,
      turn: this.turn,
      victory: this.victory,
      waitingForAllies,
      you: {
        id: me.pid,
        name: me.name,
        cls: me.cls,
        x: me.x,
        y: me.y,
        hp: me.hp,
        maxHp: me.max_hp,
        mp: me.mp,
        maxMp: me.max_mp,
        level: me.level,
        xp: me.xp,
        nextXp: me.next_xp,
        atk: me.atk,
        def: me.deff,
        kills: me.kills,
        score: me.score,
        gold: me.gold,
        potions: me.inv_potions,
        manas: me.inv_manas,
        lightTurns: me.light_turns,
        hasteTurns: me.haste_turns,
        extraActions: extraActions(me),
        actionsThisTurn: me.actions_this_turn,
        fov: fovRadius(me),
        alive: me.alive,
      },
      players: others,
      enemies: visibleEnemies,
      items: visibleItems,
      explored: exploredList,
      visible: visibleList,
      log: this.log.slice(-12),
    };
  }
}
