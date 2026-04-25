import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronLeft, Users, Dice5, Plus, LogIn } from "lucide-react";

function genCode() {
  const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing chars
  let s = "";
  for (let i = 0; i < 5; i++) s += alpha[Math.floor(Math.random() * alpha.length)];
  return s;
}

export default function MultiplayerLobby() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("create"); // create | join
  const [name, setName] = useState("Wanderer");
  const [cls, setCls] = useState("warrior");
  const [room, setRoom] = useState("");

  const enter = () => {
    const code = mode === "create" ? (room.trim().toUpperCase() || genCode()) : room.trim().toUpperCase();
    if (!code) return;
    const params = new URLSearchParams({
      cls, name: name || "Wanderer", seed: "0", room: code,
    });
    navigate(`/game?${params.toString()}`);
  };

  return (
    <div className="min-h-screen px-6 py-10" data-testid="mp-lobby-page">
      <div className="max-w-2xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 font-sub text-sm text-dungeon-muted hover:text-dungeon-parchment" data-testid="mp-back-btn">
          <ChevronLeft className="w-4 h-4" /> Return to the Gate
        </Link>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6 mb-6 flex items-center gap-4">
          <Users className="w-8 h-8 text-dungeon-teal animate-flicker" />
          <h1 className="torch-title font-heading text-5xl">Shared Descent</h1>
        </motion.div>
        <p className="font-body text-dungeon-muted mb-8 max-w-xl">
          Up to four souls may enter the same crypt. The code is the seed — all will find the same halls.
        </p>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setMode("create")}
            className={`btn-dungeon !py-2 !px-4 flex items-center gap-2 ${mode === "create" ? "" : "btn-ghost"}`}
            data-testid="mp-mode-create"
          >
            <Plus className="w-3.5 h-3.5" /> Create room
          </button>
          <button
            onClick={() => setMode("join")}
            className={`btn-dungeon !py-2 !px-4 flex items-center gap-2 ${mode === "join" ? "" : "btn-ghost"}`}
            data-testid="mp-mode-join"
          >
            <LogIn className="w-3.5 h-3.5" /> Join existing
          </button>
        </div>

        <div className="dungeon-card p-6 grid gap-4">
          <div>
            <label className="block font-sub text-sm text-dungeon-parchment mb-1">Your name</label>
            <input
              className="dungeon-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              data-testid="mp-name-input"
            />
          </div>
          <div>
            <label className="block font-sub text-sm text-dungeon-parchment mb-1">Calling</label>
            <div className="grid grid-cols-2 gap-2">
              {["warrior", "mage", "rogue", "ranger"].map((k) => (
                <button
                  key={k}
                  onClick={() => setCls(k)}
                  className={`btn-dungeon !py-2 !px-3 ${cls === k ? "" : "btn-ghost"}`}
                  data-testid={`mp-cls-${k}`}
                >
                  {k.charAt(0).toUpperCase() + k.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block font-sub text-sm text-dungeon-parchment mb-1">
              Room code {mode === "create" && <span className="text-dungeon-muted font-body text-xs italic">(leave blank for random)</span>}
            </label>
            <div className="flex gap-2">
              <input
                className="dungeon-input flex-1 uppercase tracking-[0.3em] font-heading"
                value={room}
                onChange={(e) => setRoom(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))}
                placeholder={mode === "create" ? "e.g. DARKE" : "ask a friend"}
                data-testid="mp-room-input"
              />
              {mode === "create" && (
                <button
                  type="button"
                  onClick={() => setRoom(genCode())}
                  className="btn-dungeon btn-ghost !py-2 !px-3"
                  data-testid="mp-room-random"
                >
                  <Dice5 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <button className="btn-dungeon mt-2" onClick={enter} data-testid="mp-enter-btn" disabled={mode === "join" && !room.trim()}>
            {mode === "create" ? "Open the Crypt →" : "Enter the Crypt →"}
          </button>

          <p className="font-body text-xs text-dungeon-muted italic mt-2">
            Fellow wanderers appear as spectral echoes in your line of sight. Enemies and loot are your own — this is parallel descent.
          </p>
        </div>
      </div>
    </div>
  );
}
