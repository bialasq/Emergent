import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { CLASSES } from "../game/entities";
import { newSeed } from "../game/rng";
import { useAuth } from "../contexts/AuthContext";
import { ChevronLeft, Swords, Sparkles } from "lucide-react";

const ART = {
  warrior:
    "https://images.pexels.com/photos/339805/pexels-photo-339805.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  mage:
    "https://images.pexels.com/photos/30692119/pexels-photo-30692119.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
};

export default function CharacterSelect() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const defaultName = user && user.username ? user.username : "Wanderer";
  const [selected, setSelected] = useState("warrior");
  const [name, setName] = useState(defaultName);
  const [seedInput, setSeedInput] = useState("");

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
        <div className="mt-6 mb-10">
          <h1 className="torch-title font-heading text-5xl">Choose Your Calling</h1>
          <p className="font-body text-dungeon-muted mt-2">
            Two paths descend into the crypt. Walk them carefully — only one breath separates you from oblivion.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
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
                <div
                  className="h-56 relative"
                  style={{
                    backgroundImage: `url(${ART[key]})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    filter: "grayscale(0.6) contrast(1.1)",
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-dungeon-stone via-dungeon-stone/40 to-transparent" />
                </div>
                <div className="p-6">
                  <div className="flex items-baseline justify-between">
                    <h2 className="font-heading text-2xl tracking-widest uppercase">{cls.name}</h2>
                    {key === "mage" ? (
                      <Sparkles className="w-5 h-5 text-dungeon-teal" />
                    ) : (
                      <Swords className="w-5 h-5 text-dungeon-blood" />
                    )}
                  </div>
                  <p className="font-body text-dungeon-parchment/80 mt-1">{cls.desc}</p>
                  <p className="font-body italic text-sm text-dungeon-muted mt-3">{cls.lore}</p>
                  <div className="grid grid-cols-4 gap-2 mt-5 font-heading text-xs tracking-widest uppercase text-dungeon-muted">
                    <div><div className="text-dungeon-parchment">{cls.stats.maxHp}</div>HP</div>
                    <div><div className="text-dungeon-parchment">{cls.stats.maxMp}</div>MP</div>
                    <div><div className="text-dungeon-parchment">{cls.stats.atk}</div>ATK</div>
                    <div><div className="text-dungeon-parchment">{cls.stats.def}</div>DEF</div>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>

        <div className="mt-8 dungeon-card p-6 grid sm:grid-cols-[1fr_1fr_auto] gap-4 items-end">
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
