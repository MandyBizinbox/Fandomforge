import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { http } from "../../lib/api";

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
const capabilityOptions = ["Apparel", "Mugs & drinkware", "Caps", "Paper Printing"];
const turnaroundOptions = ["1-2 working days", "2-3 working days", "3-5 working days"];

export default function PrinterSettings() {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    http.get("/printers/me").then((res) => setForm(res.data || {})).catch((err) => toast.error(err.response?.data?.detail || "Could not load printer profile"));
  }, []);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const toggleArray = (key, value) => setForm((current) => {
    const list = Array.isArray(current?.[key]) ? current[key] : [];
    return { ...current, [key]: list.includes(value) ? list.filter((item) => item !== value) : [...list, value] };
  });

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        company_name: form.company_name || form.trading_name || form.business_name || "",
        contact_email: form.contact_email || "",
        phone: form.phone || "",
        location: form.location || "",
        capabilities: form.capabilities || [],
        print_methods: form.print_methods || [],
        area_tags: form.area_tags || [],
        capability_matrix: (form.print_methods || []).flatMap((method_key) => (form.area_tags || []).map((area_tag) => ({ method_key, area_tag, active: true, turnaround_time: form.turnaround_time || "", notes: "" }))),
        turnaround_time: form.turnaround_time || "",
        business_name: form.business_name || "",
        trading_name: form.trading_name || "",
        contact_person: form.contact_person || "",
        whatsapp: form.whatsapp || "",
        address: form.address || "",
        city: form.city || "",
        province: form.province || "",
        postal_code: form.postal_code || "",
        vat_registered: !!form.vat_registered,
      };
      const res = await http.patch("/printers/me", payload);
      setForm(res.data || payload);
      toast.success("Printer settings saved");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not save printer settings");
    } finally {
      setSaving(false);
    }
  };

  if (!form) return <div className="overline">Loading printer settings…</div>;

  return (
    <div className="space-y-6" data-testid="printer-settings-page">
      <div>
        <p className="overline mb-2">Printer profile</p>
        <h1 className="font-display text-5xl uppercase">Settings</h1>
        <p className="text-zinc-400 mt-2 max-w-3xl">Update your business details, production capabilities and print methods. Pudo and BobGo accounts are required for fulfilment.</p>
      </div>

      <section className="card grid md:grid-cols-2 gap-4">
        <div className="md:col-span-2"><p className="overline mb-2">Business details</p><h2 className="font-display text-3xl uppercase">Contact information</h2></div>
        <Input label="Registered business name" value={form.business_name || ""} onChange={(v)=>set("business_name", v)} />
        <Input label="Trading name" value={form.trading_name || ""} onChange={(v)=>set("trading_name", v)} />
        <Input label="Display company name" value={form.company_name || ""} onChange={(v)=>set("company_name", v)} />
        <Input label="Contact person" value={form.contact_person || ""} onChange={(v)=>set("contact_person", v)} />
        <Input label="Business email" type="email" value={form.contact_email || ""} onChange={(v)=>set("contact_email", v)} />
        <Input label="Business phone" value={form.phone || ""} onChange={(v)=>set("phone", v)} />
        <Input label="WhatsApp" value={form.whatsapp || ""} onChange={(v)=>set("whatsapp", v)} />
        <Input label="Location label" value={form.location || ""} onChange={(v)=>set("location", v)} placeholder="Cape Town, Western Cape" />
        <Input label="Address" value={form.address || ""} onChange={(v)=>set("address", v)} />
        <Input label="City" value={form.city || ""} onChange={(v)=>set("city", v)} />
        <Input label="Province" value={form.province || ""} onChange={(v)=>set("province", v)} />
        <Input label="Postal code" value={form.postal_code || ""} onChange={(v)=>set("postal_code", v)} />
        <label className="card flex items-center justify-between md:col-span-2"><span>VAT registered</span><input type="checkbox" checked={!!form.vat_registered} onChange={(e)=>set("vat_registered", e.target.checked)} /></label>
      </section>

      <section className="card grid gap-4">
        <div><p className="overline mb-2">Production setup</p><h2 className="font-display text-3xl uppercase">Capabilities & methods</h2></div>
        <div>
          <label className="label">Turnaround time</label>
          <select className="input-base max-w-md" value={form.turnaround_time || ""} onChange={(e)=>set("turnaround_time", e.target.value)}>
            <option value="">Select turnaround time</option>
            {turnaroundOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Capabilities</label>
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-2">
            {capabilityOptions.map((option) => <CheckboxButton key={option} label={option} checked={(form.capabilities || []).includes(option)} onClick={()=>toggleArray("capabilities", option)} />)}
          </div>
        </div>
        <div>
          <label className="label">Print methods</label>
          <div className="flex flex-wrap gap-2">
            {methodOptions.map((option) => <CheckboxButton key={option.key} label={option.label} checked={(form.print_methods || []).includes(option.key)} onClick={()=>toggleArray("print_methods", option.key)} />)}
          </div>
        </div>
        <div>
          <label className="label">Production area tags</label>
          <div className="flex flex-wrap gap-2">
            {areaTagOptions.map((option) => <CheckboxButton key={option.key} label={option.label} checked={(form.area_tags || []).includes(option.key)} onClick={()=>toggleArray("area_tags", option.key)} />)}
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <button type="button" className="btn-primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save printer settings"}</button>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type="text", placeholder="" }) { return <div><label className="label">{label}</label><input className="input-base" type={type} value={value || ""} placeholder={placeholder} onChange={(e)=>onChange(e.target.value)} /></div>; }
function CheckboxButton({ label, checked, onClick }) { return <button type="button" onClick={onClick} className={`px-3 py-2 border text-xs uppercase tracking-widest ${checked ? "border-[#FF3B30] bg-[#FF3B30]/10" : "border-white/15 text-zinc-400"}`}>{checked ? "✓ " : ""}{label}</button>; }
