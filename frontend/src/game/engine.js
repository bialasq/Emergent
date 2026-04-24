// Dungeon of Echoes - main game engine.
// Performance principles:
//  - requestAnimationFrame loop with dirty-flag; tile layer pre-rendered to offscreen canvas once per level.
//  - Turn-resolved logic: enemies only think when the player acts → zero AI work on idle frames.
//  - Damage numbers & particles use a pool reused across turns.
//  - Movement interpolation for smoothness while keeping logic discrete.

import { generateDungeon, isWalkable } from "./dungeon";
import { computeFOV } from "./fov";
import { MAP_W, MAP_H, T, TILE } from "./tiles";
import {
  CLASSES, ENEMIES, ITEMS, spawnTableForDepth, weightedPick,
  resolveAttack, rollDice, XP_PER_LEVEL, rollUpgrades, applyUpgrade,
} from "./entities";
import { drawTile, drawPlayer, drawEnemy, drawItem } from "./sprites";
import { makeRng } from "./rng";

export class Game {
  constructor({ canvas, minimap, seed, classKey, characterName, onStateChange, onDeath, onVictory, onLevelUp, onEvent }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    this.minimap = minimap;
    this.minimapCtx = minimap.getContext("2d", { alpha: false });
    this.minimapCtx.imageSmoothingEnabled = false;

    this.seed = seed >>> 0;
    this.classKey = classKey;
    this.characterName = characterName || "Wanderer";

    this.onStateChange = onStateChange || (() => {});
    this.onDeath = onDeath || (() => {});
    this.onVictory = onVictory || (() => {});
    this.onLevelUp = onLevelUp || (() => {});
    this.onEvent = onEvent || (() => {});

    this.tileSize = TILE;
    this.viewW = 0; this.viewH = 0;
    this.cameraX = 0; this.cameraY = 0;

    this.depth = 0;
    this.maxDepth = 6;
    this.turn = 0;
    this.kills = 0;
    this.score = 0;
    this.startedAt = Date.now();

    const cls = CLASSES[classKey];
    this.player = {
      cls: classKey,
      name: this.characterName,
      x: 0, y: 0, rx: 0, ry: 0, // render positions
      hp: cls.stats.maxHp, maxHp: cls.stats.maxHp,
      mp: cls.stats.maxMp, maxMp: cls.stats.maxMp,
      atk: cls.stats.atk, def: cls.stats.def,
      crit: cls.stats.crit, range: cls.stats.range,
      dmgDice: cls.stats.dmgDice,
      dmgBonus: 0,
      level: 1, xp: 0, nextXp: XP_PER_LEVEL(1),
      gold: 0,
      regen: false, regenTick: 0,
      dodge: 0,
      inv: [],
      flash: 0,
    };

    this.enemies = [];
    this.items = [];
    this.damageNumbers = []; // pool-recycled
    this.log = [];
    this.explored = new Set();
    this.visible = new Set();

    this.tileCanvas = document.createElement("canvas");
    this.tileCtx = this.tileCanvas.getContext("2d");
    this.tileCtx.imageSmoothingEnabled = false;

    this.running = false;
    this.paused = false;
    this.awaitingLevelUp = false;
    this.pendingMove = null;
    this.dirty = true;
    this.lastTs = 0;
    this.fps = 60;

    this.handleKey = this.handleKey.bind(this);
    this.loop = this.loop.bind(this);
  }

  start() {
    this.enterFloor(1);
    this.running = true;
    window.addEventListener("keydown", this.handleKey);
    this.resize();
    requestAnimationFrame(this.loop);
    this.pushState();
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
    this.dpr = dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.viewW = rect.width;
    this.viewH = rect.height;
    this.dirty = true;
  }

  pushState() {
    this.onStateChange({
      player: { ...this.player },
      depth: this.depth,
      turn: this.turn,
      kills: this.kills,
      score: this.score,
      log: this.log.slice(-6),
      paused: this.paused,
      startedAt: this.startedAt,
    });
  }

  enterFloor(depth) {
    this.depth = depth;
    const { map, rooms, start, exit, rng } = generateDungeon(this.seed, depth);
    this.map = map;
    this.rooms = rooms;
    this.exit = exit;
    this.floorRng = rng;

    this.player.x = start.x; this.player.y = start.y;
    this.player.rx = start.x; this.player.ry = start.y;

    // pre-render tile layer to offscreen canvas
    const s = this.tileSize;
    this.tileCanvas.width = MAP_W * s;
    this.tileCanvas.height = MAP_H * s;
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        drawTile(this.tileCtx, map[y][x], x * s, y * s, s, (x * 13 + y * 7) | 0);
      }
    }

    // populate enemies
    this.enemies = [];
    const table = spawnTableForDepth(depth);
    const enemyCount = 6 + depth * 2;
    for (let i = 0; i < enemyCount; i++) {
      const room = rooms[rng.int(0, rooms.length - 1)];
      if (room === rooms[0]) continue;
      const x = room.x + rng.int(1, room.w - 2);
      const y = room.y + rng.int(1, room.h - 2);
      if (!isWalkable(map, x, y)) continue;
      if (this.enemies.some(e => e.x === x && e.y === y)) continue;
      const kind = weightedPick(rng, table);
      const base = ENEMIES[kind];
      this.enemies.push({
        kind, name: base.name, tier: base.tier, color: base.color,
        x, y, rx: x, ry: y,
        hp: base.hp, maxHp: base.hp,
        atk: base.atk, def: base.def, dmg: base.dmg, xp: base.xp,
        boss: base.boss || false,
        alerted: false, flash: 0,
      });
    }

    // final floor boss
    if (depth === this.maxDepth) {
      const bossRoom = rooms[rooms.length - 1];
      const base = ENEMIES.lich;
      this.enemies.push({
        kind: "lich", name: base.name, tier: 5, color: base.color,
        x: bossRoom.cx, y: bossRoom.cy, rx: bossRoom.cx, ry: bossRoom.cy,
        hp: base.hp, maxHp: base.hp,
        atk: base.atk, def: base.def, dmg: base.dmg, xp: base.xp,
        boss: true, alerted: false, flash: 0,
      });
    }

    // populate items
    this.items = [];
    const itemCount = 4 + Math.floor(depth * 1.5);
    const itemKeys = ["potion", "potion", "mana", "gold", "gold", "scroll"];
    for (let i = 0; i < itemCount; i++) {
      const room = rooms[rng.int(0, rooms.length - 1)];
      const x = room.x + rng.int(1, room.w - 2);
      const y = room.y + rng.int(1, room.h - 2);
      if (!isWalkable(map, x, y)) continue;
      if (this.items.some(it => it.x === x && it.y === y)) continue;
      const kind = itemKeys[rng.int(0, itemKeys.length - 1)];
      const amount = kind === "gold" ? rng.int(5, 15 + depth * 3) : ITEMS[kind].value;
      this.items.push({ kind, x, y, amount, name: ITEMS[kind].name });
    }

    this.explored = new Set();
    this.updateFOV();
    this.logMsg(`You descend into floor ${depth}. ${rooms.length} chambers echo.`);
    this.dirty = true;
  }

  updateFOV() {
    this.visible = computeFOV(this.map, this.player.x, this.player.y, 9);
    for (const k of this.visible) this.explored.add(k);
  }

  logMsg(msg, kind = "info") {
    this.log.push({ msg, kind, turn: this.turn });
    if (this.log.length > 40) this.log.shift();
  }

  pushDamage(x, y, text, color) {
    this.damageNumbers.push({ x, y, text, color, life: 1.0 });
    if (this.damageNumbers.length > 30) this.damageNumbers.shift();
  }

  // --- input ---
  handleKey(e) {
    if (!this.running || this.awaitingLevelUp) return;
    const k = e.key.toLowerCase();
    if (k === "p" || k === "escape") {
      this.paused = !this.paused;
      this.pushState();
      this.dirty = true;
      e.preventDefault();
      return;
    }
    if (this.paused) return;

    let dx = 0, dy = 0;
    switch (k) {
      case "arrowup": case "w": case "k": dy = -1; break;
      case "arrowdown": case "s": case "j": dy = 1; break;
      case "arrowleft": case "a": case "h": dx = -1; break;
      case "arrowright": case "d": case "l": dx = 1; break;
      case " ": case ".": this.doTurn(0, 0); e.preventDefault(); return;
      case ">": case "e":
        if (this.map[this.player.y][this.player.x] === T.STAIRS_DOWN) {
          if (this.depth >= this.maxDepth) {
            // shouldn't happen — boss must die, handled separately
          } else {
            this.enterFloor(this.depth + 1);
            this.pushState();
          }
        }
        return;
      case "q":
        this.useItemByEffect("potion");
        this.pushState();
        return;
      case "r":
        this.useItemByEffect("mana");
        this.pushState();
        return;
      default: return;
    }
    if (dx || dy) {
      this.doTurn(dx, dy);
      e.preventDefault();
    }
  }

  useItemByEffect(effect) {
    const idx = this.player.inv.findIndex(i => i.kind === effect);
    if (idx === -1) return;
    const it = this.player.inv.splice(idx, 1)[0];
    if (effect === "potion") {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + it.amount);
      this.logMsg(`Health restored (+${it.amount}).`, "heal");
      this.pushDamage(this.player.x, this.player.y, `+${it.amount}`, "#b0251a");
    } else if (effect === "mana") {
      this.player.mp = Math.min(this.player.maxMp, this.player.mp + it.amount);
      this.logMsg(`Mana restored (+${it.amount}).`, "mana");
      this.pushDamage(this.player.x, this.player.y, `+${it.amount}`, "#1fb3b3");
    }
    this.dirty = true;
  }

  // --- turn logic ---
  doTurn(dx, dy) {
    if (this.awaitingLevelUp) return;
    // Player action
    if (dx || dy) this.playerMoveOrAttack(dx, dy);
    // Enemies act
    this.enemiesAct();
    // pickup items
    this.pickupAt(this.player.x, this.player.y);
    // tick regen
    if (this.player.regen) {
      this.player.regenTick++;
      if (this.player.regenTick >= 6) { this.player.regenTick = 0; this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1); }
    }
    this.player.mp = Math.min(this.player.maxMp, this.player.mp + 0.05);
    this.turn++;
    this.updateFOV();
    this.pushState();
    this.dirty = true;
  }

  playerMoveOrAttack(dx, dy) {
    const nx = this.player.x + dx;
    const ny = this.player.y + dy;
    // Attack adjacent enemy?
    const adj = this.enemies.find(e => e.x === nx && e.y === ny && e.hp > 0);
    if (adj) {
      const result = resolveAttack(this.floorRng, {
        dmg: this.player.dmgDice, bonus: this.player.dmgBonus, crit: this.player.crit,
      }, adj);
      adj.hp -= result.dmg;
      adj.flash = 1;
      this.pushDamage(adj.x, adj.y, String(result.dmg) + (result.crit ? "!" : ""), result.crit ? "#f0d89a" : "#e0d3c1");
      this.logMsg(`You strike ${adj.name} for ${result.dmg}${result.crit ? " (crit!)" : ""}.`, "hit");
      if (adj.hp <= 0) {
        this.killEnemy(adj);
      }
      return;
    }
    // Ranged for mage: press direction with no enemy adjacent — shoot in that direction up to range
    if (this.classKey === "mage" && this.player.mp >= 5) {
      // look along direction
      for (let r = 1; r <= this.player.range; r++) {
        const tx = this.player.x + dx * r;
        const ty = this.player.y + dy * r;
        if (!isWalkable(this.map, tx, ty)) break;
        const tgt = this.enemies.find(e => e.x === tx && e.y === ty && e.hp > 0);
        if (tgt) {
          const result = resolveAttack(this.floorRng, {
            dmg: this.player.dmgDice, bonus: this.player.dmgBonus + 1, crit: this.player.crit,
          }, tgt);
          tgt.hp -= result.dmg; tgt.flash = 1;
          this.player.mp -= 5;
          this.pushDamage(tgt.x, tgt.y, String(result.dmg) + (result.crit ? "!" : ""), "#1fb3b3");
          this.logMsg(`You hurl arcane flame at ${tgt.name} for ${result.dmg}.`, "spell");
          if (tgt.hp <= 0) this.killEnemy(tgt);
          return;
        }
      }
    }
    // Move
    if (isWalkable(this.map, nx, ny)) {
      this.player.x = nx; this.player.y = ny;
    } else {
      this.logMsg(`The stone blocks your path.`, "bump");
    }
  }

  killEnemy(e) {
    e.hp = 0;
    this.kills++;
    this.player.xp += e.xp;
    this.score += e.xp * (1 + this.depth);
    this.logMsg(`${e.name} falls to silence. +${e.xp} XP.`, "kill");
    // chance to drop loot
    if (this.floorRng.chance(0.3)) {
      const kind = this.floorRng.pick(["potion", "mana", "gold"]);
      this.items.push({ kind, x: e.x, y: e.y, amount: kind === "gold" ? this.floorRng.int(5, 15) : ITEMS[kind].value, name: ITEMS[kind].name });
    }
    this.enemies = this.enemies.filter(en => en.hp > 0);
    if (e.boss) {
      this.onVictory(this.getSummary("victory"));
      this.running = false;
      this.stop();
      return;
    }
    // level up?
    while (this.player.xp >= this.player.nextXp) {
      this.player.xp -= this.player.nextXp;
      this.player.level++;
      this.player.nextXp = XP_PER_LEVEL(this.player.level);
      this.awaitingLevelUp = true;
      const upgrades = rollUpgrades(this.floorRng, 3);
      this.onLevelUp(upgrades);
    }
  }

  applyUpgrade(upg) {
    applyUpgrade(this.player, upg);
    this.logMsg(`You attune to ${upg.name}.`, "levelup");
    this.awaitingLevelUp = false;
    this.pushState();
    this.dirty = true;
  }

  enemiesAct() {
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      const vis = this.visible.has(e.x + "," + e.y);
      if (vis) e.alerted = true;
      if (!e.alerted) continue;
      const dx = this.player.x - e.x;
      const dy = this.player.y - e.y;
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist === 1) {
        // attack
        if (this.player.dodge > 0 && this.floorRng.chance(this.player.dodge)) {
          this.pushDamage(this.player.x, this.player.y, "dodge", "#e0d3c1");
          this.logMsg(`You weave past ${e.name}'s blow.`, "dodge");
          continue;
        }
        const result = resolveAttack(this.floorRng, { dmg: e.dmg, crit: 0.05 }, { def: this.player.def });
        this.player.hp -= result.dmg;
        this.player.flash = 1;
        this.pushDamage(this.player.x, this.player.y, String(result.dmg), "#b0251a");
        this.logMsg(`${e.name} hits you for ${result.dmg}${result.crit ? " (crit)" : ""}.`, "dmg");
        if (this.player.hp <= 0) {
          this.player.hp = 0;
          this.running = false;
          this.onDeath(this.getSummary("dead"));
          this.stop();
          return;
        }
      } else {
        // greedy move toward player
        const stepX = Math.sign(dx), stepY = Math.sign(dy);
        const tryMoves = Math.abs(dx) > Math.abs(dy)
          ? [[stepX, 0], [0, stepY], [stepX, stepY]]
          : [[0, stepY], [stepX, 0], [stepX, stepY]];
        for (const [mx, my] of tryMoves) {
          const nx = e.x + mx, ny = e.y + my;
          if (nx === this.player.x && ny === this.player.y) continue;
          if (!isWalkable(this.map, nx, ny)) continue;
          if (this.enemies.some(en => en !== e && en.hp > 0 && en.x === nx && en.y === ny)) continue;
          e.x = nx; e.y = ny;
          break;
        }
      }
    }
  }

  pickupAt(x, y) {
    const idx = this.items.findIndex(i => i.x === x && i.y === y);
    if (idx === -1) return;
    const it = this.items.splice(idx, 1)[0];
    if (it.kind === "gold") {
      this.player.gold += it.amount;
      this.score += it.amount;
      this.logMsg(`You pocket ${it.amount} gold.`, "loot");
    } else if (it.kind === "scroll") {
      this.player.xp += it.amount;
      this.logMsg(`The scroll crumbles to whispered lore. +${it.amount} XP.`, "loot");
      while (this.player.xp >= this.player.nextXp) {
        this.player.xp -= this.player.nextXp;
        this.player.level++;
        this.player.nextXp = XP_PER_LEVEL(this.player.level);
        this.awaitingLevelUp = true;
        this.onLevelUp(rollUpgrades(this.floorRng, 3));
      }
    } else {
      this.player.inv.push({ kind: it.kind, amount: it.amount, name: it.name });
      this.logMsg(`Picked up ${it.name}.`, "loot");
    }
  }

  getSummary(outcome) {
    return {
      seed: this.seed,
      character_class: this.classKey,
      character_name: this.characterName,
      depth: this.depth,
      score: this.score,
      kills: this.kills,
      duration_seconds: Math.floor((Date.now() - this.startedAt) / 1000),
      outcome,
      level: this.player.level,
      player: { ...this.player },
    };
  }

  // --- render loop ---
  loop(ts) {
    if (!this.running && !this.paused && this.damageNumbers.length === 0 && this.player.hp <= 0) {
      return;
    }
    const dt = Math.min(0.05, (ts - this.lastTs) / 1000 || 0);
    this.lastTs = ts;

    // interpolate render positions
    const lerp = (a, b, t) => a + (b - a) * t;
    const speed = 18; // per second
    this.player.rx = lerp(this.player.rx, this.player.x, Math.min(1, dt * speed));
    this.player.ry = lerp(this.player.ry, this.player.y, Math.min(1, dt * speed));
    if (Math.abs(this.player.rx - this.player.x) < 0.01) this.player.rx = this.player.x;
    if (Math.abs(this.player.ry - this.player.y) < 0.01) this.player.ry = this.player.y;

    for (const e of this.enemies) {
      e.rx = lerp(e.rx, e.x, Math.min(1, dt * speed));
      e.ry = lerp(e.ry, e.y, Math.min(1, dt * speed));
      if (e.flash > 0) e.flash = Math.max(0, e.flash - dt * 4);
    }
    if (this.player.flash > 0) this.player.flash = Math.max(0, this.player.flash - dt * 4);

    // damage numbers
    for (const d of this.damageNumbers) d.life -= dt * 1.5;
    this.damageNumbers = this.damageNumbers.filter(d => d.life > 0);

    const needsRender = this.dirty || this.damageNumbers.length > 0 ||
      Math.abs(this.player.rx - this.player.x) > 0.001 ||
      Math.abs(this.player.ry - this.player.y) > 0.001 ||
      this.enemies.some(e => Math.abs(e.rx - e.x) > 0.001 || Math.abs(e.ry - e.y) > 0.001 || e.flash > 0) ||
      this.player.flash > 0;

    if (needsRender) {
      this.render();
      this.renderMinimap();
      this.dirty = false;
    }

    if (this.running || this.damageNumbers.length > 0) {
      requestAnimationFrame(this.loop);
    }
  }

  render() {
    const ctx = this.ctx;
    const s = this.tileSize;
    // background
    ctx.fillStyle = "#050404";
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    // camera follows player (render-space)
    const camX = this.player.rx * s - this.viewW / 2 + s / 2;
    const camY = this.player.ry * s - this.viewH / 2 + s / 2;
    this.cameraX = Math.max(0, Math.min(MAP_W * s - this.viewW, camX));
    this.cameraY = Math.max(0, Math.min(MAP_H * s - this.viewH, camY));

    // blit pre-rendered tile canvas
    ctx.drawImage(this.tileCanvas, -this.cameraX, -this.cameraY);

    // darken unexplored / not-visible cells via an overlay pass
    // Only draw overlay for tiles within view
    const startX = Math.max(0, Math.floor(this.cameraX / s) - 1);
    const endX = Math.min(MAP_W, Math.ceil((this.cameraX + this.viewW) / s) + 1);
    const startY = Math.max(0, Math.floor(this.cameraY / s) - 1);
    const endY = Math.min(MAP_H, Math.ceil((this.cameraY + this.viewH) / s) + 1);

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const key = x + "," + y;
        const visible = this.visible.has(key);
        const explored = this.explored.has(key);
        if (visible) continue;
        ctx.fillStyle = explored ? "rgba(0,0,0,0.62)" : "rgba(5,4,3,0.98)";
        ctx.fillRect(x * s - this.cameraX, y * s - this.cameraY, s, s);
      }
    }

    // items
    for (const it of this.items) {
      if (!this.visible.has(it.x + "," + it.y)) continue;
      drawItem(ctx, it.kind, it.x * s - this.cameraX, it.y * s - this.cameraY, s);
    }

    // enemies
    for (const e of this.enemies) {
      if (!this.visible.has(e.x + "," + e.y)) continue;
      drawEnemy(ctx, e.kind, e.rx * s - this.cameraX, e.ry * s - this.cameraY, s);
      if (e.flash > 0) {
        ctx.fillStyle = `rgba(255,230,200,${e.flash * 0.5})`;
        ctx.fillRect(e.rx * s - this.cameraX, e.ry * s - this.cameraY, s, s);
      }
      // tiny HP bar above enemy if damaged
      if (e.hp < e.maxHp) {
        const w = s - 4;
        ctx.fillStyle = "#0a0807";
        ctx.fillRect(e.rx * s - this.cameraX + 2, e.ry * s - this.cameraY - 3, w, 2);
        ctx.fillStyle = "#8c1c13";
        ctx.fillRect(e.rx * s - this.cameraX + 2, e.ry * s - this.cameraY - 3, (w * e.hp) / e.maxHp, 2);
      }
    }

    // player
    drawPlayer(ctx, this.classKey, this.player.rx * s - this.cameraX, this.player.ry * s - this.cameraY, s, this.player.flash * 0.6);

    // damage numbers
    for (const d of this.damageNumbers) {
      const px = d.x * s - this.cameraX + s / 2;
      const py = d.y * s - this.cameraY + s / 2 - (1 - d.life) * 22;
      ctx.globalAlpha = Math.max(0, d.life);
      ctx.fillStyle = "#000";
      ctx.font = "bold 14px Cinzel, serif";
      ctx.textAlign = "center";
      ctx.fillText(d.text, px + 1, py + 1);
      ctx.fillStyle = d.color;
      ctx.fillText(d.text, px, py);
      ctx.globalAlpha = 1;
    }

    // vignette (torchlight)
    const grad = ctx.createRadialGradient(
      this.viewW / 2, this.viewH / 2, Math.min(this.viewW, this.viewH) * 0.2,
      this.viewW / 2, this.viewH / 2, Math.max(this.viewW, this.viewH) * 0.8
    );
    grad.addColorStop(0, "rgba(255,170,80,0.02)");
    grad.addColorStop(0.4, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.75)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    // paused overlay
    if (this.paused) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, 0, this.viewW, this.viewH);
      ctx.fillStyle = "#e0d3c1";
      ctx.font = "bold 34px Cinzel, serif";
      ctx.textAlign = "center";
      ctx.fillText("~ Paused ~", this.viewW / 2, this.viewH / 2);
      ctx.font = "14px IM Fell English, serif";
      ctx.fillStyle = "#8c7b68";
      ctx.fillText("Press P or Esc to continue", this.viewW / 2, this.viewH / 2 + 30);
    }
  }

  renderMinimap() {
    const c = this.minimapCtx;
    const w = this.minimap.width;
    const h = this.minimap.height;
    const scaleX = w / MAP_W;
    const scaleY = h / MAP_H;
    c.fillStyle = "#0a0807";
    c.fillRect(0, 0, w, h);
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const key = x + "," + y;
        if (!this.explored.has(key)) continue;
        const t = this.map[y][x];
        if (t === T.WALL) continue;
        c.fillStyle = this.visible.has(key) ? "#c8b79a" : "#4a4038";
        c.fillRect(x * scaleX, y * scaleY, Math.max(1, scaleX), Math.max(1, scaleY));
      }
    }
    // stairs
    if (this.explored.has(this.exit.x + "," + this.exit.y)) {
      c.fillStyle = "#b8860b";
      c.fillRect(this.exit.x * scaleX - 1, this.exit.y * scaleY - 1, scaleX + 2, scaleY + 2);
    }
    // enemies
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      if (!this.visible.has(e.x + "," + e.y)) continue;
      c.fillStyle = e.boss ? "#b8860b" : "#8c1c13";
      c.fillRect(e.x * scaleX - 1, e.y * scaleY - 1, scaleX + 2, scaleY + 2);
    }
    // player
    c.fillStyle = "#138c8c";
    c.fillRect(this.player.x * scaleX - 1, this.player.y * scaleY - 1, scaleX + 2, scaleY + 2);
  }
}
