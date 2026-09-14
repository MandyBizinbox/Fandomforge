import { establishAuthSession } from "./authSession";
import {
  AUTH_TOKEN_KEY,
  E2E_AUTH_TOKEN_ALIAS,
  LEGACY_AUTH_TOKEN_KEY,
} from "./authToken";

describe("establishAuthSession", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("persists the canonical token and updates auth state", () => {
    const user = {
      id: "creator-1",
      email: "creator@example.com",
      role: "creator",
    };
    const setUser = jest.fn();

    const result = establishAuthSession(
      { access_token: "creator-token", user },
      setUser,
    );

    expect(result).toEqual(user);
    expect(window.localStorage.getItem(AUTH_TOKEN_KEY)).toBe("creator-token");
    expect(window.localStorage.getItem(E2E_AUTH_TOKEN_ALIAS)).toBe("creator-token");
    expect(window.localStorage.getItem(LEGACY_AUTH_TOKEN_KEY)).toBeNull();
    expect(setUser).toHaveBeenCalledWith(user);
  });

  test("rejects an incomplete session instead of leaving auth half-established", () => {
    expect(() => establishAuthSession({ user: { role: "creator" } }, jest.fn()))
      .toThrow("Authentication session response is incomplete.");
    expect(window.localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
  });
});
