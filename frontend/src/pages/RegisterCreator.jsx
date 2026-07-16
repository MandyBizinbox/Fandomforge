import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import Navbar from "../components/Navbar";
import { http } from "../lib/api";
import { usePlatformConfig } from "../lib/platform";
import PlanSelector from "../components/signup/PlanSelector";

const STEP_LABELS = ["Owner account", "Store details", "Plan", "Review"];

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-");
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function getCheckoutUrl(data) {
  const url = data?.checkout_url || data?.authorization_url || data?.payment_url || data?.billing_checkout_url || data?.redirect_to;
  if (typeof url === "string" && /^https?:\/\//i.test(url)) return url;
  return "";
}

export default function RegisterCreator() {
  const navigate = useNavigate();
  const { platform } = usePlatformConfig();
  const [step, setStep] = useState(1);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirm: "",
    store_name: "",
    category: "",
    contact_email: "",
    plan_id: "",
  });

  const signupEnabled = platform.signup?.creator_signup_enabled !== false && platform.modules?.creators_enabled !== false;

  useEffect(() => {
    http
      .get("/public/subscription-plans?audience=creator")
      .then((response) => {
        const rows = Array.isArray(response.data) ? response.data : [];
        setPlans(rows);
        if (rows.length) {
          setForm((current) => ({ ...current, plan_id: current.plan_id || rows[0].id }));
        }
      })
      .catch(() => setPlans([]));
  }, []);

  const selectedPlan = useMemo(() => plans.find((plan) => plan.id === form.plan_id), [plans, form.plan_id]);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const validateCurrentStep = () => {
    if (step === 1) {
      if (!form.name.trim() || !form.email.trim() || !form.password || !form.confirm) {
        return "Complete all required owner-account fields.";
      }
      if (!isValidEmail(form.email)) return "Enter a valid owner email address.";
      if (form.password.length < 8) return "Use a password with at least 8 characters.";
      if (form.password !== form.confirm) return "Passwords do not match.";
    }

    if (step === 2) {
      if (!form.store_name.trim() || !form.category.trim() || !form.contact_email.trim()) {
        return "Complete all required store fields.";
      }
      if (!isValidEmail(form.contact_email)) return "Enter a valid public contact email address.";
    }

    if (step === 3 && plans.length > 0 && !form.plan_id) {
      return "Choose a creator plan before continuing.";
    }

    return "";
  };

  const nextStep = () => {
    const validationError = validateCurrentStep();
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setStep((current) => Math.min(4, current + 1));
  };

  const submit = async (event) => {
    event.preventDefault();

    if (!acceptedTerms) {
      toast.error("Accept the Creator Terms and Privacy Policy before creating the store.");
      return;
    }
    if (form.password !== form.confirm) return toast.error("Passwords do not match.");
    if (form.password.length < 8) return toast.error("Use a password with at least 8 characters.");
    if (!form.store_name.trim()) return toast.error("Store name is required.");
    if (!form.category.trim()) return toast.error("Category is required.");
    if (!isValidEmail(form.email) || !isValidEmail(form.contact_email)) return toast.error("Enter valid email addresses.");
    if (plans.length > 0 && !form.plan_id) return toast.error("Choose a creator plan.");

    setLoading(true);
    try {
      const callbackUrl = `${window.location.origin}/creator?billing=paystack`;
      const response = await http.post("/public/signup/creator", {
        user: {
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          password: form.password,
        },
        creator_name: form.store_name.trim(),
        slug: slugify(form.store_name),
        category: form.category.trim(),
        contact_email: form.contact_email.trim(),
        contact_phone: form.phone.trim(),
        bio: "",
        logo_url: "",
        socials: {},
        plan_id: form.plan_id || null,
        callback_url: callbackUrl,
      });

      const checkoutUrl = getCheckoutUrl(response.data);
      if (checkoutUrl) {
        toast.success("Store created. Redirecting to secure billing…");
        window.location.assign(checkoutUrl);
        return;
      }

      if (response.data?.access_token) localStorage.setItem("mf_token", response.data.access_token);

      if (response.data?.billing_error) {
        toast.warning("Your store was created, but billing still needs attention.");
        navigate("/creator?billing=attention");
        return;
      }

      toast.success(response.data?.status === "pending_approval" ? "Store created and submitted for approval." : "Store created.");
      navigate(response.data?.redirect_to || "/creator");
    } catch (error) {
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Creator signup failed. Please try again or contact support.");
    } finally {
      setLoading(false);
    }
  };

  if (!signupEnabled) {
    return (
      <div className="min-h-screen page-shell">
        <Navbar />
        <div className="pt-32 max-w-2xl mx-auto px-6">
          <div className="card">
            <p className="overline mb-2">Creator applications</p>
            <h1 className="font-display text-4xl uppercase">Online creator signup is temporarily unavailable</h1>
            <p className="text-[var(--ff-muted-text)] mt-3 mb-5">
              Contact FandomForge and we will help you with the next available onboarding option.
            </p>
            <Link to="/contact" className="btn-primary">Contact Support</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen page-shell">
      <Navbar />
      <form onSubmit={submit} className="pt-28 pb-16 max-w-5xl mx-auto px-4 sm:px-6 md:px-10 space-y-8">
        <div>
          <p className="overline mb-2">Creator onboarding</p>
          <h1 className="font-display text-5xl uppercase">Create your merch store</h1>
          <p className="text-[var(--ff-muted-text)] mt-2 max-w-3xl">
            Set up the account and store basics now. You can add your logo, banner, profile and first products from the creator dashboard after signup.
          </p>
        </div>

        <ol className="grid grid-cols-2 md:grid-cols-4 gap-2" aria-label="Creator signup progress">
          {STEP_LABELS.map((label, index) => {
            const number = index + 1;
            const active = step === number;
            const complete = step > number;
            return (
              <li
                key={label}
                className={`px-4 py-3 border text-xs uppercase tracking-widest ${active ? "border-[var(--ff-primary)] text-[var(--ff-page-text)]" : complete ? "border-[var(--ff-card-border)] text-[var(--ff-primary)]" : "border-[var(--ff-card-border)] text-[var(--ff-muted-text)]"}`}
              >
                <span className="block font-bold">Step {number}</span>
                <span className="block mt-1">{label}</span>
              </li>
            );
          })}
        </ol>

        {step === 1 && (
          <section className="card grid md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <p className="overline mb-2">Step 1</p>
              <h2 className="font-display text-3xl uppercase">Store owner account</h2>
              <p className="text-[var(--ff-muted-text)] text-sm mt-2">These details create the primary login used to manage the store.</p>
            </div>
            <Input label="Full name" value={form.name} onChange={(value) => set("name", value)} required autoComplete="name" />
            <Input label="Email" type="email" value={form.email} onChange={(value) => set("email", value)} required autoComplete="email" />
            <Input label="Phone / WhatsApp" value={form.phone} onChange={(value) => set("phone", value)} autoComplete="tel" />
            <PasswordInput label="Password" value={form.password} onChange={(value) => set("password", value)} required show={showPassword} onToggle={() => setShowPassword((value) => !value)} />
            <PasswordInput label="Confirm password" value={form.confirm} onChange={(value) => set("confirm", value)} required show={showPassword} onToggle={() => setShowPassword((value) => !value)} />
            <p className="md:col-span-2 text-xs text-[var(--ff-muted-text)]">Use at least 8 characters and keep this password private.</p>
          </section>
        )}

        {step === 2 && (
          <section className="card grid md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <p className="overline mb-2">Step 2</p>
              <h2 className="font-display text-3xl uppercase">Store basics</h2>
              <p className="text-[var(--ff-muted-text)] text-sm mt-2">Choose the public store identity. Branding, social links and product setup can be completed from the dashboard.</p>
            </div>
            <Input label="Store name" value={form.store_name} onChange={(value) => set("store_name", value)} required placeholder="Creator, club, organisation or brand name" />
            <Input label="Category" value={form.category} onChange={(value) => set("category", value)} required placeholder="School, club, creator, church, organisation…" />
            <Input label="Public contact email" type="email" value={form.contact_email} onChange={(value) => set("contact_email", value)} required placeholder="Customer-facing support email" />
            <div className="border border-[var(--ff-card-border)] p-4 bg-[var(--ff-surface-bg)]">
              <p className="text-[var(--ff-muted-text)] text-xs uppercase tracking-widest mb-1">Store URL preview</p>
              <p className="font-bold break-all">/creators/{slugify(form.store_name) || "your-store-name"}</p>
              <p className="text-[var(--ff-muted-text)] text-xs mt-2">The final address is generated from the store name and must remain unique.</p>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="space-y-4">
            <div>
              <p className="overline mb-2">Step 3</p>
              <h2 className="font-display text-3xl uppercase">Choose your creator plan</h2>
              <p className="text-[var(--ff-muted-text)] text-sm mt-2">
                Review the included features and any recurring charge before continuing. Payment is completed through the enabled secure billing provider when required.
              </p>
            </div>
            {plans.length > 0 ? (
              <PlanSelector plans={plans} value={form.plan_id} onChange={(value) => set("plan_id", value)} />
            ) : (
              <div className="card">
                <h3 className="font-display text-2xl uppercase mb-2">Launch access</h3>
                <p className="text-sm text-[var(--ff-muted-text)]">No paid creator plans are currently being offered through signup. You can continue with the available launch access.</p>
              </div>
            )}
          </section>
        )}

        {step === 4 && (
          <section className="card">
            <p className="overline mb-2">Step 4</p>
            <h2 className="font-display text-3xl uppercase mb-4">Review your store</h2>
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <Summary label="Owner" value={form.name || "—"} />
              <Summary label="Store" value={form.store_name || "—"} />
              <Summary label="Category" value={form.category || "—"} />
              <Summary label="Plan" value={selectedPlan?.name || "Launch access"} />
            </div>

            <p className="text-[var(--ff-muted-text)] text-sm mt-5">
              Creating the store establishes your creator account and storefront. A paid plan will redirect you to the enabled secure billing provider. Products remain subject to review, and earnings are governed by the Payout Policy.
            </p>

            <label className="flex gap-3 items-start text-sm text-[var(--ff-muted-text)] mt-5 border border-[var(--ff-card-border)] p-4">
              <input
                type="checkbox"
                className="mt-1"
                checked={acceptedTerms}
                onChange={(event) => setAcceptedTerms(event.target.checked)}
                required
              />
              <span>
                I confirm that I am authorised to create this store and agree to the <Link to="/creator-terms" className="text-[var(--ff-primary)] underline">Creator Terms</Link>, <Link to="/prohibited-content" className="text-[var(--ff-primary)] underline">Prohibited Content Policy</Link> and <Link to="/payout-policy" className="text-[var(--ff-primary)] underline">Payout Policy</Link>. I acknowledge the <Link to="/privacy-policy" className="text-[var(--ff-primary)] underline">Privacy Policy</Link>.
              </span>
            </label>
          </section>
        )}

        <div className="flex justify-between gap-3">
          <button type="button" className="btn-secondary" disabled={step === 1 || loading} onClick={() => setStep((current) => Math.max(1, current - 1))}>
            Back
          </button>
          {step < 4 ? (
            <button type="button" className="btn-primary" onClick={nextStep}>Next</button>
          ) : (
            <button type="submit" className="btn-primary" disabled={loading || !acceptedTerms}>
              {loading ? "Creating…" : "Create Store"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function Input({ label, value, onChange, type = "text", required = false, placeholder = "", autoComplete = "" }) {
  return (
    <div>
      <label className="label">{label}{required ? " *" : ""}</label>
      <input
        className="input-base"
        type={type}
        value={value || ""}
        required={required}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function PasswordInput({ label, value, onChange, required = false, show, onToggle }) {
  return (
    <div>
      <label className="label">{label}{required ? " *" : ""}</label>
      <div className="relative">
        <input
          className="input-base pr-24"
          type={show ? "text" : "password"}
          value={value || ""}
          required={required}
          minLength={8}
          autoComplete="new-password"
          onChange={(event) => onChange(event.target.value)}
        />
        <button type="button" onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs uppercase tracking-widest text-[var(--ff-muted-text)] hover:text-[var(--ff-primary)]">
          {show ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}

function Summary({ label, value }) {
  return (
    <div className="border border-[var(--ff-card-border)] p-4">
      <p className="text-[var(--ff-muted-text)] text-xs uppercase tracking-widest mb-1">{label}</p>
      <p className="font-bold">{value}</p>
    </div>
  );
}
