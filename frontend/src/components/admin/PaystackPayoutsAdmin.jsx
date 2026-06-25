import React, { useEffect, useMemo, useState } from "react";
import { http } from "../../lib/api";
import StatusBadge from "../StatusBadge";
import { toast } from "sonner";
import { Building2, CreditCard, RefreshCw, Send, WalletCards } from "lucide-react";

const money = (value) => `R ${Number(value || 0).toFixed(2)}`;

const emptyProfile = {
  owner_type: "creator",
  owner_id: "",
  provider: "manual_eft",
  account_name: "",
  bank_name: "",
  bank_code: "",
  account_number: "",
  email: "",
  phone: "",
  notes: "",
  is_default: true,
};

export default function PaystackPayoutsAdmin() {
  const [tab, setTab] = useState("ledger");
  const [ledger, setLedger] = useState({ items: [], summary: {} });
  const [profiles, setProfiles] = useState([]);
  const [batches, setBatches] = useState([]);
  const [creators, setBands] = useState([]);
  const [printers, setPrinters] = useState([]);
  const [banks, setBanks] = useState([]);
  const [profileForm, setProfileForm] = useState(emptyProfile);
  const [batchForm, setBatchForm] = useState({ title: "", provider: "manual_eft", owner_type: "", min_amount: 1 });
  const [paystackSettings, setPaystackSettings] = useState({
    paystack_enabled: false,
    paystack_mode: "test",
    paystack_public_key: "",
    paystack_secret_key: "",
    paystack_secret_configured: false,
  });
  const [loading, setLoading] = useState(false);

  const ownerOptions = useMemo(() => {
    const creatorRows = creators.map((b) => ({ owner_type: "creator", owner_id: b.id, label: `Creator: ${b.name}` }));
    const printerRows = printers.map((p) => ({ owner_type: "printer", owner_id: p.id, label: `Printer: ${p.company_name}` }));
    return [...creatorRows, ...printerRows];
  }, [creators, printers]);

  const ownerLookup = useMemo(() => {
    const lookup = {};
    creators.forEach((b) => {
      lookup[`creator:${b.id}`] = b.name || b.slug || `Creator ${String(b.id || "").slice(0, 8)}`;
    });
    printers.forEach((p) => {
      lookup[`printer:${p.id}`] = p.company_name || p.contact_email || `Printer ${String(p.id || "").slice(0, 8)}`;
    });
    lookup["platform:platform"] = "Platform";
    return lookup;
  }, [creators, printers]);

  const ownerLabel = (row) => {
    if (!row) return "—";
    if (row.owner_display_name) return row.owner_display_name;
    if (row.owner_name) return row.owner_name;
    if (row.metadata?.owner_name) return row.metadata.owner_name;
    if (row.metadata?.owner_label) return row.metadata.owner_label;
    const key = `${row.owner_type}:${row.owner_id}`;
    return ownerLookup[key] || `${row.owner_type || "owner"} · ${String(row.owner_id || "").slice(0, 8)}`;
  };

  const ownerSubLabel = (row) => {
    if (!row) return "";
    if (row.owner_type === "platform") return "platform account";
    return `${row.owner_type || "owner"} · ${String(row.owner_id || "").slice(0, 8)}`;
  };

  const load = async () => {
    const [ledgerRes, profileRes, batchRes, bandRes, printerRes, gatewayRes] = await Promise.all([
      http.get("/admin/wallet-ledger"),
      http.get("/admin/payout-profiles"),
      http.get("/admin/payout-batches"),
      http.get("/admin/creators"),
      http.get("/printers"),
      http.get("/admin/payment-gateways"),
    ]);
    setLedger(ledgerRes.data || { items: [], summary: {} });
    setProfiles(profileRes.data || []);
    setBatches(batchRes.data || []);
    setBands(bandRes.data || []);
    setPrinters(printerRes.data || []);
    const paystackGateway = (gatewayRes.data || []).find((g) => g.key === "paystack") || {};
    setPaystackSettings({
      paystack_enabled: Boolean(paystackGateway.enabled),
      paystack_mode: paystackGateway.mode || "test",
      paystack_public_key: paystackGateway.public_config?.public_key || "",
      paystack_secret_key: "",
      paystack_secret_configured: Boolean(paystackGateway.secret_configured),
    });
  };

  useEffect(() => {
    load().catch((e) => toast.error(e.response?.data?.detail || "Failed to load payouts"));
  }, []);

  const loadBanks = async () => {
    try {
      const r = await http.get("/admin/paystack/banks?currency=ZAR");
      setBanks(r.data?.data || []);
      toast.success("Banks loaded from Paystack");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not load Paystack banks");
    }
  };

  const rebuildLedger = async () => {
    setLoading(true);
    try {
      const r = await http.post("/admin/wallet-ledger/rebuild");
      toast.success(`Ledger synced: ${r.data.created || 0} new entries`);
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Ledger rebuild failed");
    } finally {
      setLoading(false);
    }
  };

  const createProfile = async (e) => {
    e.preventDefault();
    if (!profileForm.owner_id) {
      toast.error("Select a creator or printer");
      return;
    }
    try {
      await http.post("/admin/payout-profiles", profileForm);
      toast.success("Payout profile saved");
      setProfileForm(emptyProfile);
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not save profile");
    }
  };

  const createPaystackRecipient = async (profile) => {
    if (!window.confirm(`Create Paystack recipient for ${profile.account_name}?`)) return;
    try {
      await http.post(`/admin/payout-profiles/${profile.id}/paystack-recipient`);
      toast.success("Paystack recipient created");
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not create Paystack recipient");
    }
  };

  const createBatch = async (e) => {
    e.preventDefault();
    try {
      await http.post("/admin/payout-batches", {
        ...batchForm,
        owner_type: batchForm.owner_type || null,
        min_amount: Number(batchForm.min_amount || 1),
      });
      toast.success("Payout batch created");
      setBatchForm({ title: "", provider: "manual_eft", owner_type: "", min_amount: 1 });
      await load();
      setTab("batches");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not create batch");
    }
  };

  const approveBatch = async (batch) => {
    try {
      await http.post(`/admin/payout-batches/${batch.id}/approve`);
      toast.success("Batch approved");
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not approve batch");
    }
  };

  const markBatchPaid = async (batch) => {
    const ref = window.prompt("Payment reference / EFT batch reference", `EFT-${batch.id.slice(0, 8).toUpperCase()}`);
    if (ref === null) return;
    try {
      await http.post(`/admin/payout-batches/${batch.id}/mark-paid`, { payment_reference: ref });
      toast.success("Batch marked paid");
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not mark batch paid");
    }
  };

  const sendPaystack = async (batch) => {
    if (!window.confirm("Send this batch through Paystack Transfers? This may move real money if live keys are configured.")) return;
    try {
      await http.post(`/admin/payout-batches/${batch.id}/send-paystack`);
      toast.success("Paystack transfer request submitted");
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Paystack transfer failed");
    }
  };

  const savePaystackSettings = async () => {
    try {
      await http.patch("/admin/payment-gateways/paystack", {
        enabled: paystackSettings.paystack_enabled,
        mode: paystackSettings.paystack_mode,
        public_config: {
          public_key: paystackSettings.paystack_public_key,
          currency: "ZAR",
          channels: ["card", "bank"],
        },
        settings: {
          secret_key: paystackSettings.paystack_secret_key,
        },
      });
      toast.success("Paystack settings saved");
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not save Paystack settings");
    }
  };

  const selectedOwner = ownerOptions.find((o) => o.owner_type === profileForm.owner_type && o.owner_id === profileForm.owner_id);

  return (
    <div data-testid="admin-paystack-payouts">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
        <div>
          <p className="overline mb-2">Wallet / Paystack</p>
          <h1 className="font-display text-5xl uppercase">Paystack Payouts</h1>
          <p className="text-[var(--ff-muted-text)] mt-2 max-w-3xl">
            Build weekly payout batches from the internal ledger. Pay manually by EFT now, or use Paystack Transfers once recipient profiles and keys are configured.
          </p>
        </div>
        <button onClick={rebuildLedger} disabled={loading} className="btn-secondary">
          <RefreshCw size={14} /> Sync ledger
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {[
          ["ledger", "Ledger"],
          ["profiles", "Payout Profiles"],
          ["batches", "Batches"],
          ["paystack", "Paystack Setup"],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={tab === key ? "btn-primary" : "btn-secondary"}>
            {label}
          </button>
        ))}
      </div>

      {tab === "ledger" && (
        <div className="space-y-6">
          <div className="grid md:grid-cols-4 gap-4">
            <div className="card"><div className="overline">Creator available</div><div className="font-display text-3xl">{money(ledger.summary?.["creator:available"])}</div></div>
            <div className="card"><div className="overline">Printer available</div><div className="font-display text-3xl">{money(ledger.summary?.["printer:available"])}</div></div>
            <div className="card"><div className="overline">In batch</div><div className="font-display text-3xl">{money((ledger.summary?.["creator:in_batch"] || 0) + (ledger.summary?.["printer:in_batch"] || 0))}</div></div>
            <div className="card"><div className="overline">Paid</div><div className="font-display text-3xl">{money((ledger.summary?.["creator:paid"] || 0) + (ledger.summary?.["printer:paid"] || 0))}</div></div>
          </div>
          <div className="border border-[var(--ff-card-border)] overflow-x-auto">
            <table className="table-brutal">
              <thead><tr><th>Date</th><th>Owner</th><th>Type</th><th>Order</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>
                {(ledger.items || []).map((row) => (
                  <tr key={row.id}>
                    <td>{row.created_at ? new Date(row.created_at).toLocaleDateString() : "—"}</td>
                    <td>
                      <div className="font-bold">{ownerLabel(row)}</div>
                      <div className="text-xs text-[var(--ff-muted-text)]">{ownerSubLabel(row)}</div>
                    </td>
                    <td>{row.type}</td>
                    <td>{row.order_number || row.order_id?.slice(0, 8)}</td>
                    <td>{money(row.amount)}</td>
                    <td><StatusBadge status={row.status} /></td>
                  </tr>
                ))}
                {(ledger.items || []).length === 0 && <tr><td colSpan={6} className="text-center text-[var(--ff-muted-text)] p-8 overline">No ledger entries yet. Sync ledger after paid orders exist.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "profiles" && (
        <div className="grid lg:grid-cols-[420px_1fr] gap-6">
          <form onSubmit={createProfile} className="card space-y-4 h-fit">
            <div className="overline">Create payout profile</div>
            <div>
              <label className="label">Owner</label>
              <select
                className="input-base"
                value={`${profileForm.owner_type}::${profileForm.owner_id}`}
                onChange={(e) => {
                  const [owner_type, owner_id] = e.target.value.split("::");
                  setProfileForm({ ...profileForm, owner_type, owner_id });
                }}
              >
                <option value="creator::">Select owner</option>
                {ownerOptions.map((o) => <option key={`${o.owner_type}-${o.owner_id}`} value={`${o.owner_type}::${o.owner_id}`}>{o.label}</option>)}
              </select>
              {selectedOwner && <p className="text-xs text-[var(--ff-muted-text)] mt-1">{selectedOwner.label}</p>}
            </div>
            <div>
              <label className="label">Provider</label>
              <select className="input-base" value={profileForm.provider} onChange={(e) => setProfileForm({ ...profileForm, provider: e.target.value })}>
                <option value="manual_eft">Manual EFT</option>
                <option value="paystack">Paystack Transfers</option>
              </select>
            </div>
            <div><label className="label">Account holder name</label><input className="input-base" required value={profileForm.account_name} onChange={(e) => setProfileForm({ ...profileForm, account_name: e.target.value })} /></div>
            <div><label className="label">Bank name</label><input className="input-base" value={profileForm.bank_name} onChange={(e) => setProfileForm({ ...profileForm, bank_name: e.target.value })} /></div>
            <div><label className="label">Bank code</label><input className="input-base" value={profileForm.bank_code} onChange={(e) => setProfileForm({ ...profileForm, bank_code: e.target.value })} /></div>
            <div><label className="label">Account number</label><input className="input-base" value={profileForm.account_number} onChange={(e) => setProfileForm({ ...profileForm, account_number: e.target.value })} /></div>
            <div><label className="label">Email</label><input className="input-base" type="email" value={profileForm.email || ""} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} /></div>
            <button className="btn-primary w-full" type="submit"><CreditCard size={14} /> Save profile</button>
          </form>

          <div className="border border-[var(--ff-card-border)] overflow-x-auto">
            <table className="table-brutal">
              <thead><tr><th>Owner</th><th>Provider</th><th>Account</th><th>Bank</th><th>Recipient</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="font-bold">{ownerLabel(p)}</div>
                      <div className="text-xs text-[var(--ff-muted-text)]">{ownerSubLabel(p)}</div>
                    </td>
                    <td>{p.provider}</td>
                    <td>{p.account_name}<div className="text-xs text-[var(--ff-muted-text)]">{p.account_number}</div></td>
                    <td>{p.bank_name}<div className="text-xs text-[var(--ff-muted-text)]">{p.bank_code}</div></td>
                    <td className="font-mono text-xs">{p.paystack_recipient_code || "—"}</td>
                    <td><StatusBadge status={p.verification_status} /></td>
                    <td className="text-right">
                      {p.provider === "paystack" && !p.paystack_recipient_code && (
                        <button onClick={() => createPaystackRecipient(p)} className="text-xs uppercase tracking-widest text-[#34C759] font-bold">Create recipient</button>
                      )}
                    </td>
                  </tr>
                ))}
                {profiles.length === 0 && <tr><td colSpan={7} className="text-center text-[var(--ff-muted-text)] p-8 overline">No payout profiles yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "batches" && (
        <div className="space-y-6">
          <form onSubmit={createBatch} className="card grid md:grid-cols-5 gap-3 items-end">
            <div className="md:col-span-2"><label className="label">Batch title</label><input className="input-base" value={batchForm.title} onChange={(e) => setBatchForm({ ...batchForm, title: e.target.value })} placeholder="Weekly payout batch" /></div>
            <div><label className="label">Provider</label><select className="input-base" value={batchForm.provider} onChange={(e) => setBatchForm({ ...batchForm, provider: e.target.value })}><option value="manual_eft">Manual EFT</option><option value="paystack">Paystack</option></select></div>
            <div><label className="label">Owner type</label><select className="input-base" value={batchForm.owner_type} onChange={(e) => setBatchForm({ ...batchForm, owner_type: e.target.value })}><option value="">Creators + Printers</option><option value="creator">Creators only</option><option value="printer">Printers only</option></select></div>
            <button className="btn-primary" type="submit"><WalletCards size={14} /> Create batch</button>
          </form>

          <div className="space-y-4">
            {batches.map((b) => (
              <div key={b.id} className="card">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
                  <div>
                    <div className="overline mb-1">{b.provider}</div>
                    <h3 className="font-display text-3xl uppercase">{b.title}</h3>
                    <p className="text-sm text-[var(--ff-muted-text)]">{(b.items || []).length} recipients · {money(b.total_amount)}</p>
                  </div>
                  <div className="flex gap-2 items-center flex-wrap">
                    <StatusBadge status={b.status} />
                    {b.status === "draft" && <button onClick={() => approveBatch(b)} className="btn-secondary">Approve</button>}
                    {b.status === "approved" && b.provider === "paystack" && <button onClick={() => sendPaystack(b)} className="btn-primary"><Send size={14} /> Send Paystack</button>}
                    {!["paid"].includes(b.status) && <button onClick={() => markBatchPaid(b)} className="btn-secondary">Mark paid</button>}
                  </div>
                </div>
                <div className="border border-[var(--ff-card-border)] overflow-x-auto">
                  <table className="table-brutal">
                    <thead><tr><th>Recipient</th><th>Amount</th><th>Provider</th><th>Reference</th><th>Status</th><th>Failure</th></tr></thead>
                    <tbody>{(b.items || []).map((i) => <tr key={i.id}><td><div className="font-bold">{ownerLabel(i)}</div><div className="text-xs text-[var(--ff-muted-text)]">{ownerSubLabel(i)}</div></td><td>{money(i.amount)}</td><td>{i.provider}</td><td className="font-mono text-xs">{i.provider_reference || i.provider_transfer_code || "—"}</td><td><StatusBadge status={i.status} /></td><td className="text-xs text-[var(--ff-primary)]">{i.failure_reason || ""}</td></tr>)}</tbody>
                  </table>
                </div>
              </div>
            ))}
            {batches.length === 0 && <div className="card text-[var(--ff-muted-text)] overline">No payout batches yet</div>}
          </div>
        </div>
      )}

      {tab === "paystack" && (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="card space-y-4">
            <Building2 className="text-[var(--ff-primary)]" />
            <div>
              <h2 className="font-display text-3xl uppercase mb-2">Paystack setup</h2>
              <p className="text-[var(--ff-muted-text)] text-sm">
                Configure Paystack from the UI. The secret key is stored server-side in platform settings and is masked after saving.
              </p>
            </div>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={paystackSettings.paystack_enabled}
                onChange={(e) => setPaystackSettings({ ...paystackSettings, paystack_enabled: e.target.checked })}
              />
              Enable Paystack payout tools
            </label>

            <div>
              <label className="label">Mode</label>
              <select
                className="input-base"
                value={paystackSettings.paystack_mode}
                onChange={(e) => setPaystackSettings({ ...paystackSettings, paystack_mode: e.target.value })}
              >
                <option value="test">Test / Sandbox</option>
                <option value="live">Live</option>
              </select>
            </div>

            <div>
              <label className="label">Public key</label>
              <input
                className="input-base font-mono text-xs"
                value={paystackSettings.paystack_public_key}
                onChange={(e) => setPaystackSettings({ ...paystackSettings, paystack_public_key: e.target.value })}
                placeholder="pk_test_xxxxxxxxxxxxxxxxx"
              />
            </div>

            <div>
              <label className="label">Secret key</label>
              <input
                className="input-base font-mono text-xs"
                type="password"
                value={paystackSettings.paystack_secret_key}
                onChange={(e) => setPaystackSettings({ ...paystackSettings, paystack_secret_key: e.target.value })}
                placeholder={paystackSettings.paystack_secret_configured ? "Secret key already saved — enter a new one to replace" : "sk_test_xxxxxxxxxxxxxxxxx"}
              />
              <p className="text-xs text-[var(--ff-muted-text)] mt-1">
                Status: {paystackSettings.paystack_secret_configured ? "Secret key configured" : "No secret key saved"}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button onClick={savePaystackSettings} className="btn-primary">Save Paystack settings</button>
              <button onClick={loadBanks} className="btn-secondary">Load South African banks</button>
            </div>
          </div>
          <div className="card">
            <div className="overline mb-3">Banks</div>
            <div className="max-h-[420px] overflow-auto border border-[var(--ff-card-border)]">
              <table className="table-brutal">
                <thead><tr><th>Name</th><th>Code</th></tr></thead>
                <tbody>{banks.map((b) => <tr key={b.id || b.code}><td>{b.name}</td><td className="font-mono text-xs">{b.code}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
