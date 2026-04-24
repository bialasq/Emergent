import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { api } from "../services/api";
import { ChevronLeft, Trophy, Swords, Sparkles } from "lucide-react";

const CLASS_FILTERS = [
  { key: "", label: "All Callings" },
  { key: "warrior", label: "Warriors" },
  { key: "mage", label: "Mages" },
];

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

export default function Leaderboard() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    api.get("/leaderboard", {
      params: filter ? { character_class: filter, limit: 50 } : { limit: 50 },
    })
      .then((r) => { if (mounted) setEntries(r.data); })
      .catch(() => { if (mounted) setEntries([]); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [filter]);

  return (
    <div className="min-h-screen px-6 py-10" data-testid="leaderboard-page">
      <div className="max-w-5xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 font-sub text-sm text-dungeon-muted hover:text-dungeon-parchment" data-testid="lb-back-btn">
          <ChevronLeft className="w-4 h-4" /> Return to the Gate
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="mt-6 mb-6 flex items-center gap-4"
        >
          <Trophy className="w-8 h-8 text-dungeon-gold animate-flicker" />
          <h1 className="torch-title font-heading text-5xl">Hall of Fame</h1>
        </motion.div>
        <p className="font-body text-dungeon-muted mb-6 max-w-2xl">
          Names etched in candle-soot. None have truly returned — only their deeds remain.
        </p>

        <div className="flex gap-2 mb-6">
          {CLASS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`btn-dungeon !py-1.5 !px-4 !text-xs ${filter === f.key ? "" : "btn-ghost"}`}
              data-testid={`lb-filter-${f.key || "all"}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="dungeon-card overflow-hidden">
          <div className="grid grid-cols-[50px_1fr_120px_80px_80px_100px_100px_100px] gap-2 px-5 py-3 font-heading text-xs tracking-[0.2em] uppercase text-dungeon-muted border-b border-dungeon-border">
            <span>#</span>
            <span>Name</span>
            <span>Calling</span>
            <span>Depth</span>
            <span>Lv</span>
            <span>Kills</span>
            <span>Time</span>
            <span className="text-right">Score</span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-dungeon-muted font-body" data-testid="lb-loading">
              <span className="animate-flicker">✦</span> consulting the archives...
            </div>
          ) : entries.length === 0 ? (
            <div className="p-10 text-center" data-testid="lb-empty">
              <p className="font-sub text-2xl text-dungeon-parchment mb-2">The ledger is empty.</p>
              <p className="font-body text-dungeon-muted mb-6">Be the first to etch your name.</p>
              <Link to="/play">
                <button className="btn-dungeon">Begin the First Descent</button>
              </Link>
            </div>
          ) : (
            <ul data-testid="lb-list">
              {entries.map((e) => (
                <li
                  key={e.rank + e.username + e.created_at}
                  className="grid grid-cols-[50px_1fr_120px_80px_80px_100px_100px_100px] gap-2 px-5 py-3 border-b border-dungeon-border/60 font-body text-sm items-baseline"
                >
                  <span className="font-heading text-dungeon-gold text-sm">{e.rank}</span>
                  <span className="text-dungeon-parchment truncate">
                    {e.username}
                    <span className="text-dungeon-muted text-xs ml-2">· {e.character_name}</span>
                    {e.outcome === "victory" && (
                      <span className="ml-2 text-dungeon-gold text-xs">♛</span>
                    )}
                  </span>
                  <span className="flex items-center gap-1 text-dungeon-muted uppercase tracking-widest text-xs font-heading">
                    {e.character_class === "mage" ? (
                      <Sparkles className="w-3 h-3 text-dungeon-teal" />
                    ) : (
                      <Swords className="w-3 h-3 text-dungeon-blood" />
                    )}
                    {e.character_class}
                  </span>
                  <span className="text-dungeon-parchment">{e.depth}</span>
                  <span className="text-dungeon-parchment">{e.level ?? "—"}</span>
                  <span className="text-dungeon-parchment">{e.kills}</span>
                  <span className="text-dungeon-muted text-xs">{fmtTime(e.duration_seconds)}</span>
                  <span className="text-right text-dungeon-gold font-heading">{e.score}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
