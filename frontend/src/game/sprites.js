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

export function drawTile(ctx, tile, px, py, size, variant = 0) {
  drawWith(ctx, px, py, size, (c) => {
    switch (tile) {
      case 0: { // WALL
        c.fillStyle = "#1c1815";
        c.fillRect(0, 0, BASE, BASE);
        c.fillStyle = "#2a241f";
        c.fillRect(0, 0, BASE, 3);
        c.fillStyle = "#322821";
        c.fillRect(1, 1, BASE - 2, BASE - 2);
        c.fillStyle = "#1c1815";
        c.fillRect(2, 2, BASE - 4, BASE - 4);
        c.fillStyle = "#433427";
        const sp = (variant * 7) % 5;
        c.fillRect(3 + sp, 3, 1, 1);
        break;
      }
      case 1: { // FLOOR
        c.fillStyle = "#0f0d0b";
        c.fillRect(0, 0, BASE, BASE);
        c.fillStyle = "#181513";
        c.fillRect(1, 1, BASE - 2, BASE - 2);
        c.fillStyle = "#22201c";
        const vv = (variant * 31) % 7;
        c.fillRect((vv % 4) + 4, ((vv * 3) % 6) + 4, 1, 1);
        break;
      }
      case 3: { // STAIRS DOWN
        c.fillStyle = "#0f0d0b";
        c.fillRect(0, 0, BASE, BASE);
        c.fillStyle = "#b8860b";
        for (let i = 0; i < 4; i++) {
          c.fillRect(2 + i * 2, 2 + i * 2, BASE - 4 - i * 4, 2);
        }
        c.fillStyle = "#f0d89a";
        c.fillRect(BASE / 2 - 1, BASE / 2, 2, 2);
        break;
      }
      default: {
        c.fillStyle = "#0f0d0b";
        c.fillRect(0, 0, BASE, BASE);
      }
    }
  });
}

export function drawPlayer(ctx, cls, px, py, size, flash = 0) {
  drawWith(ctx, px, py, size, (c) => {
    const cx = BASE / 2;
    const bodyColor = cls === "mage" ? "#2e86ab" : "#c0392b";
    const armorColor = cls === "mage" ? "#1a4b66" : "#7a1f13";
    c.fillStyle = "rgba(0,0,0,0.55)";
    c.beginPath(); c.ellipse(cx, BASE - 3, BASE / 3, 2, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#e0bf95"; c.fillRect(cx - 3, 3, 6, 5);
    c.fillStyle = bodyColor; c.fillRect(cx - 4, 8, 8, 8);
    c.fillStyle = armorColor; c.fillRect(cx - 4, 14, 8, 2);
    if (cls === "mage") {
      c.fillStyle = "#8c6b3a"; c.fillRect(cx + 4, 4, 1, 12);
      c.fillStyle = "#1fb3b3"; c.fillRect(cx + 3, 3, 3, 3);
    } else {
      c.fillStyle = "#c0c8d0"; c.fillRect(cx + 4, 5, 1, 9);
      c.fillStyle = "#b8860b"; c.fillRect(cx + 3, 13, 3, 1);
    }
    c.fillStyle = "#2a221b"; c.fillRect(cx - 3, 16, 2, 4); c.fillRect(cx + 1, 16, 2, 4);
    if (flash > 0) { c.fillStyle = `rgba(255,230,200,${flash})`; c.fillRect(0, 0, BASE, BASE); }
  });
}

export function drawGhostPlayer(ctx, cls, name, px, py, size) {
  drawWith(ctx, px, py, size, (c) => {
    c.globalAlpha = 0.55;
    const cx = BASE / 2;
    c.fillStyle = cls === "mage" ? "#7ab8d8" : "#d88a7a";
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

export function drawItem(ctx, kind, px, py, size) {
  drawWith(ctx, px, py, size, (c) => {
    const cx = BASE / 2, cy = BASE / 2;
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
      default:
        c.fillStyle = "#e0d3c1"; c.fillRect(cx - 2, cy - 2, 4, 4);
    }
  });
}
