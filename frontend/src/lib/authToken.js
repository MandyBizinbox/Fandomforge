export const AUTH_TOKEN_KEY = "ff_token";
export const LEGACY_AUTH_TOKEN_KEY = "mf_token";

export function getAuthToken() {
  if (typeof window === "undefined") return "";

  const current = window.localStorage.getItem(AUTH_TOKEN_KEY);
  if (current) return current;

  const legacy = window.localStorage.getItem(LEGACY_AUTH_TOKEN_KEY);
  if (legacy) {
    window.localStorage.setItem(AUTH_TOKEN_KEY, legacy);
    window.localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
  }

  return legacy || "";
}

export function setAuthToken(token) {
  if (typeof window === "undefined") return;

  if (token) {
    window.localStorage.setItem(AUTH_TOKEN_KEY, token);
  } else {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
  }
  window.localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
}

export function clearAuthToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
}
