// Cloudflare Worker API (D1) for Dungeon of Echoes
// Routes are mounted under /api/* so Pages can call same-origin.

const ACCESS_TOKEN_MINUTES = 60 * 12;
const REFRESH_TOKEN_DAYS = 30;

const CSRF_COOKIE = "csrf_token";
const CSRF_HEADER = "x-csrf-token";

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

function nowIso() {
  return new Date().toISOString();
}

function bad(status, detail) {
  return json({ detail }, status);
}

function parseCookies(req) {
  const raw = req.headers.get("cookie") || "";
  const out = {};
  raw.split(";").forEach((p) => {
    const s = p.trim();
    if (!s) return;
    const i = s.indexOf("=");
    if (i === -1) return;
    out[s.slice(0, i)] = decodeURIComponent(s.slice(i + 1));
  });
  return out;
}

function setCookie(name, value, opts = {}) {
  const {
    httpOnly = false,
    secure = true,
    sameSite = "Lax",
    path = "/",
    maxAge = null,
    domain = null,
  } = opts;
  let c = `${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=${sameSite}`;
  if (httpOnly) c += "; HttpOnly";
  if (secure) c += "; Secure";
  if (typeof maxAge === "number") c += `; Max-Age=${maxAge}`;
  if (domain) c += `; Domain=${domain}`;
  return c;
}

function deleteCookie(name, opts = {}) {
  return setCookie(name, "", { ...opts, maxAge: 0 });
}

function readJson(req) {
  return req.json().catch(() => null);
}

function isWriteMethod(req) {
  const m = (req.method || "GET").toUpperCase();
  return m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE";
}

function requireCsrf(req, cookies) {
  const c = cookies[CSRF_COOKIE];
  const h = req.headers.get(CSRF_HEADER);
  if (!c || !h || c !== h) throw Object.assign(new Error("CSRF check failed"), { status: 403 });
}

function base64url(buf) {
  const b = typeof buf === "string" ? new TextEncoder().encode(buf) : buf;
  let s = "";
  const bytes = new Uint8Array(b);
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64urlToBytes(s) {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacSha256(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

async function signJwtHS256(secret, payload) {
  const header = { alg: "HS256", typ: "JWT" };
  const h = base64url(JSON.stringify(header));
  const p = base64url(JSON.stringify(payload));
  const msg = `${h}.${p}`;
  const sig = await hmacSha256(secret, msg);
  return `${msg}.${base64url(sig)}`;
}

async function verifyJwtHS256(secret, token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const msg = `${h}.${p}`;
  const sig = await hmacSha256(secret, msg);
  const expected = base64url(sig);
  if (expected !== s) return null;
  const payload = JSON.parse(new TextDecoder().decode(base64urlToBytes(p)));
  const exp = payload?.exp;
  if (typeof exp === "number" && Date.now() / 1000 > exp) return null;
  return payload;
}

async function pbkdf2Hash(password, saltB64, iterations = 160000) {
  const salt = base64urlToBytes(saltB64);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return base64url(new Uint8Array(bits));
}

function uuid() {
  return crypto.randomUUID();
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function soulsFromRun({ score, kills, outcome }) {
  const base = Math.floor(score / 100);
  const bonus = kills;
  const victoryBonus = outcome === "victory" ? 50 : 0;
  return base + bonus + victoryBonus;
}

function safeUserOut(u) {
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    created_at: u.created_at,
    souls: u.souls || 0,
    meta: JSON.parse(u.meta_json || "{}"),
  };
}

async function getUserByAccess(env, req, cookies) {
  const token = cookies.access_token || "";
  if (!token) return null;
  const payload = await verifyJwtHS256(env.JWT_SECRET, token);
  if (!payload || payload.type !== "access" || !payload.sub) return null;
  const row = await env.DB.prepare("SELECT id,email,username,created_at,souls,meta_json FROM users WHERE id=?")
    .bind(payload.sub)
    .first();
  return row || null;
}

async function route(env, req) {
  const url = new URL(req.url);
  const path = url.pathname;
  const cookies = parseCookies(req);

  // CSRF enforcement for cookie-auth write endpoints (guest endpoints allowed)
  const csrfFor = (needsAuth) => {
    if (!isWriteMethod(req)) return;
    if (!needsAuth) return;
    requireCsrf(req, cookies);
  };

  // Health
  if (path === "/api/" || path === "/api") return json({ message: "Dungeon of Echoes API", status: "ok" });

  // Auth: register/login issue cookies + csrf cookie
  if (path === "/api/auth/register" && req.method === "POST") {
    const body = await readJson(req);
    const email = String(body?.email || "").toLowerCase().trim();
    const password = String(body?.password || "");
    const username = String(body?.username || "").trim();
    if (!email || !email.includes("@")) return bad(400, "Invalid email");
    if (password.length < 6 || password.length > 100) return bad(400, "Invalid password");
    if (username.length < 2 || username.length > 32) return bad(400, "Invalid username");

    const existsEmail = await env.DB.prepare("SELECT 1 FROM users WHERE email=?").bind(email).first();
    if (existsEmail) return bad(400, "Email already registered");
    const existsUser = await env.DB.prepare("SELECT 1 FROM users WHERE username_lower=?").bind(username.toLowerCase()).first();
    if (existsUser) return bad(400, "Username taken");

    const id = uuid();
    const salt = base64url(crypto.getRandomValues(new Uint8Array(18)));
    const hash = await pbkdf2Hash(password, salt);
    const created_at = nowIso();
    await env.DB.prepare(
      "INSERT INTO users (id,email,username,username_lower,password_hash,password_salt,created_at,souls,meta_json) VALUES (?,?,?,?,?,?,?,?,?)",
    ).bind(id, email, username, username.toLowerCase(), hash, salt, created_at, 0, "{}").run();

    const accessExp = Math.floor(Date.now() / 1000) + ACCESS_TOKEN_MINUTES * 60;
    const refreshExp = Math.floor(Date.now() / 1000) + REFRESH_TOKEN_DAYS * 86400;
    const access = await signJwtHS256(env.JWT_SECRET, { sub: id, email, type: "access", exp: accessExp });
    const refresh = await signJwtHS256(env.JWT_SECRET, { sub: id, email, type: "refresh", exp: refreshExp });
    const csrf = base64url(crypto.getRandomValues(new Uint8Array(18)));

    const secure = String(env.COOKIE_SECURE || "true").toLowerCase() !== "false";
    const sameSite = String(env.COOKIE_SAMESITE || "Lax");
    const domain = String(env.COOKIE_DOMAIN || "") || null;

    const headers = new Headers();
    headers.append("set-cookie", setCookie("access_token", access, { httpOnly: true, secure, sameSite, domain, maxAge: ACCESS_TOKEN_MINUTES * 60 }));
    headers.append("set-cookie", setCookie("refresh_token", refresh, { httpOnly: true, secure, sameSite, domain, maxAge: REFRESH_TOKEN_DAYS * 86400 }));
    headers.append("set-cookie", setCookie(CSRF_COOKIE, csrf, { httpOnly: false, secure, sameSite, domain, maxAge: REFRESH_TOKEN_DAYS * 86400 }));

    return json({ id, email, username, created_at, souls: 0, meta: {} }, 200, Object.fromEntries(headers));
  }

  if (path === "/api/auth/login" && req.method === "POST") {
    const body = await readJson(req);
    const email = String(body?.email || "").toLowerCase().trim();
    const password = String(body?.password || "");
    if (!email || !password) return bad(400, "Invalid credentials");

    // rate limit (basic)
    const ip = req.headers.get("cf-connecting-ip") || "unknown";
    const identifier = `${ip}:${email}`;
    const attempt = await env.DB.prepare("SELECT identifier,count,locked_until FROM login_attempts WHERE identifier=?")
      .bind(identifier)
      .first();
    if (attempt?.locked_until) {
      const until = Date.parse(attempt.locked_until);
      if (Number.isFinite(until) && until > Date.now()) return bad(429, "Too many failed attempts. Try later.");
    }
    if (attempt?.count >= 5) return bad(429, "Too many failed attempts. Try later.");

    const u = await env.DB.prepare("SELECT * FROM users WHERE email=?").bind(email).first();
    if (!u) {
      await env.DB.prepare(
        "INSERT INTO login_attempts (identifier,count,locked_until) VALUES (?,?,?) ON CONFLICT(identifier) DO UPDATE SET count=count+1",
      ).bind(identifier, 1, null).run();
      return bad(401, "Invalid credentials");
    }
    const hash = await pbkdf2Hash(password, u.password_salt);
    if (hash !== u.password_hash) {
      const lockedUntil = (attempt?.count >= 4) ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
      await env.DB.prepare(
        "INSERT INTO login_attempts (identifier,count,locked_until) VALUES (?,?,?) ON CONFLICT(identifier) DO UPDATE SET count=count+1, locked_until=excluded.locked_until",
      ).bind(identifier, 1, lockedUntil).run();
      return bad(401, "Invalid credentials");
    }
    await env.DB.prepare("DELETE FROM login_attempts WHERE identifier=?").bind(identifier).run();

    const accessExp = Math.floor(Date.now() / 1000) + ACCESS_TOKEN_MINUTES * 60;
    const refreshExp = Math.floor(Date.now() / 1000) + REFRESH_TOKEN_DAYS * 86400;
    const access = await signJwtHS256(env.JWT_SECRET, { sub: u.id, email, type: "access", exp: accessExp });
    const refresh = await signJwtHS256(env.JWT_SECRET, { sub: u.id, email, type: "refresh", exp: refreshExp });
    const csrf = base64url(crypto.getRandomValues(new Uint8Array(18)));

    const secure = String(env.COOKIE_SECURE || "true").toLowerCase() !== "false";
    const sameSite = String(env.COOKIE_SAMESITE || "Lax");
    const domain = String(env.COOKIE_DOMAIN || "") || null;

    const headers = new Headers();
    headers.append("set-cookie", setCookie("access_token", access, { httpOnly: true, secure, sameSite, domain, maxAge: ACCESS_TOKEN_MINUTES * 60 }));
    headers.append("set-cookie", setCookie("refresh_token", refresh, { httpOnly: true, secure, sameSite, domain, maxAge: REFRESH_TOKEN_DAYS * 86400 }));
    headers.append("set-cookie", setCookie(CSRF_COOKIE, csrf, { httpOnly: false, secure, sameSite, domain, maxAge: REFRESH_TOKEN_DAYS * 86400 }));

    const out = safeUserOut(u);
    return json(out, 200, Object.fromEntries(headers));
  }

  if (path === "/api/auth/logout" && req.method === "POST") {
    csrfFor(true);
    const secure = String(env.COOKIE_SECURE || "true").toLowerCase() !== "false";
    const sameSite = String(env.COOKIE_SAMESITE || "Lax");
    const domain = String(env.COOKIE_DOMAIN || "") || null;
    const headers = new Headers();
    headers.append("set-cookie", deleteCookie("access_token", { httpOnly: true, secure, sameSite, domain }));
    headers.append("set-cookie", deleteCookie("refresh_token", { httpOnly: true, secure, sameSite, domain }));
    headers.append("set-cookie", deleteCookie(CSRF_COOKIE, { httpOnly: false, secure, sameSite, domain }));
    return json({ ok: true }, 200, Object.fromEntries(headers));
  }

  if (path === "/api/auth/refresh" && req.method === "POST") {
    // refresh is a write and must be CSRF-protected
    csrfFor(true);
    const token = cookies.refresh_token || "";
    const payload = await verifyJwtHS256(env.JWT_SECRET, token);
    if (!payload || payload.type !== "refresh" || !payload.sub) return bad(401, "Invalid refresh token");

    const u = await env.DB.prepare("SELECT id,email,username,created_at,souls,meta_json FROM users WHERE id=?")
      .bind(payload.sub)
      .first();
    if (!u) return bad(401, "User not found");

    const accessExp = Math.floor(Date.now() / 1000) + ACCESS_TOKEN_MINUTES * 60;
    const access = await signJwtHS256(env.JWT_SECRET, { sub: u.id, email: u.email, type: "access", exp: accessExp });
    const csrf = base64url(crypto.getRandomValues(new Uint8Array(18)));

    const secure = String(env.COOKIE_SECURE || "true").toLowerCase() !== "false";
    const sameSite = String(env.COOKIE_SAMESITE || "Lax");
    const domain = String(env.COOKIE_DOMAIN || "") || null;

    const headers = new Headers();
    headers.append("set-cookie", setCookie("access_token", access, { httpOnly: true, secure, sameSite, domain, maxAge: ACCESS_TOKEN_MINUTES * 60 }));
    headers.append("set-cookie", setCookie(CSRF_COOKIE, csrf, { httpOnly: false, secure, sameSite, domain, maxAge: REFRESH_TOKEN_DAYS * 86400 }));
    return json({ ok: true }, 200, Object.fromEntries(headers));
  }

  if (path === "/api/auth/me" && req.method === "GET") {
    const u = await getUserByAccess(env, req, cookies);
    if (!u) return bad(401, "Not authenticated");
    return json(safeUserOut(u));
  }

  // Runs / Leaderboard
  if (path === "/api/runs" && req.method === "POST") {
    const u = await getUserByAccess(env, req, cookies);
    if (u) csrfFor(true);
    const body = await readJson(req);
    if (!body) return bad(400, "Invalid payload");
    const run_id = uuid();
    const seed = Number(body.seed || 0) | 0;
    const character_class = String(body.character_class || "");
    const character_name = String(body.character_name || "").slice(0, 32);
    const depth = clamp(Number(body.depth || 1) | 0, 1, 999);
    const score = clamp(Number(body.score || 0) | 0, 0, 2_000_000_000);
    const kills = clamp(Number(body.kills || 0) | 0, 0, 2_000_000_000);
    const duration_seconds = clamp(Number(body.duration_seconds || 0) | 0, 0, 2_000_000_000);
    const outcome = String(body.outcome || "");
    const level = clamp(Number(body.level || 1) | 0, 1, 999);

    if (!["warrior", "mage", "rogue", "ranger"].includes(character_class)) return bad(400, "Invalid class");
    if (!["dead", "victory", "abandoned"].includes(outcome)) return bad(400, "Invalid outcome");
    if (!character_name) return bad(400, "Invalid name");

    const created_at = nowIso();
    const souls_earned = soulsFromRun({ score, kills, outcome });
    const is_guest = u ? 0 : 1;
    const username = u ? u.username : String(body.guest_id || "Wanderer").slice(0, 32);
    const user_id = u ? u.id : null;

    await env.DB.prepare(
      "INSERT INTO runs (id,user_id,username,is_guest,seed,character_class,character_name,depth,score,kills,duration_seconds,outcome,level,souls_earned,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).bind(
      run_id, user_id, username, is_guest, seed, character_class, character_name, depth, score, kills,
      duration_seconds, outcome, level, souls_earned, created_at,
    ).run();

    let souls_total = null;
    if (u) {
      await env.DB.prepare("UPDATE users SET souls = souls + ? WHERE id=?").bind(souls_earned, u.id).run();
      const row = await env.DB.prepare("SELECT souls FROM users WHERE id=?").bind(u.id).first();
      souls_total = row?.souls ?? null;
    }
    return json({ id: run_id, ok: true, souls_earned, souls_total });
  }

  if (path === "/api/leaderboard" && req.method === "GET") {
    const limit = clamp(Number(url.searchParams.get("limit") || 50) | 0, 1, 100);
    const character_class = url.searchParams.get("character_class");
    const where = ["warrior", "mage", "rogue", "ranger"].includes(character_class) ? "WHERE character_class=?" : "";
    const stmt = `SELECT username,character_class,character_name,depth,level,score,kills,duration_seconds,outcome,created_at,is_guest
                  FROM runs ${where} ORDER BY score DESC, depth DESC, created_at ASC LIMIT ?`;
    const rows = await (where
      ? env.DB.prepare(stmt).bind(character_class, limit).all()
      : env.DB.prepare(stmt).bind(limit).all());
    const out = (rows.results || []).map((r, idx) => ({
      rank: idx + 1,
      username: r.username,
      character_class: r.character_class,
      character_name: r.character_name,
      depth: r.depth,
      level: r.level,
      score: r.score,
      kills: r.kills,
      duration_seconds: r.duration_seconds,
      outcome: r.outcome,
      created_at: r.created_at,
      is_guest: !!r.is_guest,
    }));
    return json(out);
  }

  if (path === "/api/runs/me" && req.method === "GET") {
    const u = await getUserByAccess(env, req, cookies);
    if (!u) return bad(401, "Not authenticated");
    const rows = await env.DB.prepare("SELECT * FROM runs WHERE user_id=? ORDER BY created_at DESC LIMIT 50").bind(u.id).all();
    return json(rows.results || []);
  }

  // Meta progression (souls + upgrades)
  if (path === "/api/meta" && req.method === "GET") {
    const u = await getUserByAccess(env, req, cookies);
    if (!u) return bad(401, "Not authenticated");
    return json({ souls: u.souls || 0, upgrades: JSON.parse(u.meta_json || "{}") });
  }

  if (path === "/api/meta/spend" && req.method === "POST") {
    csrfFor(true);
    const u = await getUserByAccess(env, req, cookies);
    if (!u) return bad(401, "Not authenticated");
    const body = await readJson(req);
    const up_id = String(body?.upgrade_id || "");
    const SOUL_COSTS = { hp: 5, mp: 5, atk: 10, def: 10, pot: 5, haste: 25, fireball: 35, rope: 50 };
    const SOUL_MAX = { hp: 5, mp: 5, atk: 3, def: 3, pot: 3, haste: 1, fireball: 1, rope: 1 };
    if (!SOUL_COSTS[up_id]) return bad(400, "Unknown upgrade");
    const cost = SOUL_COSTS[up_id];
    const max = SOUL_MAX[up_id];
    const meta = JSON.parse(u.meta_json || "{}");
    const cur = Number(meta[up_id] || 0) | 0;
    if (cur >= max) return bad(400, "Already at max");
    if ((u.souls || 0) < cost) return bad(400, "Not enough souls");
    meta[up_id] = cur + 1;
    await env.DB.prepare("UPDATE users SET souls=souls-?, meta_json=? WHERE id=?")
      .bind(cost, JSON.stringify(meta), u.id).run();
    const row = await env.DB.prepare("SELECT souls,meta_json FROM users WHERE id=?").bind(u.id).first();
    return json({ souls: row?.souls || 0, upgrades: JSON.parse(row?.meta_json || "{}") });
  }

  // Daily seed + leaderboard
  if (path === "/api/daily" && req.method === "GET") {
    const d = new Date();
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const date = `${yyyy}-${mm}-${dd}`;
    // simple deterministic seed
    const enc = new TextEncoder().encode(`daily-${date}`);
    const digest = await crypto.subtle.digest("SHA-256", enc);
    const bytes = new Uint8Array(digest);
    const seed = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
    return json({ date, seed, tag: `DAILY-${date}` });
  }

  if (path === "/api/daily/leaderboard" && req.method === "GET") {
    const limit = clamp(Number(url.searchParams.get("limit") || 50) | 0, 1, 100);
    const daily = await route(env, new Request(new URL("/api/daily", req.url), req));
    const { seed } = await daily.json();
    const rows = await env.DB.prepare(
      "SELECT username,character_class,character_name,depth,level,score,kills,duration_seconds,outcome,created_at,is_guest FROM runs WHERE seed=? ORDER BY score DESC, depth DESC, created_at ASC LIMIT ?",
    ).bind(seed, limit).all();
    const out = (rows.results || []).map((r, idx) => ({
      rank: idx + 1,
      username: r.username,
      character_class: r.character_class,
      character_name: r.character_name,
      depth: r.depth,
      level: r.level,
      score: r.score,
      kills: r.kills,
      duration_seconds: r.duration_seconds,
      outcome: r.outcome,
      created_at: r.created_at,
      is_guest: !!r.is_guest,
    }));
    return json(out);
  }

  return bad(404, "Not found");
}

export default {
  async fetch(req, env, ctx) {
    try {
      // CORS is intentionally omitted because Pages + Worker should be same-origin.
      return await route(env, req);
    } catch (e) {
      const status = e?.status || 500;
      return bad(status, status === 500 ? "Server error" : e.message);
    }
  },
};

