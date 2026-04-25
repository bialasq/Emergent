// Combat & entity logic

export const CLASSES = {
  warrior: {
    name: "Warrior",
    desc: "Steel and steadfast. High HP, brutal strikes.",
    color: "#c0392b",
    glyph: "@",
    stats: { maxHp: 40, maxMp: 10, atk: 6, def: 3, crit: 0.1, range: 1, dmgDice: [4, 8] },
    lore: "A veteran of countless battles, wielding forged steel against the dark.",
  },
  mage: {
    name: "Mage",
    desc: "Arcane and fragile. Ranged magic, mana-based.",
    color: "#2e86ab",
    glyph: "@",
    stats: { maxHp: 25, maxMp: 30, atk: 4, def: 1, crit: 0.18, range: 4, dmgDice: [5, 10] },
    lore: "A seeker of forbidden echoes, channeling teal flame through runes.",
  },
  rogue: {
    name: "Rogue",
    desc: "Swift and cruel. Crippling crits in close darkness.",
    color: "#7a2f8c",
    glyph: "@",
    stats: { maxHp: 30, maxMp: 15, atk: 5, def: 2, crit: 0.25, range: 1, dmgDice: [3, 9] },
    lore: "A whispering shadow, daggers slick with promise.",
  },
  ranger: {
    name: "Ranger",
    desc: "Bow-bearer of the wilds. Strikes from afar without mana.",
    color: "#3a7d44",
    glyph: "@",
    // ranger basic attack range requirement: 1–4 tiles
    stats: { maxHp: 32, maxMp: 12, atk: 5, def: 2, crit: 0.15, range: 4, dmgDice: [3, 8] },
    lore: "A keeper of forest paths, feathered shafts whispering through stone.",
  },
};

function E(key, name, tier, color, glyph, hp, atk, def, xp, dmg) {
  return [key, { name, tier, color, glyph, hp, atk, def, xp, dmg }];
}

// 80 enemies total, distributed by depth:
// depth1 = e1_* (16), depth2 = e2_* (16), depth3 = e3_* (16), depth4 = e4_* (16), depth5 = e5_* (16)
// plus boss `lich`.
const ENEMY_ENTRIES = [
  // Depth 1 — easiest (tier 1)
  E("e1_rat", "Dire Rat", 1, "#7a5a3c", "r", 6, 2, 0, 3, [1, 3]),
  E("e1_goblin", "Goblin", 1, "#5a7a3c", "g", 10, 3, 1, 6, [1, 4]),
  E("e1_bat", "Cave Bat", 1, "#4b4b5e", "b", 7, 2, 0, 4, [1, 3]),
  E("e1_slime", "Tar Slime", 1, "#2b3a2f", "s", 9, 2, 1, 5, [1, 3]),
  E("e1_thief", "Grave Thief", 1, "#5a2a6e", "t", 8, 3, 0, 6, [1, 4]),
  E("e1_spider", "Dust Spider", 1, "#3a2a1f", "p", 8, 3, 0, 6, [1, 4]),
  E("e1_hound", "Crypt Hound", 1, "#6b4e2a", "h", 11, 3, 1, 7, [1, 4]),
  E("e1_cultist", "Lost Cultist", 1, "#6a3b2a", "c", 10, 3, 1, 7, [1, 4]),
  E("e1_maggot", "Carrion Maggot", 1, "#7a7a3c", "m", 6, 2, 0, 3, [1, 3]),
  E("e1_scarab", "Dust Scarab", 1, "#8c7b68", "i", 9, 3, 1, 6, [1, 4]),
  E("e1_wisp", "Faint Wisp", 1, "#7ab8b8", "w", 6, 2, 0, 5, [1, 3]),
  E("e1_imp", "Ash Imp", 1, "#8c1c13", "i", 9, 3, 0, 6, [1, 4]),
  E("e1_ghoul", "Hungry Ghoul", 1, "#4a6b2a", "g", 12, 3, 1, 8, [1, 4]),
  E("e1_scout", "Goblin Scout", 1, "#3a7d44", "g", 9, 3, 0, 6, [1, 4]),
  E("e1_sentry", "Bone Sentry", 1, "#c8b79a", "S", 10, 3, 1, 7, [1, 4]),
  E("e1_mite", "Stone Mite", 1, "#6f6a5a", "x", 8, 2, 1, 5, [1, 3]),

  // Depth 2 — early mid (tier 1–2)
  E("e2_skeleton", "Skeleton", 2, "#c8b79a", "s", 14, 4, 2, 10, [2, 5]),
  E("e2_orc", "Orc Warrior", 2, "#6b8f3b", "o", 20, 5, 3, 14, [2, 6]),
  E("e2_bonehound", "Bone Hound", 2, "#bfb4a2", "h", 16, 4, 2, 10, [2, 5]),
  E("e2_bandit", "Ruin Bandit", 2, "#6b4e2a", "b", 15, 5, 1, 11, [2, 6]),
  E("e2_acolyte", "Acolyte of Embers", 2, "#8c1c13", "a", 13, 5, 1, 12, [2, 6]),
  E("e2_ghast", "Pale Ghast", 2, "#7ab8b8", "g", 14, 5, 1, 12, [2, 6]),
  E("e2_brute", "Goblin Brute", 2, "#5a7a3c", "B", 18, 5, 2, 13, [2, 6]),
  E("e2_guard", "Crypt Guard", 2, "#6f6a5a", "G", 18, 4, 3, 12, [2, 6]),
  E("e2_spitter", "Slime Spitter", 2, "#2b3a2f", "S", 15, 4, 2, 11, [2, 5]),
  E("e2_wyrmling", "Wyrmling", 2, "#8c1c13", "w", 16, 5, 2, 13, [2, 6]),
  E("e2_weaver", "Web Weaver", 2, "#3a2a1f", "W", 14, 4, 2, 11, [2, 5]),
  E("e2_hexer", "Bone Hexer", 2, "#c8b79a", "x", 12, 6, 1, 14, [2, 7]),
  E("e2_stalker", "Shadow Stalker", 2, "#2a1533", "s", 13, 6, 1, 14, [2, 7]),
  E("e2_marauder", "Orc Marauder", 2, "#4a6b2a", "o", 21, 6, 2, 16, [2, 7]),
  E("e2_spearman", "Goblin Spearman", 2, "#3a7d44", "g", 14, 5, 2, 12, [2, 6]),
  E("e2_bonearcher", "Bone Archer", 2, "#e0d3c1", "a", 13, 6, 1, 14, [2, 7]),

  // Depth 3 — mid (tier 2–3)
  E("e3_wraith", "Wraith", 3, "#7ab8b8", "w", 16, 7, 1, 20, [3, 7]),
  E("e3_troll", "Troll", 3, "#4a6b2a", "T", 32, 8, 4, 28, [3, 8]),
  E("e3_revenant", "Revenant", 3, "#c8b79a", "R", 26, 8, 3, 26, [3, 8]),
  E("e3_warlock", "Crypt Warlock", 3, "#2e86ab", "W", 22, 9, 2, 27, [3, 9]),
  E("e3_ogre", "Ogre", 3, "#6b8f3b", "O", 34, 9, 4, 30, [3, 9]),
  E("e3_saboteur", "Ruin Saboteur", 3, "#6b4e2a", "s", 22, 9, 2, 26, [3, 9]),
  E("e3_shade", "Shade", 3, "#2a1533", "S", 20, 9, 1, 24, [3, 9]),
  E("e3_berserker", "Orc Berserker", 3, "#4a6b2a", "B", 30, 10, 2, 30, [3, 10]),
  E("e3_fiend", "Ember Fiend", 3, "#8c1c13", "f", 24, 9, 2, 27, [3, 9]),
  E("e3_lurker", "Sewer Lurker", 3, "#2b3a2f", "l", 28, 8, 3, 26, [3, 8]),
  E("e3_myrmidon", "Bone Myrmidon", 3, "#bfb4a2", "M", 27, 9, 3, 28, [3, 9]),
  E("e3_stonebeast", "Stonebeast", 3, "#6f6a5a", "s", 36, 8, 5, 30, [3, 8]),
  E("e3_blightwolf", "Blight Wolf", 3, "#6b4e2a", "w", 26, 9, 2, 26, [3, 9]),
  E("e3_harbinger", "Echo Harbinger", 3, "#b8860b", "h", 23, 10, 2, 30, [3, 10]),
  E("e3_spinecaster", "Spinecaster", 3, "#c8b79a", "c", 20, 10, 1, 28, [3, 10]),
  E("e3_mantis", "Grave Mantis", 3, "#3a7d44", "m", 24, 9, 2, 26, [3, 9]),

  // Depth 4 — hard (tier 3–4)
  E("e4_golem", "Stone Golem", 4, "#6f6a5a", "G", 50, 10, 6, 45, [4, 10]),
  E("e4_wyvern", "Wyvern", 4, "#8c1c13", "W", 55, 12, 3, 55, [5, 11]),
  E("e4_dreadknight", "Dread Knight", 4, "#6f6a5a", "K", 58, 12, 6, 60, [5, 12]),
  E("e4_bonecolossus", "Bone Colossus", 4, "#c8b79a", "C", 62, 11, 7, 62, [4, 12]),
  E("e4_soulreaper", "Soul Reaper", 4, "#7ab8b8", "R", 44, 13, 3, 62, [5, 12]),
  E("e4_siegetroll", "Siege Troll", 4, "#4a6b2a", "T", 70, 12, 6, 65, [5, 12]),
  E("e4_witch", "Catacomb Witch", 4, "#2e86ab", "w", 46, 13, 3, 62, [5, 12]),
  E("e4_howlbeast", "Howlbeast", 4, "#6b4e2a", "H", 56, 12, 4, 58, [5, 11]),
  E("e4_sandwurm", "Sandwurm", 4, "#b9923a", "S", 68, 11, 6, 60, [4, 12]),
  E("e4_ironmarauder", "Iron Marauder", 4, "#6f6a5a", "I", 60, 13, 5, 65, [5, 13]),
  E("e4_stormwraith", "Storm Wraith", 4, "#7ab8b8", "w", 48, 14, 3, 68, [5, 13]),
  E("e4_embergiant", "Ember Giant", 4, "#8c1c13", "E", 78, 13, 6, 72, [5, 13]),
  E("e4_mindbreaker", "Mindbreaker", 4, "#b8860b", "M", 52, 14, 4, 68, [5, 13]),
  E("e4_gravelord", "Gravelord", 4, "#2a221b", "g", 74, 12, 7, 70, [5, 12]),
  E("e4_bloodharpy", "Blood Harpy", 4, "#b0251a", "h", 50, 15, 3, 70, [5, 14]),
  E("e4_blackguard", "Blackguard", 4, "#1a1a22", "B", 66, 13, 6, 70, [5, 13]),

  // Depth 5 — brutal (tier 4–5)
  E("e5_seraph", "Fallen Seraph", 5, "#f0d89a", "S", 88, 16, 5, 95, [6, 14]),
  E("e5_deathknight", "Death Knight", 5, "#6f6a5a", "D", 96, 16, 7, 110, [6, 15]),
  E("e5_archlich", "Lesser Archlich", 5, "#b8860b", "L", 84, 17, 4, 105, [6, 15]),
  E("e5_voidwyrm", "Void Wyrm", 5, "#7ab8b8", "V", 92, 17, 5, 110, [6, 15]),
  E("e5_titan", "Stone Titan", 5, "#6f6a5a", "T", 120, 15, 9, 120, [6, 16]),
  E("e5_infernowyvern", "Inferno Wyvern", 5, "#8c1c13", "W", 110, 18, 4, 125, [7, 16]),
  E("e5_reaperlord", "Reaper Lord", 5, "#7ab8b8", "R", 90, 18, 5, 120, [7, 16]),
  E("e5_cryptqueen", "Crypt Queen", 5, "#2e86ab", "Q", 86, 18, 4, 118, [7, 15]),
  E("e5_bonewyrm", "Bonewyrm", 5, "#c8b79a", "B", 118, 16, 8, 125, [6, 16]),
  E("e5_hollowgiant", "Hollow Giant", 5, "#2a221b", "H", 130, 16, 8, 130, [7, 16]),
  E("e5_nightstalker", "Nightstalker", 5, "#2a1533", "N", 78, 19, 3, 115, [7, 15]),
  E("e5_emberlord", "Ember Lord", 5, "#b0251a", "E", 112, 18, 6, 130, [7, 17]),
  E("e5_doomgolem", "Doom Golem", 5, "#6f6a5a", "G", 140, 17, 10, 140, [7, 17]),
  E("e5_soulengine", "Soul Engine", 5, "#b8860b", "Ω", 100, 19, 6, 135, [7, 17]),
  E("e5_plaguecolossus", "Plague Colossus", 5, "#4a6b2a", "P", 150, 16, 9, 140, [7, 16]),
  E("e5_voidtemplar", "Void Templar", 5, "#1a1c1f", "V", 104, 19, 7, 140, [7, 17]),
];

export const ENEMIES = Object.fromEntries([
  ...ENEMY_ENTRIES,
  ["lich", { name: "Echo Lich", tier: 5, color: "#b8860b", glyph: "L", hp: 120, atk: 14, def: 5, xp: 150, dmg: [6, 14], boss: true }],
]);

export const ITEMS = {
  potion:   { name: "Health Potion", color: "#b0251a", glyph: "!", effect: "heal", value: 15 },
  mana:     { name: "Mana Phial",    color: "#138c8c", glyph: "!", effect: "mana", value: 12 },
  gold:     { name: "Gold",          color: "#b8860b", glyph: "$", effect: "gold", value: 0 },
  scroll:   { name: "Scroll of Echoes", color: "#e0d3c1", glyph: "?", effect: "xp", value: 20 },
};

export function spawnTableForDepth(depth) {
  // return list of {key, weight}
  const d1 = ENEMY_ENTRIES.filter(([k]) => k.startsWith("e1_")).map(([k]) => k);
  const d2 = ENEMY_ENTRIES.filter(([k]) => k.startsWith("e2_")).map(([k]) => k);
  const d3 = ENEMY_ENTRIES.filter(([k]) => k.startsWith("e3_")).map(([k]) => k);
  const d4 = ENEMY_ENTRIES.filter(([k]) => k.startsWith("e4_")).map(([k]) => k);
  const d5 = ENEMY_ENTRIES.filter(([k]) => k.startsWith("e5_")).map(([k]) => k);

  const make = (keys, w = 3) => keys.map((k) => [k, w]);
  if (depth === 1) return make(d1, 4);
  if (depth === 2) return [...make(d1.slice(0, 6), 2), ...make(d2, 4)];
  if (depth === 3) return [...make(d2.slice(0, 8), 2), ...make(d3, 4)];
  if (depth === 4) return [...make(d3.slice(0, 8), 2), ...make(d4, 4)];
  if (depth === 5) return [...make(d4.slice(0, 8), 2), ...make(d5, 4)];
  return make(d5, 4);
}

export function weightedPick(rng, table) {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let r = rng.next() * total;
  for (const [k, w] of table) {
    r -= w;
    if (r <= 0) return k;
  }
  return table[0][0];
}

export function rollDice(rng, [min, max]) {
  return rng.int(min, max);
}

export function resolveAttack(rng, atk, tgt) {
  const isCrit = rng.next() < (atk.crit || 0.05);
  let dmg = rollDice(rng, atk.dmg || atk.stats?.dmgDice || [1, 3]) + (atk.bonus || 0);
  dmg = Math.max(1, dmg - (tgt.def || 0));
  if (isCrit) dmg = Math.floor(dmg * 1.75);
  return { dmg, crit: isCrit };
}

export const XP_PER_LEVEL = (lvl) => 10 + lvl * 8 + Math.floor(lvl * lvl * 1.5);

export const LEVEL_UPGRADES = [
  { id: "hp_up",   name: "Vitality",        desc: "+10 max HP (full heal)" },
  { id: "mp_up",   name: "Arcane Well",     desc: "+8 max MP (refill)" },
  { id: "atk_up",  name: "Forged Edge",     desc: "+2 Attack, +1 dmg roll" },
  { id: "def_up",  name: "Stone Skin",      desc: "+2 Defense" },
  { id: "crit_up", name: "Keen Eye",        desc: "+6% Crit chance" },
  { id: "range_up",name: "Reach",           desc: "+1 Attack Range" },
  { id: "regen",   name: "Echoed Regeneration", desc: "Regen 1 HP every 6 turns" },
  { id: "dodge",   name: "Swiftness",       desc: "15% chance to dodge attacks" },
];

export function rollUpgrades(rng, count = 3) {
  const pool = [...LEVEL_UPGRADES];
  const picks = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = rng.int(0, pool.length - 1);
    picks.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return picks;
}

export function applyUpgrade(player, upg) {
  switch (upg.id) {
    case "hp_up":   player.maxHp += 10; player.hp = player.maxHp; break;
    case "mp_up":   player.maxMp += 8;  player.mp = player.maxMp; break;
    case "atk_up":  player.atk += 2;    player.dmgBonus = (player.dmgBonus || 0) + 1; break;
    case "def_up":  player.def += 2; break;
    case "crit_up": player.crit = (player.crit || 0) + 0.06; break;
    case "range_up": player.range = (player.range || 1) + 1; break;
    case "regen":   player.regen = true; break;
    case "dodge":   player.dodge = (player.dodge || 0) + 0.15; break;
    default: break;
  }
}
