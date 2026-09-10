import React, { useEffect, useMemo, useState } from "react";
import { http } from "../../lib/api";
import { toast } from "sonner";
import { FieldRenderer, MethodShell, TextInput } from "./shipping/ShippingMethodFields";

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
  if (!activeMethod) return <div className="ff-admin-card text-sm ff-admin-muted">No shipping methods available.</div>;

  return (
    <div className="grid lg:grid-cols-[280px_1fr] gap-6">
      <div className="ff-admin-card h-fit space-y-2">
        <p className="overline mb-3">Methods</p>
        {methods.map((method) => {
          const adapter = adapterByKey[method.adapter_key || method.key];
          return (
            <button
              key={method.key}
              type="button"
              onClick={() => selectMethod(method.key)}
              className={`ff-admin-method-link w-full text-left p-3 ${activeKey === method.key ? "is-active" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold">{method.display_name}</span>
                <span className={`text-[10px] uppercase tracking-widest ${method.enabled ? "ff-admin-success-text" : "ff-admin-muted"}`}>{method.enabled ? "On" : "Off"}</span>
              </div>
              <div className="text-xs ff-admin-muted mt-1">{adapter?.display_name || method.method_type.replace(/_/g, " ")} · R {Number(method.rate || 0).toFixed(2)}</div>
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

        <div className="border-t border-[var(--ff-card-border)] pt-5 text-xs ff-admin-muted leading-relaxed">
          To add another courier, create a backend adapter in <code>backend/shipping_methods/</code>, register it in <code>registry.py</code>, push to GitHub, then pull/restart the VPS. No checkout UI rewrite should be needed.
        </div>
      </MethodShell>
    </div>
  );
}
