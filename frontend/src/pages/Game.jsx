import React, { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Game } from "../game/engine";
import HUD from "../components/HUD";
import LevelUpModal from "../components/LevelUpModal";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../services/api";
import { getGuestMeta, setGuestMeta, addGuestSouls } from "../game/meta";
import { applyMetaToStats } from "../game/spells";
import { CoopClient } from "../services/coop";
import { Flame, Pause, LogOut, Users } from "lucide-react";

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

export default function GamePage() {
  const q = useQuery();
  const navigate = useNavigate();
  const { user, refresh } = useAuth();

  const cls = q.get("cls") === "mage" ? "mage" : "warrior";
  const name = q.get("name") || "Wanderer";
  let seed = Number(q.get("seed")) || 1;
  const room = q.get("room") || "";

  const canvasRef = useRef(null);
  const minimapRef = useRef(null);
  const gameRef = useRef(null);
  const coopRef = useRef(null);

  const [state, setState] = useState(null);
  const [levelUp, setLevelUp] = useState({ open: false, upgrades: [] });
  const [death, setDeath] = useState(null);
  const [victory, setVictory] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [souls, setSouls] = useState(0);
  const [coopReady, setCoopReady] = useState(!room);
  const [coopPlayers, setCoopPlayers] = useState([]);

  // load meta
  useEffect(() => {
    if (user && user.username) {
      setSouls(user.souls || 0);
    } else {
      const m = getGuestMeta();
      setSouls(m.souls || 0);
    }
  }, [user]);

  // Init game (and coop if room present)
  useEffect(() => {
    const meta = user && user.username ? (user.meta || {}) : getGuestMeta().upgrades;
    const { startPotions, unlockedSpells } = applyMetaToStats({}, meta);

    const start = (effSeed) => {
      const game = new Game({
        canvas: canvasRef.current,
        minimap: minimapRef.current,
        seed: effSeed,
        classKey: cls,
        characterName: name,
        meta,
        startPotions,
        unlockedSpells,
        coop: coopRef.current ? { ghosts: coopRef.current.ghosts } : null,
        onStateChange: setState,
        onDeath: (summary) => setDeath(summary),
        onVictory: (summary) => setVictory(summary),
        onLevelUp: (upgrades) => setLevelUp({ open: true, upgrades }),
        onBroadcast: (msg) => coopRef.current && coopRef.current.send(msg),
      });
      gameRef.current = game;
      game.start();
    };

    if (room) {
      const coop = new CoopClient({
        room, name, cls,
        onReady: ({ seed: rseed }) => {
          setCoopReady(true);
          start(rseed);
        },
        onJoin: (p) => setCoopPlayers((prev) => [...prev, p]),
        onLeave: () => { /* connection closed */ },
        onEvent: () => { if (gameRef.current) gameRef.current.dirty = true; },
        onError: () => setCoopReady(false),
      });
      coopRef.current = coop;
      coop.connect();
      // seed players
      setTimeout(() => setCoopPlayers(Array.from(coop.players.values())), 200);
    } else {
      start(seed);
    }

    const onResize = () => gameRef.current && gameRef.current.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      gameRef.current && gameRef.current.stop();
      coopRef.current && coopRef.current.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hotkeys 1/2/3 for level up
  useEffect(() => {
    if (!levelUp.open) return;
    const h = (e) => {
      const idx = { "1": 0, "2": 1, "3": 2 }[e.key];
      if (idx != null && levelUp.upgrades[idx]) {
        chooseUpgrade(levelUp.upgrades[idx]);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line
  }, [levelUp]);

  const chooseUpgrade = useCallback((u) => {
    gameRef.current?.applyUpgrade(u);
    setLevelUp({ open: false, upgrades: [] });
  }, []);

  const submitRun = useCallback(async (summary, outcome) => {
    if (submitted) return;
    setSubmitted(true);
    try {
      const res = await api.post("/runs", {
        seed: summary.seed,
        character_class: summary.character_class,
        character_name: summary.character_name,
        depth: summary.depth,
        score: summary.score,
        kills: summary.kills,
        duration_seconds: summary.duration_seconds,
        outcome,
        level: summary.level,
        guest_id: user && user.username ? undefined : name,
      });
      // update local souls
      if (user && user.username) {
        if (res.data && typeof res.data.souls_total === "number") {
          setSouls(res.data.souls_total);
          refresh();
        }
      } else {
        const m = addGuestSouls(summary.souls_earned || 0);
        setSouls(m.souls);
        setGuestMeta(m);
      }
      // notify coop
      if (coopRef.current && outcome === "dead") coopRef.current.send({ type: "death" });
    } catch (e) {
      // fallback: still award local souls if guest
      if (!(user && user.username)) {
        const m = addGuestSouls(summary.souls_earned || 0);
        setSouls(m.souls);
      }
    }
  }, [submitted, user, refresh, name]);

  useEffect(() => {
    if (death) submitRun(death, "dead");
  }, [death, submitRun]);
  useEffect(() => {
    if (victory) submitRun(victory, "victory");
  }, [victory, submitRun]);

  const abandon = () => {
    if (!window.confirm("Abandon this run? The crypt remembers.")) return;
    const g = gameRef.current;
    if (!g) { navigate("/"); return; }
    const summary = g.getSummary("abandoned");
    submitRun(summary, "abandoned");
    g.stop();
    navigate("/");
  };

  const togglePause = () => {
    const g = gameRef.current;
    if (!g) return;
    g.paused = !g.paused;
    g.dirty = true;
    g.pushState();
  };

  return (
    <div className="min-h-screen px-4 py-4" data-testid="game-page">
      <div className="max-w-[1400px] mx-auto">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Flame className="w-5 h-5 text-dungeon-blood animate-flicker" />
            <span className="font-heading text-xs tracking-[0.3em] uppercase text-dungeon-muted">
              Dungeon of Echoes
            </span>
            {room && (
              <span className="flex items-center gap-1 text-dungeon-teal text-xs font-sub" data-testid="coop-room-badge">
                <Users className="w-3.5 h-3.5" /> Room {room}
                <span className="text-dungeon-muted ml-2">{coopPlayers.length + 1} / 4</span>
              </span>
            )}
            {!room && (
              <span className="text-dungeon-muted font-body text-xs">· seed {seed}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={togglePause} className="btn-dungeon btn-ghost !py-2 !px-3 flex items-center gap-2" data-testid="pause-btn">
              <Pause className="w-3.5 h-3.5" /> Pause
            </button>
            <button onClick={abandon} className="btn-dungeon !py-2 !px-3 flex items-center gap-2" data-testid="abandon-btn">
              <LogOut className="w-3.5 h-3.5" /> Abandon
            </button>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_320px] gap-4">
          <div className="relative dungeon-card p-0 overflow-hidden" style={{ aspectRatio: "16 / 10" }}>
            <span className="rune-corner top-0 left-0 border-t-2 border-l-2 border-r-0 border-b-0" />
            <span className="rune-corner top-0 right-0 border-t-2 border-r-2 border-l-0 border-b-0" />
            <span className="rune-corner bottom-0 left-0 border-b-2 border-l-2 border-t-0 border-r-0" />
            <span className="rune-corner bottom-0 right-0 border-b-2 border-r-2 border-t-0 border-l-0" />
            <canvas
              ref={canvasRef}
              className="pixelated w-full h-full block"
              style={{ background: "#050404" }}
              data-testid="game-canvas"
            />
            {!coopReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 font-sub text-dungeon-parchment" data-testid="coop-connecting">
                <span className="animate-flicker mr-2">✦</span> Connecting to coop room {room}…
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <div className="dungeon-card p-3">
              <div className="font-heading text-xs tracking-[0.25em] uppercase text-dungeon-muted mb-2">
                Charted Echoes
              </div>
              <canvas
                ref={minimapRef}
                width={280}
                height={168}
                className="pixelated w-full border border-dungeon-border bg-dungeon-ink"
                data-testid="game-minimap"
              />
            </div>
            <div className="dungeon-card p-4">
              <HUD state={state} souls={souls} />
            </div>
          </div>
        </div>

        <div className="mt-3 text-xs font-body text-dungeon-muted flex flex-wrap gap-3 justify-center" data-testid="controls-hint">
          <span>WASD / Arrows — Move</span>
          <span>Space — Wait</span>
          <span>H — Mend</span>
          <span>L — Candleflame</span>
          <span>G — Quickstep</span>
          <span>F — Ember Burst</span>
          <span>T — Binding Rope</span>
          <span>Q — Potion</span>
          <span>R — Mana</span>
          <span>P / Esc — Pause</span>
        </div>
      </div>

      <LevelUpModal open={levelUp.open} upgrades={levelUp.upgrades} onChoose={chooseUpgrade} />

      <AnimatePresence>
        {(death || victory) && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/85 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            data-testid="endgame-modal"
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              className="dungeon-card max-w-lg w-full p-10"
            >
              <p className="font-sub text-dungeon-blood tracking-[0.35em] text-xs uppercase">
                {victory ? "The echoes fall silent" : "Your echo fades"}
              </p>
              <h2 className="torch-title font-heading text-5xl mt-2">
                {victory ? "Victory" : "You Died"}
              </h2>
              <p className="font-body text-dungeon-muted mt-2 italic">
                {victory
                  ? "The Echo Lich crumbles. The crypt breathes — for now."
                  : "The dungeon takes all who wander too deep."}
              </p>

              <div className="mt-6 grid grid-cols-2 gap-3 font-body text-sm">
                {[
                  ["Depth", (victory || death).depth],
                  ["Level", (victory || death).level],
                  ["Kills", (victory || death).kills],
                  ["Score", (victory || death).score],
                  ["Time", `${(victory || death).duration_seconds}s`],
                  ["Souls earned", `◈ ${(victory || death).souls_earned || 0}`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b border-dungeon-border/60 py-2">
                    <span className="text-dungeon-muted uppercase tracking-widest text-xs font-heading">{k}</span>
                    <span className="text-dungeon-parchment">{v}</span>
                  </div>
                ))}
              </div>

              <p className="mt-4 font-body text-xs text-dungeon-muted italic">
                Hero Souls have been added to your sanctum. Spend them before your next descent.
              </p>

              <div className="mt-6 flex gap-3">
                <Link to="/play" className="flex-1" data-testid="endgame-again-btn">
                  <button className="btn-dungeon w-full">Descend Again</button>
                </Link>
                <Link to="/leaderboard" className="flex-1" data-testid="endgame-leaderboard-btn">
                  <button className="btn-dungeon btn-teal w-full">Hall of Fame</button>
                </Link>
              </div>
              <Link to="/" data-testid="endgame-home-btn">
                <button className="btn-dungeon btn-ghost w-full mt-3">Return to Gate</button>
              </Link>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
