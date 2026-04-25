import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { CLASSES } from "../game/entities";
import { newSeed } from "../game/rng";
import { SOUL_UPGRADES } from "../game/spells";
import { useAuth } from "../contexts/AuthContext";
import { api, formatApiError } from "../services/api";
import { getGuestMeta, setGuestMeta } from "../game/meta";
import { ChevronLeft, Swords, Sparkles, Plus } from "lucide-react";

const ART = {
  warrior: "https://images.pexels.com/photos/339805/pexels-photo-339805.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  mage: "https://images.pexels.com/photos/30692119/pexels-photo-30692119.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  rogue: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=940&q=80",
  ranger: "https://images.unsplash.com/photo-1505069190533-da1c9af13346?auto=format&fit=crop&w=940&q=80",
};

export default function CharacterSelect() {
  const navigate = useNavigate();
  const { user, refresh } = useAuth();
  const isAuthed = user && user.username;
  const defaultName = isAuthed ? user.username : "Wanderer";

  const [selected, setSelected] = useState("warrior");
  const [name, setName] = useState(defaultName);
  const [seedInput, setSeedInput] = useState("");
  const [souls, setSouls] = useState(0);
  const [meta, setMeta] = useState({});
  const [spending, setSpending] = useState(false);
  const [error, setError] = useState(null);

  // load meta
  const loadMeta = useCallback(async () => {
    if (isAuthed) {
      try {
        const { data } = await api.get("/meta");
        setSouls(data.souls || 0);
        setMeta(data.upgrades || {});
      } catch {
        setSouls(user?.souls || 0);
        setMeta(user?.meta || {});
      }
    } else {
      const m = getGuestMeta();
      setSouls(m.souls || 0);
      setMeta(m.upgrades || {});
    }
  }, [isAuthed, user]);

  useEffect(() => { loadMeta(); }, [loadMeta]);

  const spend = async (upg) => {
    setError(null);
    const currentLvl = meta[upg.id] || 0;
    if (currentLvl >= upg.max) return;
    if (souls < upg.cost) { setError("Not enough Hero Souls."); return; }
    setSpending(true);
    try {
      if (isAuthed) {
        const { data } = await api.post("/meta/spend", { upgrade_id: upg.id });
        setSouls(data.souls);
        setMeta(data.upgrades);
        refresh();
      } else {
        const m = getGuestMeta();
        m.souls = (m.souls || 0) - upg.cost;
        m.upgrades = { ...(m.upgrades || {}) };
        m.upgrades[upg.id] = (m.upgrades[upg.id] || 0) + 1;
        setGuestMeta(m);
        setSouls(m.souls);
        setMeta(m.upgrades);
      }
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setSpending(false);
    }
  };

  const startGame = () => {
    const seed = seedInput.trim() ? (Number(seedInput) >>> 0) || newSeed() : newSeed();
    const params = new URLSearchParams({
      cls: selected,
      name: (name || "Wanderer").slice(0, 32),
      seed: String(seed),
    });
    navigate(`/game?${params.toString()}`);
  };

  return (
    <div className="min-h-screen px-6 py-10" data-testid="character-select-page">
      <div className="max-w-6xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 font-sub text-sm text-dungeon-muted hover:text-dungeon-parchment" data-testid="char-back-btn">
          <ChevronLeft className="w-4 h-4" /> Return to the Gate
        </Link>
        <div className="mt-6 mb-10 flex items-end justify-between flex-wrap gap-4">
          <div>
            <h1 className="torch-title font-heading text-5xl">Choose Your Calling</h1>
            <p className="font-body text-dungeon-muted mt-2 max-w-xl">
              Four callings echo in the crypt. Walk yours carefully — only one breath separates you from oblivion.
            </p>
          </div>
          <div className="flex items-center gap-2 dungeon-card px-5 py-3" data-testid="souls-display">
            <span className="font-sub text-dungeon-muted text-sm">Hero Souls</span>
            <span className="font-heading text-2xl text-dungeon-gold">◈ {souls}</span>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {Object.entries(CLASSES).map(([key, cls]) => {
            const active = selected === key;
            return (
              <motion.button
                key={key}
                onClick={() => setSelected(key)}
                whileHover={{ y: -3 }}
                className={`dungeon-card text-left p-0 overflow-hidden border transition-all ${
                  active ? "border-dungeon-blood shadow-[0_0_40px_rgba(140,28,19,0.25)]" : "border-dungeon-border hover:border-dungeon-muted/70"
                }`}
                data-testid={`class-${key}-card`}
              >
                <div className="h-40 relative" style={{ backgroundImage: `url(${ART[key]})`, backgroundSize: "cover", backgroundPosition: "center", filter: "grayscale(0.6) contrast(1.1)" }}>
                  <div className="absolute inset-0 bg-gradient-to-t from-dungeon-stone via-dungeon-stone/40 to-transparent" />
                </div>
                <div className="p-5">
                  <div className="flex items-baseline justify-between">
                    <h2 className="font-heading text-lg tracking-widest uppercase">{cls.name}</h2>
                    {key === "mage" ? <Sparkles className="w-4 h-4 text-dungeon-teal" /> : <Swords className="w-4 h-4 text-dungeon-blood" />}
                  </div>
                  <p className="font-body text-dungeon-parchment/80 mt-1 text-sm">{cls.desc}</p>
                  <div className="grid grid-cols-4 gap-1 mt-4 font-heading text-[10px] tracking-widest uppercase text-dungeon-muted">
                    <div><div className="text-dungeon-parchment text-sm">{cls.stats.maxHp}</div>HP</div>
                    <div><div className="text-dungeon-parchment text-sm">{cls.stats.maxMp}</div>MP</div>
                    <div><div className="text-dungeon-parchment text-sm">{cls.stats.atk}</div>ATK</div>
                    <div><div className="text-dungeon-parchment text-sm">{cls.stats.def}</div>DEF</div>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* Sanctum — meta-progression */}
        <div className="dungeon-card p-6 mb-6" data-testid="sanctum-panel">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-heading text-2xl tracking-widest uppercase text-dungeon-parchment">Sanctum of Echoes</h3>
              <p className="font-body text-sm text-dungeon-muted">Spend Hero Souls on permanent boons. They persist across deaths.</p>
            </div>
            {!isAuthed && (
              <p className="font-body text-xs text-dungeon-muted italic max-w-xs text-right">
                Playing as guest — souls stored in this browser. <Link to="/register" className="underline text-dungeon-parchment">Inscribe your name</Link> to keep them forever.
              </p>
            )}
          </div>
          {error && (
            <div className="mb-3 p-2 border border-dungeon-blood/50 bg-dungeon-blood/10 text-dungeon-parchment text-sm font-body">
              {error}
            </div>
          )}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {SOUL_UPGRADES.map((u) => {
              const lvl = meta[u.id] || 0;
              const maxed = lvl >= u.max;
              const affordable = souls >= u.cost && !maxed;
              return (
                <div key={u.id} className="dungeon-card p-4 flex flex-col" data-testid={`upgrade-${u.id}`}>
                  <div className="font-heading text-sm tracking-widest uppercase text-dungeon-parchment">
                    {u.name}
                  </div>
                  <div className="font-body text-xs text-dungeon-muted mt-1 flex-1">{u.desc}</div>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs font-sub text-dungeon-muted">
                      {u.max > 1 ? `Rank ${lvl} / ${u.max}` : (lvl > 0 ? "Unlocked" : "Locked")}
                    </span>
                    <button
                      disabled={!affordable || spending}
                      onClick={() => spend(u)}
                      className={`btn-dungeon !py-1 !px-3 !text-[10px] flex items-center gap-1 ${maxed ? "btn-ghost" : ""}`}
                      data-testid={`upgrade-buy-${u.id}`}
                    >
                      {maxed ? "✓" : <><Plus className="w-3 h-3" /> ◈ {u.cost}</>}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="dungeon-card p-6 grid sm:grid-cols-[1fr_1fr_auto] gap-4 items-end">
          <div>
            <label className="block font-sub text-sm text-dungeon-parchment mb-1">Name your champion</label>
            <input
              className="dungeon-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={32}
              data-testid="char-name-input"
            />
          </div>
          <div>
            <label className="block font-sub text-sm text-dungeon-parchment mb-1">
              Seed <span className="text-dungeon-muted font-body text-xs italic">(optional — identical maps)</span>
            </label>
            <input
              className="dungeon-input"
              value={seedInput}
              onChange={(e) => setSeedInput(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
              placeholder="leave blank for random"
              data-testid="char-seed-input"
            />
          </div>
          <button className="btn-dungeon whitespace-nowrap" onClick={startGame} data-testid="char-start-btn">
            Descend →
          </button>
        </div>
      </div>
    </div>
  );
}
