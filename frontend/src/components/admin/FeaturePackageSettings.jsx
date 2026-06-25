import React, { useEffect, useMemo, useState } from "react";
import { http } from "../../lib/api";
import { toast } from "sonner";
import { Boxes, CheckCircle2, Factory, LockKeyhole, Save, ToggleLeft, ToggleRight } from "lucide-react";

const MODULE_LABELS = {
  creators_enabled: "Creators",
  printers_enabled: "Printer accounts",
  sole_printer_mode: "Sole printer mode",
  product_templates_enabled: "Product Template Studio",
  artwork_review_enabled: "Artwork Review",
  printer_marketplace_enabled: "Printer marketplace",
  printer_auto_assignment_enabled: "Printer auto-assignment",
  payouts_enabled: "Payouts / wallet ledger",
  creator_subscriptions_enabled: "Creator subscriptions",
  printer_subscriptions_enabled: "Printer subscriptions",
  public_shop_enabled: "Public shop",
  manual_orders_enabled: "Manual orders",
  shipping_enabled: "Shipping / fulfilment",
  bobgo_enabled: "Bob Go integration",
  paystack_checkout_enabled: "Paystack checkout",
  manual_eft_enabled: "Manual EFT checkout",
};

const MODULE_HELP = {
  creators_enabled: "Allows creator accounts, creator dashboards and creator storefronts.",
  printers_enabled: "Allows external printer registration, printer dashboards and production assignment.",
  sole_printer_mode: "Routes fulfilment to one internal/default printer and hides the external printer network.",
  printer_marketplace_enabled: "Shows printer pricing and printer marketplace controls.",
  printer_auto_assignment_enabled: "Allows admin to auto-assign best matching printers to production jobs.",
  payouts_enabled: "Enables ledger, payout profiles and payout batches.",
  creator_subscriptions_enabled: "Enables the next sprint's creator billing rules and access controls.",
  printer_subscriptions_enabled: "Enables the next sprint's printer billing rules and access controls.",
};

function ToggleButton({ enabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-3 py-2 border text-xs uppercase tracking-widest font-bold ${enabled ? "border-[#34C759] text-[#34C759] bg-[#34C759]/10" : "border-[var(--ff-card-border)] text-[var(--ff-muted-text)] hover:text-[var(--ff-card-text)]"}`}
    >
      {enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
      {enabled ? "On" : "Off"}
    </button>
  );
}

function moduleSummary(modules = {}) {
  const active = Object.values(modules).filter(Boolean).length;
  const total = Object.keys(modules).length;
  return `${active}/${total} modules enabled`;
}

export default function FeaturePackageSettings() {
  const [settings, setSettings] = useState(null);
  const [packages, setPackages] = useState([]);
  const [printers, setPrinters] = useState([]);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [settingsRes, packagesRes] = await Promise.all([
      http.get("/admin/settings"),
      http.get("/admin/feature-packages"),
    ]);
    const data = settingsRes.data || {};
    setSettings(data);
    setForm({
      platform_name: data.platform_name || "FandomForge",
      support_email: data.support_email || "",
      support_phone: data.support_phone || "",
      country: data.country || "ZA",
      timezone: data.timezone || "Africa/Johannesburg",
      primary_color: data.primary_color || "#FF3B30",
      package_key: data.package_key || "full_marketplace",
      default_printer_id: data.default_printer_id || "",
      modules: data.modules || {},
    });
    setPackages(packagesRes.data || []);

    try {
      const printersRes = await http.get("/printers");
      setPrinters(printersRes.data || []);
    } catch (_) {
      setPrinters([]);
    }
  };

  useEffect(() => { load().catch(() => toast.error("Could not load platform package settings")); }, []);

  const selectedPackage = useMemo(() => packages.find((pkg) => pkg.key === form.package_key), [packages, form.package_key]);
  const modules = form.modules || {};

  const applyPackage = (pkg) => {
    setForm((prev) => ({
      ...prev,
      package_key: pkg.key,
      modules: pkg.toggles || {},
    }));
  };

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const setModule = (key, value) => {
    setForm((prev) => {
      const next = { ...(prev.modules || {}), [key]: value };
      if (key === "sole_printer_mode" && value) {
        next.printer_marketplace_enabled = false;
        next.printer_auto_assignment_enabled = false;
        next.printer_subscriptions_enabled = false;
      }
      if (key === "printers_enabled" && !value) {
        next.printer_marketplace_enabled = false;
        next.printer_auto_assignment_enabled = false;
        next.printer_subscriptions_enabled = false;
      }
      if (key === "payouts_enabled" && !value) {
        next.printer_subscriptions_enabled = false;
      }
      return { ...prev, modules: next };
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        platform_name: form.platform_name,
        support_email: form.support_email,
        support_phone: form.support_phone,
        country: form.country,
        timezone: form.timezone,
        primary_color: form.primary_color,
        package_key: form.package_key,
        default_printer_id: form.default_printer_id || null,
        modules: form.modules,
      };
      const res = await http.patch("/admin/settings/package", payload);
      setSettings(res.data || null);
      toast.success("Platform package saved");
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not save platform package");
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return <div className="overline">Loading package manager…</div>;

  return (
    <div className="space-y-6">
      <div className="grid xl:grid-cols-[1.1fr_0.9fr] gap-6">
        <div className="card space-y-5">
          <div>
            <p className="overline mb-2">Master SaaS</p>
            <h2 className="font-display text-3xl uppercase">Feature Package Manager</h2>
            <p className="text-sm text-[var(--ff-muted-text)] mt-2">
              Use this to run the same codebase as different branded SaaS packages without deleting the disabled modules.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">Platform name</label>
              <input className="input-base" value={form.platform_name || ""} onChange={(e) => setField("platform_name", e.target.value)} />
            </div>
            <div>
              <label className="label">Primary colour</label>
              <input className="input-base" value={form.primary_color || ""} onChange={(e) => setField("primary_color", e.target.value)} />
            </div>
            <div>
              <label className="label">Support email</label>
              <input className="input-base" value={form.support_email || ""} onChange={(e) => setField("support_email", e.target.value)} />
            </div>
            <div>
              <label className="label">Support phone</label>
              <input className="input-base" value={form.support_phone || ""} onChange={(e) => setField("support_phone", e.target.value)} />
            </div>
            <div>
              <label className="label">Country</label>
              <input className="input-base" value={form.country || "ZA"} onChange={(e) => setField("country", e.target.value)} />
            </div>
            <div>
              <label className="label">Timezone</label>
              <input className="input-base" value={form.timezone || "Africa/Johannesburg"} onChange={(e) => setField("timezone", e.target.value)} />
            </div>
          </div>
        </div>

        <div className="card space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="overline mb-2">Current Package</p>
              <h3 className="font-display text-3xl uppercase">{selectedPackage?.name || form.package_key}</h3>
              <p className="text-sm text-[var(--ff-muted-text)] mt-2">{selectedPackage?.description}</p>
            </div>
            <Boxes className="text-[var(--ff-primary)]" />
          </div>
          <div className="border border-[var(--ff-card-border)] p-4">
            <div className="text-xs uppercase tracking-widest text-[var(--ff-muted-text)] mb-1">Status</div>
            <div className="font-bold">{moduleSummary(modules)}</div>
          </div>
          {modules.sole_printer_mode && (
            <div className="border border-[var(--ff-primary)] bg-[var(--ff-surface-bg)] p-4 text-sm text-[var(--ff-primary)]">
              Sole printer mode is active. External printer marketplace and auto-assignment are disabled.
            </div>
          )}
          <button type="button" onClick={save} disabled={saving} className="btn-primary w-full justify-center">
            <Save size={14} /> {saving ? "Saving…" : "Save package settings"}
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 xl:grid-cols-4 gap-4">
        {packages.map((pkg) => (
          <button
            key={pkg.key}
            type="button"
            onClick={() => applyPackage(pkg)}
            className={`text-left border p-5 hover:border-[var(--ff-primary)] transition-colors ${form.package_key === pkg.key ? "border-[var(--ff-primary)] bg-[var(--ff-primary)]/10" : "border-[var(--ff-card-border)]"}`}
          >
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="font-display text-2xl uppercase">{pkg.name}</div>
              {form.package_key === pkg.key && <CheckCircle2 size={18} className="text-[#34C759]" />}
            </div>
            <p className="text-sm text-[var(--ff-muted-text)] mb-3">{pkg.description}</p>
            <p className="text-xs uppercase tracking-widest text-[var(--ff-muted-text)]">{pkg.recommended_for}</p>
          </button>
        ))}
      </div>

      {modules.sole_printer_mode && (
        <div className="card space-y-4">
          <div>
            <p className="overline mb-2">Sole Printer</p>
            <h2 className="font-display text-3xl uppercase flex items-center gap-2"><Factory size={22} /> Default production account</h2>
            <p className="text-sm text-[var(--ff-muted-text)] mt-2">
              In sole-printer deployments, all fulfilment can be routed to this internal printer account. If no printer exists yet, leave this blank and add one later.
            </p>
          </div>
          <select className="input-base" value={form.default_printer_id || ""} onChange={(e) => setField("default_printer_id", e.target.value)}>
            <option value="">No default printer selected</option>
            {printers.map((printer) => (
              <option key={printer.id} value={printer.id}>{printer.company_name} — {printer.location || printer.contact_email}</option>
            ))}
          </select>
        </div>
      )}

      <div className="card space-y-4">
        <div>
          <p className="overline mb-2">Module Toggles</p>
          <h2 className="font-display text-3xl uppercase">Switch features on/off</h2>
          <p className="text-sm text-[var(--ff-muted-text)] mt-2">These toggles control menus and backend access rules for the current deployment.</p>
        </div>

        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {Object.keys(MODULE_LABELS).map((key) => {
            const locked = (
              (key === "printer_marketplace_enabled" || key === "printer_auto_assignment_enabled" || key === "printer_subscriptions_enabled") &&
              (!modules.printers_enabled || modules.sole_printer_mode)
            );
            return (
              <div key={key} className={`border p-4 ${modules[key] ? "border-[var(--ff-card-border)]" : "border-[var(--ff-card-border)] bg-[var(--ff-surface-bg)]"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-bold">{MODULE_LABELS[key]}</div>
                    <p className="text-xs text-[var(--ff-muted-text)] mt-1">{MODULE_HELP[key] || "Controls availability for this feature area."}</p>
                  </div>
                  {locked ? <span className="inline-flex items-center gap-1 text-xs text-[var(--ff-muted-text)]"><LockKeyhole size={14} /> Locked</span> : <ToggleButton enabled={!!modules[key]} onClick={() => setModule(key, !modules[key])} />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
