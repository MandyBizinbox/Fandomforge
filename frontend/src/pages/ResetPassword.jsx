import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { http } from "../lib/api";

export default function ResetPassword() {
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get("token") || "");
  useEffect(() => {
    if (window.location.hash) window.history.replaceState({}, "", "/reset-password");
  }, []);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    setError("");
    if (password !== confirm) return setError("Passwords do not match.");
    if (password.length < 12 || new TextEncoder().encode(password).length > 72 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      return setError("Use at least 12 characters including letters and numbers (maximum 72 UTF-8 bytes).");
    }
    setLoading(true);
    try {
      await http.post("/auth/reset-password", { token, password });
      setDone(true);
    } catch (err) {
      setError(typeof err.response?.data?.detail === "string" ? err.response.data.detail : "Unable to reset password. Request a new link.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="min-h-screen page-shell">
      <Navbar />
      <main className="pt-28 pb-20 px-4 flex justify-center">
        <div className="w-full max-w-md">
          <div className="overline mb-2">Account recovery</div>
          <h1 className="font-display text-5xl uppercase mb-3">New password</h1>
          {done ? <div className="card" role="status">Password updated. <Link to="/login" className="underline">Sign in now</Link>.</div>
            : !token ? <div className="card">Missing reset link. <Link className="underline" to="/forgot-password">Request a new link</Link>.</div>
            : <form onSubmit={submit} className="card space-y-4" data-testid="reset-password-form">
                <p className="text-sm text-[var(--ff-muted-text)]">Use at least 12 characters, including letters and numbers.</p>
                <div><label htmlFor="new-password" className="label">New password</label>
                  <input id="new-password" className="input-base" type="password" autoComplete="new-password" required minLength={12} maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                <div><label htmlFor="confirm-password" className="label">Confirm password</label>
                  <input id="confirm-password" className="input-base" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
                {error && <p role="alert" className="text-[var(--ff-primary)] text-sm">{error}</p>}
                <button className="btn-primary w-full justify-center" type="submit" disabled={loading}>{loading ? "Saving…" : "Reset password"}</button>
              </form>}
          <p className="mt-6 text-sm"><Link className="underline" to="/login">Back to sign in</Link></p>
        </div>
      </main>
    </div>
  );
}
