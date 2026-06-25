import React, { useEffect, useMemo, useState } from "react";
import { http } from "../../lib/api";
import { toast } from "sonner";

const SECRET_PLACEHOLDER = "********";

const gatewayLabels = {
  manual_eft: "Manual EFT",
  paystack: "Paystack",
  payfast: "PayFast",
  yoco: "Yoco",
};

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

function TextInput({ label, value, onChange, placeholder = "", type = "text", help = "" }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input-base" type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {help && <p className="text-xs text-[var(--ff-muted-text)] mt-1">{help}</p>}
    </div>
  );
}


function originUrl(path = "") {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://www.fandomforge.co.za";
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

function CopyUrlBox({ label, value, help = "" }) {
  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(value);
      toast.success(`${label} copied`);
    } catch (error) {
      toast.error("Could not copy URL");
    }
  };
  return (
    <div>
      <label className="label">{label}</label>
      <div className="input-base flex items-center justify-between gap-3 min-h-[46px]">
        <span className="font-mono text-xs truncate text-[var(--ff-card-text)]">{value}</span>
        <button type="button" onClick={copy} className="text-[var(--ff-primary)] text-xs font-bold uppercase tracking-widest shrink-0">Copy</button>
      </div>
      {help && <p className="text-xs text-[var(--ff-muted-text)] mt-1">{help}</p>}
    </div>
  );
}

function PaystackSetupUrls() {
  const callbackUrl = originUrl("/api/payments/paystack/callback");
  const webhookUrl = originUrl("/api/payments/webhooks/paystack");
  return (
    <div className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-4 space-y-3">
      <div>
        <p className="overline mb-1">Paystack Dashboard URLs</p>
        <p className="text-xs text-[var(--ff-muted-text)]">Paste these into the platform manager/client Paystack dashboard for buyer checkout payments. These are not for owner subscription billing.</p>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <CopyUrlBox label="Test/Live Callback URL" value={callbackUrl} help="Paystack redirects the buyer here after checkout if the dashboard callback is used. FandomForge still sends a per-order callback during payment initialization." />
        <CopyUrlBox label="Test/Live Webhook URL" value={webhookUrl} help="Paystack sends charge.success and other checkout events here. This endpoint uses the shop checkout secret key." />
      </div>
    </div>
  );
}

function GatewayShell({ gateway, children, onChange, onSave, saving }) {
  return (
    <div className="border border-[var(--ff-card-border)] bg-[var(--ff-surface-bg)] p-5 space-y-4">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <div className="overline mb-2">{gateway.key}</div>
          <h3 className="font-display text-3xl uppercase">{gatewayLabels[gateway.key] || gateway.display_name}</h3>
          <p className="text-sm text-[var(--ff-muted-text)] max-w-2xl mt-2">{gateway.description || "Configure this checkout payment method."}</p>
        </div>
        <label className="flex items-center gap-3 text-sm font-bold uppercase tracking-widest">
          <input type="checkbox" checked={gateway.enabled} onChange={(e) => onChange({ ...gateway, enabled: e.target.checked })} />
          Enabled
        </label>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <TextInput label="Checkout display name" value={gateway.display_name} onChange={(v) => onChange({ ...gateway, display_name: v })} />
        <div>
          <label className="label">Mode</label>
          <select className="input-base" value={gateway.mode} onChange={(e) => onChange({ ...gateway, mode: e.target.value })}>
            <option value="test">Test / Sandbox</option>
            <option value="live">Live</option>
          </select>
        </div>
        <TextInput label="Sort order" type="number" value={gateway.sort_order} onChange={(v) => onChange({ ...gateway, sort_order: Number(v || 0) })} />
        <div className="flex items-end">
          <button type="button" onClick={onSave} disabled={saving} className="btn-primary w-full">
            {saving ? "Saving…" : "Save Gateway"}
          </button>
        </div>
      </div>

      <div>
        <label className="label">Checkout description</label>
        <textarea className="input-base" rows={2} value={gateway.description || ""} onChange={(e) => onChange({ ...gateway, description: e.target.value })} />
      </div>

      {children}
    </div>
  );
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

  if (loading) return <div className="card text-[var(--ff-muted-text)]">Loading payment gateway settings…</div>;
  if (!activeGateway) return <div className="card text-[var(--ff-muted-text)]">No payment gateways configured.</div>;

  return (
    <div className="space-y-6">
      <div>
        <p className="overline mb-2">Checkout</p>
        <h2 className="font-display text-4xl uppercase">Payment Methods</h2>
        <p className="text-[var(--ff-muted-text)] text-sm mt-2 max-w-3xl">
Enable buyer checkout gateways and configure the API keys or bank details each method requires. Only enabled gateways appear at checkout. Owner subscription billing and wallet payouts are configured separately under Billing & Finance.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {sortedGateways.map((gateway) => (
          <button
            key={gateway.key}
            type="button"
            onClick={() => setActiveKey(gateway.key)}
            className={`px-4 py-3 border text-xs uppercase tracking-widest font-bold ${activeKey === gateway.key ? "border-[var(--ff-primary)] bg-[var(--ff-primary)] text-[var(--ff-card-text)]" : "border-[var(--ff-card-border)] text-[var(--ff-muted-text)] hover:text-[var(--ff-card-text)]"}`}
          >
            {gateway.display_name || gateway.key}
            {gateway.enabled ? <span className="ml-2 text-[#34C759]">●</span> : <span className="ml-2 text-[var(--ff-muted-text)]">●</span>}
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
              <label className="label">Checkout instructions</label>
              <textarea className="input-base" rows={4} value={activeGateway.settings?.instructions || ""} onChange={(e) => setSetting("instructions", e.target.value)} />
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
              <label className="label">Allowed Paystack channels</label>
              <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2">
                {CHANNEL_OPTIONS.map((option) => (
                  <label key={option.key} className="border border-[var(--ff-card-border)] p-3 text-sm flex items-center gap-2">
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
            <div className="md:col-span-2 text-xs text-[var(--ff-muted-text)]">PayFast checkout is prepared as a future gateway. Leave disabled until the provider adapter is wired.</div>
          </div>
        )}

        {activeKey === "yoco" && (
          <div className="grid md:grid-cols-2 gap-4">
            <TextInput label="Public key" value={activeGateway.public_config?.public_key} onChange={(v) => setPublicConfig("public_key", v)} placeholder="pk_test_xxxxxxxxxxxxxxxxx" />
            <TextInput label="Secret key" type="password" value={activeGateway.settings?.secret_key === SECRET_PLACEHOLDER ? "" : activeGateway.settings?.secret_key} onChange={(v) => setSetting("secret_key", v)} placeholder={activeGateway.secret_configured ? "Secret key already saved — enter a new one to replace" : "sk_test_xxxxxxxxxxxxxxxxx"} />
            <div className="md:col-span-2 text-xs text-[var(--ff-muted-text)] space-y-1">
              <div>Webhook URL: <span className="font-mono text-[var(--ff-muted-text)]">/api/payments/webhooks/yoco</span></div>
              <div>Yoco Checkout API uses your Yoco secret key to create hosted checkout sessions. No separate Yoco webhook secret is required in this platform settings screen.</div>
            </div>
          </div>
        )}
      </GatewayShell>
    </div>
  );
}
