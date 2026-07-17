import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, CheckCircle2, RefreshCw, ShieldCheck, WalletCards } from "lucide-react";
import Navbar from "../components/Navbar";
import StatusBadge from "../components/StatusBadge";
import { http } from "../lib/api";
import { toast } from "sonner";

const money = (value) => `R ${Number(value || 0).toFixed(2)}`;

const emptyForm = {
  account_name: "",
  bank_name: "",
  bank_code: "",
  account_number: "",
  email: "",
  phone: "",
};

export default function CreatorPayoutAccount() {
  const [profileState, setProfileState] = useState({
    profile: null,
    ready_for_payouts: false,
    payouts_enabled: true,
    payout_day: "Friday",
  });
  const [summary, setSummary] = useState({ summary: {}, history: [] });
  const [banks, setBanks] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [profileRes, summaryRes] = await Promise.all([
        http.get("/creator-payouts/profile"),
        http.get("/creator-payouts/summary"),
      ]);
      const nextProfileState = profileRes.data || {};
      const profile = nextProfileState.profile || {};
      setProfileState(nextProfileState);
      setSummary(summaryRes.data || { summary: {}, history: [] });
      setForm({
        account_name: profile.account_name || "",
        bank_name: profile.bank_name || "",
        bank_code: profile.bank_code || "",
        account_number: profile.account_number || "",
        email: profile.email || "",
        phone: profile.phone || "",
      });

      if (nextProfileState.payouts_enabled) {
        const bankRes = await http.get("/creator-payouts/banks");
        setBanks(bankRes.data?.data || []);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not load payout account");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedBank = useMemo(
    () => banks.find((bank) => String(bank.code) === String(form.bank_code)),
    [banks, form.bank_code],
  );

  const updateField = (key, value) => {
    if (key === "bank_code") {
      const bank = banks.find((item) => String(item.code) === String(value));
      setForm((current) => ({
        ...current,
        bank_code: value,
        bank_name: bank?.name || current.bank_name,
      }));
      return;
    }
    setForm((current) => ({ ...current, [key]: value }));
  };

  const saveAndVerify = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await http.put("/creator-payouts/profile", {
        ...form,
        bank_name: selectedBank?.name || form.bank_name,
      });
      const verified = await http.post("/creator-payouts/profile/verify");
      setProfileState((current) => ({
        ...current,
        ...(verified.data || {}),
        payouts_enabled: true,
      }));
      toast.success("Paystack payout account verified");
      await load();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not verify payout account");
    } finally {
      setSaving(false);
    }
  };

  const balances = summary.summary || {};
  const profile = profileState.profile || summary.profile || null;

  return (
    <div className="min-h-screen page-shell">
      <Navbar />
      <main className="pt-28 pb-16 max-w-6xl mx-auto px-4 sm:px-6 md:px-10">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
          <div>
            <p className="overline mb-2">Creator money</p>
            <h1 className="font-display text-5xl md:text-6xl uppercase leading-none">
              Friday Payout Account
            </h1>
            <p className="text-[var(--ff-muted-text)] mt-4 max-w-3xl">
              Link and verify the South African bank account that Paystack must use
              for your weekly FandomForge creator payouts.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/creator/earnings" className="btn-secondary">Back to earnings</Link>
            <button onClick={load} disabled={loading || saving} className="btn-secondary">
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </div>

        {!profileState.payouts_enabled && (
          <section className="card mb-6 border-[var(--ff-primary)]">
            <h2 className="font-display text-2xl uppercase mb-2">Payout setup is temporarily unavailable</h2>
            <p className="text-sm text-[var(--ff-muted-text)]">
              FandomForge has not enabled the Paystack creator-payout integration yet.
              Your earnings records remain available and no payout details will be lost.
            </p>
          </section>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="card">
            <p className="overline">Available</p>
            <p className="font-display text-3xl">{money(balances.available)}</p>
          </div>
          <div className="card">
            <p className="overline">In Friday batch</p>
            <p className="font-display text-3xl">{money(balances.in_batch)}</p>
          </div>
          <div className="card">
            <p className="overline">Paid</p>
            <p className="font-display text-3xl">{money(balances.paid)}</p>
          </div>
          <div className="card">
            <p className="overline">Account status</p>
            <div className="mt-2">
              <StatusBadge status={profile?.verification_status || "not_configured"} />
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_420px] gap-6">
          <section className="card">
            <div className="flex gap-3 items-start mb-6">
              <Building2 className="text-[var(--ff-primary)] shrink-0" />
              <div>
                <h2 className="font-display text-3xl uppercase">Bank account</h2>
                <p className="text-sm text-[var(--ff-muted-text)] mt-2">
                  Eligible payouts are processed every Friday into a linked and verified Paystack recipient account.
                </p>
              </div>
            </div>

            <form onSubmit={saveAndVerify} className="space-y-4">
              <div>
                <label className="label">Account holder name</label>
                <input
                  className="input-base"
                  required
                  autoComplete="name"
                  value={form.account_name}
                  onChange={(event) => updateField("account_name", event.target.value)}
                />
              </div>

              <div>
                <label className="label">Bank</label>
                <select
                  className="input-base"
                  required
                  value={form.bank_code}
                  onChange={(event) => updateField("bank_code", event.target.value)}
                  disabled={!profileState.payouts_enabled}
                >
                  <option value="">Select your bank</option>
                  {banks.map((bank) => (
                    <option key={bank.id || bank.code} value={bank.code}>
                      {bank.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Account number</label>
                <input
                  className="input-base"
                  required
                  inputMode="numeric"
                  autoComplete="off"
                  value={form.account_number}
                  onChange={(event) => updateField("account_number", event.target.value.replace(/\D/g, ""))}
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Email</label>
                  <input
                    className="input-base"
                    type="email"
                    value={form.email}
                    onChange={(event) => updateField("email", event.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input
                    className="input-base"
                    value={form.phone}
                    onChange={(event) => updateField("phone", event.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={saving || loading || !profileState.payouts_enabled}
                className="btn-primary w-full sm:w-auto"
              >
                <ShieldCheck size={15} />
                {saving ? "Verifying with Paystack…" : "Save and verify account"}
              </button>
            </form>
          </section>

          <div className="space-y-6">
            <section className="card">
              <WalletCards className="text-[var(--ff-primary)] mb-4" />
              <h2 className="font-display text-3xl uppercase mb-3">Payout readiness</h2>
              {profileState.ready_for_payouts ? (
                <div className="flex gap-3 items-start">
                  <CheckCircle2 className="text-[#34C759] shrink-0" />
                  <div>
                    <p className="font-bold">Ready for Friday payouts</p>
                    <p className="text-sm text-[var(--ff-muted-text)] mt-1">
                      Paystack recipient {profile?.paystack_recipient_code || "verified"} is linked.
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-[var(--ff-muted-text)]">
                  Save your bank account and complete Paystack verification before you can be included in a payout batch.
                </p>
              )}
            </section>

            <section className="card">
              <p className="overline mb-3">Important</p>
              <ul className="space-y-3 text-sm text-[var(--ff-muted-text)]">
                <li>Only eligible earnings from valid paid orders enter a Friday batch.</li>
                <li>Refunds and chargebacks may reduce a future available balance.</li>
                <li>Changing bank details requires Paystack verification again.</li>
                <li>Failed transfers remain owed and can be retried by FandomForge.</li>
              </ul>
            </section>
          </div>
        </div>

        <section className="mt-8">
          <div className="mb-4">
            <p className="overline mb-2">Payout history</p>
            <h2 className="font-display text-4xl uppercase">Your Paystack runs</h2>
          </div>
          <div className="border border-[var(--ff-card-border)] overflow-x-auto">
            <table className="table-brutal">
              <thead>
                <tr><th>Friday</th><th>Batch</th><th>Amount</th><th>Reference</th><th>Status</th><th>Note</th></tr>
              </thead>
              <tbody>
                {(summary.history || []).map((item) => (
                  <tr key={`${item.batch_id}-${item.reference || item.scheduled_for}`}>
                    <td>{item.scheduled_for || "—"}</td>
                    <td>{item.title || item.batch_id?.slice(0, 8)}</td>
                    <td>{money(item.amount)}</td>
                    <td className="font-mono text-xs">{item.reference || "—"}</td>
                    <td><StatusBadge status={item.status} /></td>
                    <td className="text-xs text-[var(--ff-primary)]">{item.failure_reason || ""}</td>
                  </tr>
                ))}
                {(summary.history || []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center overline text-[var(--ff-muted-text)]">
                      No payout runs yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
