import axios from "axios";
import { getBackendBaseUrl } from "../lib/backendBaseUrl";

const ACCESS_TOKEN_KEY = "doe_access_token";

const BACKEND = getBackendBaseUrl();
export const API_BASE = BACKEND ? `${BACKEND}/api` : "/api";

export const api = axios.create({
  baseURL: API_BASE,
  // Cross-domain (pages.dev -> workers.dev) cookie auth is unreliable due to 3P cookie blocking.
  // Use bearer token instead.
  withCredentials: false,
});

export function getAccessToken() {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(ACCESS_TOKEN_KEY) || "";
}

export function setAccessToken(token) {
  if (typeof localStorage === "undefined") return;
  if (!token) localStorage.removeItem(ACCESS_TOKEN_KEY);
  else localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

// Authorization header for bearer-token auth
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
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
