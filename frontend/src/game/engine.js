// Dungeon of Echoes — game engine v2.
//  * Map is now 300×180 tiles @ 48px → we render tiles ONLY within the viewport
//    each frame (no giant offscreen pre-render) to keep memory bounded.
//  * Auto-descend on stepping onto stairs.
//  * HP/MP bars float above the player (and tiny HP above enemies when damaged).
//  * Extra actions per turn from level (level 4+ = +1, 8+ = +2, 12+ = +3).
//  * Spell system: heal, light, haste, fireball, rope — see spells.js.
//  * Multiplayer-ready: pass `onBroadcast`/`applyRemote` hooks and a `ghosts` map.

import { generateDungeon, generateWorldMap, isWalkable } from "./dungeon";
import { computeFOV } from "./fov";
import { MAP_W, MAP_H, T, TILE } from "./tiles";
import {
  CLASSES, ENEMIES, ITEMS, spawnTableForDepth, weightedPick,
  resolveAttack, XP_PER_LEVEL, rollUpgrades,
} from "./entities";
import { drawTile, drawPlayer, drawEnemy, drawItem, drawGhostPlayer } from "./sprites";
import { loadTileAtlas, atlasReady, drawAutotileFloor } from "./tileAtlas";
import { SPELLS, SPELL_ORDER, applyMetaToStats, soulsFromRun } from "./spells";
import { BIOMES, biomeForDepth } from "./biomes";
import {
  starterEquipment,
  sumEquipmentStats,
  instantiateGear,
  randomLootGearId,
  canEquipOffhand,
} from "./equipment";

export class Game {
  constructor({
    canvas, minimap, seed, classKey, characterName,
    meta = {}, unlockedSpells = ["heal", "light"], startPotions = 0,
    onStateChange, onDeath, onVictory, onLevelUp,
    onBroadcast, // (msg) — multiplayer sender
    coop = null, // { ghosts: Map<id,{x,y,cls,name,alive}> }
  }) {
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
    this.onBroadcast = onBroadcast || null;
    this.coop = coop;
    this.meta = meta;
    // HUD bottom tab: false = chat, true = pack
    this.inventoryOpen = false;
    /** Cumulative bonuses from level-up picks (recomputed with gear) */
    this._levelBonus = { maxHp: 0, maxMp: 0, atk: 0, def: 0, crit: 0, dmgBonus: 0, range: 0, dodge: 0 };

    this.tileSize = TILE;
    this.viewW = 0; this.viewH = 0;
    this.cameraX = 0; this.cameraY = 0;

    this.depth = 0;
    // World map with cities (single plane)
    this.worldMode = true;
    this.maxDepth = 1;
    this.turn = 0;
    this.kills = 0;
    this.score = 0;
    this.startedAt = Date.now();

    const cls = CLASSES[classKey];
    const mageDefaults = classKey === "mage"
      ? ["death_wave", "energy_wave", "inferno_orb", "death_nova"]
      : [];

    this.player = {
      cls: classKey,
      name: this.characterName,
      x: 0, y: 0, rx: 0, ry: 0,
      hp: 1,
      maxHp: 1,
      mp: 0,
      maxMp: 0,
      atk: 0,
      def: 0,
      crit: cls.stats.crit,
      range: cls.stats.range,
      dmgDice: [...cls.stats.dmgDice],
      dmgBonus: 0,
      level: 1, xp: 0, nextXp: XP_PER_LEVEL(1),
      gold: 0,
      regen: false, regenTick: 0,
      dodge: 0,
      inv: [],
      gearBag: [],
      equipment: starterEquipment(classKey),
      flash: 0,
      unlockedSpells: Array.from(new Set([...(unlockedSpells || []), ...mageDefaults])),
      spellState: {
        lightTurns: 0,
        hasteTurns: 0,
      },
      actionsThisTurn: 0,
    };
    this.recalcPlayerStats(true);
    for (let i = 0; i < startPotions; i++) this.player.inv.push({ kind: "potion", amount: 18, name: "Health Potion" });

    this.enemies = [];
    this.items = [];
    this.materials = null; // MAP_H x MAP_W material ids for rendering
    this.zones = null;     // MAP_H x MAP_W strings (city names)
    this.damageNumbers = [];
    this.log = [];
    this.explored = new Set();
    this.visible = new Set();
    /** Positions of open doors: "x,y" for cells where map is T.DOOR */
    this.openDoors = new Set();

    this.running = false;
    this.paused = false;
    this.awaitingLevelUp = false;
    this.dirty = true;
    this.lastTs = 0;

    this.handleKey = this.handleKey.bind(this);
    this.loop = this.loop.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleContextMenu = this.handleContextMenu.bind(this);
  }

  start() {
    loadTileAtlas()
      .then(() => { this.dirty = true; })
      .catch((e) => {
        console.warn("[Dungeon of Echoes] Tile atlas failed to load — using procedural tiles.", e);
      });
    this.enterFloor(1);
    this.running = true;
    window.addEventListener("keydown", this.handleKey);
    // right click on enemy = attack
    this.canvas.addEventListener("contextmenu", this.handleContextMenu);
    this.canvas.addEventListener("mousedown", this.handleMouseDown);
    this.resize();
    requestAnimationFrame(this.loop);
    this.pushState();
    if (this.onBroadcast) this.onBroadcast({ type: "spawn", x: this.player.x, y: this.player.y, depth: this.depth });
  }

  stop() {
    this.running = false;
    window.removeEventListener("keydown", this.handleKey);
    this.canvas.removeEventListener("contextmenu", this.handleContextMenu);
    this.canvas.removeEventListener("mousedown", this.handleMouseDown);
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

  get fovRadius() {
    return 9 + (this.player.spellState.lightTurns > 0 ? 4 : 0);
  }

  get extraActionsByLevel() {
    const lvl = this.player.level;
    let e = 0;
    if (lvl >= 4) e = 1;
    if (lvl >= 8) e = 2;
    if (lvl >= 12) e = 3;
    if (this.player.spellState.hasteTurns > 0) e += 1;
    return e;
  }

  /** Merge class + meta progression + level-up bonuses + worn gear into combat stats */
  recalcPlayerStats(fullHeal = false) {
    const clsStats = CLASSES[this.classKey].stats;
    const meta = applyMetaToStats({}, this.meta).stats;
    const lv = this._levelBonus;
    const g = sumEquipmentStats(this.player.equipment);
    const prevHp = fullHeal ? this.player.maxHp : this.player.hp;
    const prevMp = this.player.mp;

    this.player.maxHp = clsStats.maxHp + (meta.maxHp || 0) + (lv.maxHp || 0) + g.maxHp;
    this.player.maxMp = clsStats.maxMp + (meta.maxMp || 0) + (lv.maxMp || 0) + g.maxMp;
    this.player.atk = clsStats.atk + (meta.atk || 0) + (lv.atk || 0) + g.atk;
    this.player.def = clsStats.def + (meta.def || 0) + (lv.def || 0) + g.def;
    this.player.crit = clsStats.crit + (lv.crit || 0) + g.crit;
    this.player.dodge = (lv.dodge || 0) + (g.dodge || 0);
    this.player.dmgBonus = (lv.dmgBonus || 0) + g.dmgBonus;
    this.player.range = clsStats.range + (lv.range || 0) + g.range;
    this.player.dmgDice = [...clsStats.dmgDice];

    if (fullHeal) {
      this.player.hp = this.player.maxHp;
      this.player.mp = this.player.maxMp;
    } else {
      this.player.hp = Math.min(this.player.maxHp, Math.max(1, prevHp));
      this.player.mp = Math.min(this.player.maxMp, Math.max(0, prevMp));
    }
  }

  toggleInventory() {
    this.inventoryOpen = !this.inventoryOpen;
    this.pushState();
    this.dirty = true;
  }

  setHudTab(tab) {
    const next = tab === "pack";
    if (this.inventoryOpen === next) return;
    this.inventoryOpen = next;
    this.pushState();
    this.dirty = true;
  }

  equipFromBag(index) {
    const inst = this.player.gearBag[index];
    if (!inst) return;
    if (inst.cls !== this.classKey) return;
    if (inst.slot === "offhand" && !canEquipOffhand(this.classKey)) return;
    if (inst.slot === "offhand" && this.player.equipment.weapon?.twoHanded) {
      this.logMsg("Stow your two-handed weapon before raising a shield or tome.", "bump");
      return;
    }
    const slot =
      inst.slot === "amulet"
        ? (!this.player.equipment.amulet1 ? "amulet1" : !this.player.equipment.amulet2 ? "amulet2" : "amulet1")
        : inst.slot;
    const current = this.player.equipment[slot];
    const needsOff = inst.slot === "weapon" && inst.twoHanded && this.player.equipment.offhand;
    const extra = (current ? 1 : 0) + (needsOff ? 1 : 0);
    if (this.player.gearBag.length - 1 + extra > 24) {
      this.logMsg("Pack full.", "bump");
      return;
    }
    if (needsOff) {
      this.player.gearBag.push(this.player.equipment.offhand);
      this.player.equipment.offhand = null;
    }
    this.player.gearBag.splice(index, 1);
    this.player.equipment[slot] = inst;
    if (current) this.player.gearBag.push(current);
    this.recalcPlayerStats(false);
    this.logMsg(`Equipped ${inst.name}.`, "loot");
    this.pushState();
    this.dirty = true;
  }

  unequipSlot(slot) {
    const piece = this.player.equipment[slot];
    if (!piece) return;
    if (this.player.gearBag.length >= 24) {
      this.logMsg("Pack full — cannot remove.", "bump");
      return;
    }
    this.player.equipment[slot] = null;
    this.player.gearBag.push(piece);
    this.recalcPlayerStats(false);
    this.logMsg(`Stowed ${piece.name}.`, "info");
    this.pushState();
    this.dirty = true;
  }

  /** @returns {boolean} false if item must stay on the ground */
  tryPickupOrEquip(inst) {
    if (!inst) return false;
    if (inst.cls !== this.classKey) {
      if (this.player.gearBag.length >= 24) return false;
      this.player.gearBag.push(inst);
      this.logMsg(`${inst.name} — not your calling. Stowed for later trade.`, "info");
      return true;
    }
    if (inst.slot === "offhand" && !canEquipOffhand(this.classKey)) {
      if (this.player.gearBag.length >= 24) return false;
      this.player.gearBag.push(inst);
      return true;
    }
    if (inst.slot === "offhand" && this.player.equipment.weapon?.twoHanded) {
      this.logMsg("Your weapon demands both hands — stow it to use a shield or tome.", "bump");
      return false;
    }
    const slot =
      inst.slot === "amulet"
        ? (!this.player.equipment.amulet1 ? "amulet1" : !this.player.equipment.amulet2 ? "amulet2" : "amulet1")
        : inst.slot;
    const cur = this.player.equipment[slot];
    const needsOff = inst.slot === "weapon" && inst.twoHanded && this.player.equipment.offhand;
    const extra = (cur ? 1 : 0) + (needsOff ? 1 : 0);
    if (this.player.gearBag.length + extra > 24) {
      this.logMsg("Pack full — cannot swap this relic.", "bump");
      return false;
    }
    if (needsOff) {
      this.player.gearBag.push(this.player.equipment.offhand);
      this.player.equipment.offhand = null;
    }
    if (cur) this.player.gearBag.push(cur);
    this.player.equipment[slot] = inst;
    this.recalcPlayerStats(false);
    this.logMsg(`Equipped ${inst.name}.`, "loot");
    return true;
  }

  pushState() {
    this.onStateChange({
      player: { ...this.player },
      depth: this.depth,
      turn: this.turn,
      kills: this.kills,
      score: this.score,
      log: this.log.slice(-8),
      paused: this.paused,
      startedAt: this.startedAt,
      extraActions: this.extraActionsByLevel,
      fovRadius: this.fovRadius,
      inventoryOpen: this.inventoryOpen,
    });
  }

  enterFloor(depth) {
    this.depth = depth;
    const gen = this.worldMode ? generateWorldMap(this.seed) : generateDungeon(this.seed, depth);
    const { map, start, exit, rng } = gen;
    const rooms = gen.rooms || [];
    this.map = map;
    this.rooms = rooms;
    this.exit = exit;
    this.floorRng = rng;
    this.materials = gen.materials || null;
    this.zones = gen.zones || null;

    this.openDoors = new Set();
    for (let yy = 0; yy < MAP_H; yy++) {
      for (let xx = 0; xx < MAP_W; xx++) {
        if (map[yy][xx] === T.DOOR) this.openDoors.add(xx + "," + yy);
      }
    }

    this.player.x = start.x; this.player.y = start.y;
    this.player.rx = start.x; this.player.ry = start.y;

    // populate enemies scaled for larger map
    this.enemies = [];
    const enemyCount = Math.floor((6 + depth * 2) * 6); // ~6x vs small map
    let attempts = 0;
    while (this.enemies.length < enemyCount && attempts < enemyCount * 4) {
      attempts++;
      let x, y;
      if (this.worldMode) {
        x = rng.int(2, MAP_W - 3);
        y = rng.int(2, MAP_H - 3);
      } else {
        const room = rooms[rng.int(0, rooms.length - 1)];
        if (room === rooms[0]) continue;
        x = room.x + rng.int(1, room.w - 2);
        y = room.y + rng.int(1, room.h - 2);
      }
      if (!isWalkable(map, x, y)) continue;
      if (this.enemies.some(e => e.x === x && e.y === y)) continue;
      const zone = this.zones ? this.zones[y]?.[x] : null;
      const zDepth = zone === "Serva" ? 1 : zone === "Defend" ? 3 : zone === "Castle Of Knighthood" ? 5 : depth;
      const table = spawnTableForDepth(zDepth);
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

    if (!this.worldMode && depth === this.maxDepth) {
      // Remove stairs on boss floor — only boss kill leads to victory
      this.map[exit.y][exit.x] = T.FLOOR;
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

    this.items = [];
    const itemCount = Math.floor((4 + depth * 1.5) * 5);
    const itemKeys = ["potion", "potion", "mana", "gold", "gold", "scroll"];
    attempts = 0;
    while (this.items.length < itemCount && attempts < itemCount * 3) {
      attempts++;
      let x, y;
      if (this.worldMode) {
        x = rng.int(2, MAP_W - 3);
        y = rng.int(2, MAP_H - 3);
      } else {
        const room = rooms[rng.int(0, rooms.length - 1)];
        x = room.x + rng.int(1, room.w - 2);
        y = room.y + rng.int(1, room.h - 2);
      }
      if (!isWalkable(map, x, y)) continue;
      if (this.items.some(i => i.x === x && i.y === y)) continue;
      const kind = itemKeys[rng.int(0, itemKeys.length - 1)];
      const amount = kind === "gold" ? rng.int(5, 15 + depth * 3) : ITEMS[kind].value;
      this.items.push({ kind, x, y, amount, name: ITEMS[kind].name });
    }

    let gearDrops = 2 + rng.int(0, 2);
    while (gearDrops-- > 0) {
      const gid = randomLootGearId(rng, this.classKey, depth);
      if (!gid) continue;
      let gTry = 0;
      while (gTry < 80) {
        gTry++;
        let x, y;
        if (this.worldMode) {
          x = rng.int(2, MAP_W - 3);
          y = rng.int(2, MAP_H - 3);
        } else {
          const room = rooms[rng.int(0, rooms.length - 1)];
          x = room.x + rng.int(1, room.w - 2);
          y = room.y + rng.int(1, room.h - 2);
        }
        if (!isWalkable(map, x, y)) continue;
        if (this.items.some(i => i.x === x && i.y === y)) continue;
        const inst = instantiateGear(gid);
        this.items.push({ kind: "gear", gearId: gid, x, y, name: inst.name, inst });
        break;
      }
    }

    this.explored = new Set();
    this.updateFOV();
    if (this.worldMode) {
      const cities = (gen.cities || []).map(c => c.name).join(", ");
      this.logMsg(`World map loaded — cities: ${cities}.`, "info");
    } else {
      this.logMsg(`You descend into floor ${depth}. ${rooms.length} chambers echo.`);
    }
    this.dirty = true;
  }

  updateFOV() {
    this.visible = computeFOV(this.map, this.player.x, this.player.y, this.fovRadius, this.openDoors);
    for (const k of this.visible) this.explored.add(k);
  }

  cellWalkable(x, y) {
    return isWalkable(this.map, x, y, this.openDoors);
  }

  logMsg(msg, kind = "info") {
    this.log.push({ msg, kind, turn: this.turn });
    if (this.log.length > 80) this.log.shift();
  }

  pushDamage(x, y, text, color) {
    this.damageNumbers.push({ x, y, text, color, life: 1.0 });
    if (this.damageNumbers.length > 40) this.damageNumbers.shift();
  }

  // ------------- input -----------------
  handleKey(e) {
    if (!this.running || this.awaitingLevelUp) return;
    const k = e.key.toLowerCase();
    if (k === "p" || k === "escape") {
      this.paused = !this.paused;
      this.pushState(); this.dirty = true; e.preventDefault(); return;
    }
    if (this.paused) return;

    if (k === "i") {
      this.toggleInventory();
      e.preventDefault();
      return;
    }

    // Spell hotkeys
    for (const id of SPELL_ORDER) {
      if (SPELLS[id].hotkey === k) {
        this.castSpell(id);
        this.pushState();
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
      case " ": case ".": this.doTurn(0, 0); e.preventDefault(); return;
      case "q": this.useItemByEffect("potion"); this.pushState(); return;
      case "r": this.useItemByEffect("mana"); this.pushState(); return;
      default: return;
    }
    if (dx || dy) { this.doTurn(dx, dy); e.preventDefault(); }
  }

  handleContextMenu(e) {
    // prevent the browser menu from stealing focus
    e.preventDefault();
  }

  tryToggleDoorAt(tx, ty) {
    if (ty < 0 || tx < 0 || ty >= MAP_H || tx >= MAP_W) return false;
    if (this.map[ty][tx] !== T.DOOR) return false;
    const d = Math.abs(tx - this.player.x) + Math.abs(ty - this.player.y);
    if (d > 1) {
      this.logMsg("You can't reach the latch.", "bump");
      return true;
    }
    const key = tx + "," + ty;
    if (this.openDoors.has(key)) {
      if (this.player.x === tx && this.player.y === ty) {
        this.logMsg("You're in the doorway.", "bump");
        return true;
      }
      if (this.enemies.some(e => e.hp > 0 && e.x === tx && e.y === ty)) {
        this.logMsg("Something blocks the latch.", "bump");
        return true;
      }
      this.openDoors.delete(key);
      this.logMsg("You heave the door shut.", "info");
    } else {
      this.openDoors.add(key);
      this.logMsg("The door groans open.", "info");
    }
    this.updateFOV();
    this.dirty = true;
    this.pushState();
    return true;
  }

  handleMouseDown(e) {
    if (!this.running || this.paused || this.awaitingLevelUp) return;
    // right click only
    if (e.button !== 2) return;
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const tx = Math.floor((sx + this.cameraX) / this.tileSize);
    const ty = Math.floor((sy + this.cameraY) / this.tileSize);
    if (this.tryToggleDoorAt(tx, ty)) return;
    this.attackEnemyAt(tx, ty);
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

  // ------------- spells -----------------
  castSpell(id) {
    if (!this.player.unlockedSpells.includes(id)) {
      this.logMsg(`The ${SPELLS[id].name} rune is beyond your binding.`, "bump");
      return;
    }
    const s = SPELLS[id];
    if (this.player.mp < s.mpCost) {
      this.logMsg(`Not enough mana to weave ${s.name}.`, "bump");
      return;
    }
    let consumed = false;
    switch (id) {
      case "heal": {
        const amt = 18;
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + amt);
        this.pushDamage(this.player.x, this.player.y, `+${amt}`, "#b0251a");
        this.logMsg(`Mend knits your wounds (+${amt} HP).`, "heal");
        consumed = true;
        break;
      }
      case "light": {
        this.player.spellState.lightTurns = 15;
        this.logMsg(`Candleflame flares — your sight widens.`, "spell");
        consumed = true;
        break;
      }
      case "haste": {
        this.player.spellState.hasteTurns = 10;
        this.logMsg(`Quickstep — time slows for you.`, "spell");
        consumed = true;
        break;
      }
      case "fireball": {
        // target nearest visible enemy
        let tgt = null, best = 9999;
        for (const e of this.enemies) {
          if (e.hp <= 0) continue;
          if (!this.visible.has(e.x + "," + e.y)) continue;
          const d = Math.abs(e.x - this.player.x) + Math.abs(e.y - this.player.y);
          if (d < best) { best = d; tgt = e; }
        }
        if (!tgt) { this.logMsg(`No foes in sight to ember.`, "bump"); return; }
        for (const e of this.enemies) {
          if (e.hp <= 0) continue;
          if (Math.abs(e.x - tgt.x) <= 1 && Math.abs(e.y - tgt.y) <= 1) {
            const dmg = Math.max(3, 10 + Math.floor(this.player.level * 1.5) - (e.def || 0));
            e.hp -= dmg; e.flash = 1;
            this.pushDamage(e.x, e.y, String(dmg), "#e05a1a");
            if (e.hp <= 0) this.killEnemy(e);
          }
        }
        this.logMsg(`Ember Burst roars across ${tgt.name}'s lair.`, "spell");
        consumed = true;
        break;
      }
      case "death_wave":
      case "energy_wave":
      case "inferno_orb":
      case "death_nova": {
        if (this.classKey !== "mage") {
          this.logMsg(`Only a mage can weave ${SPELLS[id].name}.`, "bump");
          return;
        }
        // target nearest visible enemy (except nova which centers on player)
        let tgt = null, best = 9999;
        for (const e of this.enemies) {
          if (e.hp <= 0) continue;
          if (!this.visible.has(e.x + "," + e.y)) continue;
          const d = Math.abs(e.x - this.player.x) + Math.abs(e.y - this.player.y);
          if (d < best) { best = d; tgt = e; }
        }
        if (id !== "death_nova" && !tgt) { this.logMsg(`No foes in sight.`, "bump"); return; }

        const wave = (color, baseDmg) => {
          const pts = this.bresenhamLine(this.player.x, this.player.y, tgt.x, tgt.y).slice(1, 9);
          let hit = 0;
          for (const [x, y] of pts) {
            if (!this.cellWalkable(x, y)) break;
            const enemy = this.enemies.find(en => en.x === x && en.y === y && en.hp > 0);
            if (enemy) {
              const dmg = Math.max(2, baseDmg - (enemy.def || 0));
              enemy.hp -= dmg; enemy.flash = 1;
              this.pushDamage(enemy.x, enemy.y, String(dmg), color);
              if (enemy.hp <= 0) this.killEnemy(enemy);
              hit++;
            }
          }
          return hit;
        };

        if (id === "death_wave") {
          const hit = wave("#7ab8b8", 9 + Math.floor(this.player.level * 1.6));
          this.logMsg(`Death Wave tears through ${hit || "no"} foe${hit === 1 ? "" : "s"}.`, "spell");
          consumed = true;
        } else if (id === "energy_wave") {
          const hit = wave("#1fb3b3", 9 + Math.floor(this.player.level * 1.4));
          this.logMsg(`Energy Wave surges forward.`, "spell");
          consumed = true;
        } else if (id === "inferno_orb") {
          const r = 2; // diameter 4
          let hit = 0;
          for (const en of this.enemies) {
            if (en.hp <= 0) continue;
            const dx = en.x - tgt.x;
            const dy = en.y - tgt.y;
            if ((dx * dx + dy * dy) <= (r * r)) {
              const dmg = Math.max(3, 12 + Math.floor(this.player.level * 2.2) - (en.def || 0));
              en.hp -= dmg; en.flash = 1;
              this.pushDamage(en.x, en.y, String(dmg), "#e05a1a");
              if (en.hp <= 0) this.killEnemy(en);
              hit++;
            }
          }
          this.logMsg(`Inferno Orb detonates (${hit} hit).`, "spell");
          consumed = true;
        } else if (id === "death_nova") {
          const r = 5;
          let hit = 0;
          for (const en of this.enemies) {
            if (en.hp <= 0) continue;
            const dx = en.x - this.player.x;
            const dy = en.y - this.player.y;
            if ((dx * dx + dy * dy) <= (r * r)) {
              const dmg = Math.max(4, 14 + Math.floor(this.player.level * 2.8) - (en.def || 0));
              en.hp -= dmg; en.flash = 1;
              this.pushDamage(en.x, en.y, String(dmg), "#b8860b");
              if (en.hp <= 0) this.killEnemy(en);
              hit++;
            }
          }
          this.logMsg(`Death Nova erupts around you (${hit} hit).`, "spell");
          consumed = true;
        }
        break;
      }
      case "rope": {
        if (!this.exit) return;
        const reach = this.explored.has(this.exit.x + "," + this.exit.y);
        if (!reach) { this.logMsg(`The rope has nowhere to bind — find the stairway first.`, "bump"); return; }
        this.player.x = this.exit.x; this.player.y = this.exit.y;
        this.player.rx = this.exit.x; this.player.ry = this.exit.y;
        this.logMsg(`The Binding Rope whips taut — you snap to the stairway.`, "spell");
        consumed = true;
        break;
      }
      default: break;
    }
    if (consumed) {
      this.player.mp -= s.mpCost;
      this.updateFOV();
      this.enemiesAct();
      this.turn++;
      this.dirty = true;
      this.maybeAutoDescend();
    }
    if (this.onBroadcast) this.onBroadcast({ type: "spell", spell: id, x: this.player.x, y: this.player.y });
  }

  bresenhamLine(x0, y0, x1, y1) {
    const pts = [];
    let dx = Math.abs(x1 - x0);
    let dy = Math.abs(y1 - y0);
    let sx = x0 < x1 ? 1 : -1;
    let sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let x = x0;
    let y = y0;
    while (true) {
      pts.push([x, y]);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
      if (pts.length > 64) break;
    }
    return pts;
  }

  attackEnemyAt(tx, ty) {
    const enemy = this.enemies.find(e => e.x === tx && e.y === ty && e.hp > 0);
    if (!enemy) return;
    if (!this.visible.has(tx + "," + ty)) return;

    const dx = tx - this.player.x;
    const dy = ty - this.player.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    const cheb = Math.max(adx, ady);

    // melee if adjacent
    if (cheb <= 1) {
      const result = resolveAttack(this.floorRng, {
        dmg: this.player.dmgDice,
        bonus: this.player.dmgBonus + (this.player.atk - CLASSES[this.classKey].stats.atk),
        crit: this.player.crit,
      }, enemy);
      enemy.hp -= result.dmg; enemy.flash = 1;
      this.pushDamage(enemy.x, enemy.y, String(result.dmg) + (result.crit ? "!" : ""), result.crit ? "#f0d89a" : "#e0d3c1");
      this.logMsg(`You strike ${enemy.name} for ${result.dmg}${result.crit ? " (crit!)" : ""}.`, "hit");
      if (enemy.hp <= 0) this.killEnemy(enemy);
      this.doTurn(0, 0); // consume action / advance turn flow
      return;
    }

    // ranger ranged: 1–4 tiles, line must be clear through walkable tiles
    if (this.classKey === "ranger") {
      if (cheb < 1 || cheb > 4) { this.logMsg("Out of bow range (1–4).", "bump"); return; }
      const line = this.bresenhamLine(this.player.x, this.player.y, tx, ty).slice(1);
      for (const [x, y] of line) {
        if (x === tx && y === ty) break;
        if (!this.cellWalkable(x, y)) { this.logMsg("No clear shot.", "bump"); return; }
      }
      const bonus = this.player.dmgBonus + (this.player.atk - CLASSES[this.classKey].stats.atk);
      const result = resolveAttack(this.floorRng, { dmg: this.player.dmgDice, bonus, crit: this.player.crit }, enemy);
      enemy.hp -= result.dmg; enemy.flash = 1;
      this.pushDamage(enemy.x, enemy.y, String(result.dmg) + (result.crit ? "!" : ""), "#7bc96f");
      this.logMsg(`Your shaft finds ${enemy.name} for ${result.dmg}.`, "hit");
      if (enemy.hp <= 0) this.killEnemy(enemy);
      this.doTurn(0, 0);
      return;
    }

    // mage basic bolt (not a spell) — click-cast if MP allows
    if (this.classKey === "mage") {
      if (cheb < 1 || cheb > this.player.range) { this.logMsg("Out of arcane range.", "bump"); return; }
      if (this.player.mp < 3) { this.logMsg("Not enough mana for a bolt.", "bump"); return; }
      const line = this.bresenhamLine(this.player.x, this.player.y, tx, ty).slice(1);
      for (const [x, y] of line) {
        if (x === tx && y === ty) break;
        if (!this.cellWalkable(x, y)) { this.logMsg("The stone drinks the flame.", "bump"); return; }
      }
      const bonus = this.player.dmgBonus + 1;
      const result = resolveAttack(this.floorRng, { dmg: this.player.dmgDice, bonus, crit: this.player.crit }, enemy);
      enemy.hp -= result.dmg; enemy.flash = 1;
      this.player.mp -= 3;
      this.pushDamage(enemy.x, enemy.y, String(result.dmg) + (result.crit ? "!" : ""), "#1fb3b3");
      this.logMsg(`Arcane flame rips at ${enemy.name} for ${result.dmg}.`, "spell");
      if (enemy.hp <= 0) this.killEnemy(enemy);
      this.doTurn(0, 0);
    }
  }

  // ------------- turn logic -----------------
  doTurn(dx, dy) {
    if (this.awaitingLevelUp) return;

    if (dx || dy) this.playerMoveOrAttack(dx, dy);

    this.player.actionsThisTurn++;
    const allowedActions = 1 + this.extraActionsByLevel;

    if (this.player.actionsThisTurn >= allowedActions) {
      // enemies act; end of turn
      this.enemiesAct();
      this.player.actionsThisTurn = 0;
      if (this.player.regen) {
        this.player.regenTick++;
        if (this.player.regenTick >= 6) { this.player.regenTick = 0; this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1); }
      }
      this.player.mp = Math.min(this.player.maxMp, this.player.mp + 0.08);
      if (this.player.spellState.lightTurns > 0) this.player.spellState.lightTurns--;
      if (this.player.spellState.hasteTurns > 0) this.player.spellState.hasteTurns--;
      this.turn++;
    }

    this.pickupAt(this.player.x, this.player.y);
    this.updateFOV();

    this.maybeAutoDescend();

    this.pushState();
    this.dirty = true;

    if (this.onBroadcast) this.onBroadcast({ type: "pos", x: this.player.x, y: this.player.y });
  }

  maybeAutoDescend() {
    if (this.worldMode) return;
    if (this.map[this.player.y][this.player.x] === T.STAIRS_DOWN) {
      if (this.depth < this.maxDepth) {
        this.logMsg(`Stone gives way — you descend deeper.`, "info");
        this.enterFloor(this.depth + 1);
        this.player.actionsThisTurn = 0;
        this.pushState();
        if (this.onBroadcast) this.onBroadcast({ type: "descend", depth: this.depth });
      }
    }
  }

  playerMoveOrAttack(dx, dy) {
    const nx = this.player.x + dx;
    const ny = this.player.y + dy;
    const adj = this.enemies.find(e => e.x === nx && e.y === ny && e.hp > 0);
    if (adj) {
      const result = resolveAttack(this.floorRng, {
        dmg: this.player.dmgDice, bonus: this.player.dmgBonus + (this.player.atk - CLASSES[this.classKey].stats.atk), crit: this.player.crit,
      }, adj);
      adj.hp -= result.dmg; adj.flash = 1;
      this.pushDamage(adj.x, adj.y, String(result.dmg) + (result.crit ? "!" : ""), result.crit ? "#f0d89a" : "#e0d3c1");
      this.logMsg(`You strike ${adj.name} for ${result.dmg}${result.crit ? " (crit!)" : ""}.`, "hit");
      if (adj.hp <= 0) this.killEnemy(adj);
      return;
    }
    // mage: mana bolt | ranger: physical shot (no MP)
    const mageBolt = this.classKey === "mage" && this.player.mp >= 3;
    const rangerShot = this.classKey === "ranger";
    if (mageBolt || rangerShot) {
      const bonus =
        this.classKey === "mage"
          ? this.player.dmgBonus + 1
          : this.player.dmgBonus + (this.player.atk - CLASSES[this.classKey].stats.atk);
      const dmgColor = this.classKey === "mage" ? "#1fb3b3" : "#7bc96f";
      const logKind = this.classKey === "mage" ? "spell" : "hit";
      const logVerb = this.classKey === "mage" ? "Arcane flame rips" : "Your shaft finds";
      for (let r = 1; r <= this.player.range; r++) {
        const tx = this.player.x + dx * r;
        const ty = this.player.y + dy * r;
        if (!this.cellWalkable(tx, ty)) break;
        const tgt = this.enemies.find(e => e.x === tx && e.y === ty && e.hp > 0);
        if (tgt) {
          const result = resolveAttack(this.floorRng, {
            dmg: this.player.dmgDice, bonus, crit: this.player.crit,
          }, tgt);
          tgt.hp -= result.dmg; tgt.flash = 1;
          if (this.classKey === "mage") this.player.mp -= 3;
          this.pushDamage(tgt.x, tgt.y, String(result.dmg) + (result.crit ? "!" : ""), dmgColor);
          this.logMsg(`${logVerb} at ${tgt.name} for ${result.dmg}.`, logKind);
          if (tgt.hp <= 0) this.killEnemy(tgt);
          return;
        }
      }
    }
    if (this.cellWalkable(nx, ny)) {
      this.player.x = nx; this.player.y = ny;
    } else {
      this.logMsg(`The stone blocks your path.`, "bump");
    }
  }

  killEnemy(e) {
    if (e.hp > 0) return; // guard
    e.hp = 0;
    this.kills++;
    this.player.xp += e.xp;
    this.score += e.xp * (1 + this.depth);
    this.logMsg(`${e.name} falls to silence. +${e.xp} XP.`, "kill");
    if (this.floorRng.chance(0.2)) {
      const gid = randomLootGearId(this.floorRng, this.classKey, this.depth);
      if (gid) {
        const inst = instantiateGear(gid);
        this.items.push({ kind: "gear", gearId: gid, x: e.x, y: e.y, name: inst.name, inst });
        this.logMsg(`${e.name} dropped ${inst.name}.`, "loot");
      }
    } else if (this.floorRng.chance(0.28)) {
      const kind = this.floorRng.pick(["potion", "mana", "gold"]);
      const amount = kind === "gold" ? this.floorRng.int(5, 15) : ITEMS[kind].value;
      const name = ITEMS[kind].name;
      this.items.push({ kind, x: e.x, y: e.y, amount, name });
      this.logMsg(`${e.name} dropped ${name}.`, "loot");
    }
    this.enemies = this.enemies.filter(en => en.hp > 0);
    if (e.boss) {
      this.onVictory(this.getSummary("victory"));
      this.running = false; this.stop();
      return;
    }
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
    const lv = this._levelBonus;
    switch (upg.id) {
      case "hp_up": lv.maxHp += 10; break;
      case "mp_up": lv.maxMp += 8; break;
      case "atk_up": lv.atk += 2; lv.dmgBonus += 1; break;
      case "def_up": lv.def += 2; break;
      case "crit_up": lv.crit += 0.06; break;
      case "range_up": lv.range += 1; break;
      case "regen": this.player.regen = true; break;
      case "dodge": lv.dodge += 0.15; break;
      default: break;
    }
    this.recalcPlayerStats(false);
    if (upg.id === "hp_up") this.player.hp = this.player.maxHp;
    if (upg.id === "mp_up") this.player.mp = this.player.maxMp;
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
      } else if (dist <= 12) {
        const stepX = Math.sign(dx), stepY = Math.sign(dy);
        const tryMoves = Math.abs(dx) > Math.abs(dy)
          ? [[stepX, 0], [0, stepY], [stepX, stepY]]
          : [[0, stepY], [stepX, 0], [stepX, stepY]];
        for (const [mx, my] of tryMoves) {
          const nx = e.x + mx, ny = e.y + my;
          if (nx === this.player.x && ny === this.player.y) continue;
          if (!this.cellWalkable(nx, ny)) continue;
          if (this.enemies.some(en => en !== e && en.hp > 0 && en.x === nx && en.y === ny)) continue;
          e.x = nx; e.y = ny;
          break;
        }
      }
      // else distant enemy idles
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
    } else if (it.kind === "gear") {
      const inst = it.inst || instantiateGear(it.gearId);
      if (inst && !this.tryPickupOrEquip(inst)) {
        this.items.push(it);
      }
    } else {
      this.player.inv.push({ kind: it.kind, amount: it.amount, name: it.name });
      this.logMsg(`Picked up ${it.name}.`, "loot");
    }
  }

  getSummary(outcome) {
    const s = {
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
    s.souls_earned = soulsFromRun(s);
    return s;
  }

  // ------------- render -----------------
  loop(ts) {
    if (!this.running && !this.paused && this.damageNumbers.length === 0 && this.player.hp <= 0) {
      return;
    }
    const dt = Math.min(0.05, (ts - this.lastTs) / 1000 || 0);
    this.lastTs = ts;

    const lerp = (a, b, t) => a + (b - a) * t;
    const speed = 18;
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
    const biome = BIOMES[biomeForDepth(this.depth)] || BIOMES.stone;
    ctx.fillStyle = biome.bg;
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    // camera follows player (render-space)
    const camX = this.player.rx * s - this.viewW / 2 + s / 2;
    const camY = this.player.ry * s - this.viewH / 2 + s / 2;
    this.cameraX = Math.max(0, Math.min(MAP_W * s - this.viewW, camX));
    this.cameraY = Math.max(0, Math.min(MAP_H * s - this.viewH, camY));

    const startX = Math.max(0, Math.floor(this.cameraX / s) - 1);
    const endX = Math.min(MAP_W, Math.ceil((this.cameraX + this.viewW) / s) + 1);
    const startY = Math.max(0, Math.floor(this.cameraY / s) - 1);
    const endY = Math.min(MAP_H, Math.ceil((this.cameraY + this.viewH) / s) + 1);

    const biomeKey = biomeForDepth(this.depth);
    // draw tiles (on-the-fly; viewport ~ 25×17 tiles = 425 draws)
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const key = x + "," + y;
        const exp = this.explored.has(key);
        if (!exp) continue;
        const mat = this.materials ? this.materials[y]?.[x] : null;
        const t = this.map[y][x];
        const doorOpen = t === T.DOOR && this.openDoors.has(key);
        const px = x * s - this.cameraX;
        const py = y * s - this.cameraY;
        const v = (x * 13 + y * 7) | 0;
        const tileForNeighbor = (tx, ty) => {
          const c = this.map[ty][tx];
          if (c === T.DOOR && this.openDoors.has(tx + "," + ty)) return T.FLOOR;
          return c;
        };
        const drawAsFloor = (t === T.FLOOR || doorOpen) && atlasReady();
        if (drawAsFloor) {
          const ok = drawAutotileFloor(
            ctx,
            px,
            py,
            s,
            x,
            y,
            biomeKey,
            tileForNeighbor,
            (tx, ty) => this.materials?.[ty]?.[tx] ?? 0,
          );
          if (ok) continue;
        }
        drawTile(ctx, doorOpen ? T.FLOOR : t, px, py, s, v, biomeKey, mat, x, y);
      }
    }

    // darken non-visible
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const key = x + "," + y;
        const exp = this.explored.has(key);
        const vis = this.visible.has(key);
        if (vis) continue;
        ctx.fillStyle = exp ? "rgba(0,0,0,0.62)" : "rgba(5,4,3,0.98)";
        ctx.fillRect(x * s - this.cameraX, y * s - this.cameraY, s, s);
      }
    }

    // items
    for (const it of this.items) {
      if (!this.visible.has(it.x + "," + it.y)) continue;
      drawItem(ctx, it, it.x * s - this.cameraX, it.y * s - this.cameraY, s);
    }

    // enemies
    for (const e of this.enemies) {
      if (!this.visible.has(e.x + "," + e.y)) continue;
      drawEnemy(ctx, e.kind, e.rx * s - this.cameraX, e.ry * s - this.cameraY, s);
      if (e.flash > 0) {
        ctx.fillStyle = `rgba(255,230,200,${e.flash * 0.5})`;
        ctx.fillRect(e.rx * s - this.cameraX, e.ry * s - this.cameraY, s, s);
      }
      if (e.hp < e.maxHp) {
        const w = s - 6;
        ctx.fillStyle = "#0a0807";
        ctx.fillRect(e.rx * s - this.cameraX + 3, e.ry * s - this.cameraY - 5, w, 3);
        ctx.fillStyle = "#8c1c13";
        ctx.fillRect(e.rx * s - this.cameraX + 3, e.ry * s - this.cameraY - 5, (w * e.hp) / e.maxHp, 3);
      }
    }

    // ghost (co-op) players
    if (this.coop && this.coop.ghosts) {
      for (const [, g] of this.coop.ghosts) {
        if (!g || !g.alive) continue;
        if (g.depth !== this.depth) continue;
        if (!this.visible.has(g.x + "," + g.y)) continue;
        drawGhostPlayer(ctx, g.cls, g.name, g.x * s - this.cameraX, g.y * s - this.cameraY, s);
        // name tag
        ctx.font = "bold 12px Cinzel, serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "#0a0807";
        ctx.fillText(g.name || "?", g.x * s - this.cameraX + s / 2 + 1, g.y * s - this.cameraY - 8 + 1);
        ctx.fillStyle = "#c8b79a";
        ctx.fillText(g.name || "?", g.x * s - this.cameraX + s / 2, g.y * s - this.cameraY - 8);
      }
    }

    // player + HP/MP bars above
    const p = this.player;
    drawPlayer(ctx, this.classKey, p.rx * s - this.cameraX, p.ry * s - this.cameraY, s, p.flash * 0.6);
    // HP/MP bars above player
    const barX = p.rx * s - this.cameraX + 4;
    const barY = p.ry * s - this.cameraY - 14;
    const barW = s - 8;
    ctx.fillStyle = "#0a0807";
    ctx.fillRect(barX - 1, barY - 1, barW + 2, 5);
    ctx.fillStyle = "#8c1c13";
    ctx.fillRect(barX, barY, (barW * p.hp) / p.maxHp, 3);
    ctx.fillStyle = "#0a0807";
    ctx.fillRect(barX - 1, barY + 5 - 1, barW + 2, 5);
    ctx.fillStyle = "#138c8c";
    ctx.fillRect(barX, barY + 5, (barW * p.mp) / p.maxMp, 3);

    // damage numbers
    for (const d of this.damageNumbers) {
      const px = d.x * s - this.cameraX + s / 2;
      const py = d.y * s - this.cameraY + s / 2 - (1 - d.life) * 26;
      ctx.globalAlpha = Math.max(0, d.life);
      ctx.fillStyle = "#000";
      ctx.font = "bold 16px Cinzel, serif";
      ctx.textAlign = "center";
      ctx.fillText(d.text, px + 1, py + 1);
      ctx.fillStyle = d.color;
      ctx.fillText(d.text, px, py);
      ctx.globalAlpha = 1;
    }

    // torch vignette (biome-tinted)
    const grad = ctx.createRadialGradient(
      this.viewW / 2, this.viewH / 2, Math.min(this.viewW, this.viewH) * 0.2,
      this.viewW / 2, this.viewH / 2, Math.max(this.viewW, this.viewH) * 0.8
    );
    grad.addColorStop(0, biome.vignette);
    grad.addColorStop(0.4, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.75)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.viewW, this.viewH);

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
    if (this.exit && this.explored.has(this.exit.x + "," + this.exit.y)) {
      c.fillStyle = "#b8860b";
      c.fillRect(this.exit.x * scaleX - 1, this.exit.y * scaleY - 1, Math.max(2, scaleX + 2), Math.max(2, scaleY + 2));
    }
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      if (!this.visible.has(e.x + "," + e.y)) continue;
      c.fillStyle = e.boss ? "#b8860b" : "#8c1c13";
      c.fillRect(e.x * scaleX - 1, e.y * scaleY - 1, Math.max(2, scaleX + 2), Math.max(2, scaleY + 2));
    }
    // ghost players on minimap
    if (this.coop && this.coop.ghosts) {
      for (const [, g] of this.coop.ghosts) {
        if (!g || !g.alive || g.depth !== this.depth) continue;
        c.fillStyle = "#c8b79a";
        c.fillRect(g.x * scaleX - 1, g.y * scaleY - 1, Math.max(2, scaleX + 2), Math.max(2, scaleY + 2));
      }
    }
    c.fillStyle = "#138c8c";
    c.fillRect(this.player.x * scaleX - 1, this.player.y * scaleY - 1, Math.max(2, scaleX + 2), Math.max(2, scaleY + 2));
  }
}
