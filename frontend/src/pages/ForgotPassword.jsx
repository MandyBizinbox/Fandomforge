import React, { useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { http } from "../lib/api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    setSending(true);
    setError("");
    try {
      await http.post("/auth/forgot-password", { email: email.trim() });
      setDone(true);
    } catch {
      setError("We could not process your request right now. Please try again shortly.");
    } finally {
      setSending(false);
    }
  }
  return (
    <div className="min-h-screen page-shell">
      <Navbar />
      <main className="pt-28 pb-20 px-4 flex justify-center">
        <div className="w-full max-w-md">
          <div className="overline mb-2">Account recovery</div>
          <h1 className="font-display text-5xl uppercase mb-3">Forgot password?</h1>
          <p className="text-[var(--ff-muted-text)] mb-8">Enter your account email and we’ll send a secure reset link if an account exists.</p>
          {done ? (
            <div className="card" role="status" data-testid="forgot-password-success">
              If an account exists for that email address, a password reset link will be sent. Check your inbox and spam folder.
            </div>
          ) : (
            <form onSubmit={submit} className="card space-y-4" data-testid="forgot-password-form">
              <div><label htmlFor="recovery-email" className="label">Email address</label>
                <input id="recovery-email" className="input-base" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              {error && <div role="alert" className="text-[var(--ff-primary)] text-sm">{error}</div>}
              <button type="submit" disabled={sending} className="btn-primary w-full justify-center">{sending ? "Submitting…" : "Send reset link"}</button>
            </form>
          )}
          <p className="mt-6 text-sm"><Link className="underline" to="/login">Back to sign in</Link></p>
        </div>
      </main>
    </div>
  );
}
