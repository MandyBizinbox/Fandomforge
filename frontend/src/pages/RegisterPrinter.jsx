import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import Navbar from "../components/Navbar";
import { http } from "../lib/api";
import { usePlatformConfig } from "../lib/platform";
import PlanSelector from "../components/signup/PlanSelector";

const capabilityOptions = ["Apparel", "Mugs & drinkware", "Caps", "Paper Printing"];
const methodOptions = [
  { key: "dtf", label: "DTF" },
  { key: "dtg", label: "DTG" },
  { key: "screen_print", label: "Screen Print" },
  { key: "sublimation", label: "Sublimation" },
  { key: "embroidery", label: "Embroidery" },
  { key: "vinyl", label: "Vinyl" },
  { key: "laser", label: "Laser" },
  { key: "uv_print", label: "UV Print" },
];
const areaTagOptions = [
  { key: "front", label: "Front" },
  { key: "back", label: "Back" },
  { key: "sleeve", label: "Sleeve" },
  { key: "neck_label", label: "Neck Label" },
  { key: "pocket", label: "Pocket" },
];
const turnaroundOptions = ["1-2 working days", "2-3 working days", "3-5 working days"];

function getCheckoutUrl(data) {
  const url = data?.checkout_url || data?.authorization_url || data?.payment_url || data?.billing_checkout_url || data?.redirect_to;
  if (typeof url === "string" && /^https?:\/\//i.test(url)) return url;
  return "";
}

export default function RegisterPrinter() {
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
    turnaround_time: "2-3 working days",
    vat_registered: false,
    plan_id: "",
  });

  const modules = platform.modules || {};
  const signupEnabled = platform.signup?.printer_signup_enabled !== false && modules.printers_enabled !== false && modules.printer_marketplace_enabled !== false && !modules.sole_printer_mode;

  useEffect(() => {
    http
      .get("/public/subscription-plans?audience=printer")
      .then((res) => {
        const rows = Array.isArray(res.data) ? res.data : [];
        setPlans(rows);
        if (rows.length) setForm((f) => ({ ...f, plan_id: f.plan_id || rows[0].id }));
      })
      .catch(() => setPlans([]));
  }, []);

  const selectedPlan = useMemo(() => plans.find((p) => p.id === form.plan_id), [plans, form.plan_id]);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const toggleArrayValue = (key, value) => setForm((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((m) => m !== value) : [...f[key], value] }));

  const nextStep = () => {
    if (step === 1 && (!form.name.trim() || !form.email.trim() || !form.password || !form.confirm)) return toast.error("Please complete the owner login fields.");
    if (step === 1 && form.password !== form.confirm) return toast.error("Passwords do not match");
    if (step === 2 && (!form.business_name.trim() || !form.contact_email.trim() || !form.turnaround_time || form.capabilities.length === 0)) return toast.error("Please complete the required business fields.");
    setStep((current) => Math.min(4, current + 1));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) return toast.error("Passwords do not match");
    setLoading(true);
    try {
      const res = await http.post("/public/signup/printer", {
        user: { name: form.name, email: form.email, phone: form.phone, password: form.password },
        business_name: form.business_name,
        trading_name: form.trading_name,
        contact_person: form.contact_person || form.name,
        contact_email: form.contact_email || form.email,
        phone: form.business_phone || form.phone,
        whatsapp: form.whatsapp || form.phone,
        address: form.address,
        city: form.city,
        province: form.province,
        postal_code: form.postal_code,
        capabilities: form.capabilities,
        print_methods: form.print_methods,
        area_tags: form.area_tags,
        capability_matrix: form.print_methods.flatMap((method_key) => form.area_tags.map((area_tag) => ({ method_key, area_tag, active: true, turnaround_time: form.turnaround_time, notes: "" }))),
        turnaround_time: form.turnaround_time,
        collection_delivery: "BobGo and Pudo account required",
        vat_registered: form.vat_registered,
        plan_id: form.plan_id || null,
        callback_url: `${window.location.origin}/printer?billing=paystack`,
      });

      const checkoutUrl = getCheckoutUrl(res.data);
      if (checkoutUrl) {
        toast.success("Printer account created. Redirecting to Paystack…");
        window.location.assign(checkoutUrl);
        return;
      }

      if (res.data?.access_token) localStorage.setItem("mf_token", res.data.access_token);
      if (res.data?.billing_error) {
        toast.warning(`Printer account created, but billing needs attention: ${res.data.billing_error}`);
        navigate("/printer");
        return;
      }
      toast.success(res.data?.status === "pending_approval" ? "Application submitted and pending approval" : "Printer account created");
      navigate(res.data?.redirect_to || "/printer");
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Printer signup failed");
    } finally {
      setLoading(false);
    }
  };

  if (!signupEnabled) return <div className="min-h-screen page-shell"><Navbar /><div className="pt-32 max-w-2xl mx-auto px-6"><div className="card"><p className="overline mb-2">Printer signup closed</p><h1 className="font-display text-4xl uppercase">Printer applications are not available</h1><p className="text-[var(--ff-muted-text)] mt-3">This platform may be running in sole-printer mode.</p></div></div></div>;

  return (
    <div className="min-h-screen page-shell">
      <Navbar />
      <form onSubmit={submit} className="pt-28 pb-16 max-w-5xl mx-auto px-6 md:px-10 space-y-8">
        <div><p className="overline mb-2">Printer onboarding</p><h1 className="font-display text-5xl uppercase">Apply as production partner</h1><p className="text-[var(--ff-muted-text)] mt-2">Create your login and production profile. You will need active Pudo and BobGo accounts for routed orders.</p></div>
        <div className="flex flex-wrap gap-2">{[1,2,3,4].map((n) => <button key={n} type="button" onClick={() => setStep(n)} className={`px-4 py-2 border text-xs uppercase tracking-widest ${step===n?"border-[var(--ff-primary)]":"border-[var(--ff-card-border)] text-[var(--ff-muted-text)]"}`}>Step {n}</button>)}</div>
        {step === 1 && <section className="card grid md:grid-cols-2 gap-4"><div className="md:col-span-2"><p className="overline mb-2">Step 1</p><h2 className="font-display text-3xl uppercase">Owner login</h2></div><Input label="Full name" value={form.name} onChange={(v)=>set("name",v)} required /><Input label="Email" type="email" value={form.email} onChange={(v)=>set("email",v)} required /><Input label="Phone / WhatsApp" value={form.phone} onChange={(v)=>set("phone",v)} /><PasswordInput label="Password" value={form.password} onChange={(v)=>set("password",v)} required show={showPassword} onToggle={()=>setShowPassword((v)=>!v)} /><PasswordInput label="Confirm password" value={form.confirm} onChange={(v)=>set("confirm",v)} required show={showPassword} onToggle={()=>setShowPassword((v)=>!v)} /></section>}
        {step === 2 && <section className="card grid md:grid-cols-2 gap-4"><div className="md:col-span-2"><p className="overline mb-2">Step 2</p><h2 className="font-display text-3xl uppercase">Business profile</h2></div><Input label="Registered business name" value={form.business_name} onChange={(v)=>set("business_name",v)} required /><Input label="Trading name" value={form.trading_name} onChange={(v)=>set("trading_name",v)} /><Input label="Contact person" value={form.contact_person} onChange={(v)=>set("contact_person",v)} /><Input label="Business email" type="email" value={form.contact_email} onChange={(v)=>set("contact_email",v)} required /><Input label="Business phone" value={form.business_phone} onChange={(v)=>set("business_phone",v)} /><Input label="WhatsApp" value={form.whatsapp} onChange={(v)=>set("whatsapp",v)} /><Input label="City" value={form.city} onChange={(v)=>set("city",v)} /><Input label="Province" value={form.province} onChange={(v)=>set("province",v)} /><div><label className="label">Turnaround time *</label><select className="input-base" value={form.turnaround_time} onChange={(e)=>set("turnaround_time",e.target.value)}>{turnaroundOptions.map((opt)=><option key={opt} value={opt}>{opt}</option>)}</select></div><div className="border border-[var(--ff-card-border)] p-4 bg-[var(--ff-surface-bg)]"><p className="text-[var(--ff-muted-text)] text-sm">Collection / Delivery</p><p className="font-bold mt-1">Pudo and BobGo accounts required</p></div><div className="md:col-span-2"><label className="label">Capabilities *</label><div className="flex flex-wrap gap-2">{capabilityOptions.map((m)=><button type="button" key={m} onClick={()=>toggleArrayValue("capabilities",m)} className={`px-3 py-2 border text-xs uppercase tracking-widest ${form.capabilities.includes(m)?"border-[var(--ff-primary)]":"border-[var(--ff-card-border)] text-[var(--ff-muted-text)]"}`}>{m}</button>)}</div></div><div className="md:col-span-2"><label className="label">Print methods</label><div className="flex flex-wrap gap-2">{methodOptions.map((m)=><button type="button" key={m.key} onClick={()=>toggleArrayValue("print_methods",m.key)} className={`px-3 py-2 border text-xs uppercase tracking-widest ${form.print_methods.includes(m.key)?"border-[var(--ff-primary)]":"border-[var(--ff-card-border)] text-[var(--ff-muted-text)]"}`}>{m.label}</button>)}</div></div><div className="md:col-span-2"><label className="label">Production area tags</label><div className="flex flex-wrap gap-2">{areaTagOptions.map((m)=><button type="button" key={m.key} onClick={()=>toggleArrayValue("area_tags",m.key)} className={`px-3 py-2 border text-xs uppercase tracking-widest ${form.area_tags.includes(m.key)?"border-[var(--ff-primary)]":"border-[var(--ff-card-border)] text-[var(--ff-muted-text)]"}`}>{m.label}</button>)}</div></div><label className="card flex items-center justify-between md:col-span-2"><span>VAT registered</span><input type="checkbox" checked={form.vat_registered} onChange={(e)=>set("vat_registered",e.target.checked)} /></label></section>}
        {step === 3 && <section className="space-y-4"><div><p className="overline mb-2">Step 3</p><h2 className="font-display text-3xl uppercase">Choose subscription</h2></div><PlanSelector plans={plans} value={form.plan_id} onChange={(v)=>set("plan_id",v)} /></section>}
        {step === 4 && <section className="card"><p className="overline mb-2">Step 4</p><h2 className="font-display text-3xl uppercase mb-4">Review application</h2><div className="grid md:grid-cols-4 gap-4 text-sm"><Summary label="Owner" value={form.name || "—"}/><Summary label="Business" value={form.trading_name || form.business_name || "—"}/><Summary label="Turnaround" value={form.turnaround_time || "—"}/><Summary label="Plan" value={selectedPlan?.name || "No plan selected"}/></div><p className="text-[var(--ff-muted-text)] text-sm mt-5">When you submit, we will create your printer account. Paid plans will redirect to Paystack to complete recurring billing.</p></section>}
        <div className="flex justify-between gap-3"><button type="button" className="btn-secondary" onClick={()=>setStep(Math.max(1,step-1))}>Back</button>{step<4?<button type="button" className="btn-primary" onClick={nextStep}>Next</button>:<button className="btn-primary" disabled={loading}>{loading?"Submitting…":"Submit printer application"}</button>}</div>
      </form>
    </div>
  );
}
function Input({ label, value, onChange, type="text", required=false, placeholder="" }) { return <div><label className="label">{label}{required ? " *" : ""}</label><input className="input-base" type={type} value={value || ""} required={required} placeholder={placeholder} onChange={(e)=>onChange(e.target.value)} /></div>; }
function PasswordInput({ label, value, onChange, required=false, show, onToggle }) { return <div><label className="label">{label}{required ? " *" : ""}</label><div className="relative"><input className="input-base pr-24" type={show ? "text" : "password"} value={value || ""} required={required} onChange={(e)=>onChange(e.target.value)} /><button type="button" onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs uppercase tracking-widest text-[var(--ff-muted-text)] hover:text-[var(--ff-primary)]">{show ? "Hide" : "Show"}</button></div></div>; }
function Summary({ label, value }) { return <div className="border border-[var(--ff-card-border)] p-4"><p className="text-[var(--ff-muted-text)] text-xs uppercase tracking-widest mb-1">{label}</p><p className="font-bold">{value}</p></div>; }
