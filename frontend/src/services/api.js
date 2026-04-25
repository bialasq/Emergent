import axios from "axios";

const CSRF_COOKIE = "csrf_token";

function getCookie(name) {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : "";
}

const raw = process.env.REACT_APP_BACKEND_URL;
const devFallback =
  process.env.NODE_ENV === "development" ? "http://127.0.0.1:8000" : "";
const BACKEND = String(raw || devFallback || "")
  .trim()
  .replace(/\/$/, "");
export const API_BASE = BACKEND ? `${BACKEND}/api` : "/api";

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

// CSRF header for cookie-auth write requests
api.interceptors.request.use((config) => {
  const method = String(config.method || "get").toLowerCase();
  const isWrite = ["post", "put", "patch", "delete"].includes(method);
  if (isWrite) {
    const csrf = getCookie(CSRF_COOKIE);
    if (csrf) config.headers["x-csrf-token"] = csrf;
  }
  return config;
});

export function formatApiError(err) {
  const d = err?.response?.data?.detail;
  if (d == null) return err?.message || "Unknown error";
  if (typeof d === "string") return d;
  if (Array.isArray(d))
    return d.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).join(" ");
  if (d && typeof d.msg === "string") return d.msg;
  return String(d);
}
