// Bitmap tile atlas — bundled via webpack (import) so dev + production always resolve the URL.
// Grid is 8×3 cells; cell size = imageWidth/8 × imageHeight/3.
// 4-corner blob autotiling for FLOOR blends materials at tile corners (Tibia-style transitions).

import atlasUrl from "./assets/tile-atlas.png";
import { T, MAP_W, MAP_H } from "./tiles";

const GRID_COLS = 8;
const GRID_ROWS = 3;

let atlasImage = null;
let loadPromise = null;

export function loadTileAtlas() {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => {
      atlasImage = im;
      resolve(im);
    };
    im.onerror = () => {
      loadPromise = null;
      reject(new Error("tile-atlas.png failed to load"));
    };
    im.src = atlasUrl;
  });
  return loadPromise;
}

export function atlasReady() {
  return atlasImage != null && atlasImage.complete && atlasImage.naturalWidth > 0;
}

function cellRect(col, row) {
  const w = atlasImage.naturalWidth / GRID_COLS;
  const h = atlasImage.naturalHeight / GRID_ROWS;
  const c = Math.max(0, Math.min(GRID_COLS - 1, col | 0));
  const r = Math.max(0, Math.min(GRID_ROWS - 1, row | 0));
  return [c * w, r * h, w, h];
}

const BIOME_WALL_COL = { stone: 0, catacombs: 1, infernal: 2 };

function applyBiomeTint(ctx, px, py, size, biomeKey) {
  if (biomeKey === "infernal") {
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "rgba(200, 90, 55, 0.42)";
    ctx.fillRect(px, py, size, size);
    ctx.restore();
  } else if (biomeKey === "catacombs") {
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "rgba(55, 75, 110, 0.38)";
    ctx.fillRect(px, py, size, size);
    ctx.restore();
  }
}

/**
 * Draw a tile from the atlas. Returns true if drawn.
 * tile: same numeric ids as T.* — WALL 0, FLOOR 1, DOOR 2, STAIRS_DOWN 3, WATER 5
 */
export function drawAtlasTile(ctx, tile, px, py, size, material, biomeKey, variant, gx = 0, gy = 0) {
  if (!atlasReady()) return false;
  let col;
  let row;
  switch (tile) {
    case 0: // WALL
      row = 1;
      col = BIOME_WALL_COL[biomeKey] != null ? BIOME_WALL_COL[biomeKey] : 0;
      break;
    case 1: {
      row = 0;
      let m = material;
      if (m == null) {
        const v = variant | 0;
        m = ((v * 13) ^ (v >>> 3)) % 8;
      }
      col = Math.max(0, Math.min(7, m | 0));
      break;
    }
    case 5: // WATER (deep / unwalkable)
      row = 0;
      col = 2;
      break;
    default:
      return false;
  }

  const [sx, sy, sw, sh] = cellRect(col, row);
  // Alternate mirroring per cell hides visible grid seams on grass / organic floors
  const flipX = tile === 1 && (((gx + gy) & 1) !== 0);
  const flipY = tile === 1 && (((gx * 3 + gy * 5) & 2) !== 0);
  let dx = px;
  let dy = py;
  let dw = size;
  let dh = size;
  if (flipX) {
    dx = px + size;
    dw = -size;
  }
  if (flipY) {
    dy = py + size;
    dh = -size;
  }
  ctx.drawImage(atlasImage, sx, sy, sw, sh, dx, dy, dw, dh);
  applyBiomeTint(ctx, px, py, size, biomeKey);
  return true;
}

function majority4(a, b, c, d, center) {
  const counts = {};
  for (const v of [a, b, c, d]) counts[v] = (counts[v] || 0) + 1;
  const entries = Object.entries(counts).map(([k, v]) => [Number(k), v]);
  entries.sort((A, B) => B[1] - A[1]);
  if (entries.length >= 2 && entries[0][1] === entries[1][1]) return center;
  return entries[0][0];
}

function drawFloorQuarter(ctx, material, destX, destY, destW, destH, srcQX, srcQY, gx, gy) {
  const col = Math.max(0, Math.min(7, material | 0));
  const [sx0, sy0, sw, sh] = cellRect(col, 0);
  const ssw = sw / 2;
  const ssh = sh / 2;
  const sx = sx0 + srcQX * ssw;
  const sy = sy0 + srcQY * ssh;
  const flipX = ((gx + gy + srcQX) & 1) !== 0;
  const flipY = ((gx * 2 + gy + srcQY) & 1) !== 0;
  let dx = destX;
  let dy = destY;
  let dw = destW;
  let dh = destH;
  if (flipX) {
    dx = destX + destW;
    dw = -destW;
  }
  if (flipY) {
    dy = destY + destH;
    dh = -destH;
  }
  ctx.drawImage(atlasImage, sx, sy, ssw, ssh, dx, dy, dw, dh);
}

/**
 * Blob / 4-subtile autotile for walkable floors (smooth grass↔dirt↔sand, etc.).
 * getTile(tx,ty) → numeric tile id (T.*); getMat(tx,ty) → material 0–7 for that cell.
 */
export function drawAutotileFloor(ctx, px, py, size, gx, gy, biomeKey, getTile, getMat) {
  if (!atlasReady()) return false;
  const centerMat = getMat(gx, gy);
  const matAt = (tx, ty) => {
    if (ty < 0 || tx < 0 || ty >= MAP_H || tx >= MAP_W) return centerMat;
    const t = getTile(tx, ty);
    if (t === T.WATER) return 2;
    if (t === T.FLOOR || t === T.STAIRS_DOWN || t === T.DOOR) return getMat(tx, ty);
    return centerMat;
  };
  const tl = majority4(matAt(gx - 1, gy - 1), matAt(gx, gy - 1), matAt(gx - 1, gy), matAt(gx, gy), centerMat);
  const tr = majority4(matAt(gx, gy - 1), matAt(gx + 1, gy - 1), matAt(gx, gy), matAt(gx + 1, gy), centerMat);
  const bl = majority4(matAt(gx - 1, gy), matAt(gx, gy), matAt(gx - 1, gy + 1), matAt(gx, gy + 1), centerMat);
  const br = majority4(matAt(gx, gy), matAt(gx + 1, gy), matAt(gx, gy + 1), matAt(gx + 1, gy + 1), centerMat);

  const hs = size / 2;
  drawFloorQuarter(ctx, tl, px, py, hs, hs, 0, 0, gx, gy);
  drawFloorQuarter(ctx, tr, px + hs, py, hs, hs, 1, 0, gx, gy);
  drawFloorQuarter(ctx, bl, px, py + hs, hs, hs, 0, 1, gx, gy);
  drawFloorQuarter(ctx, br, px + hs, py + hs, hs, hs, 1, 1, gx, gy);
  applyBiomeTint(ctx, px, py, size, biomeKey);
  return true;
}
