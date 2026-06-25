import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Navbar from "../components/Navbar";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, user, logout } = useAuth();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const next = search.get("next") || "/";

  // If a stale token exists but no user yet, clear it on mount so the login attempt is clean.
  useEffect(() => {
    if (!user && localStorage.getItem("mf_token")) {
      // Token failed validation server-side; AuthContext already removed it, but be explicit.
      localStorage.removeItem("mf_token");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      // Always clear any prior auth state before logging in (prevents stale-token edge cases)
      localStorage.removeItem("mf_token");
      const u = await login(email, password);
      const dest = u.role === "super_admin" ? "/admin" : u.role === "creator" ? "/creator" : u.role === "printer" ? "/printer" : next;
      navigate(dest, { replace: true });
    } catch (ex) {
      setErr(ex.response?.data?.detail || ex.message || "Login failed");
    } finally { setLoading(false); }
  };

  const googleLogin = () => {
    const cb = `${window.location.origin}/auth/callback`;
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(cb)}`;
  };

  return (
    <div className="min-h-screen page-shell">
      <Navbar />
      <div className="pt-28 pb-20 px-6 flex items-center justify-center min-h-screen">
        <div className="w-full max-w-md">
          <div className="overline mb-2">Welcome back</div>
          <h1 className="font-display text-5xl uppercase mb-8">Sign in</h1>

          {user && (
            <div className="card mb-6 text-sm" data-testid="login-already-signed-in">
              <div className="overline mb-1">Currently signed in as</div>
              <div className="font-bold">{user.email} · {user.role}</div>
              <div className="flex gap-3 mt-3">
                <button onClick={() => navigate(user.role === "super_admin" ? "/admin" : user.role === "creator" ? "/creator" : user.role === "printer" ? "/printer" : "/")}
                  className="text-xs uppercase tracking-widest text-[var(--ff-primary)] hover:text-[var(--ff-primary)] font-bold" data-testid="login-go-dashboard">Go to dashboard →</button>
                <button onClick={() => { logout(); }} className="text-xs uppercase tracking-widest text-[var(--ff-muted-text)] hover:text-[var(--ff-primary)] font-bold" data-testid="login-switch-account">Switch account</button>
              </div>
            </div>
          )}

          <form onSubmit={submit} className="space-y-4" data-testid="login-form">
            <div>
              <label className="label">Email</label>
              <input className="input-base" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" data-testid="login-email" />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input-base" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" data-testid="login-password" />
            </div>
            {err && <div className="text-[var(--ff-primary)] text-sm" data-testid="login-error">{err}</div>}
            <button type="submit" className="btn-primary w-full" disabled={loading} data-testid="login-submit">
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="flex-1 h-px bg-white/15" />
            <span className="text-xs uppercase tracking-widest text-[var(--ff-muted-text)]">or</span>
            <div className="flex-1 h-px bg-white/15" />
          </div>

          <button onClick={googleLogin} className="btn-secondary w-full" data-testid="login-google-btn">
            Continue with Google
          </button>

          <div className="mt-8 text-sm text-[var(--ff-muted-text)]">
            New here?{" "}
            <Link to="/register" className="text-[var(--ff-page-text)] underline" data-testid="login-register-link">Create account</Link>
          </div>

          
        </div>
      </div>
    </div>
  );
}
