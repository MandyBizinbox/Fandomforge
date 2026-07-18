export const AUTH_TOKEN_KEY = "ff_token";
export const LEGACY_AUTH_TOKEN_KEY = "mf_token";
export const E2E_AUTH_TOKEN_ALIAS = "fandomforge_token";

export function getAuthToken() {
  if (typeof window === "undefined") return "";

  const current = window.localStorage.getItem(AUTH_TOKEN_KEY);
  if (current) return current;

  const legacy = window.localStorage.getItem(LEGACY_AUTH_TOKEN_KEY);
  if (legacy) {
    window.localStorage.setItem(AUTH_TOKEN_KEY, legacy);
    window.localStorage.setItem(E2E_AUTH_TOKEN_ALIAS, legacy);
    window.localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
  }

  return legacy || "";
}

export function setAuthToken(token) {
  if (typeof window === "undefined") return;

  if (token) {
    window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    // Same non-secret session token, exposed under a stable alias so the
    // committed Playwright harness can prove UI login completed successfully.
    // Runtime authentication continues to read only AUTH_TOKEN_KEY.
    window.localStorage.setItem(E2E_AUTH_TOKEN_ALIAS, token);
  } else {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    window.localStorage.removeItem(E2E_AUTH_TOKEN_ALIAS);
  }
  window.localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
}

export function clearAuthToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
  window.localStorage.removeItem(E2E_AUTH_TOKEN_ALIAS);
}
