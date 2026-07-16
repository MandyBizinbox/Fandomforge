import axios from "axios";
import { getAuthToken } from "./authToken";

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

export const http = axios.create({
  baseURL: API,
});

http.interceptors.request.use((config) => {
  const token = getAuthToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

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
