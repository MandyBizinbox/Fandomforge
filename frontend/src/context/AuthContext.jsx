import React, { createContext, useContext, useEffect, useState } from "react";
import { http } from "../lib/api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("mf_token");

    if (!token) { setLoading(false); return; }
    http.get("/auth/me")
      .then((r) => setUser(r.data))
      .catch(() => { localStorage.removeItem("mf_token"); })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const r = await http.post("/auth/login", { email, password });
    localStorage.setItem("mf_token", r.data.access_token);
    setUser(r.data.user);
    return r.data.user;
  };

  const register = async (email, password, name, role = "buyer") => {
    const r = await http.post("/auth/register", { email, password, name, role });
    localStorage.setItem("mf_token", r.data.access_token);
    setUser(r.data.user);
    return r.data.user;
  };

  const logout = () => {
    localStorage.removeItem("mf_token");
    setUser(null);
  };

  const exchangeGoogleSession = async (sessionId) => {
    const r = await http.post("/auth/google/session", null, {
      headers: { "X-Session-ID": sessionId },
    });
    localStorage.setItem("mf_token", r.data.access_token);
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
