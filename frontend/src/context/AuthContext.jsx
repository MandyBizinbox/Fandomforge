import React, { createContext, useContext, useEffect, useState } from "react";
import {
  AUTH_EXPIRED_EVENT,
  clearStoredAuthToken,
  getStoredAuthToken,
  http,
  storeAuthToken,
} from "../lib/api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getStoredAuthToken();

    if (!token) {
      setLoading(false);
      return;
    }

    http.get("/auth/me")
      .then((r) => setUser(r.data))
      .catch(() => {
        clearStoredAuthToken();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handleExpiredSession = () => {
      clearStoredAuthToken();
      setUser(null);
      setLoading(false);
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpiredSession);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpiredSession);
  }, []);

  const login = async (email, password) => {
    const r = await http.post("/auth/login", { email, password });
    storeAuthToken(r.data.access_token);
    setUser(r.data.user);
    return r.data.user;
  };

  const register = async (email, password, name, role = "buyer") => {
    const r = await http.post("/auth/register", { email, password, name, role });
    storeAuthToken(r.data.access_token);
    setUser(r.data.user);
    return r.data.user;
  };

  const logout = () => {
    clearStoredAuthToken();
    setUser(null);
  };

  const exchangeGoogleSession = async (sessionId) => {
    const r = await http.post("/auth/google/session", null, {
      headers: { "X-Session-ID": sessionId },
    });
    storeAuthToken(r.data.access_token);
    setUser(r.data.user);
    return r.data.user;
  };

  const refreshUser = async () => {
    const r = await http.get("/auth/me");
    setUser(r.data);
    return r.data;
  };

  return (
    <AuthCtx.Provider value={{ user, loading, login, register, logout, exchangeGoogleSession, refreshUser }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}
