import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";
import StatusBadge from "../StatusBadge";
import { http } from "../../lib/api";
import { toast } from "sonner";

const emptyForm = {
  account_name: "",
  bank_name: "",
  bank_code: "",
  account_number: "",
  email: "",
  phone: "",
};

function maskAccountNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "Not supplied";
  if (digits.length <= 4) return digits;
  return `${"•".repeat(Math.min(8, digits.length - 4))}${digits.slice(-4)}`;
}

export default function CreatorPayoutSettings() {
  const [profileState, setProfileState] = useState({
    profile: null,
    ready_for_payouts: false,
    payouts_enabled: true,
    payout_day: "Friday",
  });
  const [banks, setBanks] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const profileRes = await http.get("/creator-payouts/profile");
      const nextState = profileRes.data || {};
      const profile = nextState.profile || {};
      setProfileState(nextState);
      setForm({
        account_name: profile.account_name || "",
        bank_name: profile.bank_name || "",
        bank_code: profile.bank_code || "",
        account_number: profile.account_number || "",
        email: profile.email || "",
        phone: profile.phone || "",
      });

      if (nextState.payouts_enabled) {
        const bankRes = await http.get("/creator-payouts/banks");
        setBanks(bankRes.data?.data || []);
      }

      setEditing(!nextState.ready_for_payouts);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not load payout details");
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
      await http.post("/creator-payouts/profile/verify");
      toast.success("Paystack payout account verified");
      await load();
      setEditing(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not verify payout account");
    } finally {
      setSaving(false);
    }
  };

  const profile = profileState.profile || null;

  if (loading) {
    return <div className="overline">Loading payout details…</div>;
  }

  return (
    <div className="space-y-6" data-testid="creator-payout-settings">
      <section className="card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex gap-3 items-start">
            <Building2 className="text-[var(--ff-primary)] shrink-0" />
            <div>
              <p className="overline mb-2">Paystack payouts</p>
              <h2 className="font-display text-3xl uppercase">Payout account</h2>
              <p className="text-sm text-[var(--ff-muted-text)] mt-2 max-w-2xl">
                Link the South African bank account used for weekly FandomForge creator payouts.
                Eligible payouts are processed every Friday.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={profile?.verification_status || "not_configured"} />
            <button
              type="button"
              className="btn-secondary px-3"
              onClick={load}
              disabled={saving}
              title="Refresh payout status"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </section>

      {!profileState.payouts_enabled && (
        <section className="card border-[var(--ff-primary)]">
          <h3 className="font-display text-2xl uppercase mb-2">Payout setup is unavailable</h3>
          <p className="text-sm text-[var(--ff-muted-text)]">
            FandomForge has not enabled Paystack creator payouts yet. Your earnings remain recorded.
          </p>
        </section>
      )}

      {profileState.ready_for_payouts && !editing ? (
        <section className="card">
          <div className="flex gap-3 items-start mb-6">
            <CheckCircle2 className="text-[#34C759] shrink-0" />
            <div>
              <h3 className="font-display text-2xl uppercase">Ready for Friday payouts</h3>
              <p className="text-sm text-[var(--ff-muted-text)] mt-1">
                Your verified Paystack recipient is linked.
              </p>
            </div>
          </div>

          <dl className="grid sm:grid-cols-2 gap-4">
            <div className="border border-[var(--ff-card-border)] bg-[var(--ff-surface-bg)] p-4">
              <dt className="overline mb-1">Account holder</dt>
              <dd className="font-bold">{profile?.account_name || "—"}</dd>
            </div>
            <div className="border border-[var(--ff-card-border)] bg-[var(--ff-surface-bg)] p-4">
              <dt className="overline mb-1">Bank</dt>
              <dd className="font-bold">{profile?.bank_name || "—"}</dd>
            </div>
            <div className="border border-[var(--ff-card-border)] bg-[var(--ff-surface-bg)] p-4">
              <dt className="overline mb-1">Account number</dt>
              <dd className="font-mono font-bold">{maskAccountNumber(profile?.account_number)}</dd>
            </div>
            <div className="border border-[var(--ff-card-border)] bg-[var(--ff-surface-bg)] p-4">
              <dt className="overline mb-1">Payout day</dt>
              <dd className="font-bold">{profileState.payout_day || "Friday"}</dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-3 mt-6">
            <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
              Change payout account
            </button>
            <Link to="/creator/payouts" className="btn-secondary">
              View payout history
            </Link>
          </div>
        </section>
      ) : (
        <form onSubmit={saveAndVerify} className="card space-y-4">
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
              <label className="label">Payout email</label>
              <input
                className="input-base"
                type="email"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
              />
            </div>
            <div>
              <label className="label">Payout phone</label>
              <input
                className="input-base"
                value={form.phone}
                onChange={(event) => updateField("phone", event.target.value)}
              />
            </div>
          </div>

          <p className="text-xs text-[var(--ff-muted-text)]">
            Changing verified bank details requires Paystack verification again.
            FandomForge will never ask you to enter a Paystack secret key here.
          </p>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving || !profileState.payouts_enabled}
              className="btn-primary"
            >
              <ShieldCheck size={15} />
              {saving ? "Verifying with Paystack…" : "Save and verify account"}
            </button>
            {profileState.ready_for_payouts && (
              <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
