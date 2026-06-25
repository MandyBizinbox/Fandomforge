import React, { useEffect, useMemo, useState } from "react";
import { http } from "../../lib/api";
import { toast } from "sonner";

const MASKED_SECRET = "********";

function cloneMethod(method) {
  return {
    key: method.key,
    adapter_key: method.adapter_key || method.key,
    enabled: Boolean(method.enabled),
    display_name: method.display_name || method.key,
    description: method.description || "",
    method_type: method.method_type || "manual",
    sort_order: Number(method.sort_order || 100),
    rate: Number(method.rate || 0),
    free_shipping_threshold: method.free_shipping_threshold ?? "",
    zones: Array.isArray(method.zones) ? method.zones : [],
    public_config: { ...(method.public_config || {}) },
    settings: { ...(method.settings || {}) },
  };
}

function TextInput({ label, value, onChange, placeholder = "", type = "text", help = "" }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input-base" type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {help && <p className="text-xs text-[var(--ff-muted-text)] mt-1">{help}</p>}
    </div>
  );
}

function ToggleRow({ label, checked, onChange, help = "" }) {
  return (
    <label className="flex items-start gap-3 border border-[var(--ff-card-border)] p-3 bg-[var(--ff-card-bg)] cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1" />
      <span>
        <span className="block text-sm font-bold">{label}</span>
        {help && <span className="block text-xs text-[var(--ff-muted-text)] mt-1">{help}</span>}
      </span>
    </label>
  );
}

function CapabilityPill({ active, children }) {
  return (
    <span className={`text-[10px] uppercase tracking-widest border px-2 py-1 ${active ? "border-[#34C759]/50 text-[#34C759]" : "border-[var(--ff-card-border)] text-[var(--ff-muted-text)]"}`}>
      {children}
    </span>
  );
}

function FieldRenderer({ field, value, onChange }) {
  const type = field.type || "text";
  if (type === "textarea") {
    return (
      <div>
        <label className="label">{field.label}</label>
        <textarea className="input-base min-h-[90px]" value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder || ""} />
        {field.help && <p className="text-xs text-[var(--ff-muted-text)] mt-1">{field.help}</p>}
      </div>
    );
  }
  if (type === "checkbox") {
    return <ToggleRow label={field.label} checked={Boolean(value)} onChange={onChange} help={field.help || ""} />;
  }
  if (type === "select") {
    return (
      <div>
        <label className="label">{field.label}</label>
        <select className="input-base" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          {(field.options || []).map((option) => (
            <option key={option.value ?? option.key ?? option.label} value={option.value ?? option.key ?? ""}>{option.label}</option>
          ))}
        </select>
        {field.help && <p className="text-xs text-[var(--ff-muted-text)] mt-1">{field.help}</p>}
      </div>
    );
  }
  return (
    <TextInput
      label={field.label}
      type={type === "number" ? "number" : type === "password" ? "password" : "text"}
      value={value ?? (type === "password" ? MASKED_SECRET : "")}
      onChange={onChange}
      placeholder={field.placeholder || ""}
      help={field.help || ""}
    />
  );
}

function MethodShell({ children, method, adapter, setMethod, saving, save }) {
  return (
    <div className="card space-y-5">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <p className="overline mb-2">Shipping Adapter</p>
          <h2 className="font-display text-3xl uppercase">{method.display_name}</h2>
          <p className="text-sm text-[var(--ff-muted-text)] mt-1">{method.description || adapter?.description || "Configure checkout availability, rates and dispatch behaviour."}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <CapabilityPill active={adapter?.supports_live_rates}>Live rates</CapabilityPill>
            <CapabilityPill active={adapter?.supports_waybills}>Waybills</CapabilityPill>
            <CapabilityPill active={adapter?.supports_tracking}>Tracking</CapabilityPill>
            <CapabilityPill active={adapter?.supports_pickup}>Pickup</CapabilityPill>
          </div>
        </div>
        <button type="button" onClick={save} disabled={saving} className="btn-primary whitespace-nowrap">
          {saving ? "Saving…" : "Save method"}
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <ToggleRow label="Enabled at checkout" checked={method.enabled} onChange={(v) => setMethod({ ...method, enabled: v })} />
        <div>
          <label className="label">Adapter key</label>
          <input className="input-base" value={method.adapter_key || method.key} readOnly />
          <p className="text-xs text-[var(--ff-muted-text)] mt-1">New couriers are added as backend adapters, then appear here automatically after deploy.</p>
        </div>
        <TextInput label="Display name" value={method.display_name} onChange={(v) => setMethod({ ...method, display_name: v })} />
        <TextInput label="Sort order" type="number" value={method.sort_order} onChange={(v) => setMethod({ ...method, sort_order: Number(v || 0) })} />
        <div className="md:col-span-2">
          <label className="label">Description</label>
          <textarea className="input-base min-h-[90px]" value={method.description || ""} onChange={(e) => setMethod({ ...method, description: e.target.value })} />
        </div>
      </div>

      {children}
    </div>
  );
}

export default function ShippingSettings() {
  const [methods, setMethods] = useState([]);
  const [adapters, setAdapters] = useState([]);
  const [activeKey, setActiveKey] = useState("manual_shipping");
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const adapterByKey = useMemo(() => Object.fromEntries((adapters || []).map((adapter) => [adapter.key, adapter])), [adapters]);

  const load = async () => {
    setLoading(true);
    try {
      const [adapterRes, methodRes] = await Promise.all([
        http.get("/admin/shipping-method-adapters"),
        http.get("/admin/shipping-methods"),
      ]);
      setAdapters(adapterRes.data || []);
      const rows = (methodRes.data || []).map(cloneMethod);
      setMethods(rows);
      const nextActive = rows.find((m) => m.key === activeKey) || rows[0] || null;
      if (nextActive) {
        setActiveKey(nextActive.key);
        setDraft(cloneMethod(nextActive));
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to load shipping settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const activeMethod = useMemo(() => draft || methods.find((m) => m.key === activeKey) || null, [draft, methods, activeKey]);
  const activeAdapter = activeMethod ? adapterByKey[activeMethod.adapter_key || activeMethod.key] : null;

  const selectMethod = (key) => {
    const method = methods.find((m) => m.key === key);
    setActiveKey(key);
    setDraft(method ? cloneMethod(method) : null);
  };

  const setPublicConfig = (key, value) => setDraft((m) => ({ ...m, public_config: { ...(m.public_config || {}), [key]: value } }));
  const setSetting = (key, value) => setDraft((m) => ({ ...m, settings: { ...(m.settings || {}), [key]: value } }));
  const setZones = (value) => setDraft((m) => ({ ...m, zones: value.split(",").map((z) => z.trim().toUpperCase()).filter(Boolean) }));

  const save = async () => {
    if (!activeMethod) return;
    setSaving(true);
    try {
      const payload = {
        adapter_key: activeMethod.adapter_key || activeMethod.key,
        enabled: activeMethod.enabled,
        display_name: activeMethod.display_name,
        description: activeMethod.description,
        method_type: activeMethod.method_type,
        sort_order: Number(activeMethod.sort_order || 100),
        rate: Number(activeMethod.rate || 0),
        free_shipping_threshold: activeMethod.free_shipping_threshold === "" || activeMethod.free_shipping_threshold === null ? null : Number(activeMethod.free_shipping_threshold || 0),
        zones: activeMethod.zones || [],
        public_config: activeMethod.public_config || {},
        settings: activeMethod.settings || {},
      };
      const res = await http.patch(`/admin/shipping-methods/${activeMethod.key}`, payload);
      const saved = cloneMethod(res.data);
      setMethods((rows) => rows.map((m) => (m.key === saved.key ? saved : m)));
      setDraft(saved);
      toast.success("Shipping method saved");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save shipping method");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="overline">Loading shipping settings…</div>;
  if (!activeMethod) return <div className="card text-sm text-[var(--ff-muted-text)]">No shipping methods available.</div>;

  return (
    <div className="grid lg:grid-cols-[280px_1fr] gap-6">
      <div className="card h-fit space-y-2">
        <p className="overline mb-3">Methods</p>
        {methods.map((method) => {
          const adapter = adapterByKey[method.adapter_key || method.key];
          return (
            <button
              key={method.key}
              type="button"
              onClick={() => selectMethod(method.key)}
              className={`w-full text-left border p-3 ${activeKey === method.key ? "border-[var(--ff-primary)] bg-[var(--ff-primary)]/10" : "border-[var(--ff-card-border)] hover:border-[var(--ff-card-border)]"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold">{method.display_name}</span>
                <span className={`text-[10px] uppercase tracking-widest ${method.enabled ? "text-[#34C759]" : "text-[var(--ff-muted-text)]"}`}>{method.enabled ? "On" : "Off"}</span>
              </div>
              <div className="text-xs text-[var(--ff-muted-text)] mt-1">{adapter?.display_name || method.method_type.replace(/_/g, " ")} · R {Number(method.rate || 0).toFixed(2)}</div>
            </button>
          );
        })}
      </div>

      <MethodShell method={activeMethod} adapter={activeAdapter} setMethod={setDraft} saving={saving} save={save}>
        <div className="grid md:grid-cols-2 gap-4 border-t border-[var(--ff-card-border)] pt-5">
          <TextInput label="Base / fallback rate" type="number" value={activeMethod.rate} onChange={(v) => setDraft({ ...activeMethod, rate: Number(v || 0) })} help="Flat checkout shipping amount in ZAR. Courier adapters may use this as a fallback." />
          <TextInput label="Free shipping threshold" type="number" value={activeMethod.free_shipping_threshold ?? ""} onChange={(v) => setDraft({ ...activeMethod, free_shipping_threshold: v })} help="Leave blank to disable threshold logic for this method." />
          <TextInput label="Zones / countries" value={(activeMethod.zones || []).join(", ")} onChange={setZones} help="Comma-separated country codes. ZA is the default." />
        </div>

        {(activeAdapter?.public_config_schema || []).length > 0 && (
          <div className="grid md:grid-cols-2 gap-4 border-t border-[var(--ff-card-border)] pt-5">
            <div className="md:col-span-2">
              <p className="overline mb-2">Public checkout / tracking config</p>
            </div>
            {(activeAdapter.public_config_schema || []).map((field) => (
              <FieldRenderer
                key={field.key}
                field={field}
                value={activeMethod.public_config?.[field.key]}
                onChange={(v) => setPublicConfig(field.key, v)}
              />
            ))}
          </div>
        )}

        {(activeAdapter?.settings_schema || []).length > 0 && (
          <div className="grid md:grid-cols-2 gap-4 border-t border-[var(--ff-card-border)] pt-5">
            <div className="md:col-span-2">
              <p className="overline mb-2">Adapter settings</p>
            </div>
            {(activeAdapter.settings_schema || []).map((field) => (
              <FieldRenderer
                key={field.key}
                field={field}
                value={activeMethod.settings?.[field.key]}
                onChange={(v) => setSetting(field.key, v)}
              />
            ))}
          </div>
        )}

        <div className="border-t border-[var(--ff-card-border)] pt-5 text-xs text-[var(--ff-muted-text)] leading-relaxed">
          To add another courier, create a backend adapter in <code>backend/shipping_methods/</code>, register it in <code>registry.py</code>, push to GitHub, then pull/restart the VPS. No checkout UI rewrite should be needed.
        </div>
      </MethodShell>
    </div>
  );
}
