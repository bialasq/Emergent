import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import { formatApiError } from "../services/api";
import { validateRegisterFields } from "../lib/registerValidation";
import { Flame } from "lucide-react";

export default function Register() {
  const { register, isAuthed, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (isAuthed) navigate("/play", { replace: true });
  }, [loading, isAuthed, navigate]);

  const runRegister = async () => {
    setError(null);
    const fieldErrors = validateRegisterFields({ email, username, password, passwordConfirm });
    if (fieldErrors.length) {
      setError(fieldErrors.join(" "));
      return;
    }
    setBusy(true);
    try {
      await register(email, password, username);
      navigate("/play", { replace: true, state: { justRegistered: true, username: String(username).trim() } });
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    await runRegister();
  };

  if (loading || isAuthed) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" data-testid="register-loading">
        <p className="font-body text-dungeon-muted">Otwieranie bramy…</p>
      </div>
    );
  }

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
        <p className="font-body text-sm text-dungeon-muted mb-2">
          Utwórz konto — zapisz dusze, runy i postęp meta na serwerze (Bearer JWT, bez ciastek).
        </p>
        <ol className="font-body text-xs text-dungeon-muted/90 mb-8 list-decimal list-inside space-y-1">
          <li>Wybierz widoczny <strong className="text-dungeon-parchment">sigil</strong> (nick, 2–32 znaki).</li>
          <li>Podaj <strong className="text-dungeon-parchment">e-mail</strong> (logowanie).</li>
          <li>Ustaw <strong className="text-dungeon-parchment">hasło</strong> (min. 6 znaków) i potwierdź.</li>
        </ol>

        <label className="block font-sub text-sm text-dungeon-parchment mb-1">Sigil (nazwa w grze)</label>
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

        <label className="block font-sub text-sm text-dungeon-parchment mb-1">E-mail</label>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="dungeon-input mb-4"
          placeholder="you@example.com"
          required
          data-testid="register-email-input"
        />

        <label className="block font-sub text-sm text-dungeon-parchment mb-1">Hasło (6–100 znaków)</label>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="dungeon-input mb-4"
          placeholder="•••••••••"
          required
          minLength={6}
          maxLength={100}
          data-testid="register-password-input"
        />

        <label className="block font-sub text-sm text-dungeon-parchment mb-1">Potwierdź hasło</label>
        <input
          type="password"
          autoComplete="new-password"
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          className="dungeon-input mb-6"
          placeholder="•••••••••"
          required
          minLength={6}
          maxLength={100}
          data-testid="register-password-confirm-input"
        />

        {error && (
          <div
            className="mb-4 p-3 border border-dungeon-blood/50 bg-dungeon-blood/10 text-dungeon-parchment text-sm font-body"
            data-testid="register-error"
          >
            {error}
          </div>
        )}

        <button type="submit" disabled={busy} className="btn-dungeon w-full" data-testid="register-submit-btn">
          {busy ? "Zapisywanie…" : "Utwórz konto"}
        </button>

        <p className="mt-6 text-center font-body text-sm text-dungeon-muted">
          Masz już konto?{" "}
          <Link
            to="/login"
            className="text-dungeon-parchment underline decoration-dungeon-blood/60 underline-offset-4"
            data-testid="register-to-login-link"
          >
            Zaloguj się
          </Link>
        </p>
        <p className="mt-3 text-center font-body text-sm text-dungeon-muted">
          <Link
            to="/play"
            className="text-dungeon-teal/90 underline underline-offset-4"
            data-testid="register-skip-guest"
          >
            Graj jako gość
          </Link>
        </p>
      </motion.form>
    </div>
  );
}
