import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Store, Truck } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import Navbar from "../components/Navbar";
import { usePlatformConfig } from "../lib/platform";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const { platform } = usePlatformConfig();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const initialRole = search.get("role") || "buyer";
  const [role, setRole] = useState(["buyer", "creator", "printer"].includes(initialRole) ? initialRole : "buyer");

  const submit = async (event) => {
    event.preventDefault();
    setErr("");

    if (!acceptedTerms) {
      setErr("Please accept the Customer Terms and Privacy Policy.");
      return;
    }

    setLoading(true);
    try {
      const user = await register(email, password, name, role);
      if (user.role === "creator") navigate("/creator/profile-setup");
      else if (user.role === "printer") navigate("/printer/apply");
      else navigate("/");
    } catch (error) {
      setErr(error.response?.data?.detail || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen page-shell">
      <Navbar />
      <div className="pt-28 pb-20 px-6 flex items-center justify-center">
        <div className="w-full max-w-md">
          <div className="overline mb-2">Join {platform.platform_name || "Fandom Forge"}</div>
          <h1 className="font-display text-5xl uppercase mb-8">Create account</h1>

          <div className="grid grid-cols-3 gap-0 border border-[var(--ff-card-border)] mb-6">
            {[
              { v: "buyer", l: "Fan" },
              { v: "creator", l: "Creator" },
              { v: "printer", l: "Printer" },
            ].map((item, index) => (
              <button
                key={item.v}
                type="button"
                onClick={() => setRole(item.v)}
                className={`px-4 py-3 text-xs uppercase tracking-widest font-bold ${index < 2 ? "border-r border-[var(--ff-card-border)]" : ""} ${role === item.v ? "bg-[var(--ff-primary)] text-[var(--ff-button-primary-text)]" : "text-[var(--ff-muted-text)] hover:text-[var(--ff-primary)]"}`}
                data-testid={`register-role-${item.v}`}
              >
                {item.l}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4" data-testid="register-form">
            <div>
              <label className="label">{role === "creator" ? "Creator name" : role === "printer" ? "Company name" : "Full name"}</label>
              <input className="input-base" value={name} onChange={(event) => setName(event.target.value)} required data-testid="register-name" />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input-base" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required data-testid="register-email" />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input-base" type="password" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} required data-testid="register-password" />
            </div>

            <label className="flex gap-3 items-start text-sm text-[var(--ff-muted-text)]">
              <input
                type="checkbox"
                className="mt-1"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                required
              />
              <span>
                I agree to the <Link to="/terms" className="text-[var(--ff-primary)] underline">Customer Terms</Link> and acknowledge the <Link to="/privacy-policy" className="text-[var(--ff-primary)] underline">Privacy Policy</Link>.
              </span>
            </label>

            {err && <div className="text-[var(--ff-primary)] text-sm" role="alert" data-testid="register-error">{err}</div>}

            <button type="submit" className="btn-primary w-full" disabled={loading} data-testid="register-submit">
              {loading ? "Creating…" : "Create customer account"}
            </button>
          </form>

          <div className="mt-6 text-sm text-[var(--ff-muted-text)]">
            Already have an account?{" "}
            <Link to="/login" className="text-[var(--ff-page-text)] underline" data-testid="register-login-link">Sign in</Link>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="card">
            <Store className="text-[var(--ff-primary)] mb-4" />
            <h2 className="font-display text-3xl uppercase mb-2">Want to sell merch?</h2>
            <p className="text-sm text-[var(--ff-muted-text)] mb-5">
              Creator onboarding includes store setup, plan selection and the commercial terms needed to start selling.
            </p>
            <Link to="/register/creator" className="btn-primary w-full justify-center">Create a creator store</Link>
          </div>

          <div className="card">
            <Truck className="text-[var(--ff-primary)] mb-4" />
            <h2 className="font-display text-3xl uppercase mb-2">Production partner?</h2>
            <p className="text-sm text-[var(--ff-muted-text)] mb-5">
              Apply through the dedicated production-partner process so FandomForge can review your capabilities.
            </p>
            <Link to="/register/printer" className="btn-secondary w-full justify-center">Apply as a printer</Link>
          </div>
        </aside>
      </main>
    </div>
  );
}
