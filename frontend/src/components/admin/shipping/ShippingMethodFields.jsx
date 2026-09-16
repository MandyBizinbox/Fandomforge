import React from "react";

const MASKED_SECRET = "********";

export function TextInput({ label, value, onChange, placeholder = "", type = "text", help = "" }) {
  return (
    <div>
      <label className="ff-admin-label">{label}</label>
      <input className="ff-admin-control" type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {help && <p className="text-xs ff-admin-muted mt-1">{help}</p>}
    </div>
  );
}

export function ToggleRow({ label, checked, onChange, help = "" }) {
  return (
    <label className="flex items-start gap-3 ff-admin-subpanel p-3 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1" />
      <span>
        <span className="block text-sm font-bold">{label}</span>
        {help && <span className="block text-xs ff-admin-muted mt-1">{help}</span>}
      </span>
    </label>
  );
}

function CapabilityPill({ active, children }) {
  return (
    <span className={`text-[10px] uppercase tracking-widest border px-2 py-1 ${active ? "ff-admin-success-border ff-admin-success-text" : "border-[var(--ff-card-border)] ff-admin-muted"}`}>
      {children}
    </span>
  );
}

export function FieldRenderer({ field, value, onChange }) {
  const type = field.type || "text";
  if (type === "textarea") {
    return (
      <div>
        <label className="ff-admin-label">{field.label}</label>
        <textarea className="ff-admin-control min-h-[90px]" value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder || ""} />
        {field.help && <p className="text-xs ff-admin-muted mt-1">{field.help}</p>}
      </div>
    );
  }
  if (type === "checkbox") {
    return <ToggleRow label={field.label} checked={Boolean(value)} onChange={onChange} help={field.help || ""} />;
  }
  if (type === "select") {
    return (
      <div>
        <label className="ff-admin-label">{field.label}</label>
        <select className="ff-admin-control" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          {(field.options || []).map((option) => (
            <option key={option.value ?? option.key ?? option.label} value={option.value ?? option.key ?? ""}>{option.label}</option>
          ))}
        </select>
        {field.help && <p className="text-xs ff-admin-muted mt-1">{field.help}</p>}
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

export function MethodShell({ children, method, adapter, setMethod, saving, save }) {
  return (
    <div className="ff-admin-card space-y-5">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <p className="overline mb-2">Shipping Adapter</p>
          <h2 className="font-display text-3xl uppercase">{method.display_name}</h2>
          <p className="text-sm ff-admin-muted mt-1">{method.description || adapter?.description || "Configure checkout availability, rates and dispatch behaviour."}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <CapabilityPill active={adapter?.supports_live_rates}>Live rates</CapabilityPill>
            <CapabilityPill active={adapter?.supports_waybills}>Waybills</CapabilityPill>
            <CapabilityPill active={adapter?.supports_tracking}>Tracking</CapabilityPill>
            <CapabilityPill active={adapter?.supports_pickup}>Pickup</CapabilityPill>
          </div>
        </div>
        <button type="button" onClick={save} disabled={saving} className="ff-admin-button ff-admin-button--primary whitespace-nowrap">
          {saving ? "Saving…" : "Save method"}
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <ToggleRow label="Enabled at checkout" checked={method.enabled} onChange={(v) => setMethod({ ...method, enabled: v })} />
        <div>
          <label className="ff-admin-label">Adapter key</label>
          <input className="ff-admin-control" value={method.adapter_key || method.key} readOnly />
          <p className="text-xs ff-admin-muted mt-1">New couriers are added as backend adapters, then appear here automatically after deploy.</p>
        </div>
        <TextInput label="Display name" value={method.display_name} onChange={(v) => setMethod({ ...method, display_name: v })} />
        <TextInput label="Sort order" type="number" value={method.sort_order} onChange={(v) => setMethod({ ...method, sort_order: Number(v || 0) })} />
        <div className="md:col-span-2">
          <label className="ff-admin-label">Description</label>
          <textarea className="ff-admin-control min-h-[90px]" value={method.description || ""} onChange={(e) => setMethod({ ...method, description: e.target.value })} />
        </div>
      </div>

      {children}
    </div>
  );
}
