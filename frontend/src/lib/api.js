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

export const http = axios.create({
  baseURL: API,
});

http.interceptors.request.use((cfg) => {
  const token = localStorage.getItem("mf_token");

  if (token) {
    cfg.headers.Authorization = `Bearer ${token}`;
  }

  return cfg;
});

function isBuilderContext() {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname || "";
  return (
    path.includes("/product-templates") ||
    path.includes("/products") ||
    path.includes("/creator") ||
    path.includes("/admin")
  );
}

function isPrintOptionsRequest(response) {
  const url = String(response?.config?.url || "");
  const method = String(response?.config?.method || "get").toLowerCase();
  return method === "get" && (url === "/print-options" || url.endsWith("/print-options"));
}

async function loadProductionMethodProfiles() {
  const token = localStorage.getItem("mf_token");
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
  if (!isPrintOptionsRequest(response) || !isBuilderContext() || response.config?._productionProfilesInjected) {
    return response;
  }

  try {
    const profiles = await loadProductionMethodProfiles();
    if (profiles.length) {
      return {
        ...response,
        data: profiles,
        config: {
          ...(response.config || {}),
          _productionProfilesInjected: true,
        },
      };
    }
  } catch (error) {
    // Fallback to the original legacy print-options response if the production
    // profile endpoint is unavailable. This keeps launch screens usable while
    // backend/profile issues are diagnosed.
    console.warn("Production method profiles unavailable; using legacy print options", error);
  }

  return response;
});

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
