import React, { useEffect, useState } from "react";
import { http } from "../../lib/api";
import { toast } from "sonner";
import { RefreshCw, ShieldCheck, Repeat, Eye, EyeOff } from "lucide-react";

const SECRET_PLACEHOLDER = "********";

function normalizeApiError(error, fallback = "Request failed") {
  const detail = error?.response?.data?.detail;
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d?.msg || String(d)).join("; ");
  if (typeof detail === "object") return detail.message || detail.msg || JSON.stringify(detail);
  return fallback;
}

function keyPrefix(value) {
  const raw = String(value || "").trim();
  if (!raw || raw === SECRET_PLACEHOLDER) return "";
  return raw.slice(0, 8);
}

function TextInput({ label, value, onChange, placeholder = "", type = "text", help = "", right = null }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="relative">
        <input className="input-base pr-12" type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
        {right && <div className="absolute right-3 top-1/2 -translate-y-1/2">{right}</div>}
      </div>
      {help && <p className="text-xs text-[var(--ff-muted-text)] mt-1">{help}</p>}
    </div>
  );
}

function absolutePlatformUrl(path = "") {
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
        <button type="button" className="text-[var(--ff-primary)] text-xs font-bold uppercase tracking-widest shrink-0" onClick={copy}>Copy</button>
      </div>
      {help && <p className="text-xs text-[var(--ff-muted-text)] mt-1">{help}</p>}
    </div>
  );
}

function StatusTile({ title, value, good, help }) {
  return (
    <div className={`border p-4 ${good ? "border-[#34C759]/40 bg-[#34C759]/5" : "border-[var(--ff-card-border)] bg-[var(--ff-surface-bg)]"}`}>
      <div className="overline mb-1">{title}</div>
      <div className="font-display text-2xl uppercase break-words">{value}</div>
      {help && <p className="text-xs text-[var(--ff-muted-text)] mt-1">{help}</p>}
    </div>
  );
}

export default function SubscriptionBillingSettings() {
  const [settings, setSettings] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [platformSettings, setPlatformSettings] = useState({ default_commission_rate: 0.05 });
  const [savingCommission, setSavingCommission] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [diagnostics, setDiagnostics] = useState(null);
  const [paystackLogs, setPaystackLogs] = useState([]);
  const [runningDiagnostics, setRunningDiagnostics] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [billingRes, settingsRes] = await Promise.all([
        http.get("/admin/subscription-billing/settings"),
        http.get("/admin/settings"),
      ]);
      setSettings(billingRes.data || {});
      setDraft(billingRes.data || {});
      setPlatformSettings(settingsRes.data || { default_commission_rate: 0.05 });
    } catch (error) {
      toast.error(normalizeApiError(error, "Could not load platform billing settings"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const setField = (key, value) => setDraft((current) => ({ ...(current || {}), [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        enabled: Boolean(draft.enabled),
        mode: draft.mode || "test",
        public_key: draft.public_key || "",
        secret_key: draft.secret_key === SECRET_PLACEHOLDER ? "" : (draft.secret_key || ""),
        currency: draft.currency || "ZAR",
        statement_descriptor: draft.statement_descriptor || "FandomForge Subscription",
        clear_secret_key: Boolean(draft.clear_secret_key),
      };
      await http.patch("/admin/subscription-billing/settings", payload);
      toast.success("Subscription billing settings saved");
      await load();
    } catch (error) {
      toast.error(normalizeApiError(error, "Could not save subscription billing settings"));
    } finally {
      setSaving(false);
    }
  };

  const saveCommission = async () => {
    setSavingCommission(true);
    try {
      const rate = Number(platformSettings.default_commission_rate || 0);
      await http.patch(`/admin/settings?default_commission_rate=${encodeURIComponent(rate)}`);
      toast.success("Platform commission saved");
      await load();
    } catch (error) {
      toast.error(normalizeApiError(error, "Could not save platform commission"));
    } finally {
      setSavingCommission(false);
    }
  };

  const runDiagnostics = async () => {
    setRunningDiagnostics(true);
    try {
      const [diagRes, logsRes] = await Promise.all([
        http.post("/admin/subscription-billing/diagnose"),
        http.get("/admin/subscription-billing/paystack-logs"),
      ]);
      const d = diagRes.data || {};
      const checks = d.checks || {};
      const normalized = {
        ...d,
        paystack_api_reachable: Boolean(d.paystack_api_reachable ?? d.ok),
        paystack_message: d.paystack_message || d.message || "No diagnostic message returned.",
        public_key_prefix: d.public_key_prefix || checks.public_key_prefix || settings?.public_key_prefix || keyPrefix(draft?.public_key),
        secret_key_prefix: d.secret_key_prefix || checks.secret_key_prefix || settings?.secret_key_prefix || (draft?.secret_configured ? "saved" : ""),
      };
      setDiagnostics(normalized);
      setPaystackLogs(Array.isArray(logsRes.data) ? logsRes.data : []);
      if (normalized.paystack_api_reachable) {
        toast.success("Paystack subscription billing connection passed");
      } else {
        toast.warning(normalized.paystack_message || "Paystack subscription billing diagnostic failed");
      }
    } catch (error) {
      const message = normalizeApiError(error, "Could not run Paystack diagnostics");
      setDiagnostics({
        paystack_api_reachable: false,
        paystack_message: message,
        public_key_prefix: settings?.public_key_prefix || keyPrefix(draft?.public_key),
        secret_key_prefix: settings?.secret_key_prefix || (draft?.secret_configured ? "saved" : ""),
      });
      toast.error(message);
    } finally {
      setRunningDiagnostics(false);
    }
  };

  if (loading) return <div className="card text-[var(--ff-muted-text)]">Loading subscription billing settings…</div>;
  if (!draft) return <div className="card text-[var(--ff-muted-text)]">No subscription billing settings loaded.</div>;

  const publicPrefix = settings?.public_key_prefix || keyPrefix(draft.public_key) || "Missing";
  const secretPrefix = settings?.secret_key_prefix || (draft.secret_configured ? "saved" : "Missing");
  const publicLooksValid = publicPrefix.startsWith("pk_test_") || publicPrefix.startsWith("pk_live_");
  const secretLooksValid = secretPrefix.startsWith("sk_test_") || secretPrefix.startsWith("sk_live_") || secretPrefix === "saved";

  return (
    <div className="space-y-6">
      <div>
        <p className="overline mb-2">Platform Billing</p>
        <h2 className="font-display text-4xl uppercase">Owner Billing & Commission</h2>
        <p className="text-[var(--ff-muted-text)] text-sm mt-2 max-w-3xl">
          Manage the owner billing account used for creator/printer subscriptions and the default platform commission applied to marketplace orders. Buyer checkout gateways stay under Shop Settings.
        </p>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <StatusTile title="Billing status" value={draft.enabled ? "Enabled" : "Disabled"} good={draft.enabled && draft.secret_configured} help={draft.enabled ? "Recurring subscription billing can be used." : "Paystack recurring actions stay disabled."} />
        <StatusTile title="Public key" value={publicPrefix} good={publicLooksValid} />
        <StatusTile title="Secret key" value={secretPrefix} good={secretLooksValid} help="Secret is masked after saving." />
        <StatusTile title="Synced plans" value={settings?.synced_plan_count ?? 0} good={(settings?.synced_plan_count ?? 0) > 0} help={`${settings?.plan_count ?? 0} plans total`} />
      </div>

      <div className="grid md:grid-cols-[1fr_320px] gap-4">
        <div className="card space-y-3">
          <div>
            <p className="overline mb-2">Platform Commission</p>
            <h3 className="font-display text-3xl uppercase">Marketplace commission</h3>
            <p className="text-sm text-[var(--ff-muted-text)] mt-2 max-w-2xl">
              This default rate is used when calculating the platform commission on product orders. Subscription plan pricing is managed separately under Subscriptions.
            </p>
          </div>
          <div>
            <label className="label">Default commission rate</label>
            <input
              className="input-base"
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={platformSettings.default_commission_rate ?? 0.05}
              onChange={(e) => setPlatformSettings((current) => ({ ...current, default_commission_rate: e.target.value }))}
            />
            <p className="text-xs text-[var(--ff-muted-text)] mt-1">Use decimal format: 0.05 = 5%, 0.15 = 15%.</p>
          </div>
          <button type="button" onClick={saveCommission} disabled={savingCommission} className="btn-primary w-fit">
            {savingCommission ? "Saving…" : "Save Commission"}
          </button>
        </div>
        <StatusTile
          title="Current commission"
          value={`${(Number(platformSettings.default_commission_rate || 0) * 100).toFixed(2)}%`}
          good={Number(platformSettings.default_commission_rate || 0) > 0}
          help="Applied as the default platform commission rate."
        />
      </div>

      <div className="card space-y-5">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <p className="overline mb-2">Paystack Recurring</p>
            <h3 className="font-display text-3xl uppercase">Master subscription account</h3>
            <p className="text-sm text-[var(--ff-muted-text)] max-w-2xl mt-2">
              These credentials should belong to the software owner account. Do not use a client/platform manager's shop checkout Paystack account here.
            </p>
          </div>
          <label className="flex items-center gap-3 text-sm font-bold uppercase tracking-widest">
            <input type="checkbox" checked={Boolean(draft.enabled)} onChange={(e) => setField("enabled", e.target.checked)} />
            Enabled
          </label>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="label">Mode</label>
            <select className="input-base" value={draft.mode || "test"} onChange={(e) => setField("mode", e.target.value)}>
              <option value="test">Test / Sandbox</option>
              <option value="live">Live</option>
            </select>
          </div>
          <TextInput label="Currency" value={draft.currency || "ZAR"} onChange={(v) => setField("currency", v)} />
          <TextInput label="Statement descriptor" value={draft.statement_descriptor || "FandomForge Subscription"} onChange={(v) => setField("statement_descriptor", v)} />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <TextInput label="Paystack public key" value={draft.public_key || ""} onChange={(v) => setField("public_key", v)} placeholder="pk_test_..." />
          <TextInput
            label="Paystack secret key"
            value={draft.secret_key || ""}
            onChange={(v) => setField("secret_key", v)}
            placeholder={draft.secret_configured ? SECRET_PLACEHOLDER : "sk_test_..."}
            type={showSecret ? "text" : "password"}
            help={draft.secret_configured ? "Leave as ******** to keep the existing secret." : "Required to create plans and recurring checkout links."}
            right={<button type="button" className="text-[var(--ff-muted-text)] hover:text-[var(--ff-card-text)]" onClick={() => setShowSecret((v) => !v)}>{showSecret ? <EyeOff size={16} /> : <Eye size={16} />}</button>}
          />
          <div className="md:col-span-2 border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-4 space-y-3">
            <div>
              <p className="overline mb-1">Owner Paystack Dashboard URLs</p>
              <p className="text-xs text-[var(--ff-muted-text)]">Paste these into the platform owner/super admin Paystack dashboard for creator/printer subscription billing. Do not use these for buyer shop checkout.</p>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <CopyUrlBox
                label="Test/Live Callback URL"
                value={absolutePlatformUrl("/admin?tab=settings&settingsTab=subscriptions")}
                help="Paystack returns subscription payers here if the dashboard callback is used. FandomForge still sends a subscription-specific callback during checkout initialization."
              />
              <CopyUrlBox
                label="Test/Live Webhook URL"
                value={settings?.absolute_webhook_url || absolutePlatformUrl(settings?.webhook_url || "/api/platform-billing/webhooks/paystack")}
                help="Dedicated webhook endpoint for owner subscription billing. This endpoint verifies events with the owner Paystack secret key."
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 text-xs text-[var(--ff-muted-text)]">
          <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(draft.clear_secret_key)} onChange={(e) => setField("clear_secret_key", e.target.checked)} /> Clear saved secret key</label>
        </div>

        <div className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-4 text-sm text-[var(--ff-muted-text)] space-y-2">
          <p className="font-bold text-[var(--ff-card-text)] flex items-center gap-2"><ShieldCheck size={15} className="text-[#34C759]" /> Separation rule</p>
          <p>Shop checkout gateways are for buyer payments into the platform manager's merchant account. Subscription billing is for SaaS fees owed to the software owner and uses a separate Paystack integration.</p>
          <p className="flex items-center gap-2"><Repeat size={14} /> Plans are created under Subscriptions, synced to this owner Paystack account, then assigned to creators or printers.</p>
        </div>

        <div className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-4 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <p className="overline mb-1">Paystack Diagnostics</p>
              <p className="text-xs text-[var(--ff-muted-text)]">Checks the owner subscription keys against Paystack and shows the last provider responses. This is useful for error 10001 and failed recurring checkout debugging.</p>
            </div>
            <button type="button" onClick={runDiagnostics} disabled={runningDiagnostics} className="border border-[var(--ff-card-border)] px-4 py-3 text-xs uppercase tracking-widest hover:border-[var(--ff-primary)]">
              {runningDiagnostics ? "Checking…" : "Run Diagnostics"}
            </button>
          </div>

          {diagnostics && (
            <div className="grid md:grid-cols-3 gap-3 text-xs">
              <div className="border border-[var(--ff-card-border)] p-3"><span className="text-[var(--ff-muted-text)]">API Reachable</span><br /><strong className={diagnostics.paystack_api_reachable ? "text-[#34C759]" : "text-[var(--ff-primary)]"}>{diagnostics.paystack_api_reachable ? "Yes" : "No"}</strong></div>
              <div className="border border-[var(--ff-card-border)] p-3"><span className="text-[var(--ff-muted-text)]">Public Key</span><br /><strong>{diagnostics.public_key_prefix || "Missing"}</strong></div>
              <div className="border border-[var(--ff-card-border)] p-3"><span className="text-[var(--ff-muted-text)]">Secret Key</span><br /><strong>{diagnostics.secret_key_prefix || "Missing"}</strong></div>
              <div className="md:col-span-3 border border-[var(--ff-card-border)] p-3 text-[var(--ff-muted-text)] break-words">{diagnostics.paystack_message || "No diagnostic message returned."}</div>
            </div>
          )}

          {paystackLogs.length > 0 && (
            <div className="space-y-2 max-h-72 overflow-auto">
              {paystackLogs.slice(0, 5).map((row, idx) => (
                <div key={`${row.created_at}-${idx}`} className="border border-[var(--ff-card-border)] p-3 text-xs">
                  <div className="flex justify-between gap-3 text-[var(--ff-muted-text)]">
                    <span>{row.method} {row.path}</span>
                    <span>{row.status}</span>
                  </div>
                  <pre className="mt-2 whitespace-pre-wrap break-words text-[var(--ff-muted-text)]">{JSON.stringify(row.response_body || row.response || row.payload || {}, null, 2)}</pre>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={save} disabled={saving} className="btn-primary">
            {saving ? "Saving…" : "Save Subscription Billing"}
          </button>
          <button type="button" onClick={load} className="border border-[var(--ff-card-border)] px-4 py-3 text-xs uppercase tracking-widest hover:border-[var(--ff-primary)] flex items-center gap-2">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
