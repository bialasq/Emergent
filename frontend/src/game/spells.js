// Spell definitions and runtime effects.
// All spells consume MP. Some require a target tile (aimed).
// Key bindings are declared below and wired from Game.jsx.

export const SPELLS = {
  heal: {
    id: "heal",
    name: "Mend",
    hotkey: "h",
    mpCost: 8,
    baseUnlocked: true,
    color: "#b0251a",
    desc: "Knit flesh. Restore 18 HP.",
  },
  light: {
    id: "light",
    name: "Candleflame",
    hotkey: "l",
    mpCost: 5,
    baseUnlocked: true,
    color: "#f0d89a",
    desc: "Extend sight +4 for 15 turns.",
  },
  haste: {
    id: "haste",
    name: "Quickstep",
    hotkey: "g",
    mpCost: 10,
    baseUnlocked: false,
    cost: 25,
    color: "#1fb3b3",
    desc: "You move twice per foe turn (10 turns).",
  },
  fireball: {
    id: "fireball",
    name: "Ember Burst",
    hotkey: "f",
    mpCost: 12,
    baseUnlocked: false,
    cost: 35,
    color: "#e05a1a",
    desc: "Sear all foes within 1 tile of the nearest visible enemy.",
  },
  death_wave: {
    id: "death_wave",
    name: "Death Wave",
    hotkey: "z",
    mpCost: 14,
    baseUnlocked: false,
    color: "#7ab8b8",
    desc: "A piercing wave of death along the line to the nearest foe.",
  },
  energy_wave: {
    id: "energy_wave",
    name: "Energy Wave",
    hotkey: "x",
    mpCost: 14,
    baseUnlocked: false,
    color: "#1fb3b3",
    desc: "A piercing wave of energy along the line to the nearest foe.",
  },
  inferno_orb: {
    id: "inferno_orb",
    name: "Inferno Orb",
    hotkey: "c",
    mpCost: 20,
    baseUnlocked: false,
    color: "#e05a1a",
    desc: "Explodes in a circle (diameter 4 tiles) around the nearest visible foe.",
  },
  death_nova: {
    id: "death_nova",
    name: "Death Nova",
    hotkey: "v",
    mpCost: 35,
    baseUnlocked: false,
    color: "#b8860b",
    desc: "Ultimate: death erupts around you (radius 5).",
  },
  rope: {
    id: "rope",
    name: "Binding Rope",
    hotkey: "t",
    mpCost: 15,
    baseUnlocked: false,
    cost: 50,
    color: "#b8860b",
    desc: "Pull yourself to the known stairway down.",
  },
};

export const SPELL_ORDER = ["heal", "light", "haste", "fireball", "death_wave", "energy_wave", "inferno_orb", "death_nova", "rope"];

export const SOUL_UPGRADES = [
  { id: "hp",   name: "Hardened Soul",  desc: "+5 max HP",   cost: 5,  max: 5, delta: { maxHp: 5 } },
  { id: "mp",   name: "Deep Well",      desc: "+5 max MP",   cost: 5,  max: 5, delta: { maxMp: 5 } },
  { id: "atk",  name: "Sharpened Steel",desc: "+1 Attack",   cost: 10, max: 3, delta: { atk: 1 } },
  { id: "def",  name: "Iron Ward",      desc: "+1 Defense",  cost: 10, max: 3, delta: { def: 1 } },
  { id: "pot",  name: "Alchemist's Kit",desc: "Begin with a health potion", cost: 5, max: 3, delta: { startPotions: 1 } },
  { id: "haste",    name: "Echo of the Wind",  desc: "Unlock Quickstep",   cost: 25, max: 1, unlocks: "haste" },
  { id: "fireball", name: "Ember Reforged",    desc: "Unlock Ember Burst", cost: 35, max: 1, unlocks: "fireball" },
  { id: "rope",     name: "Ancestral Thread",  desc: "Unlock Binding Rope",cost: 50, max: 1, unlocks: "rope" },
];

// Computes player stat modifiers from a meta object of {upgradeId: level}
export function applyMetaToStats(baseStats, meta) {
  const s = { ...baseStats };
  let startPotions = 0;
  const unlockedSpells = ["heal", "light"]; // baseline
  for (const u of SOUL_UPGRADES) {
    const lvl = (meta && meta[u.id]) || 0;
    if (lvl <= 0) continue;
    if (u.delta) {
      for (const [k, v] of Object.entries(u.delta)) {
        if (k === "startPotions") startPotions += v * lvl;
        else s[k] = (s[k] || 0) + v * lvl;
      }
    }
    if (u.unlocks) unlockedSpells.push(u.unlocks);
  }
  return { stats: s, startPotions, unlockedSpells };
}

// Hero Soul earned from a run
export function soulsFromRun(summary) {
  const base = Math.floor(summary.score / 100);
  const bonus = summary.kills;
  const victoryBonus = summary.outcome === "victory" ? 50 : 0;
  return base + bonus + victoryBonus;
}
