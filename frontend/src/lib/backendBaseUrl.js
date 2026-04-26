/**
 * Public HTTPS base for the Worker API (no trailing slash).
 *
 * Cloudflare Pages często ma w zmiennych builda błędny REACT_APP_BACKEND_URL
 * (np. URL frontu Emergent zamiast Workera) — wtedy axios woła /api na złym hoście → 404.
 */
export const DEFAULT_WORKER_API_ORIGIN = "https://dungeon-of-echoes-api.dungeonofechoes.workers.dev";

/** URL wskazuje na host preview bez API (tylko statyczny front). */
function isPreviewFrontendOnlyApiUrl(urlStr) {
  if (!urlStr) return false;
  try {
    const u = new URL(urlStr.startsWith("http") ? urlStr : `https://${urlStr}`);
    const h = u.hostname;
    return /\.pr-t\.com$/i.test(h) || /\.emergentagent\.com$/i.test(h);
  } catch {
    return false;
  }
}

export function getBackendBaseUrl() {
  let fromEnv = String(process.env.REACT_APP_BACKEND_URL || "")
    .trim()
    .replace(/\/$/, "");
  if (fromEnv && isPreviewFrontendOnlyApiUrl(fromEnv)) {
    fromEnv = "";
  }
  if (fromEnv) return fromEnv;

  if (process.env.NODE_ENV === "development") {
    return "http://127.0.0.1:8000";
  }

  if (typeof window !== "undefined" && window.location?.hostname) {
    const h = window.location.hostname;
    if (/\.pr-t\.com$/i.test(h) || /\.emergentagent\.com$/i.test(h)) {
      return DEFAULT_WORKER_API_ORIGIN;
    }
    /* Cloudflare Pages — zawsze łącz z Workerem, jeśli nie ma poprawnego env. */
    if (/\.pages\.dev$/i.test(h)) {
      return DEFAULT_WORKER_API_ORIGIN;
    }
  }
  return "";
}
