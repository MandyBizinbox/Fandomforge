import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { http } from "../lib/api";
import { clearAuthToken, getAuthToken, setAuthToken } from "../lib/authToken";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAuthToken();

    if (!token) {
      setLoading(false);
      return;
    }

    http.get("/auth/me")
      .then((response) => setUser(response.data))
      .catch(() => clearAuthToken())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const response = await http.post("/auth/login", { email, password });
    setAuthToken(response.data.access_token);
    setUser(response.data.user);
    return response.data.user;
  }, []);

  const register = useCallback(async (email, password, name, role = "buyer") => {
    const response = await http.post("/auth/register", { email, password, name, role });
    setAuthToken(response.data.access_token);
    setUser(response.data.user);
    return response.data.user;
  }, []);

  const logout = useCallback(() => {
    clearAuthToken();
    setUser(null);
  }, []);

  const exchangeGoogleSession = useCallback(async (sessionId) => {
    const response = await http.post("/auth/google/session", null, {
      headers: { "X-Session-ID": sessionId },
    });
    setAuthToken(response.data.access_token);
    setUser(response.data.user);
    return response.data.user;
  }, []);

  const refreshUser = useCallback(async () => {
    const response = await http.get("/auth/me");
    setUser(response.data);
    return response.data;
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    login,
    register,
    logout,
    exchangeGoogleSession,
    refreshUser,
  }), [user, loading, login, register, logout, exchangeGoogleSession, refreshUser]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}
