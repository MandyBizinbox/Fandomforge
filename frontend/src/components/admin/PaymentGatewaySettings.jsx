import React, { useEffect, useMemo, useState } from "react";
import { http } from "../../lib/api";
import { toast } from "sonner";
import { GatewayShell, PaystackSetupUrls, TextInput, gatewayLabels } from "./payments/PaymentGatewayFields";

const SECRET_PLACEHOLDER = "********";

const CHANNEL_OPTIONS = [
  { key: "card", label: "Card" },
  { key: "bank", label: "Bank / EFT" },
  { key: "qr", label: "QR" },
  { key: "mobile_money", label: "Mobile money" },
  { key: "bank_transfer", label: "Bank transfer" },
];

function cloneGateway(gateway) {
  return {
    key: gateway.key,
    enabled: Boolean(gateway.enabled),
    display_name: gateway.display_name || gatewayLabels[gateway.key] || gateway.key,
    description: gateway.description || "",
    mode: gateway.mode || "test",
    sort_order: Number(gateway.sort_order || 100),
    public_config: { ...(gateway.public_config || {}) },
    settings: { ...(gateway.settings || {}) },
    secret_configured: Boolean(gateway.secret_configured),
  };
}

export default function PaymentGatewaySettings() {
  const [gateways, setGateways] = useState([]);
  const [activeKey, setActiveKey] = useState("manual_eft");
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const response = await http.get("/admin/payment-gateways");
      const rows = response.data || [];
      setGateways(rows);
      const nextDrafts = {};
      rows.forEach((gateway) => { nextDrafts[gateway.key] = cloneGateway(gateway); });
      setDrafts(nextDrafts);
      if (!rows.find((g) => g.key === activeKey) && rows[0]) setActiveKey(rows[0].key);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to load payment gateways");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const activeGateway = drafts[activeKey];
  const sortedGateways = useMemo(() => [...gateways].sort((a, b) => Number(a.sort_order || 100) - Number(b.sort_order || 100)), [gateways]);

  const updateDraft = (gateway) => {
    setDrafts((current) => ({ ...current, [gateway.key]: gateway }));
  };

  const saveGateway = async (gateway) => {
    setSaving(true);
    try {
      const payload = {
        enabled: gateway.enabled,
        display_name: gateway.display_name,
        description: gateway.description,
        mode: gateway.mode,
        sort_order: Number(gateway.sort_order || 100),
        public_config: gateway.public_config || {},
        settings: gateway.settings || {},
        clear_secret_fields: gateway.clear_secret_fields || [],
      };
      await http.patch(`/admin/payment-gateways/${gateway.key}`, payload);
      toast.success(`${gateway.display_name || gateway.key} saved`);
      await load();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save gateway");
    } finally {
      setSaving(false);
    }
  };

  const setSetting = (key, value) => updateDraft({ ...activeGateway, settings: { ...(activeGateway.settings || {}), [key]: value } });
  const setPublicConfig = (key, value) => updateDraft({ ...activeGateway, public_config: { ...(activeGateway.public_config || {}), [key]: value } });

  const toggleChannel = (channel) => {
    const channels = activeGateway.public_config?.channels || [];
    const next = channels.includes(channel) ? channels.filter((c) => c !== channel) : [...channels, channel];
    setPublicConfig("channels", next);
  };

  if (loading) return <div className="ff-admin-card ff-admin-muted">Loading payment gateway settings…</div>;
  if (!activeGateway) return <div className="ff-admin-card ff-admin-muted">No payment gateways configured.</div>;

  return (
    <div className="space-y-6">
      <div>
        <p className="overline mb-2">Checkout</p>
        <h2 className="font-display text-4xl uppercase">Payment Methods</h2>
        <p className="ff-admin-muted text-sm mt-2 max-w-3xl">
Enable buyer checkout gateways and configure the API keys or bank details each method requires. Only enabled gateways appear at checkout. Owner subscription billing and wallet payouts are configured separately under Billing & Finance.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {sortedGateways.map((gateway) => (
          <button
            key={gateway.key}
            type="button"
            onClick={() => setActiveKey(gateway.key)}
            className={`px-4 py-3 border text-xs uppercase tracking-widest font-bold ${activeKey === gateway.key ? "border-[var(--ff-primary)] bg-[var(--ff-primary)] text-[var(--ff-card-text)]" : "border-[var(--ff-card-border)] ff-admin-muted hover:text-[var(--ff-card-text)]"}`}
          >
            {gateway.display_name || gateway.key}
            {gateway.enabled ? <span className="ml-2 ff-admin-success-text">●</span> : <span className="ml-2 ff-admin-muted">●</span>}
          </button>
        ))}
      </div>

      <GatewayShell gateway={activeGateway} onChange={updateDraft} onSave={() => saveGateway(activeGateway)} saving={saving}>
        {activeKey === "manual_eft" && (
          <div className="grid md:grid-cols-2 gap-4">
            <TextInput label="Bank name" value={activeGateway.settings?.bank_name} onChange={(v) => setSetting("bank_name", v)} />
            <TextInput label="Account holder" value={activeGateway.settings?.account_holder} onChange={(v) => setSetting("account_holder", v)} />
            <TextInput label="Account number" value={activeGateway.settings?.account_number} onChange={(v) => setSetting("account_number", v)} />
            <TextInput label="Branch code" value={activeGateway.settings?.branch_code} onChange={(v) => setSetting("branch_code", v)} />
            <TextInput label="Reference format" value={activeGateway.settings?.reference_format} onChange={(v) => setSetting("reference_format", v)} help="Example: Use your order number as reference." />
            <TextInput label="Expire unpaid orders after days" type="number" value={activeGateway.settings?.expiry_days} onChange={(v) => setSetting("expiry_days", Number(v || 0))} />
            <div className="md:col-span-2">
              <label className="ff-admin-label">Checkout instructions</label>
              <textarea className="ff-admin-control" rows={4} value={activeGateway.settings?.instructions || ""} onChange={(e) => setSetting("instructions", e.target.value)} />
            </div>
          </div>
        )}

        {activeKey === "paystack" && (
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <TextInput label="Public key" value={activeGateway.public_config?.public_key} onChange={(v) => setPublicConfig("public_key", v)} placeholder="pk_test_xxxxxxxxxxxxxxxxx" />
              <TextInput label="Secret key" type="password" value={activeGateway.settings?.secret_key === SECRET_PLACEHOLDER ? "" : activeGateway.settings?.secret_key} onChange={(v) => setSetting("secret_key", v)} placeholder={activeGateway.secret_configured ? "Secret key already saved — enter a new one to replace" : "sk_test_xxxxxxxxxxxxxxxxx"} />
              <TextInput label="Currency" value={activeGateway.public_config?.currency || "ZAR"} onChange={(v) => setPublicConfig("currency", v)} />
              <TextInput label="Payment description prefix" value={activeGateway.settings?.payment_description_prefix} onChange={(v) => setSetting("payment_description_prefix", v)} />
            </div>
            <div>
              <label className="ff-admin-label">Allowed Paystack channels</label>
              <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2">
                {CHANNEL_OPTIONS.map((option) => (
                  <label key={option.key} className="ff-admin-subpanel p-3 text-sm flex items-center gap-2">
                    <input type="checkbox" checked={(activeGateway.public_config?.channels || []).includes(option.key)} onChange={() => toggleChannel(option.key)} />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>
            <PaystackSetupUrls />
          </div>
        )}

        {activeKey === "payfast" && (
          <div className="grid md:grid-cols-2 gap-4">
            <TextInput label="Merchant ID" value={activeGateway.settings?.merchant_id} onChange={(v) => setSetting("merchant_id", v)} />
            <TextInput label="Merchant Key" type="password" value={activeGateway.settings?.merchant_key === SECRET_PLACEHOLDER ? "" : activeGateway.settings?.merchant_key} onChange={(v) => setSetting("merchant_key", v)} />
            <TextInput label="Passphrase" type="password" value={activeGateway.settings?.passphrase === SECRET_PLACEHOLDER ? "" : activeGateway.settings?.passphrase} onChange={(v) => setSetting("passphrase", v)} />
            <TextInput label="Return URL" value={activeGateway.settings?.return_url} onChange={(v) => setSetting("return_url", v)} />
            <TextInput label="Cancel URL" value={activeGateway.settings?.cancel_url} onChange={(v) => setSetting("cancel_url", v)} />
            <TextInput label="Notify URL" value={activeGateway.settings?.notify_url} onChange={(v) => setSetting("notify_url", v)} />
            <div className="md:col-span-2 text-xs ff-admin-muted">PayFast checkout is prepared as a future gateway. Leave disabled until the provider adapter is wired.</div>
          </div>
        )}

        {activeKey === "yoco" && (
          <div className="grid md:grid-cols-2 gap-4">
            <TextInput label="Public key" value={activeGateway.public_config?.public_key} onChange={(v) => setPublicConfig("public_key", v)} placeholder="pk_test_xxxxxxxxxxxxxxxxx" />
            <TextInput label="Secret key" type="password" value={activeGateway.settings?.secret_key === SECRET_PLACEHOLDER ? "" : activeGateway.settings?.secret_key} onChange={(v) => setSetting("secret_key", v)} placeholder={activeGateway.secret_configured ? "Secret key already saved — enter a new one to replace" : "sk_test_xxxxxxxxxxxxxxxxx"} />
            <div className="md:col-span-2 text-xs ff-admin-muted space-y-1">
              <div>Webhook URL: <span className="font-mono ff-admin-muted">/api/payments/webhooks/yoco</span></div>
              <div>Yoco Checkout API uses your Yoco secret key to create hosted checkout sessions. No separate Yoco webhook secret is required in this platform settings screen.</div>
            </div>
          </div>
        )}
      </GatewayShell>
    </div>
  );
}
