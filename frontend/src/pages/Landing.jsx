import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import { Flame, Skull, Swords, Scroll, LogIn, UserPlus, LogOut, Trophy } from "lucide-react";

export default function Landing() {
  const { user, logout } = useAuth();
  const isAuthed = user && user.username;

  return (
    <div className="relative min-h-screen overflow-hidden" data-testid="landing-page">
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage:
            "url(https://images.pexels.com/photos/7826034/pexels-photo-7826034.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940)",
          filter: "grayscale(0.4) saturate(0.6)",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-dungeon-ink/90 via-dungeon-ink/75 to-dungeon-ink" />
      <div
        className="absolute inset-0 opacity-60 mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.18'/></svg>\")",
        }}
      />

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-8 py-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <Flame className="w-6 h-6 text-dungeon-blood animate-flicker" />
          <span className="font-heading text-sm tracking-[0.35em] text-dungeon-muted uppercase">
            Dungeon of Echoes
          </span>
        </div>
        <nav className="flex items-center gap-5 text-sm font-sub text-dungeon-muted">
          <Link to="/leaderboard" className="hover:text-dungeon-parchment transition" data-testid="nav-leaderboard">
            Hall of Fame
          </Link>
          {isAuthed ? (
            <>
              <span className="text-dungeon-parchment hidden sm:inline" data-testid="nav-username">
                {user.username}
              </span>
              <button
                onClick={logout}
                className="flex items-center gap-2 hover:text-dungeon-parchment transition"
                data-testid="nav-logout-btn"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Depart</span>
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="hover:text-dungeon-parchment transition" data-testid="nav-login">
                <LogIn className="inline w-4 h-4 mr-1" /> Enter
              </Link>
              <Link to="/register" className="hover:text-dungeon-parchment transition" data-testid="nav-register">
                <UserPlus className="inline w-4 h-4 mr-1" /> Inscribe
              </Link>
            </>
          )}
        </nav>
      </header>

      {/* Hero */}
      <main className="relative z-10 max-w-7xl mx-auto px-8 pt-8 pb-24 grid lg:grid-cols-[1.3fr_1fr] gap-16 items-start">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="pt-8"
        >
          <p className="font-sub text-dungeon-blood tracking-[0.4em] text-sm mb-6 uppercase">
            A tale told by candlelight
          </p>
          <h1 className="torch-title text-6xl sm:text-7xl lg:text-[88px] leading-[0.95] font-heading font-black uppercase">
            Dungeon
            <span className="block text-dungeon-parchment/90">of Echoes</span>
          </h1>
          <p className="mt-8 max-w-xl font-body text-lg text-dungeon-parchment/80 leading-relaxed">
            A procedurally-forged crypt whispers beneath the forgotten kingdom.
            Each descent is unique, each death eternal. Wield steel or sorcery
            and uncover what echoes in the deep.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link to="/play" data-testid="play-guest-btn">
              <button className="btn-dungeon flex items-center gap-3">
                <Swords className="w-4 h-4" /> Enter the Crypt
              </button>
            </Link>
            <Link to="/coop" data-testid="play-coop-btn">
              <button className="btn-dungeon btn-teal flex items-center gap-3">
                <Skull className="w-4 h-4" /> Shared Descent
              </button>
            </Link>
            <Link to="/daily" data-testid="play-daily-btn">
              <button className="btn-dungeon btn-ghost flex items-center gap-3">
                <Flame className="w-4 h-4" /> Daily Echo
              </button>
            </Link>
            {!isAuthed && (
              <Link to="/register" data-testid="cta-register-btn">
                <button className="btn-dungeon btn-ghost flex items-center gap-3">
                  <Scroll className="w-4 h-4" /> Inscribe Your Name
                </button>
              </Link>
            )}
          </div>

          {/* Feature strip */}
          <div className="mt-14 grid sm:grid-cols-3 gap-px bg-dungeon-border border border-dungeon-border">
            {[
              { icon: Skull, title: "Permadeath", desc: "One life. Every step matters." },
              { icon: Flame, title: "Procedural Crypt", desc: "BSP-carved halls, unique per seed." },
              { icon: Trophy, title: "Hall of Fame", desc: "Leaderboard of the fallen." },
            ].map((f) => (
              <div key={f.title} className="dungeon-card p-6">
                <f.icon className="w-5 h-5 text-dungeon-blood mb-3" />
                <h3 className="font-heading text-sm tracking-widest uppercase text-dungeon-parchment mb-1">
                  {f.title}
                </h3>
                <p className="font-body text-sm text-dungeon-muted leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Side panel */}
        <motion.aside
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="dungeon-card p-8 relative overflow-hidden"
          data-testid="controls-panel"
        >
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-dungeon-blood/10 blur-3xl" />
          <h2 className="font-sub text-2xl text-dungeon-parchment mb-1">Inscribed Commands</h2>
          <p className="font-body text-sm text-dungeon-muted mb-6">
            The runes by which a wanderer endures.
          </p>
          <ul className="space-y-3 font-body text-sm text-dungeon-parchment/90">
            {[
              ["WASD / Arrows", "Step through stone"],
              ["Space or .", "Wait a turn (listen for echoes)"],
              [">  or  E", "Descend to the next floor"],
              ["Q", "Quaff a health potion"],
              ["R", "Drink a mana phial"],
              ["P / Esc", "Pause the passage of time"],
            ].map(([k, v]) => (
              <li key={k} className="flex items-start justify-between gap-4 pb-2 border-b border-dungeon-border/60">
                <span className="font-heading text-xs tracking-[0.2em] uppercase text-dungeon-blood/90 pt-1">
                  {k}
                </span>
                <span className="text-right text-dungeon-parchment/80">{v}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 font-body text-xs italic text-dungeon-muted">
            The Mage aims magic in the direction of movement. The Warrior strikes adjacent foes.
          </p>
        </motion.aside>
      </main>

      <footer className="relative z-10 py-8 text-center font-body text-xs text-dungeon-muted/80">
        <span className="animate-flicker">✦</span> v0.1 Alpha — Compiled from the ashes of echoed memory
      </footer>
    </div>
  );
}
