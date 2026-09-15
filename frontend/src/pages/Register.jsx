import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Store, Truck } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import Navbar from "../components/Navbar";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const submit = async (event) => {
    event.preventDefault();
    setErr("");

    if (!acceptedTerms) {
      setErr("Please accept the Customer Terms and Privacy Policy.");
      return;
    }

    setLoading(true);
    try {
      await register(email, password, name, "buyer");
      navigate("/account");
    } catch (error) {
      setErr(error.response?.data?.detail || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen page-shell">
      <Navbar />
      <main className="pt-28 pb-20 px-6 max-w-6xl mx-auto grid gap-8 lg:grid-cols-[1fr_360px] items-start">
        <section className="w-full max-w-xl">
          <div className="overline mb-2">Join FandomForge</div>
          <h1 className="font-display text-5xl uppercase mb-4">Create customer account</h1>
          <p className="text-[var(--ff-muted-text)] mb-8">
            Create an account to view your orders, manage contact details and follow order progress.
          </p>

          <form onSubmit={submit} className="card space-y-4" data-testid="register-form">
            <div>
              <label className="label">Full name</label>
              <input className="input-base" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" data-testid="register-name" />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input-base" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" data-testid="register-email" />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input-base" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" data-testid="register-password" />
              <p className="text-xs text-[var(--ff-muted-text)] mt-2">Use at least 8 characters.</p>
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
