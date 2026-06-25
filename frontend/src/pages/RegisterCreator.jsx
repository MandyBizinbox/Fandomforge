import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import Navbar from "../components/Navbar";
import { http } from "../lib/api";
import { usePlatformConfig } from "../lib/platform";
import PlanSelector from "../components/signup/PlanSelector";

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-");
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
      .then((res) => {
        const rows = Array.isArray(res.data) ? res.data : [];
        setPlans(rows);
        if (rows.length) setForm((f) => ({ ...f, plan_id: f.plan_id || rows[0].id }));
      })
      .catch(() => setPlans([]));
  }, []);

  const selectedPlan = useMemo(() => plans.find((p) => p.id === form.plan_id), [plans, form.plan_id]);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const canContinue = () => {
    if (step === 1) return form.name.trim() && form.email.trim() && form.password && form.confirm;
    if (step === 2) return form.store_name.trim() && form.category.trim() && form.contact_email.trim();
    return true;
  };

  const nextStep = () => {
    if (!canContinue()) {
      toast.error("Please complete the required fields before continuing.");
      return;
    }
    if (step === 1 && form.password !== form.confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setStep((current) => Math.min(4, current + 1));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) return toast.error("Passwords do not match");
    if (!form.store_name.trim()) return toast.error("Store name is required");
    if (!form.category.trim()) return toast.error("Category is required");
    if (!form.contact_email.trim()) return toast.error("Contact email is required");

    setLoading(true);
    try {
      const callbackUrl = `${window.location.origin}/creator?billing=paystack`;
      const res = await http.post("/public/signup/creator", {
        user: {
          name: form.name,
          email: form.email,
          phone: form.phone,
          password: form.password,
        },
        creator_name: form.store_name,
        slug: slugify(form.store_name),
        category: form.category,
        contact_email: form.contact_email,
        contact_phone: form.phone,
        bio: "",
        logo_url: "",
        socials: {},
        plan_id: form.plan_id || null,
        callback_url: callbackUrl,
      });

      const checkoutUrl = getCheckoutUrl(res.data);
      if (checkoutUrl) {
        toast.success("Store created. Redirecting to Paystack…");
        window.location.assign(checkoutUrl);
        return;
      }

      if (res.data?.access_token) localStorage.setItem("mf_token", res.data.access_token);

      if (res.data?.billing_error) {
        toast.warning(`Store created, but billing needs attention: ${res.data.billing_error}`);
        navigate("/creator");
        return;
      }

      toast.success(res.data?.status === "pending_approval" ? "Store created and pending approval" : "Store created");
      navigate(res.data?.redirect_to || "/creator");
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Creator signup failed");
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
            <p className="overline mb-2">Signup closed</p>
            <h1 className="font-display text-4xl uppercase">Creator signup is not available</h1>
            <p className="text-[var(--ff-muted-text)] mt-3">Contact support if you need access.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen page-shell">
      <Navbar />
      <form onSubmit={submit} className="pt-28 pb-16 max-w-5xl mx-auto px-6 md:px-10 space-y-8">
        <div>
          <p className="overline mb-2">Creator onboarding</p>
          <h1 className="font-display text-5xl uppercase">Create your merch store</h1>
          <p className="text-[var(--ff-muted-text)] mt-2">Fast setup for creators, clubs and communities. Add branding and full profile details after signup.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setStep(n)}
              className={`px-4 py-2 border text-xs uppercase tracking-widest ${step === n ? "border-[var(--ff-primary)]" : "border-[var(--ff-card-border)] text-[var(--ff-muted-text)]"}`}
            >
              Step {n}
            </button>
          ))}
        </div>

        {step === 1 && (
          <section className="card grid md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <p className="overline mb-2">Step 1</p>
              <h2 className="font-display text-3xl uppercase">Owner login</h2>
              <p className="text-[var(--ff-muted-text)] text-sm mt-2">This creates the main owner account for the store.</p>
            </div>
            <Input label="Full name" value={form.name} onChange={(v) => set("name", v)} required />
            <Input label="Email" type="email" value={form.email} onChange={(v) => set("email", v)} required />
            <Input label="Phone / WhatsApp" value={form.phone} onChange={(v) => set("phone", v)} />
            <PasswordInput label="Password" value={form.password} onChange={(v) => set("password", v)} required show={showPassword} onToggle={() => setShowPassword((v) => !v)} />
            <PasswordInput label="Confirm password" value={form.confirm} onChange={(v) => set("confirm", v)} required show={showPassword} onToggle={() => setShowPassword((v) => !v)} />
          </section>
        )}

        {step === 2 && (
          <section className="card grid md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <p className="overline mb-2">Step 2</p>
              <h2 className="font-display text-3xl uppercase">Store basics</h2>
              <p className="text-[var(--ff-muted-text)] text-sm mt-2">Keep this quick. Logo, bio, socials and product setup can be added from the dashboard.</p>
            </div>
            <Input label="Store Name" value={form.store_name} onChange={(v) => set("store_name", v)} required placeholder="Creator, club, creator or brand name" />
            <Input label="Category" value={form.category} onChange={(v) => set("category", v)} required placeholder="Creator, school, club, creator, influencer..." />
            <Input label="Contact email" type="email" value={form.contact_email} onChange={(v) => set("contact_email", v)} required placeholder="Public/customer contact email" />
            <div className="border border-[var(--ff-card-border)] p-4 bg-[var(--ff-surface-bg)]">
              <p className="text-[var(--ff-muted-text)] text-xs uppercase tracking-widest mb-1">Store URL</p>
              <p className="font-bold break-all">/{slugify(form.store_name) || "your-store-name"}</p>
              <p className="text-[var(--ff-muted-text)] text-xs mt-2">Generated automatically from the store name.</p>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="space-y-4">
            <div>
              <p className="overline mb-2">Step 3</p>
              <h2 className="font-display text-3xl uppercase">Choose subscription</h2>
            </div>
            <PlanSelector plans={plans} value={form.plan_id} onChange={(v) => set("plan_id", v)} />
          </section>
        )}

        {step === 4 && (
          <section className="card">
            <p className="overline mb-2">Step 4</p>
            <h2 className="font-display text-3xl uppercase mb-4">Review your store</h2>
            <div className="grid md:grid-cols-4 gap-4 text-sm">
              <Summary label="Owner" value={form.name || "—"} />
              <Summary label="Store" value={form.store_name || "—"} />
              <Summary label="Category" value={form.category || "—"} />
              <Summary label="Plan" value={selectedPlan?.name || "No plan selected"} />
            </div>
            <p className="text-[var(--ff-muted-text)] text-sm mt-5">
              When you click Create Store, we will create your account and storefront. Paid plans will redirect to Paystack to complete recurring billing.
            </p>
          </section>
        )}

        <div className="flex justify-between gap-3">
          <button type="button" className="btn-secondary" onClick={() => setStep(Math.max(1, step - 1))}>Back</button>
          {step < 4 ? (
            <button type="button" className="btn-primary" onClick={nextStep}>Next</button>
          ) : (
            <button className="btn-primary" disabled={loading}>{loading ? "Creating…" : "Create Store"}</button>
          )}
        </div>
      </form>
    </div>
  );
}

function Input({ label, value, onChange, type = "text", required = false, placeholder = "" }) {
  return (
    <div>
      <label className="label">{label}{required ? " *" : ""}</label>
      <input className="input-base" type={type} value={value || ""} required={required} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function PasswordInput({ label, value, onChange, required = false, show, onToggle }) {
  return (
    <div>
      <label className="label">{label}{required ? " *" : ""}</label>
      <div className="relative">
        <input className="input-base pr-24" type={show ? "text" : "password"} value={value || ""} required={required} onChange={(e) => onChange(e.target.value)} />
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
