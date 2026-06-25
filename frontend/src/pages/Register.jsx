import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Navbar from "../components/Navbar";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const initialRole = search.get("role") || "buyer";
  const [role, setRole] = useState(["buyer","creator","printer"].includes(initialRole) ? initialRole : "buyer");

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const u = await register(email, password, name, role);
      if (u.role === "creator") navigate("/creator/profile-setup");
      else if (u.role === "printer") navigate("/printer/apply");
      else navigate("/");
    } catch (e) {
      setErr(e.response?.data?.detail || "Registration failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen page-shell">
      <Navbar />
      <div className="pt-28 pb-20 px-6 flex items-center justify-center">
        <div className="w-full max-w-md">
          <div className="overline mb-2">Join FandomForge</div>
          <h1 className="font-display text-5xl uppercase mb-8">Create account</h1>

          <div className="grid grid-cols-3 gap-0 border border-[var(--ff-card-border)] mb-6">
            {[
              { v: "buyer", l: "Fan" },
              { v: "creator", l: "Creator" },
              { v: "printer", l: "Printer" },
            ].map((r, i) => (
              <button key={r.v} type="button" onClick={() => setRole(r.v)}
                className={`px-4 py-3 text-xs uppercase tracking-widest font-bold ${i < 2 ? 'border-r border-[var(--ff-card-border)]' : ''} ${role === r.v ? 'bg-[var(--ff-primary)] text-[var(--ff-button-primary-text)]' : 'text-[var(--ff-muted-text)] hover:text-[var(--ff-primary)]'}`}
                data-testid={`register-role-${r.v}`}>
                {r.l}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4" data-testid="register-form">
            <div>
              <label className="label">{role === "creator" ? "Creator name" : role === "printer" ? "Company name" : "Full name"}</label>
              <input className="input-base" value={name} onChange={(e) => setName(e.target.value)} required data-testid="register-name" />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input-base" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="register-email" />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input-base" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required data-testid="register-password" />
            </div>
            {err && <div className="text-[var(--ff-primary)] text-sm" data-testid="register-error">{err}</div>}
            <button type="submit" className="btn-primary w-full" disabled={loading} data-testid="register-submit">
              {loading ? "Creating..." : "Create account"}
            </button>
          </form>

          <div className="mt-8 text-sm text-[var(--ff-muted-text)]">
            Already have an account?{" "}
            <Link to="/login" className="text-[var(--ff-page-text)] underline" data-testid="register-login-link">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
