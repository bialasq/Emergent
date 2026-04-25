import React, { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Game } from "../game/engine";
import { CoopRenderer } from "../game/coopRenderer";
import HUD from "../components/HUD";
import LevelUpModal from "../components/LevelUpModal";
import TouchControls from "../components/TouchControls";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../services/api";
import { getGuestMeta, setGuestMeta, addGuestSouls } from "../game/meta";
import { applyMetaToStats } from "../game/spells";
import { CoopClient } from "../services/coop";
import { startAmbient, stopAmbient, sfx, setMuted, isMuted } from "../game/audio";
import { Flame, Pause, LogOut, Users, Volume2, VolumeX } from "lucide-react";

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

export default function GamePage() {
  const q = useQuery();
  const navigate = useNavigate();
  const { user, refresh } = useAuth();

  const cls = ["mage", "rogue", "ranger"].includes(q.get("cls")) ? q.get("cls") : "warrior";
  const name = q.get("name") || "Wanderer";
  const seed = Number(q.get("seed")) || 1;
  const room = q.get("room") || "";
  const isCoop = !!room;

  const canvasRef = useRef(null);
  const minimapRef = useRef(null);
  const gameRef = useRef(null);
  const coopRef = useRef(null);
  const submittedRef = useRef(false);

  const [state, setState] = useState(null);
  const [coopHud, setCoopHud] = useState(null); // server-derived HUD for coop
  const [levelUp, setLevelUp] = useState({ open: false, upgrades: [] });
  const [death, setDeath] = useState(null);
  const [victory, setVictory] = useState(null);
  const [souls, setSouls] = useState(0);
  const [coopReady, setCoopReady] = useState(!isCoop);
  const [coopPlayers, setCoopPlayers] = useState([]);
  const [muted, setMutedState] = useState(false);

  // load souls
  useEffect(() => {
    if (user && user.username) setSouls(user.souls || 0);
    else setSouls(getGuestMeta().souls || 0);
  }, [user]);

  // ambient audio on
  useEffect(() => {
    startAmbient();
    return () => stopAmbient();
  }, []);

  // Init game
  useEffect(() => {
    if (isCoop) {
      // Server-authoritative coop
      const renderer = new CoopRenderer({
        canvas: canvasRef.current,
        minimap: minimapRef.current,
        coop: null, // assigned below
        onState: (s) => {
          // Build HUD-compatible shape from server state
          const y = s.you;
          setCoopHud({
            player: {
              cls: y.cls, name: y.name,
              hp: y.hp, maxHp: y.maxHp, mp: y.mp, maxMp: y.maxMp,
              level: y.level, xp: y.xp, nextXp: y.nextXp,
              gold: y.gold, inv: [
                ...Array(y.potions).fill({ kind: "potion" }),
                ...Array(y.manas).fill({ kind: "mana" }),
              ],
              unlockedSpells: ["heal", "light", "haste", "fireball", "rope"],
              spellState: { lightTurns: y.lightTurns, hasteTurns: y.hasteTurns },
            },
            depth: s.depth,
            kills: y.kills,
            score: y.score,
            extraActions: y.extraActions,
            log: s.log.map((l) => ({ msg: l.msg, kind: "info" })),
          });
        },
        onVictory: (s) => setVictory(s),
        onDeath: (s) => setDeath(s),
      });
      gameRef.current = renderer;
      const coop = new CoopClient({
        room, name, cls,
        onJoined: () => setCoopReady(true),
        onMap: (m) => renderer.setMap(m),
        onState: (s) => renderer.setState(s),
        onPlayerJoin: (p) => setCoopPlayers((prev) => [...prev.filter(x => x.id !== p.id), p]),
        onPlayerLeave: (id) => setCoopPlayers((prev) => prev.filter(x => x.id !== id)),
        onVictory: () => { /* will be reflected in state */ },
        onError: (e) => console.warn("coop err", e),
        onClose: () => { /* connection closed */ },
      });
      coopRef.current = coop;
      renderer.coop = coop;
      coop.connect();
      renderer.start();
    } else {
      const meta = user && user.username ? (user.meta || {}) : getGuestMeta().upgrades;
      const { startPotions, unlockedSpells } = applyMetaToStats({}, meta);
      const game = new Game({
        canvas: canvasRef.current,
        minimap: minimapRef.current,
        seed, classKey: cls, characterName: name,
        meta, startPotions, unlockedSpells,
        onStateChange: (s) => {
          setState((prev) => {
            // detect transitions for sfx
            if (prev) {
              if ((s.kills || 0) > (prev.kills || 0)) sfx.hit();
              if (s.depth !== prev.depth) sfx.descend();
              const ph = prev.player?.hp || 0;
              const ch = s.player?.hp || 0;
              if (ch < ph) sfx.hurt();
            }
            return s;
          });
        },
        onDeath: (summary) => { sfx.death(); setDeath(summary); },
        onVictory: (summary) => { sfx.victory(); setVictory(summary); },
        onLevelUp: (upgrades) => { sfx.levelup(); setLevelUp({ open: true, upgrades }); },
      });
      gameRef.current = game;
      game.start();
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

  // hotkeys for level up
  useEffect(() => {
    if (!levelUp.open) return;
    const h = (e) => {
      const idx = { "1": 0, "2": 1, "3": 2 }[e.key];
      if (idx != null && levelUp.upgrades[idx]) {
        gameRef.current?.applyUpgrade(levelUp.upgrades[idx]);
        setLevelUp({ open: false, upgrades: [] });
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [levelUp]);

  const submitRun = useCallback(async (summary, outcome) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    try {
      const body = {
        seed: summary.seed || seed,
        character_class: summary.character_class || cls,
        character_name: summary.character_name || name,
        depth: summary.depth || 1,
        score: summary.score || (summary.you?.score) || 0,
        kills: summary.kills || (summary.you?.kills) || 0,
        duration_seconds: summary.duration_seconds || 0,
        outcome,
        level: summary.level || (summary.you?.level) || 1,
      };
      if (!(user && user.username)) body.guest_id = name;
      const res = await api.post("/runs", body);
      if (user && user.username) {
        if (res.data?.souls_total != null) {
          setSouls(res.data.souls_total);
          refresh();
        }
      } else {
        const m = addGuestSouls(res.data?.souls_earned || 0);
        setSouls(m.souls);
      }
    } catch (e) {
      if (!(user && user.username)) {
        const m = addGuestSouls(0);
        setSouls(m.souls);
      }
    }
  }, [user, refresh, name, seed, cls]);

  useEffect(() => { if (death) submitRun(death, "dead"); }, [death, submitRun]);
  useEffect(() => { if (victory) submitRun(victory, "victory"); }, [victory, submitRun]);

  const abandon = () => {
    if (!window.confirm("Abandon this run? The crypt remembers.")) return;
    const g = gameRef.current;
    if (g && !isCoop) {
      const summary = g.getSummary("abandoned");
      submitRun(summary, "abandoned");
    }
    if (g) g.stop();
    coopRef.current?.close();
    navigate("/");
  };

  const togglePause = () => {
    const g = gameRef.current;
    if (!g || isCoop) return; // pause not meaningful in coop
    g.paused = !g.paused;
    g.dirty = true;
    g.pushState();
  };

  const toggleMute = () => { const v = !muted; setMutedState(v); setMuted(v); };

  const hudState = isCoop ? coopHud : state;

  return (
    <div className="min-h-screen px-4 py-4" data-testid="game-page">
      <div className="max-w-[1400px] mx-auto">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Flame className="w-5 h-5 text-dungeon-blood animate-flicker" />
            <span className="font-heading text-xs tracking-[0.3em] uppercase text-dungeon-muted">
              Dungeon of Echoes
            </span>
            {isCoop ? (
              <span className="flex items-center gap-1 text-dungeon-teal text-xs font-sub" data-testid="coop-room-badge">
                <Users className="w-3.5 h-3.5" /> Room {room}
                <span className="text-dungeon-muted ml-2">{coopPlayers.length + 1} / 4</span>
              </span>
            ) : (
              <span className="text-dungeon-muted font-body text-xs">· seed {seed}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={toggleMute} className="btn-dungeon btn-ghost !py-2 !px-3" data-testid="mute-btn" aria-label="mute">
              {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
            {!isCoop && (
              <button onClick={togglePause} className="btn-dungeon btn-ghost !py-2 !px-3 flex items-center gap-2" data-testid="pause-btn">
                <Pause className="w-3.5 h-3.5" /> Pause
              </button>
            )}
            <button onClick={abandon} className="btn-dungeon !py-2 !px-3 flex items-center gap-2" data-testid="abandon-btn">
              <LogOut className="w-3.5 h-3.5" /> {isCoop ? "Leave" : "Abandon"}
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_320px] gap-4">
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
                <span className="animate-flicker mr-2">✦</span> Connecting to room {room}…
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
              <HUD state={hudState} souls={souls} />
            </div>
          </div>
        </div>

        <div className="mt-3 text-xs font-body text-dungeon-muted flex flex-wrap gap-3 justify-center" data-testid="controls-hint">
          <span>WASD/Arrows — Move</span>
          <span>Space — Wait</span>
          <span>H — Mend</span>
          <span>L — Candleflame</span>
          <span>G — Quickstep</span>
          <span>F — Ember Burst</span>
          <span>T — Binding Rope</span>
          <span>Q — Potion</span>
          <span>R — Mana</span>
          {!isCoop && <span>P/Esc — Pause</span>}
        </div>
      </div>

      <TouchControls />

      <LevelUpModal open={levelUp.open} upgrades={levelUp.upgrades} onChoose={(u) => { gameRef.current?.applyUpgrade(u); setLevelUp({ open: false, upgrades: [] }); }} />

      <AnimatePresence>
        {(death || victory) && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/85 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            data-testid="endgame-modal"
          >
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="dungeon-card max-w-lg w-full p-10">
              <p className="font-sub text-dungeon-blood tracking-[0.35em] text-xs uppercase">
                {victory ? "The echoes fall silent" : "Your echo fades"}
              </p>
              <h2 className="torch-title font-heading text-5xl mt-2">{victory ? "Victory" : "You Died"}</h2>
              <p className="font-body text-dungeon-muted mt-2 italic">
                {victory ? "The Echo Lich crumbles. The crypt breathes — for now." : "The dungeon takes all who wander too deep."}
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3 font-body text-sm">
                {[
                  ["Depth", (victory || death).depth || (victory || death).you?.level],
                  ["Level", (victory || death).level || (victory || death).you?.level],
                  ["Kills", (victory || death).kills || (victory || death).you?.kills || 0],
                  ["Score", (victory || death).score || (victory || death).you?.score || 0],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b border-dungeon-border/60 py-2">
                    <span className="text-dungeon-muted uppercase tracking-widest text-xs font-heading">{k}</span>
                    <span className="text-dungeon-parchment">{v}</span>
                  </div>
                ))}
              </div>
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
