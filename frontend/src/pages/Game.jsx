import React, { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Game } from "../game/engine";
import HUD from "../components/HUD";
import LevelUpModal from "../components/LevelUpModal";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../services/api";
import { Flame, Pause, LogOut } from "lucide-react";

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

export default function GamePage() {
  const q = useQuery();
  const navigate = useNavigate();
  const { user } = useAuth();

  const cls = q.get("cls") === "mage" ? "mage" : "warrior";
  const name = q.get("name") || "Wanderer";
  const seed = Number(q.get("seed")) || 1;

  const canvasRef = useRef(null);
  const minimapRef = useRef(null);
  const gameRef = useRef(null);

  const [state, setState] = useState(null);
  const [levelUp, setLevelUp] = useState({ open: false, upgrades: [] });
  const [death, setDeath] = useState(null);
  const [victory, setVictory] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  // Init game once
  useEffect(() => {
    const game = new Game({
      canvas: canvasRef.current,
      minimap: minimapRef.current,
      seed,
      classKey: cls,
      characterName: name,
      onStateChange: setState,
      onDeath: (summary) => setDeath(summary),
      onVictory: (summary) => setVictory(summary),
      onLevelUp: (upgrades) => setLevelUp({ open: true, upgrades }),
    });
    gameRef.current = game;
    game.start();

    const onResize = () => game.resize();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      game.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hotkeys 1/2/3 for level up choices
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
      await api.post("/runs", {
        seed: summary.seed,
        character_class: summary.character_class,
        character_name: summary.character_name,
        depth: summary.depth,
        score: summary.score,
        kills: summary.kills,
        duration_seconds: summary.duration_seconds,
        outcome,
        level: summary.level,
      });
    } catch (e) {
      // non-fatal
      console.warn("Run submit failed", e);
    }
  }, [submitted]);

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
        {/* top bar */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Flame className="w-5 h-5 text-dungeon-blood animate-flicker" />
            <span className="font-heading text-xs tracking-[0.3em] uppercase text-dungeon-muted">
              Dungeon of Echoes
            </span>
            <span className="text-dungeon-muted font-body text-xs">· seed {seed}</span>
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
          {/* Canvas frame */}
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
          </div>

          {/* Right panel: minimap + HUD */}
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
              <HUD state={state} />
            </div>
          </div>
        </div>

        {/* help footer */}
        <div className="mt-3 text-xs font-body text-dungeon-muted flex flex-wrap gap-4 justify-center" data-testid="controls-hint">
          <span>WASD / Arrows — Move</span>
          <span>Space — Wait</span>
          <span>{cls === "mage" ? "Step toward foe to cast (5 MP)" : "Step toward foe to strike"}</span>
          <span>&gt; — Descend stairs</span>
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
                  ["Class", (victory || death).character_class],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b border-dungeon-border/60 py-2">
                    <span className="text-dungeon-muted uppercase tracking-widest text-xs font-heading">{k}</span>
                    <span className="text-dungeon-parchment">{v}</span>
                  </div>
                ))}
              </div>

              {!user?.username && (
                <p className="mt-5 font-body text-xs text-dungeon-muted italic">
                  Tip: inscribe your name to preserve your deeds beyond this session.
                </p>
              )}

              <div className="mt-8 flex gap-3">
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
