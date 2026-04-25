// Class-based gear: slots, stat bonuses, two-handed rules (ranger/rogue: no off-hand).

export const GEAR_SLOTS = ["helm", "armor", "offhand", "weapon", "amulet1", "amulet2", "ring", "boots"];

/** UI label for off-hand depends on class */
export function offhandLabel(cls) {
  if (cls === "warrior") return "Shield";
  if (cls === "mage") return "Spellbook";
  return "—";
}

export function canEquipOffhand(cls) {
  return cls === "warrior" || cls === "mage";
}

export function emptyEquipment() {
  return {
    helm: null,
    armor: null,
    offhand: null,
    weapon: null,
    amulet1: null,
    amulet2: null,
    ring: null,
    boots: null,
  };
}

/** @typedef {{ gearId: string, name: string, slot: string, cls: string, twoHanded?: boolean, weaponType?: string, stats?: Record<string, number> }} GearInstance */

/** Full definitions keyed by id */
export const GEAR_DEFS = {
  // ——— Warrior (knight) ———
  // helms (4)
  helm_war_bascinet: { name: "Bascinet of the Gate", slot: "helm", cls: "warrior", stats: { def: 2, maxHp: 6 } },
  helm_war_crown: { name: "Crownhelm of Ash", slot: "helm", cls: "warrior", stats: { def: 3, maxHp: 10, atk: 1 } },
  helm_war_visored: { name: "Visored Greathelm", slot: "helm", cls: "warrior", stats: { def: 4, maxHp: 12, crit: 0.01 } },
  helm_war_lion: { name: "Lioncrest Helm", slot: "helm", cls: "warrior", stats: { def: 3, atk: 2, maxHp: 8 } },
  // armors (4)
  armor_war_chain: { name: "Riveted Hauberk", slot: "armor", cls: "warrior", stats: { def: 4, maxHp: 12 } },
  armor_war_plate: { name: "Plate of the Echo", slot: "armor", cls: "warrior", stats: { def: 6, maxHp: 18 } },
  armor_war_brig: { name: "Brigandine of Oaths", slot: "armor", cls: "warrior", stats: { def: 5, maxHp: 16, atk: 1 } },
  armor_war_blacksteel: { name: "Blacksteel Cuirass", slot: "armor", cls: "warrior", stats: { def: 7, maxHp: 14, dodge: -0.01 } },
  // shields (4)
  shield_war_kite: { name: "Kite Shield", slot: "offhand", cls: "warrior", stats: { def: 3, maxHp: 4 } },
  shield_war_tower: { name: "Tower Bulwark", slot: "offhand", cls: "warrior", stats: { def: 5, maxHp: 8 } },
  shield_war_round: { name: "Roundguard", slot: "offhand", cls: "warrior", stats: { def: 2, crit: 0.02 } },
  shield_war_aegis: { name: "Aegis of the Crypt", slot: "offhand", cls: "warrior", stats: { def: 6, maxHp: 6, dodge: 0.01 } },
  // weapons (4 each: sword/axe/club)
  wep_war_sword: { name: "Knight's Sword", slot: "weapon", cls: "warrior", weaponType: "sword", stats: { atk: 3, dmgBonus: 1 } },
  wep_war_sword2: { name: "Dawnblade", slot: "weapon", cls: "warrior", weaponType: "sword", stats: { atk: 4, dmgBonus: 1, crit: 0.02 } },
  wep_war_sword3: { name: "Echo Longsword", slot: "weapon", cls: "warrior", weaponType: "sword", stats: { atk: 5, dmgBonus: 2 } },
  wep_war_sword4: { name: "Hollowsteel Sabre", slot: "weapon", cls: "warrior", weaponType: "sword", stats: { atk: 4, dmgBonus: 3, dodge: 0.01 } },
  wep_war_axe: { name: "Greataxe", slot: "weapon", cls: "warrior", weaponType: "axe", stats: { atk: 4, dmgBonus: 2, crit: 0.02 } },
  wep_war_axe2: { name: "Rift Cleaver", slot: "weapon", cls: "warrior", weaponType: "axe", stats: { atk: 5, dmgBonus: 2, crit: 0.03 } },
  wep_war_axe3: { name: "Ironbite Axe", slot: "weapon", cls: "warrior", weaponType: "axe", stats: { atk: 6, dmgBonus: 1 } },
  wep_war_axe4: { name: "Executioner's Hatchet", slot: "weapon", cls: "warrior", weaponType: "axe", stats: { atk: 5, dmgBonus: 3, dodge: -0.01 } },
  wep_war_club: { name: "Stone Club", slot: "weapon", cls: "warrior", weaponType: "club", stats: { atk: 2, dmgBonus: 3 } },
  wep_war_club2: { name: "Ogre Maul", slot: "weapon", cls: "warrior", weaponType: "club", stats: { atk: 3, dmgBonus: 4 } },
  wep_war_club3: { name: "Censer Mace", slot: "weapon", cls: "warrior", weaponType: "club", stats: { atk: 4, dmgBonus: 4, def: 1 } },
  wep_war_club4: { name: "Gravehammer", slot: "weapon", cls: "warrior", weaponType: "club", stats: { atk: 5, dmgBonus: 5, crit: -0.01 } },
  // amulets (4)
  amu_war_sun: { name: "Amulet of Dawn", slot: "amulet", cls: "warrior", stats: { maxHp: 5, def: 1 } },
  amu_war_blood: { name: "Bloodward Pendant", slot: "amulet", cls: "warrior", stats: { atk: 2, crit: 0.03 } },
  amu_war_oath: { name: "Oathkeeper Locket", slot: "amulet", cls: "warrior", stats: { def: 2, maxHp: 8 } },
  amu_war_giant: { name: "Giant's Tooth", slot: "amulet", cls: "warrior", stats: { atk: 3, maxHp: 4 } },
  // rings (4)
  ring_war_iron: { name: "Iron Signet", slot: "ring", cls: "warrior", stats: { def: 2, atk: 1 } },
  ring_war_warpath: { name: "Warpath Ring", slot: "ring", cls: "warrior", stats: { atk: 2, crit: 0.02 } },
  ring_war_bulwark: { name: "Bulwark Band", slot: "ring", cls: "warrior", stats: { def: 3, maxHp: 3 } },
  ring_war_grit: { name: "Grit Loop", slot: "ring", cls: "warrior", stats: { maxHp: 10, dodge: -0.01 } },
  // boots (4)
  boots_war_heavy: { name: "Sabatons of March", slot: "boots", cls: "warrior", stats: { def: 2, maxHp: 6 } },
  boots_war_stomp: { name: "Gravel Stompers", slot: "boots", cls: "warrior", stats: { def: 1, maxHp: 10 } },
  boots_war_vigil: { name: "Vigil Greaves", slot: "boots", cls: "warrior", stats: { def: 3, atk: 1 } },
  boots_war_warden: { name: "Warden Treads", slot: "boots", cls: "warrior", stats: { def: 2, dodge: 0.02 } },

  // ——— Mage ———
  // helms (4)
  helm_mage_hood: { name: "Archivist's Hood", slot: "helm", cls: "mage", stats: { maxMp: 8, def: 1 } },
  helm_mage_circlet: { name: "Circlet of Veils", slot: "helm", cls: "mage", stats: { maxMp: 12, crit: 0.04 } },
  helm_mage_moon: { name: "Moonlit Cowl", slot: "helm", cls: "mage", stats: { maxMp: 10, dodge: 0.02 } },
  helm_mage_spire: { name: "Spirecap", slot: "helm", cls: "mage", stats: { maxMp: 16, atk: 1 } },
  // armors (4)
  armor_mage_robes: { name: "Runesilk Robes", slot: "armor", cls: "mage", stats: { def: 2, maxMp: 15 } },
  armor_mage_arcane: { name: "Arcane Surcoat", slot: "armor", cls: "mage", stats: { def: 3, maxMp: 22, maxHp: 5 } },
  armor_mage_warded: { name: "Warded Vestments", slot: "armor", cls: "mage", stats: { def: 3, maxMp: 18, crit: 0.02 } },
  armor_mage_astral: { name: "Astral Mantle", slot: "armor", cls: "mage", stats: { def: 2, maxMp: 28, dodge: 0.02 } },
  // spellbooks (4)
  off_mage_codex: { name: "Lesser Spell Codex", slot: "offhand", cls: "mage", stats: { maxMp: 10, atk: 1 } },
  off_mage_tome: { name: "Tome of Ember Sigils", slot: "offhand", cls: "mage", stats: { maxMp: 18, atk: 2, crit: 0.03 } },
  off_mage_grimoire: { name: "Grimoire of Threads", slot: "offhand", cls: "mage", stats: { maxMp: 14, def: 1, crit: 0.03 } },
  off_mage_lexicon: { name: "Lexicon of Sparks", slot: "offhand", cls: "mage", stats: { maxMp: 22, atk: 1, dmgBonus: 1 } },
  // wands (4)
  wep_mage_wand: { name: "Pine Channel-Wand", slot: "weapon", cls: "mage", weaponType: "wand", stats: { atk: 2, maxMp: 6, dmgBonus: 1 } },
  wep_mage_wand2: { name: "Crystal Wand", slot: "weapon", cls: "mage", weaponType: "wand", stats: { atk: 4, maxMp: 10, dmgBonus: 2 } },
  wep_mage_wand3: { name: "Obsidian Rod", slot: "weapon", cls: "mage", weaponType: "wand", stats: { atk: 5, maxMp: 8, crit: 0.02 } },
  wep_mage_wand4: { name: "Starglass Scepter", slot: "weapon", cls: "mage", weaponType: "wand", stats: { atk: 6, maxMp: 14, dmgBonus: 2 } },
  // amulets (4)
  amu_mage_star: { name: "Starwoven Charm", slot: "amulet", cls: "mage", stats: { maxMp: 8, crit: 0.03 } },
  amu_mage_void: { name: "Voidthread Locket", slot: "amulet", cls: "mage", stats: { atk: 2, maxMp: 6 } },
  amu_mage_rune: { name: "Runic Pendant", slot: "amulet", cls: "mage", stats: { maxMp: 12, def: 1 } },
  amu_mage_glow: { name: "Glowstone Charm", slot: "amulet", cls: "mage", stats: { atk: 3, crit: 0.01 } },
  // rings (4)
  ring_mage_loop: { name: "Quartz Loop", slot: "ring", cls: "mage", stats: { maxMp: 10, def: 1 } },
  ring_mage_focus: { name: "Focus Band", slot: "ring", cls: "mage", stats: { maxMp: 14, atk: 1 } },
  ring_mage_aether: { name: "Aether Ring", slot: "ring", cls: "mage", stats: { crit: 0.05, maxMp: 6 } },
  ring_mage_guard: { name: "Warding Circle", slot: "ring", cls: "mage", stats: { def: 2, maxMp: 8 } },
  // boots (4)
  boots_mage_soft: { name: "Silent Slippers", slot: "boots", cls: "mage", stats: { dodge: 0.05, maxMp: 5 } },
  boots_mage_sand: { name: "Sandstep Wraps", slot: "boots", cls: "mage", stats: { dodge: 0.04, maxMp: 8 } },
  boots_mage_rune: { name: "Rune-stitched Boots", slot: "boots", cls: "mage", stats: { def: 1, maxMp: 10 } },
  boots_mage_sigil: { name: "Sigil Soles", slot: "boots", cls: "mage", stats: { atk: 1, maxMp: 6, dodge: 0.02 } },

  // ——— Rogue (dual / two-hand only — no shield) ———
  // helms (4)
  helm_rogue_cowl: { name: "Leather Cowl", slot: "helm", cls: "rogue", stats: { def: 1, crit: 0.04 } },
  helm_rogue_mask: { name: "Mask of the Guild", slot: "helm", cls: "rogue", stats: { crit: 0.06, dodge: 0.03 } },
  helm_rogue_veil: { name: "Veil of Footsteps", slot: "helm", cls: "rogue", stats: { dodge: 0.05, crit: 0.03 } },
  helm_rogue_hush: { name: "Hush Hood", slot: "helm", cls: "rogue", stats: { def: 2, dodge: 0.04 } },
  // armors (4)
  armor_rogue_jerkin: { name: "Night Jerkin", slot: "armor", cls: "rogue", stats: { def: 2, dodge: 0.04 } },
  armor_rogue_weave: { name: "Shadowweave Coat", slot: "armor", cls: "rogue", stats: { def: 3, crit: 0.05, maxHp: 8 } },
  armor_rogue_smoke: { name: "Smokewalker Garb", slot: "armor", cls: "rogue", stats: { def: 2, dodge: 0.06 } },
  armor_rogue_guild: { name: "Guild Leathers", slot: "armor", cls: "rogue", stats: { def: 4, crit: 0.03, dodge: 0.02 } },
  // daggers (4) + nunchaku (4) (all twoHanded)
  wep_rogue_dirks: { name: "Twin Dirks", slot: "weapon", cls: "rogue", weaponType: "daggers", twoHanded: true, stats: { atk: 4, crit: 0.08, dmgBonus: 2 } },
  wep_rogue_dirks2: { name: "Whisper Blades", slot: "weapon", cls: "rogue", weaponType: "daggers", twoHanded: true, stats: { atk: 5, crit: 0.07, dodge: 0.02 } },
  wep_rogue_dirks3: { name: "Gutterfangs", slot: "weapon", cls: "rogue", weaponType: "daggers", twoHanded: true, stats: { atk: 6, crit: 0.06, dmgBonus: 2 } },
  wep_rogue_dirks4: { name: "Blackedge Pair", slot: "weapon", cls: "rogue", weaponType: "daggers", twoHanded: true, stats: { atk: 5, crit: 0.09, dmgBonus: 1 } },
  wep_rogue_nunchaku: { name: "Chain Nunchaku", slot: "weapon", cls: "rogue", weaponType: "nunchaku", twoHanded: true, stats: { atk: 5, dmgBonus: 1, dodge: 0.05 } },
  wep_rogue_nunchaku2: { name: "Iron Munchako", slot: "weapon", cls: "rogue", weaponType: "nunchaku", twoHanded: true, stats: { atk: 6, dmgBonus: 2, dodge: 0.03 } },
  wep_rogue_nunchaku3: { name: "Gravechain Sticks", slot: "weapon", cls: "rogue", weaponType: "nunchaku", twoHanded: true, stats: { atk: 7, dmgBonus: 2, crit: 0.02 } },
  wep_rogue_nunchaku4: { name: "Shadowcord Nunchaku", slot: "weapon", cls: "rogue", weaponType: "nunchaku", twoHanded: true, stats: { atk: 6, dmgBonus: 3, dodge: 0.04 } },
  // amulets (4)
  amu_rogue_cut: { name: "Cutpurse's Charm", slot: "amulet", cls: "rogue", stats: { atk: 2, crit: 0.04 } },
  amu_rogue_night: { name: "Nightmarket Token", slot: "amulet", cls: "rogue", stats: { dodge: 0.06, maxHp: 6 } },
  amu_rogue_coin: { name: "Bent Coin", slot: "amulet", cls: "rogue", stats: { crit: 0.05, dodge: 0.02 } },
  amu_rogue_smoke: { name: "Smoketrail Locket", slot: "amulet", cls: "rogue", stats: { dodge: 0.07, def: 1 } },
  // rings (4)
  ring_rogue_wire: { name: "Wire Loop", slot: "ring", cls: "rogue", stats: { crit: 0.05, atk: 1 } },
  ring_rogue_vanish: { name: "Vanish Ring", slot: "ring", cls: "rogue", stats: { dodge: 0.05, crit: 0.02 } },
  ring_rogue_fang: { name: "Fang Band", slot: "ring", cls: "rogue", stats: { atk: 2, crit: 0.03 } },
  ring_rogue_nail: { name: "Nail Ring", slot: "ring", cls: "rogue", stats: { def: 1, crit: 0.06 } },
  // boots (4)
  boots_rogue_soft: { name: "Soft Tread", slot: "boots", cls: "rogue", stats: { dodge: 0.07, def: 1 } },
  boots_rogue_silent: { name: "Silent Soles", slot: "boots", cls: "rogue", stats: { dodge: 0.08 } },
  boots_rogue_gutter: { name: "Gutter Runners", slot: "boots", cls: "rogue", stats: { dodge: 0.06, atk: 1 } },
  boots_rogue_night: { name: "Nightstep Boots", slot: "boots", cls: "rogue", stats: { dodge: 0.05, crit: 0.02 } },

  // ——— Ranger (bow / crossbow two-hand — no shield) ———
  // helms (4)
  helm_ranger_cap: { name: "Hunter's Cap", slot: "helm", cls: "ranger", stats: { atk: 1, maxHp: 5 } },
  helm_ranger_leaf: { name: "Leaf-Woven Veil", slot: "helm", cls: "ranger", stats: { atk: 2, crit: 0.03 } },
  helm_ranger_stag: { name: "Staghide Hood", slot: "helm", cls: "ranger", stats: { maxHp: 8, def: 1 } },
  helm_ranger_briar: { name: "Briar Crown", slot: "helm", cls: "ranger", stats: { atk: 1, crit: 0.05 } },
  // armors (4)
  armor_ranger_hide: { name: "Brigandine Hide", slot: "armor", cls: "ranger", stats: { def: 3, maxHp: 10 } },
  armor_ranger_scout: { name: "Scout's Lamellar", slot: "armor", cls: "ranger", stats: { def: 4, maxHp: 14, atk: 1 } },
  armor_ranger_bark: { name: "Barkscale Vest", slot: "armor", cls: "ranger", stats: { def: 4, maxHp: 10, dodge: 0.02 } },
  armor_ranger_dune: { name: "Dunecloak", slot: "armor", cls: "ranger", stats: { def: 3, maxHp: 12, crit: 0.02 } },
  // bows (4) + crossbows (4) (twoHanded)
  wep_ranger_bow: { name: "Ash Longbow", slot: "weapon", cls: "ranger", weaponType: "bow", twoHanded: true, stats: { atk: 4, range: 1, dmgBonus: 2 } },
  wep_ranger_bow2: { name: "Yew Warbow", slot: "weapon", cls: "ranger", weaponType: "bow", twoHanded: true, stats: { atk: 5, range: 1, dmgBonus: 2, crit: 0.02 } },
  wep_ranger_bow3: { name: "Moonstring Bow", slot: "weapon", cls: "ranger", weaponType: "bow", twoHanded: true, stats: { atk: 6, range: 2, dmgBonus: 2 } },
  wep_ranger_bow4: { name: "Ravenwood Longbow", slot: "weapon", cls: "ranger", weaponType: "bow", twoHanded: true, stats: { atk: 6, range: 1, dmgBonus: 3 } },
  wep_ranger_cross: { name: "Iron Crossbow", slot: "weapon", cls: "ranger", weaponType: "crossbow", twoHanded: true, stats: { atk: 5, dmgBonus: 3 } },
  wep_ranger_cross2: { name: "Crank Crossbow", slot: "weapon", cls: "ranger", weaponType: "crossbow", twoHanded: true, stats: { atk: 6, dmgBonus: 3, crit: 0.01 } },
  wep_ranger_cross3: { name: "Repeater Crossbow", slot: "weapon", cls: "ranger", weaponType: "crossbow", twoHanded: true, stats: { atk: 7, dmgBonus: 2, range: 1 } },
  wep_ranger_cross4: { name: "Hollowbolt Rig", slot: "weapon", cls: "ranger", weaponType: "crossbow", twoHanded: true, stats: { atk: 7, dmgBonus: 4, dodge: -0.01 } },
  // amulets (4)
  amu_ranger_wind: { name: "Windcaller Charm", slot: "amulet", cls: "ranger", stats: { atk: 2, crit: 0.03 } },
  amu_ranger_beast: { name: "Beastfang Talisman", slot: "amulet", cls: "ranger", stats: { maxHp: 10, def: 1 } },
  amu_ranger_thicket: { name: "Thicket Locket", slot: "amulet", cls: "ranger", stats: { dodge: 0.04, maxHp: 6 } },
  amu_ranger_quarry: { name: "Quarry Charm", slot: "amulet", cls: "ranger", stats: { atk: 3, dmgBonus: 1 } },
  // rings (4)
  ring_ranger_thorn: { name: "Thorn Ring", slot: "ring", cls: "ranger", stats: { atk: 2, crit: 0.04 } },
  ring_ranger_trail: { name: "Trail Ring", slot: "ring", cls: "ranger", stats: { dodge: 0.03, atk: 1 } },
  ring_ranger_keen: { name: "Keen Band", slot: "ring", cls: "ranger", stats: { crit: 0.06 } },
  ring_ranger_bark: { name: "Bark Ring", slot: "ring", cls: "ranger", stats: { def: 2, maxHp: 6 } },
  // boots (4)
  boots_ranger_trail: { name: "Trail Boots", slot: "boots", cls: "ranger", stats: { dodge: 0.04, maxHp: 6 } },
  boots_ranger_mire: { name: "Mire Walkers", slot: "boots", cls: "ranger", stats: { dodge: 0.05, def: 1 } },
  boots_ranger_dune: { name: "Dune Striders", slot: "boots", cls: "ranger", stats: { dodge: 0.04, atk: 1 } },
  boots_ranger_briar: { name: "Briar Treads", slot: "boots", cls: "ranger", stats: { dodge: 0.03, crit: 0.02 } },
};

export function getGearDef(gearId) {
  return GEAR_DEFS[gearId] || null;
}

export function instantiateGear(gearId) {
  const d = getGearDef(gearId);
  if (!d) return null;
  return {
    gearId,
    name: d.name,
    slot: d.slot,
    cls: d.cls,
    twoHanded: !!d.twoHanded,
    weaponType: d.weaponType || null,
    stats: { ...(d.stats || {}) },
  };
}

/** Starting loadout per class (one weapon line; warrior starts with sword + shield) */
export function starterEquipment(cls) {
  const E = emptyEquipment();
  if (cls === "warrior") {
    E.helm = instantiateGear("helm_war_bascinet");
    E.armor = instantiateGear("armor_war_chain");
    E.offhand = instantiateGear("shield_war_kite");
    E.weapon = instantiateGear("wep_war_sword");
    E.amulet1 = instantiateGear("amu_war_sun");
    E.amulet2 = instantiateGear("amu_war_blood");
    E.ring = instantiateGear("ring_war_iron");
    E.boots = instantiateGear("boots_war_heavy");
  } else if (cls === "mage") {
    E.helm = instantiateGear("helm_mage_hood");
    E.armor = instantiateGear("armor_mage_robes");
    E.offhand = instantiateGear("off_mage_codex");
    E.weapon = instantiateGear("wep_mage_wand");
    E.amulet1 = instantiateGear("amu_mage_star");
    E.amulet2 = instantiateGear("amu_mage_void");
    E.ring = instantiateGear("ring_mage_loop");
    E.boots = instantiateGear("boots_mage_soft");
  } else if (cls === "rogue") {
    E.helm = instantiateGear("helm_rogue_cowl");
    E.armor = instantiateGear("armor_rogue_jerkin");
    E.offhand = null;
    E.weapon = instantiateGear("wep_rogue_dirks");
    E.amulet1 = instantiateGear("amu_rogue_cut");
    E.amulet2 = instantiateGear("amu_rogue_night");
    E.ring = instantiateGear("ring_rogue_wire");
    E.boots = instantiateGear("boots_rogue_soft");
  } else if (cls === "ranger") {
    E.helm = instantiateGear("helm_ranger_cap");
    E.armor = instantiateGear("armor_ranger_hide");
    E.offhand = null;
    E.weapon = instantiateGear("wep_ranger_bow");
    E.amulet1 = instantiateGear("amu_ranger_wind");
    E.amulet2 = instantiateGear("amu_ranger_beast");
    E.ring = instantiateGear("ring_ranger_thorn");
    E.boots = instantiateGear("boots_ranger_trail");
  }
  return E;
}

export function sumEquipmentStats(equipment) {
  const out = { maxHp: 0, maxMp: 0, atk: 0, def: 0, crit: 0, dodge: 0, dmgBonus: 0, range: 0 };
  if (!equipment) return out;
  for (const slot of GEAR_SLOTS) {
    const g = equipment[slot];
    if (!g || !g.stats) continue;
    const s = g.stats;
    if (s.maxHp) out.maxHp += s.maxHp;
    if (s.maxMp) out.maxMp += s.maxMp;
    if (s.atk) out.atk += s.atk;
    if (s.def) out.def += s.def;
    if (s.crit) out.crit += s.crit;
    if (s.dodge) out.dodge += s.dodge;
    if (s.dmgBonus) out.dmgBonus += s.dmgBonus;
    if (s.range) out.range += s.range;
  }
  return out;
}

/** Loot pool: ids valid for class at given depth tier */
export function randomLootGearId(rng, cls, depth) {
  const pool = Object.keys(GEAR_DEFS).filter((id) => GEAR_DEFS[id].cls === cls);
  if (!pool.length) return null;
  const tier = Math.min(3, 1 + Math.floor(depth / 2));
  const weighted = [];
  for (const id of pool) {
    const def = GEAR_DEFS[id];
    let w = 4;
    if (def.slot === "weapon") w = 3 + tier;
    if (def.slot === "armor" || def.slot === "helm") w = 3;
    if (def.slot === "offhand" && !canEquipOffhand(cls)) continue;
    weighted.push([id, w]);
  }
  if (!weighted.length) return null;
  const t = weighted.reduce((s, [, w]) => s + w, 0);
  let r = rng.next() * t;
  for (const [id, w] of weighted) {
    r -= w;
    if (r <= 0) return id;
  }
  return weighted[weighted.length - 1][0];
}

export function slotDisplayName(slot, cls) {
  if (slot === "offhand") return offhandLabel(cls);
  const map = {
    helm: "Helm",
    armor: "Armor",
    weapon: "Weapon",
    amulet1: "Amulet I",
    amulet2: "Amulet II",
    ring: "Ring",
    boots: "Boots",
  };
  return map[slot] || slot;
}
