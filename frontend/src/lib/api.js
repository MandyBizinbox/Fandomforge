import axios from "axios";

function resolveApiBase() {
  const configured = process.env.REACT_APP_BACKEND_URL;

  if (
    configured &&
    configured !== "undefined" &&
    configured !== "null" &&
    configured.trim() !== ""
  ) {
    return configured.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "";
}

export const API_BASE = resolveApiBase();
export const API = `${API_BASE}/api`;

export const AUTH_TOKEN_STORAGE_KEY = "mf_token";
export const AUTH_EXPIRED_EVENT = "fandomforge:auth-expired";
const LEGACY_AUTH_TOKEN_STORAGE_KEYS = ["ff_token", "access_token"];

export function getStoredAuthToken() {
  if (typeof window === "undefined") return "";

  const canonical = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  if (canonical) return canonical;

  for (const key of LEGACY_AUTH_TOKEN_STORAGE_KEYS) {
    const token = window.localStorage.getItem(key);
    if (token) {
      window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
      return token;
    }
  }

  return "";
}

export function storeAuthToken(token) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  else window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  LEGACY_AUTH_TOKEN_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
}

export function clearStoredAuthToken() {
  storeAuthToken("");
}

export const http = axios.create({
  baseURL: API,
});

http.interceptors.request.use((cfg) => {
  const token = getStoredAuthToken();

  if (token) {
    cfg.headers.Authorization = `Bearer ${token}`;
  }

  return cfg;
});

http.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const requestPath = String(error.config?.url || "");
    const isAuthenticationAttempt = [
      "/auth/login",
      "/auth/register",
      "/auth/google/session",
    ].some((path) => requestPath.includes(path));

    if (status === 401 && !isAuthenticationAttempt) {
      clearStoredAuthToken();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
      }
    }

    return Promise.reject(error);
  }
);

// Convert /api/uploads/... to absolute URL; pass through absolute URLs/data URLs.
export function assetUrl(path) {
  if (!path) return "";

  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  if (path.startsWith("data:")) {
    return path;
  }

  if (path.startsWith("/api/")) {
    return `${API_BASE}${path}`;
  }

  if (path.startsWith("/uploads/")) {
    return `${API_BASE}/api${path}`;
  }

  return path;
}