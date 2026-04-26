/** Exact match, or Pages preview host (*.project.pages.dev) when base URL is in allow-list. */
export function parseAllowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function resolveAllowOrigin(origin, allowed) {
  if (!origin || !allowed.length) return allowed[0] || "";
  if (allowed.includes(origin)) return origin;
  let reqHost = "";
  try {
    reqHost = new URL(origin).hostname;
  } catch {
    return allowed[0] || "";
  }
  for (const entry of allowed) {
    try {
      const baseHost = new URL(entry).hostname;
      if (!baseHost.endsWith(".pages.dev")) continue;
      if (reqHost === baseHost || reqHost.endsWith(`.${baseHost}`)) return origin;
    } catch {
      /* ignore */
    }
  }
  // Emergent / publiczne preview (gra bez własnego API na tym hoście)
  if (reqHost.endsWith(".pr-t.com") || reqHost.endsWith(".emergentagent.com")) {
    return origin;
  }
  return allowed[0] || "";
}

/** Browser WebSocket sends Origin — must match CORS allow-list (same as REST). */
export function isOriginAllowed(origin, env) {
  const allowed = parseAllowedOrigins(env);
  if (!allowed.length) return true;
  if (!origin) return false;
  return resolveAllowOrigin(origin, allowed) === origin;
}
