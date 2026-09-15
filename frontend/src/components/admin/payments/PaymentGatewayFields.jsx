import React from "react";
import { toast } from "sonner";

export const gatewayLabels = {
  manual_eft: "Manual EFT",
  paystack: "Paystack",
  payfast: "PayFast",
  yoco: "Yoco",
};

export function TextInput({ label, value, onChange, placeholder = "", type = "text", help = "" }) {
  return (
    <div>
      <label className="ff-admin-label">{label}</label>
      <input className="ff-admin-control" type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {help && <p className="text-xs ff-admin-muted mt-1">{help}</p>}
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
      <label className="ff-admin-label">{label}</label>
      <div className="ff-admin-control flex items-center justify-between gap-3 min-h-[46px]">
        <span className="font-mono text-xs truncate text-[var(--ff-card-text)]">{value}</span>
        <button type="button" onClick={copy} className="text-[var(--ff-primary)] text-xs font-bold uppercase tracking-widest shrink-0">Copy</button>
      </div>
      {help && <p className="text-xs ff-admin-muted mt-1">{help}</p>}
    </div>
  );
}

export function PaystackSetupUrls() {
  const callbackUrl = originUrl("/api/payments/paystack/callback");
  const webhookUrl = originUrl("/api/payments/webhooks/paystack");
  return (
    <div className="ff-admin-subpanel p-4 space-y-3">
      <div>
        <p className="overline mb-1">Paystack Dashboard URLs</p>
        <p className="text-xs ff-admin-muted">Paste these into the platform manager/client Paystack dashboard for buyer checkout payments. These are not for owner subscription billing.</p>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <CopyUrlBox label="Test/Live Callback URL" value={callbackUrl} help="Paystack redirects the buyer here after checkout if the dashboard callback is used. FandomForge still sends a per-order callback during payment initialization." />
        <CopyUrlBox label="Test/Live Webhook URL" value={webhookUrl} help="Paystack sends charge.success and other checkout events here. This endpoint uses the shop checkout secret key." />
      </div>
    </div>
  );
}

export function GatewayShell({ gateway, children, onChange, onSave, saving }) {
  return (
    <div className="ff-admin-card p-5 space-y-4">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <div className="overline mb-2">{gateway.key}</div>
          <h3 className="font-display text-3xl uppercase">{gatewayLabels[gateway.key] || gateway.display_name}</h3>
          <p className="text-sm ff-admin-muted max-w-2xl mt-2">{gateway.description || "Configure this checkout payment method."}</p>
        </div>
        <label className="flex items-center gap-3 text-sm font-bold uppercase tracking-widest">
          <input type="checkbox" checked={gateway.enabled} onChange={(e) => onChange({ ...gateway, enabled: e.target.checked })} />
          Enabled
        </label>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <TextInput label="Checkout display name" value={gateway.display_name} onChange={(v) => onChange({ ...gateway, display_name: v })} />
        <div>
          <label className="ff-admin-label">Mode</label>
          <select className="ff-admin-control" value={gateway.mode} onChange={(e) => onChange({ ...gateway, mode: e.target.value })}>
            <option value="test">Test / Sandbox</option>
            <option value="live">Live</option>
          </select>
        </div>
        <TextInput label="Sort order" type="number" value={gateway.sort_order} onChange={(v) => onChange({ ...gateway, sort_order: Number(v || 0) })} />
        <div className="flex items-end">
          <button type="button" onClick={onSave} disabled={saving} className="ff-admin-button ff-admin-button--primary w-full">
            {saving ? "Saving…" : "Save Gateway"}
          </button>
        </div>
      </div>

      <div>
        <label className="ff-admin-label">Checkout description</label>
        <textarea className="ff-admin-control" rows={2} value={gateway.description || ""} onChange={(e) => onChange({ ...gateway, description: e.target.value })} />
      </div>

      {children}
    </div>
  );
}
