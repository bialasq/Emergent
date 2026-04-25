// Procedural pixel sprite drawing directly to canvas.
// All sprite artwork is authored at a nominal 24px grid and scaled with ctx.scale()
// so the same code works at any tileSize (used: 48px, can also be 24px or 64px).

const BASE = 24;

function drawWith(ctx, px, py, size, fn) {
  ctx.save();
  ctx.translate(px, py);
  const sc = size / BASE;
  ctx.scale(sc, sc);
  fn(ctx);
  ctx.restore();
}

function biomePalette(biomeKey) {
  // fallback-safe: if unknown, use original stone-like palette
  switch (biomeKey) {
    case "catacombs":
      return {
        // cooler, more modern slate
        wallA: "#121418", wallB: "#1b1f27", wallHi: "#2e3442",
        floorA: "#0a0c10", floorB: "#10141b", floorSpec: "#313a4d",
        accentA: "#2bb3b3",
      };
    case "infernal":
      return {
        // deeper volcanic
        wallA: "#160908", wallB: "#24100d", wallHi: "#4a1a12",
        floorA: "#0a0506", floorB: "#140708", floorSpec: "#6f2717",
        accentA: "#e05a1a",
      };
    default:
      return {
        // clean stone
        wallA: "#13100e", wallB: "#1f1914", wallHi: "#332a22",
        floorA: "#090807", floorB: "#11100e", floorSpec: "#2a2925",
        accentA: "#3a7d44",
      };
  }
}

export function drawTile(ctx, tile, px, py, size, variant = 0, biomeKey = "stone", material = null) {
  drawWith(ctx, px, py, size, (c) => {
    const pal = biomePalette(biomeKey);
    const v = Math.abs(variant | 0);
    switch (tile) {
      case 0: { // WALL
        c.fillStyle = pal.wallA;
        c.fillRect(0, 0, BASE, BASE);
        c.fillStyle = pal.wallB;
        c.fillRect(0, 0, BASE, 4);
        c.fillStyle = pal.wallHi;
        c.fillRect(1, 1, BASE - 2, BASE - 2);
        c.fillStyle = pal.wallA;
        c.fillRect(2, 2, BASE - 4, BASE - 4);
        // cracks/relief
        c.fillStyle = pal.wallHi;
        const sp = (v * 7) % 9;
        c.fillRect(3 + sp, 3, 1, 1);
        c.fillRect(6 + ((v * 11) % 8), 9, 1, 1);
        c.fillRect(4 + ((v * 17) % 10), 16, 1, 1);
        // subtle bevel
        c.fillStyle = "rgba(255,255,255,0.04)";
        c.fillRect(2, 2, BASE - 4, 1);
        c.fillRect(2, 2, 1, BASE - 4);
        c.fillStyle = "rgba(0,0,0,0.25)";
        c.fillRect(2, BASE - 3, BASE - 4, 1);
        c.fillRect(BASE - 3, 2, 1, BASE - 4);
        // occasional moss/soot
        if ((v % 13) === 0) {
          c.fillStyle = biomeKey === "infernal" ? "#3a120a" : "#1f3a22";
          c.fillRect(2, 18, 4, 3);
          c.fillRect(4, 17, 3, 2);
        }
        break;
      }
      case 1: { // FLOOR
        // Tibia-like floor: crisp 2x2 tiling + subtle deterministic specks (no assets)
        c.fillStyle = pal.floorA;
        c.fillRect(0, 0, BASE, BASE);

        // 0=stone, 1=rubble, 2=water puddle, 3=grass, 4=sand, 5=concrete, 6=asphalt, 7=marble
        const mat = (material != null ? material : (v % 7));
        let a = pal.floorB;
        let b = pal.floorSpec;
        if (mat === 3) { a = "#0b120c"; b = "#17301e"; }      // grass
        else if (mat === 4) { a = "#1c140a"; b = "#b9923a"; } // sand
        else if (mat === 5) { a = "#0f1319"; b = "#242a33"; } // concrete
        else if (mat === 6) { a = "#0a0c10"; b = "#1b2028"; } // asphalt
        else if (mat === 7) { a = "#d6dbe6"; b = "#a8b0be"; } // marble

        // 2x2 checker inside border (classic Tibia vibe)
        for (let yy = 1; yy < BASE - 1; yy++) {
          for (let xx = 1; xx < BASE - 1; xx++) {
            const chk = ((xx >> 1) + (yy >> 1) + (v & 3)) & 1;
            c.fillStyle = chk ? a : b;
            c.fillRect(xx, yy, 1, 1);
          }
        }

        // 3 specks (deterministic) to break repetition
        c.fillStyle = "rgba(0,0,0,0.22)";
        c.fillRect(3 + ((v * 7) % 18), 4 + ((v * 11) % 16), 1, 1);
        c.fillRect(6 + ((v * 13) % 14), 15 + ((v * 17) % 6), 1, 1);
        c.fillStyle = "rgba(255,255,255,0.05)";
        c.fillRect(10 + ((v * 19) % 10), 7 + ((v * 23) % 12), 1, 1);

        if (mat === 1) { // rubble
          c.fillStyle = pal.floorSpec;
          for (let i = 0; i < 10; i++) c.fillRect(3 + ((v * (i + 5)) % 16), 4 + ((v * (i + 11)) % 14), 1, 1);
          c.fillStyle = "#8c7b68";
          c.fillRect(6, 15, 3, 2); c.fillRect(14, 10, 2, 2);
        } else if (mat === 2) { // water
          c.fillStyle = "#081218";
          c.beginPath(); c.ellipse(12, 14, 7, 4, 0, 0, Math.PI * 2); c.fill();
          c.fillStyle = "#1b6a8a";
          c.beginPath(); c.ellipse(12, 14, 6, 3, 0, 0, Math.PI * 2); c.fill();
          c.fillStyle = "#6dd0ff";
          c.fillRect(10, 13, 2, 1); c.fillRect(14, 15, 2, 1);
        } else {
          // base checker already covers stone/grass/sand/concrete/asphalt/marble
        }

        // occasional set dressing: rocks/trees (purely visual)
        if ((v % 29) === 0) {
          // rock pile
          c.fillStyle = "#2a221b";
          c.fillRect(4, 16, 6, 4);
          c.fillStyle = "#6f6a5a";
          c.fillRect(5, 17, 4, 2);
          c.fillRect(8, 16, 2, 2);
        } else if ((v % 37) === 0 && biomeKey !== "infernal") {
          // small tree/brush
          c.fillStyle = "#2a1533";
          c.fillRect(11, 15, 2, 6);
          c.fillStyle = "#1f4a26";
          c.fillRect(7, 6, 10, 10);
          c.fillStyle = "#3a7d44";
          c.fillRect(9, 8, 6, 6);
        }
        break;
      }
      case 2: { // DOOR / gate
        c.fillStyle = pal.floorA;
        c.fillRect(0, 0, BASE, BASE);
        // cleaner door with metal braces
        c.fillStyle = "#3a2a1f"; c.fillRect(6, 4, 12, 16);
        c.fillStyle = "#6b4e2a"; c.fillRect(7, 5, 10, 14);
        c.fillStyle = "rgba(255,255,255,0.06)"; c.fillRect(7, 5, 1, 14);
        c.fillStyle = "rgba(0,0,0,0.35)"; c.fillRect(16, 5, 1, 14);
        c.fillStyle = "#2a221b"; c.fillRect(6, 4, 12, 1); c.fillRect(6, 19, 12, 1);
        c.fillStyle = "#6f6a5a"; c.fillRect(8, 9, 8, 1); c.fillRect(8, 14, 8, 1);
        c.fillStyle = "#b8860b"; c.fillRect(14, 12, 1, 2);
        break;
      }
      case 3: { // STAIRS DOWN
        c.fillStyle = pal.floorA;
        c.fillRect(0, 0, BASE, BASE);
        c.fillStyle = "#b8860b";
        for (let i = 0; i < 4; i++) {
          c.fillRect(2 + i * 2, 2 + i * 2, BASE - 4 - i * 4, 2);
        }
        c.fillStyle = "#f0d89a";
        c.fillRect(BASE / 2 - 1, BASE / 2, 2, 2);
        break;
      }
      case 5: { // WATER (unwalkable)
        c.fillStyle = "#04070a";
        c.fillRect(0, 0, BASE, BASE);
        c.fillStyle = "#0a2230";
        c.fillRect(1, 1, BASE - 2, BASE - 2);
        c.fillStyle = "#1b6a8a";
        const wv = (v * 17) % 10;
        c.fillRect(2 + wv, 6, 6, 1);
        c.fillRect(3 + ((v * 29) % 10), 14, 7, 1);
        c.fillStyle = "#6dd0ff";
        c.fillRect(6 + ((v * 11) % 8), 7, 2, 1);
        c.fillRect(10 + ((v * 13) % 6), 15, 2, 1);
        break;
      }
      default: {
        c.fillStyle = pal.floorA;
        c.fillRect(0, 0, BASE, BASE);
      }
    }
  });
}

function classPalette(cls) {
  switch (cls) {
    case "mage":
      return { body: "#2e86ab", armor: "#1a4b66" };
    case "rogue":
      return { body: "#5a2a6e", armor: "#2a1533" };
    case "ranger":
      return { body: "#3a7d44", armor: "#1f4a26" };
    default:
      return { body: "#c0392b", armor: "#7a1f13" };
  }
}

export function drawPlayer(ctx, cls, px, py, size, flash = 0) {
  drawWith(ctx, px, py, size, (c) => {
    const cx = BASE / 2;
    const { body: bodyColor, armor: armorColor } = classPalette(cls);
    c.fillStyle = "rgba(0,0,0,0.55)";
    c.beginPath(); c.ellipse(cx, BASE - 3, BASE / 3, 2, 0, 0, Math.PI * 2); c.fill();
    // head + face
    c.fillStyle = "#e0bf95"; c.fillRect(cx - 3, 3, 6, 5);
    c.fillStyle = "#0a0807"; c.fillRect(cx - 2, 5, 1, 1); c.fillRect(cx + 1, 5, 1, 1);
    c.fillStyle = "#8c6b3a"; c.fillRect(cx - 1, 7, 2, 1);
    // torso + shoulders
    c.fillStyle = bodyColor; c.fillRect(cx - 5, 8, 10, 8);
    c.fillStyle = armorColor; c.fillRect(cx - 5, 14, 10, 2);
    c.fillStyle = "#2a221b"; c.fillRect(cx - 6, 10, 1, 4); c.fillRect(cx + 5, 10, 1, 4);
    if (cls === "mage") {
      // hood + staff
      c.fillStyle = "#1a4b66"; c.fillRect(cx - 4, 2, 8, 2);
      c.fillStyle = "#8c6b3a"; c.fillRect(cx + 5, 4, 1, 13);
      c.fillStyle = "#1fb3b3"; c.fillRect(cx + 4, 3, 3, 3);
      c.fillStyle = "#6dd0ff"; c.fillRect(cx + 5, 4, 1, 1);
    } else if (cls === "ranger") {
      // cloak + bow
      c.fillStyle = "#1f4a26"; c.fillRect(cx - 6, 8, 2, 10); c.fillRect(cx + 4, 8, 2, 10);
      c.fillStyle = "#c8b79a"; c.fillRect(cx - 7, 10, 2, 1);
      c.fillStyle = "#6b4e2a"; c.fillRect(cx - 8, 6, 2, 12);
      c.fillStyle = "#8c6b3a"; c.fillRect(cx - 9, 5, 1, 4);
      c.fillStyle = "#e0d3c1"; c.fillRect(cx - 9, 8, 1, 1);
    } else if (cls === "rogue") {
      // mask + dagger
      c.fillStyle = "#2a1533"; c.fillRect(cx - 3, 2, 6, 1);
      c.fillStyle = "#c0c8d0"; c.fillRect(cx + 5, 6, 1, 10);
      c.fillStyle = "#1a1a22"; c.fillRect(cx + 4, 14, 3, 1);
      c.fillStyle = "#dba62b"; c.fillRect(cx + 5, 6, 1, 1);
    } else {
      // helm + sword
      c.fillStyle = "#6f6a5a"; c.fillRect(cx - 3, 2, 6, 2);
      c.fillStyle = "#c0c8d0"; c.fillRect(cx + 5, 5, 1, 11);
      c.fillStyle = "#b8860b"; c.fillRect(cx + 4, 14, 3, 1);
    }
    c.fillStyle = "#2a221b"; c.fillRect(cx - 3, 16, 2, 4); c.fillRect(cx + 1, 16, 2, 4);
    if (flash > 0) { c.fillStyle = `rgba(255,230,200,${flash})`; c.fillRect(0, 0, BASE, BASE); }
  });
}

export function drawGhostPlayer(ctx, cls, name, px, py, size) {
  drawWith(ctx, px, py, size, (c) => {
    c.globalAlpha = 0.55;
    const cx = BASE / 2;
    const tint =
      cls === "mage" ? "#7ab8d8"
      : cls === "rogue" ? "#c896d8"
      : cls === "ranger" ? "#9cd4a4"
      : "#d88a7a";
    c.fillStyle = tint;
    c.fillRect(cx - 4, 3, 8, 13);
    c.globalAlpha = 1;
  });
}

export function drawEnemy(ctx, kind, px, py, size) {
  drawWith(ctx, px, py, size, (c) => {
    const cx = BASE / 2;
    c.fillStyle = "rgba(0,0,0,0.55)";
    c.beginPath(); c.ellipse(cx, BASE - 3, BASE / 3, 2, 0, 0, Math.PI * 2); c.fill();
    switch (kind) {
      case "rat":
        c.fillStyle = "#7a5a3c"; c.fillRect(cx - 5, 12, 10, 6); c.fillRect(cx + 4, 10, 4, 3);
        c.fillStyle = "#2a1a10"; c.fillRect(cx + 6, 11, 1, 1);
        c.fillStyle = "#aa8866"; c.fillRect(cx - 6, 13, 1, 3);
        break;
      case "goblin":
        c.fillStyle = "#5a7a3c"; c.fillRect(cx - 3, 4, 6, 5); c.fillRect(cx - 4, 9, 8, 7);
        c.fillStyle = "#b0251a"; c.fillRect(cx - 2, 6, 1, 1); c.fillRect(cx + 1, 6, 1, 1);
        c.fillStyle = "#8c8c8c"; c.fillRect(cx + 4, 8, 1, 8);
        c.fillStyle = "#2a221b"; c.fillRect(cx - 3, 16, 2, 4); c.fillRect(cx + 1, 16, 2, 4);
        break;
      case "skeleton":
        c.fillStyle = "#c8b79a"; c.fillRect(cx - 3, 3, 6, 5);
        c.fillStyle = "#0a0807"; c.fillRect(cx - 2, 5, 1, 2); c.fillRect(cx + 1, 5, 1, 2);
        c.fillStyle = "#c8b79a"; c.fillRect(cx - 3, 8, 6, 2); c.fillRect(cx - 1, 10, 3, 6);
        c.fillStyle = "#8c7b68"; c.fillRect(cx + 4, 5, 1, 12);
        c.fillStyle = "#c8b79a"; c.fillRect(cx - 3, 16, 2, 4); c.fillRect(cx + 1, 16, 2, 4);
        break;
      case "orc":
        c.fillStyle = "#6b8f3b"; c.fillRect(cx - 4, 3, 8, 6); c.fillRect(cx - 5, 9, 10, 8);
        c.fillStyle = "#b0251a"; c.fillRect(cx - 2, 5, 1, 1); c.fillRect(cx + 1, 5, 1, 1);
        c.fillStyle = "#c0c8d0"; c.fillRect(cx + 5, 6, 2, 10);
        c.fillStyle = "#2a221b"; c.fillRect(cx - 4, 17, 3, 3); c.fillRect(cx + 1, 17, 3, 3);
        break;
      case "wraith":
        c.globalAlpha = 0.8; c.fillStyle = "#7ab8b8"; c.fillRect(cx - 4, 4, 8, 14); c.globalAlpha = 1;
        c.fillStyle = "#e0f8f8"; c.fillRect(cx - 2, 6, 1, 2); c.fillRect(cx + 1, 6, 1, 2);
        break;
      case "troll":
        c.fillStyle = "#4a6b2a"; c.fillRect(cx - 5, 2, 10, 7); c.fillRect(cx - 6, 9, 12, 9);
        c.fillStyle = "#8c1c13"; c.fillRect(cx - 3, 4, 1, 2); c.fillRect(cx + 2, 4, 1, 2);
        c.fillStyle = "#e0d3c1"; c.fillRect(cx - 2, 8, 1, 2); c.fillRect(cx + 1, 8, 1, 2);
        break;
      case "golem":
        c.fillStyle = "#6f6a5a"; c.fillRect(cx - 5, 2, 10, 8); c.fillRect(cx - 6, 10, 12, 9);
        c.fillStyle = "#b8860b"; c.fillRect(cx - 1, 5, 2, 1); c.fillRect(cx - 3, 12, 6, 1);
        break;
      case "wyvern":
        c.fillStyle = "#8c1c13"; c.fillRect(cx - 6, 6, 12, 9); c.fillRect(cx + 4, 4, 4, 4);
        c.fillStyle = "#e0d3c1"; c.fillRect(cx + 6, 5, 1, 1);
        c.fillStyle = "#b0251a"; c.fillRect(cx - 8, 4, 3, 3); c.fillRect(cx - 8, 12, 3, 3);
        break;
      case "lich":
        c.fillStyle = "#b8860b"; c.fillRect(cx - 5, 2, 10, 18);
        c.fillStyle = "#e0d3c1"; c.fillRect(cx - 3, 4, 6, 4);
        c.fillStyle = "#8c1c13"; c.fillRect(cx - 2, 5, 1, 1); c.fillRect(cx + 1, 5, 1, 1);
        c.fillStyle = "#138c8c"; c.fillRect(cx + 5, 2, 1, 16); c.fillRect(cx + 4, 1, 3, 3);
        break;
      default:
        c.fillStyle = "#8c7b68"; c.fillRect(cx - 3, 6, 6, 12);
    }
  });
}

function drawGearIcon(c, inst) {
  const cx = BASE / 2, cy = BASE / 2;
  const slot = inst?.slot || "gear";
  const cls = inst?.cls || "warrior";
  // frame
  c.fillStyle = "#0a0807"; c.fillRect(cx - 7, cy - 7, 14, 14);
  c.fillStyle = cls === "mage" ? "#138c8c" : cls === "rogue" ? "#5a2a6e" : cls === "ranger" ? "#3a7d44" : "#b0251a";
  c.fillRect(cx - 6, cy - 6, 12, 12);
  c.fillStyle = "#1c1410"; c.fillRect(cx - 5, cy - 5, 10, 10);

  if (slot === "helm") {
    c.fillStyle = "#6f6a5a"; c.fillRect(cx - 4, cy - 2, 8, 5);
    c.fillStyle = "#c0c8d0"; c.fillRect(cx - 3, cy - 1, 6, 3);
    c.fillStyle = "#0a0807"; c.fillRect(cx - 2, cy, 1, 1); c.fillRect(cx + 1, cy, 1, 1);
  } else if (slot === "armor") {
    c.fillStyle = "#8c7b68"; c.fillRect(cx - 4, cy - 4, 8, 9);
    c.fillStyle = "#2a221b"; c.fillRect(cx - 4, cy - 1, 8, 1);
    c.fillStyle = "#b8860b"; c.fillRect(cx - 1, cy - 4, 2, 2);
  } else if (slot === "boots") {
    c.fillStyle = "#2a221b"; c.fillRect(cx - 4, cy + 1, 4, 3);
    c.fillRect(cx + 1, cy + 1, 4, 3);
    c.fillStyle = "#8c6b3a"; c.fillRect(cx - 4, cy, 4, 1); c.fillRect(cx + 1, cy, 4, 1);
  } else if (slot === "ring") {
    c.fillStyle = "#b8860b";
    c.beginPath(); c.arc(cx, cy, 4, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#1c1410";
    c.beginPath(); c.arc(cx, cy, 2, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#f0d89a"; c.fillRect(cx, cy - 3, 1, 1);
  } else if (slot === "amulet") {
    c.fillStyle = "#b8860b"; c.fillRect(cx - 1, cy - 5, 2, 2);
    c.fillStyle = "#8c7b68"; c.fillRect(cx - 3, cy - 3, 6, 1);
    c.fillStyle = "#138c8c"; c.fillRect(cx - 2, cy - 1, 4, 4);
    c.fillStyle = "#6dd0ff"; c.fillRect(cx - 1, cy, 2, 2);
  } else if (slot === "offhand") {
    if (cls === "mage") {
      // book
      c.fillStyle = "#6b4e2a"; c.fillRect(cx - 4, cy - 4, 8, 9);
      c.fillStyle = "#e0d3c1"; c.fillRect(cx - 3, cy - 3, 6, 7);
      c.fillStyle = "#b0251a"; c.fillRect(cx - 2, cy - 1, 4, 1);
    } else {
      // shield
      c.fillStyle = "#6f6a5a";
      c.beginPath(); c.moveTo(cx, cy - 5); c.lineTo(cx + 5, cy - 2); c.lineTo(cx + 4, cy + 5); c.lineTo(cx, cy + 6); c.lineTo(cx - 4, cy + 5); c.lineTo(cx - 5, cy - 2); c.closePath(); c.fill();
      c.fillStyle = "#b8860b"; c.fillRect(cx - 1, cy - 3, 2, 7);
    }
  } else if (slot === "weapon") {
    const wt = inst?.weaponType || "sword";
    if (wt === "wand") {
      c.fillStyle = "#8c6b3a"; c.fillRect(cx - 1, cy - 5, 2, 10);
      c.fillStyle = "#1fb3b3"; c.fillRect(cx - 2, cy - 6, 4, 2);
      c.fillStyle = "#6dd0ff"; c.fillRect(cx - 1, cy - 6, 2, 1);
    } else if (wt === "bow") {
      c.strokeStyle = "#8c6b3a"; c.lineWidth = 2;
      c.beginPath(); c.arc(cx - 1, cy, 6, -1.2, 1.2); c.stroke();
      c.strokeStyle = "#e0d3c1"; c.lineWidth = 1;
      c.beginPath(); c.moveTo(cx + 3, cy - 5); c.lineTo(cx + 3, cy + 5); c.stroke();
      c.fillStyle = "#b8860b"; c.fillRect(cx + 2, cy - 1, 2, 2);
    } else if (wt === "crossbow") {
      c.fillStyle = "#6b4e2a"; c.fillRect(cx - 4, cy - 1, 9, 2);
      c.fillRect(cx - 1, cy - 4, 2, 9);
      c.fillStyle = "#c0c8d0"; c.fillRect(cx - 5, cy - 2, 2, 4); c.fillRect(cx + 4, cy - 2, 2, 4);
      c.fillStyle = "#e0d3c1"; c.fillRect(cx - 3, cy - 3, 6, 1);
    } else if (wt === "axe") {
      c.fillStyle = "#8c6b3a"; c.fillRect(cx - 1, cy - 5, 2, 11);
      c.fillStyle = "#c0c8d0"; c.fillRect(cx - 4, cy - 4, 6, 3);
      c.fillStyle = "#6f6a5a"; c.fillRect(cx - 3, cy - 3, 4, 1);
    } else if (wt === "club") {
      c.fillStyle = "#6b4e2a"; c.fillRect(cx - 1, cy - 5, 2, 11);
      c.fillStyle = "#8c7b68"; c.fillRect(cx - 3, cy - 6, 6, 4);
      c.fillStyle = "#2a221b"; c.fillRect(cx - 2, cy - 4, 4, 1);
    } else if (wt === "nunchaku") {
      c.fillStyle = "#6b4e2a"; c.fillRect(cx - 5, cy - 4, 2, 7);
      c.fillRect(cx + 3, cy - 2, 2, 7);
      c.fillStyle = "#8c7b68"; c.fillRect(cx - 3, cy - 1, 6, 1);
      c.fillStyle = "#b8860b"; c.fillRect(cx - 1, cy - 1, 2, 2);
    } else { // sword/daggers
      c.fillStyle = "#c0c8d0"; c.fillRect(cx - 1, cy - 6, 2, 10);
      c.fillStyle = "#b8860b"; c.fillRect(cx - 2, cy + 2, 4, 1);
      c.fillStyle = "#6b4e2a"; c.fillRect(cx - 1, cy + 3, 2, 3);
    }
  } else {
    // generic
    c.fillStyle = "#b8860b"; c.fillRect(cx - 3, cy - 3, 6, 2); c.fillRect(cx - 1, cy, 2, 4);
  }
}

export function drawItem(ctx, item, px, py, size) {
  drawWith(ctx, px, py, size, (c) => {
    const cx = BASE / 2, cy = BASE / 2;
    const kind = item?.kind;
    switch (kind) {
      case "potion":
        c.fillStyle = "#8c1c13"; c.fillRect(cx - 3, cy - 2, 6, 6);
        c.fillStyle = "#b0251a"; c.fillRect(cx - 2, cy - 4, 4, 2);
        c.fillStyle = "#e0d3c1"; c.fillRect(cx - 1, cy - 1, 1, 2);
        break;
      case "mana":
        c.fillStyle = "#138c8c"; c.fillRect(cx - 3, cy - 2, 6, 6);
        c.fillStyle = "#1fb3b3"; c.fillRect(cx - 2, cy - 4, 4, 2);
        break;
      case "gold":
        c.fillStyle = "#b8860b"; c.beginPath(); c.arc(cx, cy, 3, 0, Math.PI * 2); c.fill();
        c.fillStyle = "#f0d89a"; c.fillRect(cx - 1, cy - 1, 2, 2);
        break;
      case "scroll":
        c.fillStyle = "#e0d3c1"; c.fillRect(cx - 4, cy - 2, 8, 4);
        c.fillStyle = "#8c7b68"; c.fillRect(cx - 4, cy - 2, 1, 4); c.fillRect(cx + 3, cy - 2, 1, 4);
        break;
      case "gear":
        drawGearIcon(c, item?.inst || null);
        break;
      default:
        c.fillStyle = "#e0d3c1"; c.fillRect(cx - 2, cy - 2, 4, 4);
    }
  });
}
