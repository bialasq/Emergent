// Field of view via simple Recursive Shadowcasting (8 octants).
// Returns Set of "x,y" keys visible from (ox, oy) with radius.
import { MAP_W, MAP_H, T } from "./tiles";

function blocks(map, x, y) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return true;
  return map[y][x] === T.WALL;
}

const octants = [
  [ 1, 0, 0, 1], [ 0, 1, 1, 0],
  [ 0,-1, 1, 0], [-1, 0, 0, 1],
  [-1, 0, 0,-1], [ 0,-1,-1, 0],
  [ 0, 1,-1, 0], [ 1, 0, 0,-1],
];

function cast(visible, map, ox, oy, row, startSlope, endSlope, radius, xx, xy, yx, yy) {
  if (startSlope < endSlope) return;
  let nextStart = startSlope;
  for (let i = row; i <= radius; i++) {
    let blocked = false;
    for (let dx = -i, dy = -i; dx <= 0; dx++) {
      const lSlope = (dx - 0.5) / (dy + 0.5);
      const rSlope = (dx + 0.5) / (dy - 0.5);
      if (startSlope < rSlope) continue;
      if (endSlope > lSlope) break;
      const sax = dx * xx + dy * xy;
      const say = dx * yx + dy * yy;
      const mx = ox + sax, my = oy + say;
      if (mx < 0 || my < 0 || mx >= MAP_W || my >= MAP_H) continue;
      if (dx*dx + dy*dy <= radius*radius) visible.add(mx + "," + my);
      if (blocked) {
        if (blocks(map, mx, my)) { nextStart = rSlope; continue; }
        else { blocked = false; startSlope = nextStart; }
      } else {
        if (blocks(map, mx, my) && i < radius) {
          blocked = true;
          cast(visible, map, ox, oy, i + 1, startSlope, lSlope, radius, xx, xy, yx, yy);
          nextStart = rSlope;
        }
      }
    }
    if (blocked) break;
  }
}

export function computeFOV(map, ox, oy, radius = 8) {
  const vis = new Set();
  vis.add(ox + "," + oy);
  for (const [xx, xy, yx, yy] of octants) {
    cast(vis, map, ox, oy, 1, 1.0, 0.0, radius, xx, xy, yx, yy);
  }
  return vis;
}
