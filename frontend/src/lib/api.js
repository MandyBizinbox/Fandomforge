import axios from "axios";
import { clearAuthToken, getAuthToken } from "./authToken";

function resolveApiBase() {
  const configured = process.env.REACT_APP_BACKEND_URL;
  if (configured && configured !== "undefined" && configured !== "null" && configured.trim() !== "") {
    return configured.replace(/\/+$/, "");
  }
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export const API_BASE = resolveApiBase();
export const API = `${API_BASE}/api`;
export const AUTH_EXPIRED_EVENT = "fandomforge:auth-expired";
export const http = axios.create({ baseURL: API });

export function apiErrorDetailText(detail, fallback = "Request failed") {
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  if (Array.isArray(detail)) {
    const parts = detail.map((item) => {
      if (typeof item === "string") return item;
      if (!item || typeof item !== "object") return "";
      const location = Array.isArray(item.loc) ? item.loc.join(".") : "";
      const message = String(item.msg || item.message || item.error || "").trim();
      return [location, message].filter(Boolean).join(": ");
    }).filter(Boolean);
    return parts.length ? parts.join("; ") : fallback;
  }
  if (detail && typeof detail === "object") {
    const message = [detail.message, detail.detail, detail.reason]
      .find((value) => typeof value === "string" && value.trim());
    const error = typeof detail.error === "string" && detail.error.trim() ? detail.error.trim() : "";
    if (message && error && error !== message) return `${message} ${error}`;
    if (message) return message;
    if (error) return error;
    try {
      return JSON.stringify(detail);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

http.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

function isBuilderContext() {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname || "";
  return path.includes("/product-templates") || path.includes("/products") || path.includes("/creator") || path.includes("/admin");
}

function isPrintOptionsRequest(response) {
  const url = String(response?.config?.url || "");
  const method = String(response?.config?.method || "get").toLowerCase();
  return method === "get" && (url === "/print-options" || url.endsWith("/print-options"));
}

function isInstanceSettingsUpdate(response) {
  const url = String(response?.config?.url || "");
  const method = String(response?.config?.method || "get").toLowerCase();
  return method === "patch" && (url === "/admin/instance-settings" || url.endsWith("/admin/instance-settings") || url === "/integrity/settings");
}

function isAuthenticationRequest(error) {
  const url = String(error?.config?.url || "");
  return [
    "/auth/login",
    "/auth/register",
    "/auth/google/session",
  ].some((path) => url.includes(path));
}

function isAdminProductRequest(error) {
  const url = String(error?.config?.url || "");
  return url === "/admin/products" || url.startsWith("/admin/products/");
}

async function loadProductionMethodProfiles() {
  const token = getAuthToken();
  const response = await axios.get(`${API}/production-rules/print-option-profiles`, {
    params: { active: true, _: Date.now() },
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });
  return Array.isArray(response.data) ? response.data : [];
}

http.interceptors.response.use(async (response) => {
  if (isInstanceSettingsUpdate(response) && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("fandomforge:platform-updated", { detail: response.data || {} }));
  }
  if (!isPrintOptionsRequest(response) || !isBuilderContext() || response.config?._productionProfilesInjected) {
    return response;
  }
  try {
    const profiles = await loadProductionMethodProfiles();
    if (profiles.length) {
      return {
        ...response,
        data: profiles,
        config: { ...(response.config || {}), _productionProfilesInjected: true },
      };
    }
  } catch (error) {
    console.warn("Production method profiles unavailable; using legacy print options", error);
  }
  return response;
}, (error) => {
  const status = Number(error?.response?.status || 0);
  const activeToken = getAuthToken();

  if (status === 401 && activeToken && !isAuthenticationRequest(error)) {
    clearAuthToken();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT, {
        detail: { requestUrl: String(error?.config?.url || "") },
      }));
    }
  }

  const detail = error?.response?.data?.detail;
  const entitlement = detail?.code === "entitlement_denied"
    ? detail
    : detail?.reason_code && detail?.feature_key
      ? detail
      : null;
  if (entitlement && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("fandomforge:entitlement-denied", { detail: entitlement }));
  }

  if (isAdminProductRequest(error) && error?.response?.data && detail !== undefined && typeof detail !== "string") {
    error.response.data.detail = apiErrorDetailText(detail);
  }

  return Promise.reject(error);
});

export function assetUrl(path) {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("data:")) return path;
  if (path.startsWith("/api/")) return `${API_BASE}${path}`;
  if (path.startsWith("/uploads/")) return `${API_BASE}/api${path}`;
  return path;
}
