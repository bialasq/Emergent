// Server-authoritative coop renderer.
// This engine does NOT compute game logic. It only:
//   - decodes server map (rows of digits)
//   - tracks per-player explored set (server sends explored list)
//   - draws tiles, enemies, items, players received from server
//   - sends action intents to server via CoopClient
//
// Player input (keys) → action messages → server → state snapshot → render.

import { drawTile, drawPlayer, drawEnemy, drawItem, drawGhostPlayer } from "./sprites";
import { TILE, MAP_W, MAP_H, T } from "./tiles";
import { SPELLS, SPELL_ORDER } from "./spells";
import { BIOMES, biomeForDepth } from "./biomes";
import { sfx } from "./audio";

export class CoopRenderer {
  constructor({ canvas, minimap, coop, onState, onVictory, onDeath }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    this.minimap = minimap;
    this.minimapCtx = minimap.getContext("2d", { alpha: false });
    this.minimapCtx.imageSmoothingEnabled = false;
    this.coop = coop;
    this.onState = onState || (() => {});
    this.onVictory = onVictory || (() => {});
    this.onDeath = onDeath || (() => {});
    this.tileSize = TILE;
    this.viewW = 0; this.viewH = 0;

    this.state = null;       // last server state
    this.map = null;          // server map { rows, depth, biome, exit }
    this.explored = new Set();
    this.dirty = true;
    this.running = false;
    this.lastTs = 0;
    this.handleKey = this.handleKey.bind(this);
    this.loop = this.loop.bind(this);
  }

  start() {
    this.running = true;
    window.addEventListener("keydown", this.handleKey);
    this.resize();
    requestAnimationFrame(this.loop);
  }
  stop() {
    this.running = false;
    window.removeEventListener("keydown", this.handleKey);
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.viewW = rect.width;
    this.viewH = rect.height;
    this.dirty = true;
  }

  setMap(payload) {
    this.map = payload;
    this.explored = new Set(); // reset on new floor
    sfx.descend();
    this.dirty = true;
  }

  setState(s) {
    const prev = this.state;
    this.state = s;
    if (s.explored) for (const c of s.explored) this.explored.add(c[0] + "," + c[1]);
    if (s.victible) {/* no-op */}
    if (s.victory && (!prev || !prev.victory)) {
      sfx.victory();
      this.onVictory(s);
    }
    if (prev && prev.you?.hp > 0 && s.you?.hp <= 0) {
      sfx.death();
      this.onDeath(s);
    } else if (prev && s.you?.hp < prev.you?.hp) {
      sfx.hurt();
    }
    if (prev && (s.you?.kills || 0) > (prev.you?.kills || 0)) sfx.hit();
    this.onState(s);
    this.dirty = true;
  }

  handleKey(e) {
    if (!this.running || !this.state) return;
    const k = e.key.toLowerCase();
    // spell
    for (const id of SPELL_ORDER) {
      if (SPELLS[id].hotkey === k) {
        this.coop.send({ type: "action", kind: "spell", id });
        sfx.spell();
        e.preventDefault();
        return;
      }
    }
    let dx = 0, dy = 0;
    switch (k) {
      case "arrowup": case "w": dy = -1; break;
      case "arrowdown": case "s": dy = 1; break;
      case "arrowleft": case "a": dx = -1; break;
      case "arrowright": case "d": dx = 1; break;
      case " ": case ".":
        this.coop.send({ type: "action", kind: "wait" });
        e.preventDefault(); return;
      case "q":
        this.coop.send({ type: "action", kind: "use_potion" });
        sfx.heal(); e.preventDefault(); return;
      case "r":
        this.coop.send({ type: "action", kind: "use_mana" });
        e.preventDefault(); return;
      default: return;
    }
    if (dx || dy) {
      this.coop.send({ type: "action", kind: "move", dx, dy });
      sfx.step();
      e.preventDefault();
    }
  }

  loop(ts) {
    if (!this.running) return;
    const dt = Math.min(0.05, (ts - this.lastTs) / 1000 || 0);
    this.lastTs = ts;
    if (this.dirty) {
      this.render();
      this.renderMinimap();
      this.dirty = false;
    }
    if (this.running) requestAnimationFrame(this.loop);
  }

  _tileAt(x, y) {
    if (!this.map) return T.WALL;
    if (y < 0 || y >= MAP_H || x < 0 || x >= MAP_W) return T.WALL;
    const row = this.map.rows[y];
    if (!row) return T.WALL;
    const ch = row.charCodeAt(x) - 48; // '0'.charCodeAt
    return ch;
  }

  render() {
    const ctx = this.ctx;
    const s = this.tileSize;
    const biome = this.map ? BIOMES[this.map.biome] || BIOMES.stone : BIOMES.stone;
    ctx.fillStyle = biome.bg;
    ctx.fillRect(0, 0, this.viewW, this.viewH);
    if (!this.state || !this.map) return;
    const me = this.state.you;
    if (!me) return;

    const camX = me.x * s - this.viewW / 2 + s / 2;
    const camY = me.y * s - this.viewH / 2 + s / 2;
    const cameraX = Math.max(0, Math.min(MAP_W * s - this.viewW, camX));
    const cameraY = Math.max(0, Math.min(MAP_H * s - this.viewH, camY));

    const startX = Math.max(0, Math.floor(cameraX / s) - 1);
    const endX = Math.min(MAP_W, Math.ceil((cameraX + this.viewW) / s) + 1);
    const startY = Math.max(0, Math.floor(cameraY / s) - 1);
    const endY = Math.min(MAP_H, Math.ceil((cameraY + this.viewH) / s) + 1);

    const visibleSet = new Set((this.state.visible || []).map(c => c[0] + "," + c[1]));

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const key = x + "," + y;
        if (!this.explored.has(key)) continue;
        const t = this._tileAt(x, y);
        drawTile(ctx, t, x * s - cameraX, y * s - cameraY, s, (x * 13 + y * 7) | 0);
      }
    }
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const key = x + "," + y;
        const exp = this.explored.has(key);
        const vis = visibleSet.has(key);
        if (vis) continue;
        ctx.fillStyle = exp ? "rgba(0,0,0,0.62)" : "rgba(5,4,3,0.98)";
        ctx.fillRect(x * s - cameraX, y * s - cameraY, s, s);
      }
    }
    // items
    for (const it of (this.state.items || [])) {
      drawItem(ctx, it.kind, it.x * s - cameraX, it.y * s - cameraY, s);
    }
    // enemies
    for (const e of (this.state.enemies || [])) {
      drawEnemy(ctx, e.kind, e.x * s - cameraX, e.y * s - cameraY, s);
      if (e.hp < e.maxHp) {
        const w = s - 6;
        ctx.fillStyle = "#0a0807";
        ctx.fillRect(e.x * s - cameraX + 3, e.y * s - cameraY - 5, w, 3);
        ctx.fillStyle = "#8c1c13";
        ctx.fillRect(e.x * s - cameraX + 3, e.y * s - cameraY - 5, (w * e.hp) / e.maxHp, 3);
      }
    }
    // other players (always drawn if same depth — server sends them)
    for (const op of (this.state.players || [])) {
      if (!op.alive) continue;
      drawGhostPlayer(ctx, op.cls, op.name, op.x * s - cameraX, op.y * s - cameraY, s);
      ctx.font = "bold 12px Cinzel, serif"; ctx.textAlign = "center";
      ctx.fillStyle = "#0a0807"; ctx.fillText(op.name || "?", op.x * s - cameraX + s / 2 + 1, op.y * s - cameraY - 8 + 1);
      ctx.fillStyle = "#c8b79a"; ctx.fillText(op.name || "?", op.x * s - cameraX + s / 2, op.y * s - cameraY - 8);
    }
    // me
    drawPlayer(ctx, me.cls, me.x * s - cameraX, me.y * s - cameraY, s, 0);
    const barX = me.x * s - cameraX + 4;
    const barY = me.y * s - cameraY - 14;
    const barW = s - 8;
    ctx.fillStyle = "#0a0807"; ctx.fillRect(barX - 1, barY - 1, barW + 2, 5);
    ctx.fillStyle = "#8c1c13"; ctx.fillRect(barX, barY, (barW * me.hp) / me.maxHp, 3);
    ctx.fillStyle = "#0a0807"; ctx.fillRect(barX - 1, barY + 5 - 1, barW + 2, 5);
    ctx.fillStyle = "#138c8c"; ctx.fillRect(barX, barY + 5, (barW * me.mp) / me.maxMp, 3);
    // vignette
    const grad = ctx.createRadialGradient(
      this.viewW / 2, this.viewH / 2, Math.min(this.viewW, this.viewH) * 0.2,
      this.viewW / 2, this.viewH / 2, Math.max(this.viewW, this.viewH) * 0.8
    );
    grad.addColorStop(0, biome.vignette);
    grad.addColorStop(0.4, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.75)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.viewW, this.viewH);
  }

  renderMinimap() {
    const c = this.minimapCtx;
    const w = this.minimap.width, h = this.minimap.height;
    if (!this.map) { c.fillStyle = "#0a0807"; c.fillRect(0,0,w,h); return; }
    const scaleX = w / MAP_W, scaleY = h / MAP_H;
    c.fillStyle = "#0a0807"; c.fillRect(0,0,w,h);
    for (const k of this.explored) {
      const [x, y] = k.split(",").map(Number);
      const t = this._tileAt(x, y);
      if (t === T.WALL) continue;
      c.fillStyle = "#4a4038";
      c.fillRect(x * scaleX, y * scaleY, Math.max(1, scaleX), Math.max(1, scaleY));
    }
    if (this.state) {
      const visibleSet = new Set((this.state.visible || []).map(cc => cc[0] + "," + cc[1]));
      for (const k of visibleSet) {
        const [x, y] = k.split(",").map(Number);
        const t = this._tileAt(x, y);
        if (t === T.WALL) continue;
        c.fillStyle = "#c8b79a";
        c.fillRect(x * scaleX, y * scaleY, Math.max(1, scaleX), Math.max(1, scaleY));
      }
      // exit
      if (this.map.exit) {
        const [ex, ey] = this.map.exit;
        if (this.explored.has(ex + "," + ey)) {
          c.fillStyle = "#b8860b";
          c.fillRect(ex * scaleX - 1, ey * scaleY - 1, Math.max(2, scaleX + 2), Math.max(2, scaleY + 2));
        }
      }
      // enemies
      for (const e of (this.state.enemies || [])) {
        c.fillStyle = e.boss ? "#b8860b" : "#8c1c13";
        c.fillRect(e.x * scaleX - 1, e.y * scaleY - 1, Math.max(2, scaleX + 2), Math.max(2, scaleY + 2));
      }
      // others
      for (const op of (this.state.players || [])) {
        if (!op.alive) continue;
        c.fillStyle = "#c8b79a";
        c.fillRect(op.x * scaleX - 1, op.y * scaleY - 1, Math.max(2, scaleX + 2), Math.max(2, scaleY + 2));
      }
      const me = this.state.you;
      c.fillStyle = "#138c8c";
      c.fillRect(me.x * scaleX - 1, me.y * scaleY - 1, Math.max(2, scaleX + 2), Math.max(2, scaleY + 2));
    }
  }
}
