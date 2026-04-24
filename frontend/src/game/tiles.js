// Tile constants & dungeon config
export const TILE = 24; // pixels per tile on screen (pre-zoom)
export const MAP_W = 60;
export const MAP_H = 36;

export const T = {
  WALL: 0,
  FLOOR: 1,
  DOOR: 2,
  STAIRS_DOWN: 3,
  STAIRS_UP: 4,
};

export const COLORS = {
  wall: "#1c1815",
  wallLight: "#2a241f",
  floor: "#0f0d0b",
  floorLight: "#181513",
  floorHidden: "#05040390",
  mortar: "#322821",
  stairs: "#b8860b",
  door: "#6b4e2a",
  fog: "rgba(0,0,0,0.82)",
  explored: "rgba(0,0,0,0.55)",
};
