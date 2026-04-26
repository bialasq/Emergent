/**
 * Public HTTPS base for the Worker API (no trailing slash).
 * Emergent / niektóre CI ustawiają puste REACT_APP_BACKEND_URL → wtedy front woła /api na złym hoście (404).
 * Dla znanych hostów preview używamy produkcyjnego Workera (musi być na ALLOWED_ORIGINS / regule domeny).
 */
export const DEFAULT_WORKER_API_ORIGIN = "https://dungeon-of-echoes-api.dungeonofechoes.workers.dev";

export function getBackendBaseUrl() {
  const fromEnv = String(process.env.REACT_APP_BACKEND_URL || "")
    .trim()
    .replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "development") {
    return "http://127.0.0.1:8000";
  }
  if (typeof window !== "undefined" && window.location?.hostname) {
    const h = window.location.hostname;
    if (/\.pr-t\.com$/i.test(h) || /\.emergentagent\.com$/i.test(h)) {
      return DEFAULT_WORKER_API_ORIGIN;
    }
  }
  return "";
}
