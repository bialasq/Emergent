// BSP dungeon generation. Deterministic from seed.
import { makeRng } from "./rng";
import { T, MAP_W, MAP_H } from "./tiles";

class BSPNode {
  constructor(x, y, w, h) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.left = null; this.right = null; this.room = null;
  }
  isLeaf() { return !this.left && !this.right; }
  getRooms() {
    if (this.room) return [this.room];
    const out = [];
    if (this.left) out.push(...this.left.getRooms());
    if (this.right) out.push(...this.right.getRooms());
    return out;
  }
}

function splitNode(node, rng, minSize = 8) {
  if (!node.isLeaf()) return false;
  const canH = node.w > node.h * 1.25;
  const canV = node.h > node.w * 1.25;
  let splitH;
  if (canH && !canV) splitH = false;
  else if (canV && !canH) splitH = true;
  else splitH = rng.chance(0.5);

  if (splitH) {
    const max = node.h - minSize;
    if (max <= minSize) return false;
    const split = rng.int(minSize, max);
    node.left = new BSPNode(node.x, node.y, node.w, split);
    node.right = new BSPNode(node.x, node.y + split, node.w, node.h - split);
  } else {
    const max = node.w - minSize;
    if (max <= minSize) return false;
    const split = rng.int(minSize, max);
    node.left = new BSPNode(node.x, node.y, split, node.h);
    node.right = new BSPNode(node.x + split, node.y, node.w - split, node.h);
  }
  return true;
}

function createRoomInNode(node, rng) {
  const pad = 1;
  const minRoom = 5;
  const maxW = node.w - pad * 2;
  const maxH = node.h - pad * 2;
  const w = rng.int(minRoom, Math.max(minRoom, maxW));
  const h = rng.int(minRoom, Math.max(minRoom, maxH));
  const x = node.x + pad + rng.int(0, Math.max(0, maxW - w));
  const y = node.y + pad + rng.int(0, Math.max(0, maxH - h));
  node.room = { x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) };
}

function carveRect(map, r) {
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      map[y][x] = T.FLOOR;
    }
  }
}

function carveCorridor(map, ax, ay, bx, by, rng) {
  // L-shaped
  if (rng.chance(0.5)) {
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) map[ay][x] = T.FLOOR;
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) map[y][bx] = T.FLOOR;
  } else {
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) map[y][ax] = T.FLOOR;
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) map[by][x] = T.FLOOR;
  }
}

function connect(node, rng, map) {
  if (node.isLeaf()) return;
  connect(node.left, rng, map);
  connect(node.right, rng, map);
  const la = node.left.getRooms();
  const lb = node.right.getRooms();
  if (!la.length || !lb.length) return;
  const a = la[rng.int(0, la.length - 1)];
  const b = lb[rng.int(0, lb.length - 1)];
  carveCorridor(map, a.cx, a.cy, b.cx, b.cy, rng);
}

export function generateDungeon(seed, depth) {
  const rng = makeRng(seed + depth * 9719);
  const map = Array.from({ length: MAP_H }, () => new Array(MAP_W).fill(T.WALL));

  const root = new BSPNode(1, 1, MAP_W - 2, MAP_H - 2);
  const queue = [root];
  const maxIter = 40;
  let iter = 0;
  while (queue.length && iter < maxIter) {
    const node = queue.shift();
    if (splitNode(node, rng)) {
      queue.push(node.left, node.right);
    }
    iter++;
  }

  const leaves = [];
  (function collect(n) {
    if (n.isLeaf()) leaves.push(n);
    else { collect(n.left); collect(n.right); }
  })(root);

  for (const leaf of leaves) createRoomInNode(leaf, rng);
  for (const leaf of leaves) if (leaf.room) carveRect(map, leaf.room);
  connect(root, rng, map);

  const rooms = leaves.filter(l => l.room).map(l => l.room);
  // Place stairs down in farthest room from start
  const start = rooms[0];
  let far = rooms[rooms.length - 1];
  let bestD = -1;
  for (const r of rooms) {
    const d = Math.abs(r.cx - start.cx) + Math.abs(r.cy - start.cy);
    if (d > bestD) { bestD = d; far = r; }
  }
  map[far.cy][far.cx] = T.STAIRS_DOWN;

  // Ensure map borders walls
  for (let x = 0; x < MAP_W; x++) { map[0][x] = T.WALL; map[MAP_H-1][x] = T.WALL; }
  for (let y = 0; y < MAP_H; y++) { map[y][0] = T.WALL; map[y][MAP_W-1] = T.WALL; }

  return {
    map,
    rooms,
    start: { x: start.cx, y: start.cy },
    exit: { x: far.cx, y: far.cy },
    rng,
  };
}

export function isWalkable(map, x, y) {
  if (y < 0 || y >= MAP_H || x < 0 || x >= MAP_W) return false;
  const t = map[y][x];
  return t === T.FLOOR || t === T.STAIRS_DOWN || t === T.STAIRS_UP || t === T.DOOR;
}

// ---------------- World map: 3 cities ----------------
// Materials used by renderer (visual only):
// 0 stone, 1 rubble, 2 water, 3 grass, 4 sand, 5 concrete, 6 asphalt, 7 marble
function makeGrid(fill) {
  return Array.from({ length: MAP_H }, () => new Array(MAP_W).fill(fill));
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function carveRoad(rng, map, mat, x0, y0, x1, y1, width = 2, material = 6) {
  // simple manhattan road with thickness
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let x = x0, y = y0;
  const steps = Math.abs(x1 - x0) + Math.abs(y1 - y0) + 5;
  let i = 0;
  while ((x !== x1 || y !== y1) && i++ < steps) {
    for (let yy = y - width; yy <= y + width; yy++) {
      for (let xx = x - width; xx <= x + width; xx++) {
        if (yy <= 0 || yy >= MAP_H - 1 || xx <= 0 || xx >= MAP_W - 1) continue;
        map[yy][xx] = T.FLOOR;
        mat[yy][xx] = material;
      }
    }
    if (x !== x1 && (y === y1 || rng.chance(0.6))) x += sx;
    else if (y !== y1) y += sy;
  }
}

function paintRect(map, mat, x, y, w, h, tile, material) {
  for (let yy = y; yy < y + h; yy++) {
    if (yy < 0 || yy >= MAP_H) continue;
    for (let xx = x; xx < x + w; xx++) {
      if (xx < 0 || xx >= MAP_W) continue;
      map[yy][xx] = tile;
      if (material != null) mat[yy][xx] = material;
    }
  }
}

function outlineWalls(map, x, y, w, h) {
  for (let xx = x; xx < x + w; xx++) {
    map[y][xx] = T.WALL;
    map[y + h - 1][xx] = T.WALL;
  }
  for (let yy = y; yy < y + h; yy++) {
    map[yy][x] = T.WALL;
    map[yy][x + w - 1] = T.WALL;
  }
}

function cityPlan(rng, name, box, baseMat, plazaMat) {
  const { x, y, w, h } = box;
  const cx = x + Math.floor(w / 2);
  const cy = y + Math.floor(h / 2);
  const gate = rng.pick(["N", "S", "E", "W"]);
  const gatePos =
    gate === "N" ? { x: cx, y: y }
    : gate === "S" ? { x: cx, y: y + h - 1 }
    : gate === "E" ? { x: x + w - 1, y: cy }
    : { x: x, y: cy };
  return { name, box, cx, cy, baseMat, plazaMat, gate, gatePos };
}

function buildCity(map, mat, zone, plan) {
  const { name, box, cx, cy, baseMat, plazaMat, gatePos } = plan;
  const { x, y, w, h } = box;

  // interior ground
  paintRect(map, mat, x + 1, y + 1, w - 2, h - 2, T.FLOOR, baseMat);

  // outer walls
  outlineWalls(map, x, y, w, h);
  paintRect(map, mat, x, y, w, 1, T.WALL, 0);
  paintRect(map, mat, x, y + h - 1, w, 1, T.WALL, 0);
  paintRect(map, mat, x, y, 1, h, T.WALL, 0);
  paintRect(map, mat, x + w - 1, y, 1, h, T.WALL, 0);

  // gate
  map[gatePos.y][gatePos.x] = T.DOOR;
  mat[gatePos.y][gatePos.x] = plazaMat;

  // plaza (different texture)
  const pr = Math.floor(Math.min(w, h) / 6);
  paintRect(map, mat, cx - pr, cy - pr, pr * 2 + 1, pr * 2 + 1, T.FLOOR, plazaMat);

  // main streets (cross)
  for (let xx = x + 2; xx < x + w - 2; xx++) { map[cy][xx] = T.FLOOR; mat[cy][xx] = plazaMat; }
  for (let yy = y + 2; yy < y + h - 2; yy++) { map[yy][cx] = T.FLOOR; mat[yy][cx] = plazaMat; }

  // districts: blocky buildings
  const blockW = 10, blockH = 8;
  for (let by = y + 3; by < y + h - 3; by += blockH + 2) {
    for (let bx = x + 3; bx < x + w - 3; bx += blockW + 2) {
      // avoid plaza cross
      if (Math.abs((bx + 5) - cx) <= 3 || Math.abs((by + 4) - cy) <= 3) continue;
      // buildings are WALL rectangles with DOOR
      const bw = clamp(blockW - (plan.name === "Serva" ? 2 : 0), 7, 12);
      const bh = clamp(blockH - (plan.name === "Castle Of Knighthood" ? 1 : 0), 6, 10);
      outlineWalls(map, bx, by, bw, bh);
      // door toward nearest street
      const dx = (bx + Math.floor(bw / 2));
      const dy = by + bh - 1;
      map[dy][dx] = T.DOOR;
      mat[dy][dx] = baseMat;
      // ensure walkable in front of door
      if (dy + 1 < MAP_H) { map[dy + 1][dx] = T.FLOOR; mat[dy + 1][dx] = baseMat; }
      // small courtyards
      paintRect(map, mat, bx + 1, by + 1, bw - 2, bh - 2, T.FLOOR, baseMat);
    }
  }

  // zone marking
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      zone[yy][xx] = name;
    }
  }
}

export function generateWorldMap(seed) {
  const rng = makeRng(seed + 1337);

  // base: grassland with some sand belts and lakes (water = unwalkable)
  const map = makeGrid(T.FLOOR);
  const mat = makeGrid(3); // grass
  const zone = makeGrid("Wilderness");

  // borders
  for (let x = 0; x < MAP_W; x++) { map[0][x] = T.WALL; map[MAP_H - 1][x] = T.WALL; }
  for (let y = 0; y < MAP_H; y++) { map[y][0] = T.WALL; map[y][MAP_W - 1] = T.WALL; }

  // lakes
  const lakes = 5;
  for (let i = 0; i < lakes; i++) {
    const cx = rng.int(30, MAP_W - 30);
    const cy = rng.int(25, MAP_H - 25);
    const rx = rng.int(10, 22);
    const ry = rng.int(8, 18);
    for (let y = cy - ry; y <= cy + ry; y++) {
      for (let x = cx - rx; x <= cx + rx; x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1.0 && y > 0 && y < MAP_H - 1 && x > 0 && x < MAP_W - 1) {
          map[y][x] = T.WATER;
          mat[y][x] = 2;
          zone[y][x] = "Water";
        }
      }
    }
  }

  // sandy band (Defend sits near it)
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (map[y][x] !== T.FLOOR) continue;
      if (y > MAP_H * 0.62 && y < MAP_H * 0.86 && rng.chance(0.12)) mat[y][x] = 4; // sand
      if (y > MAP_H * 0.66 && y < MAP_H * 0.82 && rng.chance(0.06)) mat[y][x] = 1; // rubble patches
    }
  }

  // City boxes (spaced apart, different textures)
  const serva = cityPlan(rng, "Serva", { x: 18, y: 18, w: 96, h: 64 }, 3, 5);               // grassy + light concrete plaza
  const defend = cityPlan(rng, "Defend", { x: 112, y: 92, w: 112, h: 72 }, 5, 6);            // concrete/asphalt
  const castle = cityPlan(rng, "Castle Of Knighthood", { x: 214, y: 22, w: 70, h: 92 }, 0, 7); // stone + marble plaza

  buildCity(map, mat, zone, serva);
  buildCity(map, mat, zone, defend);
  buildCity(map, mat, zone, castle);

  // roads connect gates
  carveRoad(rng, map, mat, serva.gatePos.x, serva.gatePos.y, defend.gatePos.x, defend.gatePos.y, 2, 6);
  carveRoad(rng, map, mat, defend.gatePos.x, defend.gatePos.y, castle.gatePos.x, castle.gatePos.y, 2, 6);
  carveRoad(rng, map, mat, serva.gatePos.x, serva.gatePos.y, castle.gatePos.x, castle.gatePos.y, 1, 6);

  // ensure roads don't cut through water (turn those to bridges)
  for (let y = 1; y < MAP_H - 1; y++) {
    for (let x = 1; x < MAP_W - 1; x++) {
      if (mat[y][x] === 6 && map[y][x] === T.WATER) {
        map[y][x] = T.FLOOR;
        mat[y][x] = 6;
        zone[y][x] = "Bridge";
      }
    }
  }

  // start in Serva plaza
  const start = { x: serva.cx, y: serva.cy };

  return {
    map,
    start,
    // no dungeon stairs exit; world is a single plane
    exit: null,
    rng,
    materials: mat,
    zones: zone,
    cities: [serva, defend, castle],
  };
}
