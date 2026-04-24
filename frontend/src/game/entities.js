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
};

export const ENEMIES = {
  rat:      { name: "Dire Rat",     tier: 1, color: "#7a5a3c", glyph: "r", hp: 6,  atk: 2, def: 0, xp: 3,  dmg: [1,3] },
  goblin:   { name: "Goblin",       tier: 1, color: "#5a7a3c", glyph: "g", hp: 10, atk: 3, def: 1, xp: 6,  dmg: [1,4] },
  skeleton: { name: "Skeleton",     tier: 2, color: "#c8b79a", glyph: "s", hp: 14, atk: 4, def: 2, xp: 10, dmg: [2,5] },
  orc:      { name: "Orc Warrior",  tier: 2, color: "#6b8f3b", glyph: "o", hp: 20, atk: 5, def: 3, xp: 14, dmg: [2,6] },
  wraith:   { name: "Wraith",       tier: 3, color: "#7ab8b8", glyph: "w", hp: 16, atk: 7, def: 1, xp: 20, dmg: [3,7] },
  troll:    { name: "Troll",        tier: 3, color: "#4a6b2a", glyph: "T", hp: 32, atk: 8, def: 4, xp: 28, dmg: [3,8] },
  golem:    { name: "Stone Golem",  tier: 4, color: "#6f6a5a", glyph: "G", hp: 50, atk: 10, def: 6, xp: 45, dmg: [4,10] },
  wyvern:   { name: "Wyvern",       tier: 4, color: "#8c1c13", glyph: "W", hp: 55, atk: 12, def: 3, xp: 55, dmg: [5,11] },
  lich:     { name: "Echo Lich",    tier: 5, color: "#b8860b", glyph: "L", hp: 120, atk: 14, def: 5, xp: 150, dmg: [6,14], boss: true },
};

export const ITEMS = {
  potion:   { name: "Health Potion", color: "#b0251a", glyph: "!", effect: "heal", value: 15 },
  mana:     { name: "Mana Phial",    color: "#138c8c", glyph: "!", effect: "mana", value: 12 },
  gold:     { name: "Gold",          color: "#b8860b", glyph: "$", effect: "gold", value: 0 },
  scroll:   { name: "Scroll of Echoes", color: "#e0d3c1", glyph: "?", effect: "xp", value: 20 },
};

export function spawnTableForDepth(depth) {
  // return list of {key, weight}
  if (depth === 1) return [["rat", 5], ["goblin", 3]];
  if (depth === 2) return [["rat", 3], ["goblin", 5], ["skeleton", 2]];
  if (depth === 3) return [["goblin", 3], ["skeleton", 4], ["orc", 3], ["wraith", 1]];
  if (depth === 4) return [["skeleton", 3], ["orc", 4], ["wraith", 3], ["troll", 2]];
  if (depth === 5) return [["orc", 3], ["wraith", 3], ["troll", 4], ["golem", 2], ["wyvern", 2]];
  return [["troll", 2], ["golem", 3], ["wyvern", 3]];
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
