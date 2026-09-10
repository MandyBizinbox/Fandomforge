import React, { useEffect, useState } from "react";
import { http } from "../../../lib/api";
import { toast } from "sonner";
import PaymentGatewaySettings from "../PaymentGatewaySettings";
import ShippingSettings from "../ShippingSettings";
import FeaturePackageSettings from "../FeaturePackageSettings";
import SubscriptionManagerAdmin from "../SubscriptionManagerAdmin";
import SubscriptionBillingSettings from "../SubscriptionBillingSettings";
import PaystackPayoutsAdmin from "../PaystackPayoutsAdmin";

export default function AdminPlatformGeneralSettings({ initialTab = "general", compact = false } = {}) {
  const [settings, setSettings] = useState(null);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [rate, setRate] = useState("");
  const [fee, setFee] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => http.get("/admin/settings").then((r) => {
    const data = r.data || {};
    setSettings(data);
    setRate(data.default_commission_rate ?? 0.05);
    setFee("");
  });

  useEffect(() => { load(); }, []);

  const saveCore = async () => {
    setSaving(true);
    try {
      await http.patch(`/admin/settings?default_commission_rate=${encodeURIComponent(rate)}`);
      toast.success("Platform settings saved");
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return <div className="overline">Loading…</div>;

  const tabs = [
    { key: "package", label: "SaaS Package" },
    { key: "general", label: "General" },
    { key: "checkout", label: "Checkout Payment Methods" },
    { key: "shipping", label: "Shipping / Fulfilment" },
    { key: "subscription-billing", label: "Owner Subscription Billing" },
    { key: "subscriptions", label: "Subscriptions" },
    { key: "payouts", label: "Paystack Payouts" },
  ];

  const visibleTabs = compact ? tabs.filter((tab) => tab.key === initialTab) : tabs;

  return (
    <div data-testid="admin-settings-page" className="space-y-6">
      {!compact && (
        <div>
          <div className="overline mb-2">Platform</div>
          <h1 className="font-display text-5xl uppercase">Settings</h1>
        </div>
      )}

      {!compact && (
      <div className="flex flex-wrap gap-2 border-b border-[var(--ff-card-border)] pb-4">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-3 border text-xs uppercase tracking-widest font-bold ${activeTab === tab.key ? "border-[var(--ff-primary)] bg-[var(--ff-primary)] text-[var(--ff-card-text)]" : "border-[var(--ff-card-border)] text-[var(--ff-muted-text)] hover:text-[var(--ff-card-text)]"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      )}

      {activeTab === "package" && <FeaturePackageSettings />}

      {activeTab === "general" && (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="card space-y-4">
            <div>
              <p className="overline mb-2">General</p>
              <h2 className="font-display text-3xl uppercase">Platform Identity</h2>
            </div>
            <div>
              <label className="label">Platform name</label>
              <input className="input-base" value={settings.platform_name || "FandomForge"} disabled />
              <p className="text-xs text-[var(--ff-muted-text)] mt-1">Edit public branding under Platform Settings → Branding / Instance.</p>
            </div>
            <div>
              <label className="label">Currency</label>
              <input className="input-base" value={settings.currency || "ZAR"} disabled />
            </div>
          </div>

          <div className="card space-y-4">
            <p className="overline mb-2">Settings guide</p>
            <p className="text-sm text-[var(--ff-muted-text)]">
              Buyer checkout and delivery settings are managed under Shop Settings. Owner billing, subscriptions, commission and payouts are managed under Billing & Finance.
            </p>
          </div>
        </div>
      )}

      {activeTab === "fees" && (
        <div className="card space-y-4 max-w-2xl">
          <div>
            <p className="overline mb-2">Platform Commission</p>
            <h2 className="font-display text-3xl uppercase">Commission Rate</h2>
            <p className="text-sm text-[var(--ff-muted-text)] mt-2">This setting is now managed from Billing & Finance → Platform Billing.</p>
          </div>

          <div>
            <label className="label">Default commission rate</label>
            <input className="input-base" type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
            <p className="text-xs text-[var(--ff-muted-text)] mt-1">Use decimal format: 0.05 = 5%.</p>
          </div>

          <button type="button" onClick={saveCore} disabled={saving} className="btn-primary">
            {saving ? "Saving…" : "Save Commission"}
          </button>
        </div>
      )}

      {activeTab === "checkout" && <PaymentGatewaySettings />}

      {activeTab === "shipping" && <ShippingSettings />}

      {activeTab === "subscription-billing" && <SubscriptionBillingSettings />}

      {activeTab === "subscriptions" && <SubscriptionManagerAdmin modules={settings.modules || {}} />}

      {activeTab === "payouts" && (
        <div className="card">
          <p className="overline mb-2">Payouts</p>
          <h2 className="font-display text-3xl uppercase mb-3">Paystack payout workflow</h2>
          <p className="text-[var(--ff-muted-text)] text-sm mb-4">
            Payout batches are managed from the dedicated Paystack Payouts screen because they include ledger rows, recipient profiles and batch actions.
          </p>
          <button type="button" onClick={() => window.location.assign("/admin/billing")} className="btn-primary">
            Open Paystack Payouts
          </button>
        </div>
      )}
    </div>
  );
}
