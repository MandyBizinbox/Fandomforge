import React, { useCallback, useEffect, useMemo, useState } from "react";
import { http } from "../../lib/api";
import StatusBadge from "../StatusBadge";
import { toast } from "sonner";
import {
  Building2,
  CheckCircle2,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  WalletCards,
} from "lucide-react";

const money = (value) => `R ${Number(value || 0).toFixed(2)}`;

function ownerLabel(row) {
  return (
    row?.owner_display_name
    || row?.owner_name
    || row?.metadata?.owner_name
    || `${row?.owner_type || "owner"} · ${String(row?.owner_id || "").slice(0, 8)}`
  );
}

export default function PaystackPayoutsAdmin() {
  const [tab, setTab] = useState("ledger");
  const [ledger, setLedger] = useState({ items: [], summary: {} });
  const [profiles, setProfiles] = useState([]);
  const [batches, setBatches] = useState([]);
  const [readiness, setReadiness] = useState(null);
  const [banks, setBanks] = useState([]);
  const [settings, setSettings] = useState({
    enabled: false,
    mode: "test",
    public_key: "",
    secret_key: "",
    secret_configured: false,
    webhook_path: "/api/payments/webhooks/paystack",
  });
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const [ledgerRes, profileRes, batchRes, readinessRes, settingsRes] = await Promise.all([
      http.get("/admin/wallet-ledger"),
      http.get("/admin/payout-profiles"),
      http.get("/admin/payout-batches"),
      http.get("/admin/payout-batches/friday/readiness"),
      http.get("/admin/payout-settings"),
    ]);

    setLedger(ledgerRes.data || { items: [], summary: {} });
    setProfiles(profileRes.data || []);
    setBatches(batchRes.data || []);
    setReadiness(readinessRes.data || null);
    setSettings((current) => ({
      ...current,
      ...(settingsRes.data || {}),
      secret_key: "",
    }));
  }, []);

  useEffect(() => {
    load().catch((error) => {
      toast.error(error.response?.data?.detail || "Failed to load creator payouts");
    });
  }, [load]);

  const run = async (action, successMessage) => {
    setLoading(true);
    try {
      const result = await action();
      toast.success(successMessage);
      await load();
      return result;
    } catch (error) {
      toast.error(error.response?.data?.detail || "Payout action failed");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const syncLedger = () => run(
    () => http.post("/admin/wallet-ledger/rebuild"),
    "Creator ledger synchronized",
  );

  const reconcileRefunds = () => run(
    () => http.post("/admin/wallet-ledger/reconcile-refunds"),
    "Refund adjustments reconciled",
  );

  const createFridayBatch = () => run(
    () => http.post("/admin/payout-batches/friday", {
      title: readiness?.scheduled_for
        ? `Friday creator payouts ${readiness.scheduled_for}`
        : "Friday creator payouts",
      min_amount: 1,
    }),
    readiness?.existing_batch ? "Existing Friday batch loaded" : "Friday payout batch created",
  );

  const approveBatch = (batch) => run(
    () => http.post(`/admin/payout-batches/${batch.id}/approve`),
    "Payout batch approved",
  );

  const sendBatch = (batch) => {
    if (!window.confirm(
      `Send ${money(batch.total_amount)} to ${(batch.items || []).length} verified creator account(s) through Paystack?`,
    )) return null;
    return run(
      () => http.post(`/admin/payout-batches/${batch.id}/send-paystack`),
      "Paystack transfer requests submitted",
    );
  };

  const reconcileBatch = (batch) => run(
    () => http.post(`/admin/payout-batches/${batch.id}/reconcile`),
    "Transfer statuses reconciled",
  );

  const retryFailed = (batch) => {
    if (!window.confirm("Retry only the failed or reversed payouts in this batch?")) return null;
    return run(
      () => http.post(`/admin/payout-batches/${batch.id}/retry-failed`),
      "Failed payouts resubmitted",
    );
  };

  const createRecipient = (profile) => run(
    () => http.post(`/admin/payout-profiles/${profile.id}/paystack-recipient`),
    "Paystack recipient created",
  );

  const saveSettings = () => run(
    () => http.patch("/admin/payout-settings", {
      enabled: settings.enabled,
      mode: settings.mode,
      public_key: settings.public_key,
      secret_key: settings.secret_key || null,
    }),
    "Creator payout settings saved",
  );

  const loadBanks = async () => {
    setLoading(true);
    try {
      const response = await http.get("/admin/paystack/banks?currency=ZAR");
      setBanks(response.data?.data || []);
      toast.success("South African banks loaded");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not load Paystack banks");
    } finally {
      setLoading(false);
    }
  };

  const totals = useMemo(() => {
    const summary = ledger.summary || {};
    return {
      available: summary["creator:available"] || 0,
      inBatch: summary["creator:in_batch"] || 0,
      paid: summary["creator:paid"] || 0,
      reversed: summary["creator:reversed"] || 0,
    };
  }, [ledger.summary]);

  return (
    <div data-testid="admin-paystack-payouts">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-8">
        <div>
          <p className="overline mb-2">Creator finance</p>
          <h1 className="font-display text-5xl uppercase">Friday Paystack Payouts</h1>
          <p className="text-[var(--ff-muted-text)] mt-2 max-w-3xl">
            Build one verified creator batch for each Friday, send it through Paystack,
            reconcile provider outcomes and retry failed transfers without duplicating payouts.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={syncLedger} disabled={loading} className="btn-secondary">
            <RefreshCw size={14} /> Sync ledger
          </button>
          <button onClick={reconcileRefunds} disabled={loading} className="btn-secondary">
            <RotateCcw size={14} /> Reconcile refunds
          </button>
          <button onClick={createFridayBatch} disabled={loading} className="btn-primary">
            <WalletCards size={14} /> Create Friday batch
          </button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="card">
          <div className="overline">Creator available</div>
          <div className="font-display text-3xl">{money(totals.available)}</div>
        </div>
        <div className="card">
          <div className="overline">In payout batches</div>
          <div className="font-display text-3xl">{money(totals.inBatch)}</div>
        </div>
        <div className="card">
          <div className="overline">Creator paid</div>
          <div className="font-display text-3xl">{money(totals.paid)}</div>
        </div>
        <div className="card">
          <div className="overline">Reversed before payout</div>
          <div className="font-display text-3xl">{money(totals.reversed)}</div>
        </div>
      </div>

      <section className="card mb-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <p className="overline mb-2">Next payout run</p>
            <h2 className="font-display text-3xl uppercase">
              Friday {readiness?.scheduled_for || "—"}
            </h2>
            <p className="text-sm text-[var(--ff-muted-text)] mt-2">
              {readiness?.ready_creator_count || 0} creator account(s) ready.
              {" "}
              {(readiness?.blocked_creators || []).length} blocked by missing or unverified Paystack details.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <StatusBadge status={settings.enabled && settings.secret_configured ? "active" : "pending"} />
            {readiness?.existing_batch && <StatusBadge status={readiness.existing_batch.status} />}
          </div>
        </div>

        {(readiness?.blocked_creators || []).length > 0 && (
          <div className="mt-5 border border-[var(--ff-card-border)] overflow-x-auto">
            <table className="table-brutal">
              <thead>
                <tr><th>Blocked creator</th><th>Reason</th></tr>
              </thead>
              <tbody>
                {readiness.blocked_creators.map((item) => (
                  <tr key={item.owner_id}>
                    <td>{item.owner_name || item.owner_id}</td>
                    <td>{item.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-2 mb-6">
        {[
          ["ledger", "Ledger"],
          ["profiles", "Verified Accounts"],
          ["batches", "Payout Batches"],
          ["settings", "Paystack Setup"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={tab === key ? "btn-primary" : "btn-secondary"}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "ledger" && (
        <div className="border border-[var(--ff-card-border)] overflow-x-auto">
          <table className="table-brutal">
            <thead>
              <tr><th>Date</th><th>Creator</th><th>Type</th><th>Order</th><th>Amount</th><th>Status</th></tr>
            </thead>
            <tbody>
              {(ledger.items || []).filter((row) => row.owner_type === "creator").map((row) => (
                <tr key={row.id}>
                  <td>{row.created_at ? new Date(row.created_at).toLocaleDateString() : "—"}</td>
                  <td>{ownerLabel(row)}</td>
                  <td>{String(row.type || "").replaceAll("_", " ")}</td>
                  <td>{row.order_number || row.order_id?.slice(0, 8) || "—"}</td>
                  <td>{money(row.amount)}</td>
                  <td><StatusBadge status={row.status} /></td>
                </tr>
              ))}
              {(ledger.items || []).filter((row) => row.owner_type === "creator").length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-[var(--ff-muted-text)] p-8 overline">
                    No creator ledger entries yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "profiles" && (
        <div className="space-y-4">
          <div className="card flex gap-3 items-start">
            <ShieldCheck className="text-[var(--ff-primary)] shrink-0" />
            <p className="text-sm text-[var(--ff-muted-text)]">
              Creators save and verify their own payout account at <strong>/creator/payouts</strong>.
              Only profiles with a verified Paystack recipient are included in Friday batches.
            </p>
          </div>

          <div className="border border-[var(--ff-card-border)] overflow-x-auto">
            <table className="table-brutal">
              <thead>
                <tr><th>Creator</th><th>Account</th><th>Bank</th><th>Recipient</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {profiles.filter((profile) => profile.owner_type === "creator").map((profile) => (
                  <tr key={profile.id}>
                    <td>{ownerLabel(profile)}</td>
                    <td>
                      {profile.account_name}
                      <div className="text-xs text-[var(--ff-muted-text)]">
                        ••••{String(profile.account_number || "").slice(-4)}
                      </div>
                    </td>
                    <td>{profile.bank_name || profile.bank_code || "—"}</td>
                    <td className="font-mono text-xs">{profile.paystack_recipient_code || "—"}</td>
                    <td><StatusBadge status={profile.verification_status} /></td>
                    <td className="text-right">
                      {profile.provider === "paystack" && !profile.paystack_recipient_code && (
                        <button
                          onClick={() => createRecipient(profile)}
                          disabled={loading}
                          className="text-xs uppercase tracking-widest text-[var(--ff-primary)] font-bold"
                        >
                          Verify recipient
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {profiles.filter((profile) => profile.owner_type === "creator").length === 0 && (
                  <tr><td colSpan={6} className="text-center p-8 overline text-[var(--ff-muted-text)]">No creator payout accounts yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "batches" && (
        <div className="space-y-4">
          {batches.map((batch) => {
            const failedCount = (batch.items || []).filter((item) => item.status === "failed").length;
            const processingCount = (batch.items || []).filter((item) => item.status === "processing").length;

            return (
              <article key={batch.id} className="card">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-4">
                  <div>
                    <p className="overline mb-1">
                      {batch.provider} · {batch.scheduled_for ? `Friday ${batch.scheduled_for}` : "Legacy batch"}
                    </p>
                    <h3 className="font-display text-3xl uppercase">{batch.title}</h3>
                    <p className="text-sm text-[var(--ff-muted-text)] mt-1">
                      {(batch.items || []).length} creator(s) · {money(batch.total_amount)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <StatusBadge status={batch.status} />
                    {batch.status === "draft" && (
                      <button onClick={() => approveBatch(batch)} disabled={loading} className="btn-secondary">
                        <CheckCircle2 size={14} /> Approve
                      </button>
                    )}
                    {batch.status === "approved" && (
                      <button onClick={() => sendBatch(batch)} disabled={loading} className="btn-primary">
                        <Send size={14} /> Send Friday payouts
                      </button>
                    )}
                    {processingCount > 0 && (
                      <button onClick={() => reconcileBatch(batch)} disabled={loading} className="btn-secondary">
                        <RefreshCw size={14} /> Reconcile
                      </button>
                    )}
                    {failedCount > 0 && (
                      <button onClick={() => retryFailed(batch)} disabled={loading} className="btn-secondary">
                        <RotateCcw size={14} /> Retry failed
                      </button>
                    )}
                  </div>
                </div>

                {(batch.skipped_items || []).length > 0 && (
                  <div className="mb-4 border border-[var(--ff-card-border)] p-4">
                    <p className="overline mb-2">Excluded from this run</p>
                    <div className="space-y-1 text-sm text-[var(--ff-muted-text)]">
                      {batch.skipped_items.map((item, index) => (
                        <div key={`${item.owner_id}-${index}`}>
                          {item.owner_name || item.owner_id}: {item.reason}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="border border-[var(--ff-card-border)] overflow-x-auto">
                  <table className="table-brutal">
                    <thead>
                      <tr><th>Creator</th><th>Amount</th><th>Reference</th><th>Attempts</th><th>Status</th><th>Failure</th></tr>
                    </thead>
                    <tbody>
                      {(batch.items || []).map((item) => (
                        <tr key={item.id}>
                          <td>{ownerLabel(item)}</td>
                          <td>{money(item.amount)}</td>
                          <td className="font-mono text-xs">{item.provider_reference || "—"}</td>
                          <td>{item.attempt_count || 0}</td>
                          <td><StatusBadge status={item.status} /></td>
                          <td className="text-xs text-[var(--ff-primary)]">{item.failure_reason || ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            );
          })}

          {batches.length === 0 && (
            <div className="card text-[var(--ff-muted-text)] overline">No payout batches yet</div>
          )}
        </div>
      )}

      {tab === "settings" && (
        <div className="grid lg:grid-cols-2 gap-6">
          <section className="card space-y-4">
            <Building2 className="text-[var(--ff-primary)]" />
            <div>
              <h2 className="font-display text-3xl uppercase mb-2">Creator payout integration</h2>
              <p className="text-sm text-[var(--ff-muted-text)]">
                These credentials are used only for Paystack transfer recipients and creator payouts.
                Checkout and subscription billing keep their separate settings.
              </p>
            </div>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })}
              />
              Enable Friday creator payouts
            </label>

            <div>
              <label className="label">Mode</label>
              <select
                className="input-base"
                value={settings.mode}
                onChange={(event) => setSettings({ ...settings, mode: event.target.value })}
              >
                <option value="test">Test</option>
                <option value="live">Live</option>
              </select>
            </div>

            <div>
              <label className="label">Public key</label>
              <input
                className="input-base font-mono text-xs"
                value={settings.public_key || ""}
                onChange={(event) => setSettings({ ...settings, public_key: event.target.value })}
                placeholder="pk_test_..."
              />
            </div>

            <div>
              <label className="label">Payout secret key</label>
              <input
                className="input-base font-mono text-xs"
                type="password"
                value={settings.secret_key || ""}
                onChange={(event) => setSettings({ ...settings, secret_key: event.target.value })}
                placeholder={settings.secret_configured ? "Secret configured — enter only to replace" : "sk_test_..."}
              />
              <p className="text-xs text-[var(--ff-muted-text)] mt-1">
                Status: {settings.secret_configured ? "Configured" : "Not configured"}
              </p>
            </div>

            <div className="border border-[var(--ff-card-border)] p-3 text-xs text-[var(--ff-muted-text)]">
              Paystack webhook URL: <span className="font-mono">{settings.webhook_path}</span>
            </div>

            <div className="flex flex-wrap gap-2">
              <button onClick={saveSettings} disabled={loading} className="btn-primary">
                Save payout settings
              </button>
              <button onClick={loadBanks} disabled={loading} className="btn-secondary">
                Load South African banks
              </button>
            </div>
          </section>

          <section className="card">
            <p className="overline mb-3">Paystack banks</p>
            <div className="max-h-[520px] overflow-auto border border-[var(--ff-card-border)]">
              <table className="table-brutal">
                <thead><tr><th>Name</th><th>Code</th></tr></thead>
                <tbody>
                  {banks.map((bank) => (
                    <tr key={bank.id || bank.code}>
                      <td>{bank.name}</td>
                      <td className="font-mono text-xs">{bank.code}</td>
                    </tr>
                  ))}
                  {banks.length === 0 && (
                    <tr><td colSpan={2} className="p-8 text-center overline text-[var(--ff-muted-text)]">Load banks to verify the payout integration</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
