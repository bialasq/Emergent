import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import { formatApiError } from "../services/api";
import { Flame } from "lucide-react";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      await register(email, password, username);
      navigate("/");
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10" data-testid="register-page">
      <motion.form
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        onSubmit={onSubmit}
        className="dungeon-card w-full max-w-md p-10 relative"
      >
        <div className="flex items-center gap-2 mb-2">
          <Flame className="w-5 h-5 text-dungeon-blood animate-flicker" />
          <span className="font-heading text-xs tracking-[0.35em] text-dungeon-muted uppercase">
            Dungeon of Echoes
          </span>
        </div>
        <h1 className="torch-title font-heading text-4xl mb-2">Inscribe Your Name</h1>
        <p className="font-body text-sm text-dungeon-muted mb-8">
          Carved in stone, your deeds shall endure.
        </p>

        <label className="block font-sub text-sm text-dungeon-parchment mb-1">Sigil (Username)</label>
        <input
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="dungeon-input mb-4"
          placeholder="Ravenhold"
          required
          minLength={2}
          maxLength={32}
          data-testid="register-username-input"
        />

        <label className="block font-sub text-sm text-dungeon-parchment mb-1">Email</label>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="dungeon-input mb-4"
          placeholder="you@crypt.realm"
          required
          data-testid="register-email-input"
        />

        <label className="block font-sub text-sm text-dungeon-parchment mb-1">Passphrase (≥ 6)</label>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="dungeon-input mb-6"
          placeholder="•••••••••"
          required
          minLength={6}
          data-testid="register-password-input"
        />

        {error && (
          <div className="mb-4 p-3 border border-dungeon-blood/50 bg-dungeon-blood/10 text-dungeon-parchment text-sm font-body" data-testid="register-error">
            {error}
          </div>
        )}

        <button type="submit" disabled={busy} className="btn-dungeon w-full" data-testid="register-submit-btn">
          {busy ? "..." : "Inscribe"}
        </button>

        <p className="mt-6 text-center font-body text-sm text-dungeon-muted">
          Already among the damned?{" "}
          <Link to="/login" className="text-dungeon-parchment underline decoration-dungeon-blood/60 underline-offset-4" data-testid="register-to-login-link">
            Enter
          </Link>
        </p>
      </motion.form>
    </div>
  );
}
