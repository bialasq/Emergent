// Local Hero Soul storage helpers for guest mode (localStorage).
// Authenticated users get souls from GET/POST /api/meta endpoints.

const KEY = "dungeon_echoes_meta";

export function getGuestMeta() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { souls: 0, upgrades: {} };
    const obj = JSON.parse(raw);
    return { souls: Number(obj.souls) || 0, upgrades: obj.upgrades || {} };
  } catch {
    return { souls: 0, upgrades: {} };
  }
}

export function setGuestMeta(meta) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ souls: meta.souls || 0, upgrades: meta.upgrades || {} }));
  } catch { /* ignore */ }
}

export function addGuestSouls(n) {
  const m = getGuestMeta();
  m.souls = (m.souls || 0) + n;
  setGuestMeta(m);
  return m;
}
