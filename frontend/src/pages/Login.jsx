import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { clearAuthToken } from "../lib/authToken";
import Navbar from "../components/Navbar";

function accountHome(role) {
  if (["super_admin", "admin"].includes(role)) return "/admin";
  if (role === "manager") return "/manager";
  if (role === "creator") return "/creator";
  if (role === "printer") return "/printer";
  return "/account";
}

function safeNextPath(value) {
  const path = String(value || "");
  return path.startsWith("/") && !path.startsWith("//") ? path : "";
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, user, logout } = useAuth();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const nextPath = safeNextPath(search.get("next"));

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      clearAuthToken();
      const signedInUser = await login(email.trim(), password);
      navigate(nextPath || accountHome(signedInUser.role), { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "The email address or password could not be verified.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen page-shell">
      <Navbar />
      <main className="pt-28 pb-20 px-4 sm:px-6 flex items-center justify-center min-h-screen">
        <div className="w-full max-w-md">
          <div className="overline mb-2">Welcome back</div>
          <h1 className="font-display text-5xl uppercase mb-3">Sign in</h1>
          <p className="text-[var(--ff-muted-text)] mb-8">Access your FandomForge account, store or production dashboard.</p>

          {user && (
            <div className="card mb-6 text-sm" data-testid="login-already-signed-in">
              <div className="overline mb-1">Currently signed in</div>
              <div className="font-bold break-all">{user.email}</div>
              <div className="text-xs text-[var(--ff-muted-text)] mt-1">Account type: {user.role}</div>
              <div className="flex flex-wrap gap-3 mt-4">
                <button type="button" onClick={() => navigate(accountHome(user.role))} className="text-xs uppercase tracking-widest text-[var(--ff-primary)] font-bold" data-testid="login-go-dashboard">Go to dashboard →</button>
                <button type="button" onClick={logout} className="text-xs uppercase tracking-widest text-[var(--ff-muted-text)] hover:text-[var(--ff-primary)] font-bold" data-testid="login-switch-account">Switch account</button>
              </div>
            </div>
          )}

          <form onSubmit={submit} className="card space-y-4" data-testid="login-form">
            <div>
              <label className="label">Email</label>
              <input className="input-base" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" data-testid="login-email" />
            </div>
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input className="input-base pr-14" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" data-testid="login-password" />
                <button type="button" onClick={() => setShowPassword((current) => !current)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ff-muted-text)] hover:text-[var(--ff-primary)]" aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            {error && <div className="text-[var(--ff-primary)] text-sm" role="alert" data-testid="login-error">{error}</div>}
            <button type="submit" className="btn-primary w-full justify-center" disabled={loading} data-testid="login-submit">
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="mt-8 text-sm text-[var(--ff-muted-text)]">
            New customer?{" "}
            <Link to="/register" className="text-[var(--ff-page-text)] underline" data-testid="login-register-link">Create an account</Link>
          </div>
          <div className="mt-3 text-sm text-[var(--ff-muted-text)]">
            Want to sell merchandise?{" "}
            <Link to="/register/creator" className="text-[var(--ff-page-text)] underline">Create a creator store</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
