import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import Navbar from "../components/Navbar";
import { http } from "../lib/api";
import { setAuthToken } from "../lib/authToken";
import { usePlatformConfig } from "../lib/platform";
import PlanSelector from "../components/signup/PlanSelector";

const STEP_LABELS = ["Owner account", "Business profile", "Plan", "Review"];
const capabilityOptions = ["Apparel", "Mugs & drinkware", "Caps", "Paper printing"];
const methodOptions = [
  { key: "dtf", label: "DTF" },
  { key: "dtg", label: "DTG" },
  { key: "screen_print", label: "Screen printing" },
  { key: "sublimation", label: "Sublimation" },
  { key: "embroidery", label: "Embroidery" },
  { key: "vinyl", label: "Vinyl" },
  { key: "laser", label: "Laser" },
  { key: "uv_print", label: "UV printing" },
];
const areaTagOptions = [
  { key: "front", label: "Front" },
  { key: "back", label: "Back" },
  { key: "sleeve", label: "Sleeve" },
  { key: "neck_label", label: "Neck label" },
  { key: "pocket", label: "Pocket" },
];
const turnaroundOptions = ["1–2 working days", "2–3 working days", "3–5 working days"];

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function getCheckoutUrl(data) {
  const url = data?.checkout_url || data?.authorization_url || data?.payment_url || data?.billing_checkout_url || data?.redirect_to;
  return typeof url === "string" && /^https?:\/\//i.test(url) ? url : "";
}

export default function RegisterPrinter() {
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
    business_name: "",
    trading_name: "",
    contact_person: "",
    contact_email: "",
    business_phone: "",
    whatsapp: "",
    address: "",
    city: "",
    province: "",
    postal_code: "",
    capabilities: [],
    print_methods: [],
    area_tags: [],
    turnaround_time: "2–3 working days",
    vat_registered: false,
    plan_id: "",
  });

  const modules = platform.modules || {};
  const signupEnabled = platform.signup?.printer_signup_enabled !== false && modules.printers_enabled !== false && modules.printer_marketplace_enabled !== false && !modules.sole_printer_mode;

  useEffect(() => {
    http.get("/public/subscription-plans?audience=printer")
      .then((response) => {
        const rows = Array.isArray(response.data) ? response.data : [];
        setPlans(rows);
        if (rows.length) setForm((current) => ({ ...current, plan_id: current.plan_id || rows[0].id }));
      })
      .catch(() => setPlans([]));
  }, []);

  const selectedPlan = useMemo(() => plans.find((plan) => plan.id === form.plan_id), [plans, form.plan_id]);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const toggleArrayValue = (key, value) => setForm((current) => ({
    ...current,
    [key]: current[key].includes(value) ? current[key].filter((item) => item !== value) : [...current[key], value],
  }));

  const validateCurrentStep = () => {
    if (step === 1) {
      if (!form.name.trim() || !form.email.trim() || !form.password || !form.confirm) return "Complete all required owner-account fields.";
      if (!isValidEmail(form.email)) return "Enter a valid owner email address.";
      if (form.password.length < 8) return "Use a password with at least 8 characters.";
      if (form.password !== form.confirm) return "Passwords do not match.";
    }

    if (step === 2) {
      if (!form.business_name.trim() || !form.contact_email.trim() || !form.turnaround_time || form.capabilities.length === 0) return "Complete the required business and capability fields.";
      if (!isValidEmail(form.contact_email)) return "Enter a valid business contact email.";
      if (!form.city.trim() || !form.province.trim()) return "Enter the business city and province.";
    }

    if (step === 3 && plans.length > 0 && !form.plan_id) return "Choose a production-partner plan.";
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

    if (!acceptedTerms) return toast.error("Accept the Production Partner Terms and Privacy Policy before submitting.");
    if (form.password !== form.confirm) return toast.error("Passwords do not match.");
    if (form.password.length < 8) return toast.error("Use a password with at least 8 characters.");
    if (plans.length > 0 && !form.plan_id) return toast.error("Choose a production-partner plan.");

    setLoading(true);
    try {
      const response = await http.post("/public/signup/printer", {
        user: { name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), password: form.password },
        business_name: form.business_name.trim(),
        trading_name: form.trading_name.trim(),
        contact_person: form.contact_person.trim() || form.name.trim(),
        contact_email: form.contact_email.trim() || form.email.trim(),
        phone: form.business_phone.trim() || form.phone.trim(),
        whatsapp: form.whatsapp.trim() || form.phone.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        province: form.province.trim(),
        postal_code: form.postal_code.trim(),
        capabilities: form.capabilities,
        print_methods: form.print_methods,
        area_tags: form.area_tags,
        capability_matrix: form.print_methods.flatMap((methodKey) => form.area_tags.map((areaTag) => ({ method_key: methodKey, area_tag: areaTag, active: true, turnaround_time: form.turnaround_time, notes: "" }))),
        turnaround_time: form.turnaround_time,
        collection_delivery: "BobGo and Pudo account required",
        vat_registered: form.vat_registered,
        plan_id: form.plan_id || null,
        callback_url: `${window.location.origin}/printer?billing=paystack`,
      });

      const checkoutUrl = getCheckoutUrl(response.data);
      if (checkoutUrl) {
        toast.success("Application created. Redirecting to secure billing…");
        window.location.assign(checkoutUrl);
        return;
      }

      if (response.data?.access_token) setAuthToken(response.data.access_token);
      if (response.data?.billing_error) {
        toast.warning("Your application was created, but billing setup still needs attention.");
        navigate("/printer?billing=attention");
        return;
      }

      toast.success(response.data?.status === "pending_approval" ? "Application submitted for approval." : "Production-partner account created.");
      navigate(response.data?.redirect_to || "/printer");
    } catch (error) {
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "The production-partner application could not be submitted.");
    } finally {
      setLoading(false);
    }
  };

  if (!signupEnabled) {
    return (
      <div className="min-h-screen page-shell">
        <Navbar />
        <main className="pt-32 max-w-2xl mx-auto px-4 sm:px-6">
          <div className="card">
            <p className="overline mb-2">Production partners</p>
            <h1 className="font-display text-4xl uppercase">Online applications are temporarily unavailable</h1>
            <p className="text-[var(--ff-muted-text)] mt-3 mb-5">Contact FandomForge to ask about current production-partner opportunities.</p>
            <Link to="/contact" className="btn-primary">Contact Support</Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen page-shell">
      <Navbar />
      <form onSubmit={submit} className="pt-28 pb-16 max-w-5xl mx-auto px-4 sm:px-6 md:px-10 space-y-8">
        <header>
          <p className="overline mb-2">Production-partner application</p>
          <h1 className="font-display text-5xl uppercase">Apply to fulfil FandomForge orders</h1>
          <p className="text-[var(--ff-muted-text)] mt-2 max-w-3xl">Tell us who you are, where you operate and which production methods you can support. Applications are reviewed before production work is assigned.</p>
        </header>

        <ol className="grid grid-cols-2 md:grid-cols-4 gap-2" aria-label="Application progress">
          {STEP_LABELS.map((label, index) => {
            const number = index + 1;
            return (
              <li key={label} className={`px-4 py-3 border text-xs uppercase tracking-widest ${step === number ? "border-[var(--ff-primary)]" : step > number ? "border-[var(--ff-card-border)] text-[var(--ff-primary)]" : "border-[var(--ff-card-border)] text-[var(--ff-muted-text)]"}`}>
                <span className="block font-bold">Step {number}</span>
                <span className="block mt-1">{label}</span>
              </li>
            );
          })}
        </ol>

        {step === 1 && (
          <section className="card grid md:grid-cols-2 gap-4">
            <div className="md:col-span-2"><p className="overline mb-2">Step 1</p><h2 className="font-display text-3xl uppercase">Account owner</h2><p className="text-sm text-[var(--ff-muted-text)] mt-2">These details create the primary login responsible for the production account.</p></div>
            <Input label="Full name" value={form.name} onChange={(value) => set("name", value)} required autoComplete="name" />
            <Input label="Email" type="email" value={form.email} onChange={(value) => set("email", value)} required autoComplete="email" />
            <Input label="Phone / WhatsApp" type="tel" value={form.phone} onChange={(value) => set("phone", value)} autoComplete="tel" />
            <PasswordInput label="Password" value={form.password} onChange={(value) => set("password", value)} required show={showPassword} onToggle={() => setShowPassword((current) => !current)} />
            <PasswordInput label="Confirm password" value={form.confirm} onChange={(value) => set("confirm", value)} required show={showPassword} onToggle={() => setShowPassword((current) => !current)} />
          </section>
        )}

        {step === 2 && (
          <section className="card grid md:grid-cols-2 gap-4">
            <div className="md:col-span-2"><p className="overline mb-2">Step 2</p><h2 className="font-display text-3xl uppercase">Business and production profile</h2></div>
            <Input label="Registered business name" value={form.business_name} onChange={(value) => set("business_name", value)} required />
            <Input label="Trading name" value={form.trading_name} onChange={(value) => set("trading_name", value)} />
            <Input label="Contact person" value={form.contact_person} onChange={(value) => set("contact_person", value)} />
            <Input label="Business email" type="email" value={form.contact_email} onChange={(value) => set("contact_email", value)} required />
            <Input label="Business phone" type="tel" value={form.business_phone} onChange={(value) => set("business_phone", value)} />
            <Input label="WhatsApp" type="tel" value={form.whatsapp} onChange={(value) => set("whatsapp", value)} />
            <Input label="Street address" value={form.address} onChange={(value) => set("address", value)} />
            <Input label="Postal code" value={form.postal_code} onChange={(value) => set("postal_code", value)} />
            <Input label="City / Town" value={form.city} onChange={(value) => set("city", value)} required />
            <Input label="Province" value={form.province} onChange={(value) => set("province", value)} required />
            <div><label className="label">Standard turnaround time *</label><select className="input-base" value={form.turnaround_time} onChange={(event) => set("turnaround_time", event.target.value)}>{turnaroundOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></div>
            <div className="border border-[var(--ff-card-border)] p-4 bg-[var(--ff-surface-bg)]"><p className="text-[var(--ff-muted-text)] text-xs uppercase tracking-widest">Order routing</p><p className="font-bold mt-1">Active Pudo and BobGo accounts are required for routed orders.</p></div>

            <ChoiceGroup label="Capabilities *" options={capabilityOptions.map((label) => ({ key: label, label }))} selected={form.capabilities} onToggle={(value) => toggleArrayValue("capabilities", value)} />
            <ChoiceGroup label="Production methods" options={methodOptions} selected={form.print_methods} onToggle={(value) => toggleArrayValue("print_methods", value)} />
            <ChoiceGroup label="Production area tags" options={areaTagOptions} selected={form.area_tags} onToggle={(value) => toggleArrayValue("area_tags", value)} />

            <label className="border border-[var(--ff-card-border)] p-4 flex items-center justify-between md:col-span-2"><span>VAT registered</span><input type="checkbox" checked={form.vat_registered} onChange={(event) => set("vat_registered", event.target.checked)} /></label>
          </section>
        )}

        {step === 3 && (
          <section className="space-y-4">
            <div><p className="overline mb-2">Step 3</p><h2 className="font-display text-3xl uppercase">Choose production-partner plan</h2><p className="text-sm text-[var(--ff-muted-text)] mt-2">Review the plan, capabilities and any recurring charge before continuing.</p></div>
            {plans.length > 0 ? <PlanSelector plans={plans} value={form.plan_id} onChange={(value) => set("plan_id", value)} /> : <div className="card"><h3 className="font-display text-2xl uppercase mb-2">Application access</h3><p className="text-sm text-[var(--ff-muted-text)]">No paid production-partner plan is currently required through this application.</p></div>}
          </section>
        )}

        {step === 4 && (
          <section className="card">
            <p className="overline mb-2">Step 4</p>
            <h2 className="font-display text-3xl uppercase mb-4">Review application</h2>
            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm"><Summary label="Owner" value={form.name || "—"} /><Summary label="Business" value={form.trading_name || form.business_name || "—"} /><Summary label="Turnaround" value={form.turnaround_time || "—"} /><Summary label="Plan" value={selectedPlan?.name || "Application access"} /></div>
            <p className="text-[var(--ff-muted-text)] text-sm mt-5">Submitting creates the production-partner account and sends it into the configured approval process. Paid plans redirect to the enabled secure billing provider.</p>
            <label className="flex gap-3 items-start text-sm text-[var(--ff-muted-text)] mt-5 border border-[var(--ff-card-border)] p-4">
              <input type="checkbox" className="mt-1" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} required />
              <span>I confirm that the business and capability information is accurate and agree to the <Link to="/printer-terms" className="text-[var(--ff-primary)] underline">Production Partner Terms</Link>. I acknowledge the <Link to="/privacy-policy" className="text-[var(--ff-primary)] underline">Privacy Policy</Link>.</span>
            </label>
          </section>
        )}

        <div className="flex justify-between gap-3">
          <button type="button" className="btn-secondary" disabled={step === 1 || loading} onClick={() => setStep((current) => Math.max(1, current - 1))}>Back</button>
          {step < 4 ? <button type="button" className="btn-primary" onClick={nextStep}>Next</button> : <button type="submit" className="btn-primary" disabled={loading || !acceptedTerms}>{loading ? "Submitting…" : "Submit application"}</button>}
        </div>
      </form>
    </div>
  );
}

function Input({ label, value, onChange, type = "text", required = false, placeholder = "", autoComplete = "" }) {
  return <div><label className="label">{label}{required ? " *" : ""}</label><input className="input-base" type={type} value={value || ""} required={required} placeholder={placeholder} autoComplete={autoComplete} onChange={(event) => onChange(event.target.value)} /></div>;
}

function PasswordInput({ label, value, onChange, required = false, show, onToggle }) {
  return <div><label className="label">{label}{required ? " *" : ""}</label><div className="relative"><input className="input-base pr-24" type={show ? "text" : "password"} minLength={8} autoComplete="new-password" value={value || ""} required={required} onChange={(event) => onChange(event.target.value)} /><button type="button" onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs uppercase tracking-widest text-[var(--ff-muted-text)] hover:text-[var(--ff-primary)]">{show ? "Hide" : "Show"}</button></div></div>;
}

function ChoiceGroup({ label, options, selected, onToggle }) {
  return <div className="md:col-span-2"><label className="label">{label}</label><div className="flex flex-wrap gap-2">{options.map((option) => <button type="button" key={option.key} onClick={() => onToggle(option.key)} aria-pressed={selected.includes(option.key)} className={`px-3 py-2 border text-xs uppercase tracking-widest ${selected.includes(option.key) ? "border-[var(--ff-primary)]" : "border-[var(--ff-card-border)] text-[var(--ff-muted-text)]"}`}>{option.label}</button>)}</div></div>;
}

function Summary({ label, value }) {
  return <div className="border border-[var(--ff-card-border)] p-4"><p className="text-[var(--ff-muted-text)] text-xs uppercase tracking-widest mb-1">{label}</p><p className="font-bold">{value}</p></div>;
}
