import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { api } from "../services/api";
import { ChevronLeft, Calendar, Trophy } from "lucide-react";

function fmtTime(s) {
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

export default function Daily() {
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [board, setBoard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cls, setCls] = useState("warrior");
  const [name, setName] = useState("Wanderer");

  useEffect(() => {
    let mounted = true;
    Promise.all([api.get("/daily"), api.get("/daily/leaderboard?limit=20")])
      .then(([a, b]) => { if (mounted) { setInfo(a.data); setBoard(b.data); } })
      .catch(() => { /* ignore */ })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const start = () => {
    if (!info) return;
    const params = new URLSearchParams({ cls, name: name || "Wanderer", seed: String(info.seed) });
    navigate(`/game?${params.toString()}`);
  };

  return (
    <div className="min-h-screen px-6 py-10" data-testid="daily-page">
      <div className="max-w-4xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 font-sub text-sm text-dungeon-muted hover:text-dungeon-parchment" data-testid="daily-back-btn">
          <ChevronLeft className="w-4 h-4" /> Return to the Gate
        </Link>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6 mb-4 flex items-center gap-4">
          <Calendar className="w-8 h-8 text-dungeon-teal animate-flicker" />
          <h1 className="torch-title font-heading text-5xl">Daily Echo</h1>
        </motion.div>
        <p className="font-body text-dungeon-muted mb-6 max-w-2xl">
          The same crypt for all wanderers, today only. Different souls, identical halls — let your name rise on the daily ledger.
        </p>

        {loading ? (
          <div className="dungeon-card p-8 text-center font-body text-dungeon-muted">
            <span className="animate-flicker">✦</span> reading today's seal…
          </div>
        ) : (
          <>
            <div className="dungeon-card p-6 mb-6 grid sm:grid-cols-[1fr_auto] gap-4 items-end" data-testid="daily-config">
              <div>
                <p className="font-sub text-sm text-dungeon-muted">{info?.tag}</p>
                <p className="font-heading text-2xl text-dungeon-parchment tracking-widest uppercase mt-1">
                  Seed {info?.seed}
                </p>
                <div className="mt-4 grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-sub text-xs text-dungeon-parchment mb-1">Your name</label>
                    <input className="dungeon-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={32} data-testid="daily-name-input" />
                  </div>
                  <div>
                    <label className="block font-sub text-xs text-dungeon-parchment mb-1">Calling</label>
                    <div className="grid grid-cols-4 gap-1">
                      {["warrior", "mage", "rogue", "ranger"].map((k) => (
                        <button
                          key={k}
                          onClick={() => setCls(k)}
                          className={`btn-dungeon !py-1.5 !px-2 !text-[10px] ${cls === k ? "" : "btn-ghost"}`}
                          data-testid={`daily-cls-${k}`}
                        >
                          {k.slice(0, 3).toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <button className="btn-dungeon" onClick={start} data-testid="daily-start-btn">
                Take the Daily →
              </button>
            </div>

            <div className="dungeon-card overflow-hidden">
              <div className="px-5 py-3 flex items-center gap-2 border-b border-dungeon-border">
                <Trophy className="w-4 h-4 text-dungeon-gold" />
                <span className="font-heading text-xs tracking-[0.25em] uppercase text-dungeon-muted">
                  Today's Leaderboard
                </span>
              </div>
              {board.length === 0 ? (
                <div className="p-8 text-center text-dungeon-muted font-body" data-testid="daily-board-empty">
                  Be the first to brave today's seal.
                </div>
              ) : (
                <ul data-testid="daily-board-list">
                  {board.map((e) => (
                    <li key={e.rank + e.username + e.created_at} className="grid grid-cols-[40px_1fr_90px_60px_60px_80px_90px] gap-2 px-5 py-2.5 border-b border-dungeon-border/60 font-body text-sm items-baseline">
                      <span className="font-heading text-dungeon-gold">{e.rank}</span>
                      <span className="text-dungeon-parchment truncate">
                        {e.username} <span className="text-dungeon-muted text-xs">· {e.character_name}</span>
                        {e.outcome === "victory" && <span className="ml-2 text-dungeon-gold">♛</span>}
                      </span>
                      <span className="text-dungeon-muted uppercase tracking-widest text-xs font-heading">{e.character_class}</span>
                      <span className="text-dungeon-parchment">{e.depth}</span>
                      <span className="text-dungeon-parchment">{e.kills}</span>
                      <span className="text-dungeon-muted text-xs">{fmtTime(e.duration_seconds)}</span>
                      <span className="text-right text-dungeon-gold font-heading">{e.score}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
