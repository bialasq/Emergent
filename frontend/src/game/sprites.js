// Procedural pixel sprite drawing directly to canvas.
// Uses simple shapes so no external assets are required.

export function drawTile(ctx, tile, px, py, tileSize, variant = 0) {
  const s = tileSize;
  switch (tile) {
    case 0: { // WALL - stone block
      ctx.fillStyle = "#1c1815";
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = "#2a241f";
      ctx.fillRect(px, py, s, Math.max(1, s / 8));
      ctx.fillStyle = "#322821";
      ctx.fillRect(px + 1, py + 1, s - 2, s - 2);
      ctx.fillStyle = "#1c1815";
      ctx.fillRect(px + 2, py + 2, s - 4, s - 4);
      // mortar speckle
      ctx.fillStyle = "#433427";
      const sp = (variant * 7) % 5;
      ctx.fillRect(px + 3 + sp, py + 3, 1, 1);
      break;
    }
    case 1: { // FLOOR
      ctx.fillStyle = "#0f0d0b";
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = "#181513";
      ctx.fillRect(px + 1, py + 1, s - 2, s - 2);
      // dot speckle
      ctx.fillStyle = "#22201c";
      const vv = (variant * 31) % 7;
      ctx.fillRect(px + (vv % 4) + 4, py + ((vv * 3) % 6) + 4, 1, 1);
      break;
    }
    case 3: { // STAIRS DOWN
      ctx.fillStyle = "#0f0d0b";
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = "#b8860b";
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(px + 2 + i * 2, py + 2 + i * 2, s - 4 - i * 4, 2);
      }
      ctx.fillStyle = "#f0d89a";
      ctx.fillRect(px + s / 2 - 1, py + s / 2, 2, 2);
      break;
    }
    default: {
      ctx.fillStyle = "#0f0d0b";
      ctx.fillRect(px, py, s, s);
    }
  }
}

export function drawPlayer(ctx, cls, px, py, size, flash = 0) {
  const s = size;
  const cx = px + s / 2, cy = py + s / 2;
  // body
  const bodyColor = cls === "mage" ? "#2e86ab" : "#c0392b";
  const armorColor = cls === "mage" ? "#1a4b66" : "#7a1f13";
  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.beginPath();
  ctx.ellipse(cx, py + s - 3, s / 3, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  // head
  ctx.fillStyle = "#e0bf95";
  ctx.fillRect(cx - 3, py + 3, 6, 5);
  // body
  ctx.fillStyle = bodyColor;
  ctx.fillRect(cx - 4, py + 8, 8, 8);
  ctx.fillStyle = armorColor;
  ctx.fillRect(cx - 4, py + 14, 8, 2);
  // arms / weapon
  if (cls === "mage") {
    ctx.fillStyle = "#8c6b3a";
    ctx.fillRect(cx + 4, py + 4, 1, 12); // staff
    ctx.fillStyle = "#1fb3b3";
    ctx.fillRect(cx + 3, py + 3, 3, 3); // orb
  } else {
    ctx.fillStyle = "#c0c8d0";
    ctx.fillRect(cx + 4, py + 5, 1, 9); // sword
    ctx.fillStyle = "#b8860b";
    ctx.fillRect(cx + 3, py + 13, 3, 1);
  }
  // legs
  ctx.fillStyle = "#2a221b";
  ctx.fillRect(cx - 3, py + 16, 2, 4);
  ctx.fillRect(cx + 1, py + 16, 2, 4);

  if (flash > 0) {
    ctx.fillStyle = `rgba(255,230,200,${flash})`;
    ctx.fillRect(px, py, s, s);
  }
}

export function drawEnemy(ctx, kind, px, py, size) {
  const s = size;
  const cx = px + s / 2;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.beginPath();
  ctx.ellipse(cx, py + s - 3, s / 3, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  switch (kind) {
    case "rat":
      ctx.fillStyle = "#7a5a3c";
      ctx.fillRect(cx - 5, py + 12, 10, 6);
      ctx.fillRect(cx + 4, py + 10, 4, 3); // head
      ctx.fillStyle = "#2a1a10";
      ctx.fillRect(cx + 6, py + 11, 1, 1); // eye
      ctx.fillStyle = "#aa8866";
      ctx.fillRect(cx - 6, py + 13, 1, 3); // tail
      break;
    case "goblin":
      ctx.fillStyle = "#5a7a3c";
      ctx.fillRect(cx - 3, py + 4, 6, 5); // head
      ctx.fillRect(cx - 4, py + 9, 8, 7); // body
      ctx.fillStyle = "#b0251a";
      ctx.fillRect(cx - 2, py + 6, 1, 1);
      ctx.fillRect(cx + 1, py + 6, 1, 1);
      ctx.fillStyle = "#8c8c8c";
      ctx.fillRect(cx + 4, py + 8, 1, 8); // dagger
      ctx.fillStyle = "#2a221b";
      ctx.fillRect(cx - 3, py + 16, 2, 4);
      ctx.fillRect(cx + 1, py + 16, 2, 4);
      break;
    case "skeleton":
      ctx.fillStyle = "#c8b79a";
      ctx.fillRect(cx - 3, py + 3, 6, 5); // skull
      ctx.fillStyle = "#0a0807";
      ctx.fillRect(cx - 2, py + 5, 1, 2);
      ctx.fillRect(cx + 1, py + 5, 1, 2);
      ctx.fillStyle = "#c8b79a";
      ctx.fillRect(cx - 3, py + 8, 6, 2);
      ctx.fillRect(cx - 1, py + 10, 3, 6);
      ctx.fillStyle = "#8c7b68";
      ctx.fillRect(cx + 4, py + 5, 1, 12);
      ctx.fillStyle = "#c8b79a";
      ctx.fillRect(cx - 3, py + 16, 2, 4);
      ctx.fillRect(cx + 1, py + 16, 2, 4);
      break;
    case "orc":
      ctx.fillStyle = "#6b8f3b";
      ctx.fillRect(cx - 4, py + 3, 8, 6);
      ctx.fillRect(cx - 5, py + 9, 10, 8);
      ctx.fillStyle = "#b0251a";
      ctx.fillRect(cx - 2, py + 5, 1, 1);
      ctx.fillRect(cx + 1, py + 5, 1, 1);
      ctx.fillStyle = "#c0c8d0";
      ctx.fillRect(cx + 5, py + 6, 2, 10);
      ctx.fillStyle = "#2a221b";
      ctx.fillRect(cx - 4, py + 17, 3, 3);
      ctx.fillRect(cx + 1, py + 17, 3, 3);
      break;
    case "wraith":
      ctx.fillStyle = "#7ab8b8";
      ctx.globalAlpha = 0.8;
      ctx.fillRect(cx - 4, py + 4, 8, 14);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#e0f8f8";
      ctx.fillRect(cx - 2, py + 6, 1, 2);
      ctx.fillRect(cx + 1, py + 6, 1, 2);
      break;
    case "troll":
      ctx.fillStyle = "#4a6b2a";
      ctx.fillRect(cx - 5, py + 2, 10, 7);
      ctx.fillRect(cx - 6, py + 9, 12, 9);
      ctx.fillStyle = "#8c1c13";
      ctx.fillRect(cx - 3, py + 4, 1, 2);
      ctx.fillRect(cx + 2, py + 4, 1, 2);
      ctx.fillStyle = "#e0d3c1";
      ctx.fillRect(cx - 2, py + 8, 1, 2); // tooth
      ctx.fillRect(cx + 1, py + 8, 1, 2);
      break;
    case "golem":
      ctx.fillStyle = "#6f6a5a";
      ctx.fillRect(cx - 5, py + 2, 10, 8);
      ctx.fillRect(cx - 6, py + 10, 12, 9);
      ctx.fillStyle = "#b8860b";
      ctx.fillRect(cx - 1, py + 5, 2, 1); // runes
      ctx.fillRect(cx - 3, py + 12, 6, 1);
      break;
    case "wyvern":
      ctx.fillStyle = "#8c1c13";
      ctx.fillRect(cx - 6, py + 6, 12, 9);
      ctx.fillRect(cx + 4, py + 4, 4, 4); // head
      ctx.fillStyle = "#e0d3c1";
      ctx.fillRect(cx + 6, py + 5, 1, 1);
      ctx.fillStyle = "#b0251a";
      ctx.fillRect(cx - 8, py + 4, 3, 3); // wing
      ctx.fillRect(cx - 8, py + 12, 3, 3);
      break;
    case "lich":
      ctx.fillStyle = "#b8860b";
      ctx.fillRect(cx - 5, py + 2, 10, 18);
      ctx.fillStyle = "#e0d3c1";
      ctx.fillRect(cx - 3, py + 4, 6, 4); // skull
      ctx.fillStyle = "#8c1c13";
      ctx.fillRect(cx - 2, py + 5, 1, 1);
      ctx.fillRect(cx + 1, py + 5, 1, 1);
      ctx.fillStyle = "#138c8c";
      ctx.fillRect(cx + 5, py + 2, 1, 16); // staff
      ctx.fillRect(cx + 4, py + 1, 3, 3); // orb
      break;
    default:
      ctx.fillStyle = "#8c7b68";
      ctx.fillRect(cx - 3, py + 6, 6, 12);
  }
}

export function drawItem(ctx, kind, px, py, size) {
  const cx = px + size / 2, cy = py + size / 2;
  switch (kind) {
    case "potion":
      ctx.fillStyle = "#8c1c13";
      ctx.fillRect(cx - 3, cy - 2, 6, 6);
      ctx.fillStyle = "#b0251a";
      ctx.fillRect(cx - 2, cy - 4, 4, 2);
      ctx.fillStyle = "#e0d3c1";
      ctx.fillRect(cx - 1, cy - 1, 1, 2);
      break;
    case "mana":
      ctx.fillStyle = "#138c8c";
      ctx.fillRect(cx - 3, cy - 2, 6, 6);
      ctx.fillStyle = "#1fb3b3";
      ctx.fillRect(cx - 2, cy - 4, 4, 2);
      break;
    case "gold":
      ctx.fillStyle = "#b8860b";
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#f0d89a";
      ctx.fillRect(cx - 1, cy - 1, 2, 2);
      break;
    case "scroll":
      ctx.fillStyle = "#e0d3c1";
      ctx.fillRect(cx - 4, cy - 2, 8, 4);
      ctx.fillStyle = "#8c7b68";
      ctx.fillRect(cx - 4, cy - 2, 1, 4);
      ctx.fillRect(cx + 3, cy - 2, 1, 4);
      break;
    default:
      ctx.fillStyle = "#e0d3c1";
      ctx.fillRect(cx - 2, cy - 2, 4, 4);
  }
}
