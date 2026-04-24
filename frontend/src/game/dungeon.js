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
