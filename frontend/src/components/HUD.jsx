import React from "react";
import { SPELLS, SPELL_ORDER } from "../game/spells";
import { GEAR_SLOTS, slotDisplayName, canEquipOffhand, offhandLabel } from "../game/equipment";

export default function HUD({ state, souls = 0, onEquipFromBag, onUnequipSlot, onSelectHudTab }) {
  if (!state) return null;
  const p = state.player;
  const hasEquipment = p.equipment && typeof p.equipment === "object";
  const hpPct = Math.max(0, (p.hp / p.maxHp) * 100);
  const mpPct = Math.max(0, (p.mp / p.maxMp) * 100);
  const xpPct = Math.max(0, (p.xp / p.nextXp) * 100);
  const tab = state.inventoryOpen ? "pack" : "chat";

  const potions = p.inv.filter((i) => i.kind === "potion").length;
  const manas = p.inv.filter((i) => i.kind === "mana").length;

  return (
    <div className="w-full text-dungeon-parchment font-body" data-testid="hud">
      {state.waitingForAllies && (
        <div
          className="mb-2 text-xs font-sub text-dungeon-teal border border-dungeon-teal/40 bg-dungeon-teal/10 px-2 py-1.5 rounded-sm"
          data-testid="hud-waiting-allies"
        >
          Awaiting fellow echoes — foes stir only after everyone finishes their moves.
        </div>
      )}
      <div className="flex items-center gap-3 mb-2">
        <div className="font-heading text-xs tracking-[0.25em] uppercase text-dungeon-muted">{p.cls}</div>
        <div className="text-dungeon-parchment font-sub">{p.name}</div>
        <div className="ml-auto font-heading text-xs tracking-[0.25em] uppercase text-dungeon-muted">
          Lv {p.level}
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="w-8 font-heading text-dungeon-blood">HP</span>
        <div className="hud-bar flex-1">
          <div className="fill" style={{ width: `${hpPct}%`, background: "linear-gradient(90deg,#b0251a,#8c1c13)" }} />
        </div>
        <span className="w-14 text-right" data-testid="hud-hp">{Math.ceil(p.hp)}/{p.maxHp}</span>
      </div>
      <div className="flex items-center gap-2 text-xs mt-1">
        <span className="w-8 font-heading text-dungeon-teal">MP</span>
        <div className="hud-bar flex-1">
          <div className="fill" style={{ width: `${mpPct}%`, background: "linear-gradient(90deg,#1fb3b3,#138c8c)" }} />
        </div>
        <span className="w-14 text-right" data-testid="hud-mp">{Math.floor(p.mp)}/{p.maxMp}</span>
      </div>
      <div className="flex items-center gap-2 text-xs mt-1">
        <span className="w-8 font-heading text-dungeon-gold">XP</span>
        <div className="hud-bar flex-1">
          <div className="fill" style={{ width: `${xpPct}%`, background: "linear-gradient(90deg,#dba62b,#b8860b)" }} />
        </div>
        <span className="w-14 text-right" data-testid="hud-xp">{p.xp}/{p.nextXp}</span>
      </div>

      <div className="grid grid-cols-4 gap-2 mt-4 text-xs font-heading tracking-widest uppercase">
        <div className="dungeon-card p-2 text-center">
          <div className="text-dungeon-muted">Depth</div>
          <div className="text-dungeon-parchment text-lg" data-testid="hud-depth">{state.depth}</div>
        </div>
        <div className="dungeon-card p-2 text-center">
          <div className="text-dungeon-muted">Kills</div>
          <div className="text-dungeon-parchment text-lg" data-testid="hud-kills">{state.kills}</div>
        </div>
        <div className="dungeon-card p-2 text-center">
          <div className="text-dungeon-muted">Score</div>
          <div className="text-dungeon-parchment text-lg" data-testid="hud-score">{state.score}</div>
        </div>
        <div className="dungeon-card p-2 text-center" title="Extra actions per foe turn">
          <div className="text-dungeon-muted">Speed</div>
          <div className="text-dungeon-parchment text-lg" data-testid="hud-speed">+{state.extraActions || 0}</div>
        </div>
      </div>

      {hasEquipment && (
        <div className="mt-4" data-testid="hud-equipment">
          <div className="font-heading text-xs tracking-[0.25em] uppercase text-dungeon-muted mb-2 flex justify-between items-center">
            <span>Relics / Arms</span>
            <span className="text-[10px] font-sub normal-case text-dungeon-muted">I — pack</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-[10px]">
            {GEAR_SLOTS.map((slot) => {
              const piece = p.equipment[slot];
              const offDisabled = slot === "offhand" && !canEquipOffhand(p.cls);
              const label =
                slot === "offhand" ? offhandLabel(p.cls) : slotDisplayName(slot, p.cls);
              return (
                <div
                  key={slot}
                  className={`dungeon-card p-1.5 min-h-[52px] flex flex-col border ${
                    offDisabled ? "opacity-40 border-dungeon-border" : "border-dungeon-border/80"
                  }`}
                  data-testid={`eq-slot-${slot}`}
                >
                  <div className="font-heading text-[9px] tracking-widest uppercase text-dungeon-muted truncate">
                    {label}
                  </div>
                  {offDisabled ? (
                    <div className="font-body text-dungeon-muted italic mt-0.5 leading-tight">Two-handed path</div>
                  ) : piece ? (
                    <>
                      <div className="font-body text-dungeon-parchment leading-tight mt-0.5 flex-1 line-clamp-2">
                        {piece.name}
                      </div>
                      {onUnequipSlot && (
                        <button
                          type="button"
                          className="mt-1 text-[9px] font-sub text-dungeon-teal hover:underline self-start"
                          onClick={() => onUnequipSlot(slot)}
                        >
                          Stow
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="text-dungeon-muted/60 mt-0.5">— empty —</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4">
        <div className="font-heading text-xs tracking-[0.25em] uppercase text-dungeon-muted mb-2 flex justify-between">
          <span>Runes</span>
          <span className="text-dungeon-gold">◈ {souls}</span>
        </div>
        <div className="grid grid-cols-5 gap-1.5" data-testid="hud-spells">
          {SPELL_ORDER.map((id) => {
            const s = SPELLS[id];
            const unlocked = p.unlockedSpells.includes(id);
            const canCast = unlocked && p.mp >= s.mpCost;
            const active =
              (id === "light" && p.spellState?.lightTurns > 0) ||
              (id === "haste" && p.spellState?.hasteTurns > 0);
            return (
              <div
                key={id}
                title={`${s.name} — ${s.desc} (${s.hotkey.toUpperCase()}, ${s.mpCost} MP)`}
                className={`relative flex flex-col items-center justify-center aspect-square border text-center leading-tight ${
                  unlocked
                    ? canCast
                      ? "border-dungeon-blood/70 bg-dungeon-stoneLight"
                      : "border-dungeon-border bg-dungeon-stone/60 opacity-60"
                    : "border-dungeon-border bg-dungeon-ink opacity-40"
                } ${active ? "shadow-[0_0_10px_rgba(31,179,179,0.6)] border-dungeon-teal" : ""}`}
                data-testid={`spell-slot-${id}`}
              >
                <div className="text-[10px] font-heading tracking-widest uppercase" style={{ color: s.color }}>
                  {s.hotkey.toUpperCase()}
                </div>
                <div className="text-[10px] text-dungeon-muted truncate w-full">{s.name}</div>
                <div className="text-[9px] text-dungeon-teal mt-0.5">{s.mpCost}</div>
                {active && (
                  <div className="absolute bottom-0 right-0 text-[9px] text-dungeon-teal px-0.5">
                    {id === "light" ? p.spellState.lightTurns : p.spellState.hasteTurns}t
                  </div>
                )}
                {!unlocked && (
                  <div className="absolute inset-0 flex items-center justify-center text-dungeon-muted text-lg">
                    ✦
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4">
        <div className="font-heading text-xs tracking-[0.25em] uppercase text-dungeon-muted mb-2">Vials</div>
        <div className="flex gap-2">
          <div className="hud-slot" title="Health potion (Q)" data-testid="hud-potions">
            <span style={{ color: "#b0251a" }}>!</span>
            <span className="ml-1 text-dungeon-parchment">{potions}</span>
          </div>
          <div className="hud-slot" title="Mana phial (R)" data-testid="hud-manas">
            <span style={{ color: "#1fb3b3" }}>!</span>
            <span className="ml-1 text-dungeon-parchment">{manas}</span>
          </div>
          <div className="hud-slot" title="Gold">
            <span style={{ color: "#b8860b" }}>$</span>
            <span className="ml-1 text-dungeon-parchment">{p.gold}</span>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <div className="font-heading text-xs tracking-[0.25em] uppercase text-dungeon-muted">Panel</div>
          <div className="flex gap-1">
            <button
              type="button"
              className={`px-2 py-1 text-[10px] font-heading tracking-widest uppercase border ${
                tab === "chat"
                  ? "border-dungeon-teal/60 bg-dungeon-teal/10 text-dungeon-teal"
                  : "border-dungeon-border/70 text-dungeon-muted hover:text-dungeon-parchment"
              }`}
              onClick={() => onSelectHudTab && onSelectHudTab("chat")}
            >
              Chat
            </button>
            <button
              type="button"
              className={`px-2 py-1 text-[10px] font-heading tracking-widest uppercase border ${
                tab === "pack"
                  ? "border-dungeon-gold/60 bg-dungeon-gold/10 text-dungeon-gold"
                  : "border-dungeon-border/70 text-dungeon-muted hover:text-dungeon-parchment"
              }`}
              onClick={() => onSelectHudTab && onSelectHudTab("pack")}
            >
              Ekwipunek
            </button>
          </div>
        </div>

        {tab === "pack" ? (
          <div className="dungeon-card p-3 h-32 overflow-y-auto text-xs leading-relaxed" data-testid="hud-gear-bag">
            <div className="font-heading text-[10px] tracking-widest uppercase text-dungeon-muted mb-2">
              Torba ({p.gearBag?.length || 0}/24)
            </div>
            {p.gearBag?.length > 0 && onEquipFromBag ? (
              p.gearBag.map((g, i) => (
                <div
                  key={`${g.gearId}-${i}`}
                  className="flex items-center justify-between gap-2 py-1 border-b border-dungeon-border/40 last:border-0"
                >
                  <span className="font-body text-[11px] text-dungeon-parchment truncate">{g.name}</span>
                  <button
                    type="button"
                    className="shrink-0 text-[10px] font-sub text-dungeon-gold hover:underline"
                    onClick={() => onEquipFromBag(i)}
                  >
                    Załóż
                  </button>
                </div>
              ))
            ) : (
              <div className="text-dungeon-muted italic">— pusto —</div>
            )}
          </div>
        ) : (
          <div className="dungeon-card p-3 h-32 log-scroll overflow-y-auto text-xs leading-relaxed" data-testid="hud-log">
            {state.log.map((l, i) => (
              <div
                key={i}
                className={
                  l.kind === "dmg"
                    ? "text-dungeon-blood/90"
                    : l.kind === "heal"
                    ? "text-dungeon-blood"
                    : l.kind === "spell" || l.kind === "mana"
                    ? "text-dungeon-teal"
                    : l.kind === "levelup" || l.kind === "loot"
                    ? "text-dungeon-gold"
                    : "text-dungeon-parchment/80"
                }
              >
                › {l.msg}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
