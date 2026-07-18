import React, { useEffect, useState } from "react";
import { ArrowLeft, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import Navbar from "../components/Navbar";
import { http } from "../lib/api";

export default function AdminAccountReview() {
  const { ownerType, ownerId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const plural = ownerType === "printer" ? "printers" : "creators";

  useEffect(() => {
    let mounted = true;
    http.get(`/admin/review/${plural}/${ownerId}`)
      .then((response) => mounted && setData(response.data))
      .catch((error) => toast.error(error?.response?.data?.detail || "Could not load account review."))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [ownerId, plural]);

  const account = data?.creator || data?.printer || {};
  const jobs = data?.production_jobs || [];
  const products = data?.products || [];
  const wallet = data?.wallet || [];

  return (
    <div className="min-h-screen page-shell">
      <Navbar />
      <main className="max-w-7xl mx-auto px-6 md:px-10 pt-28 pb-16">
        <Link to="/admin" className="inline-flex items-center gap-2 text-sm text-[var(--ff-muted-text)] hover:text-[var(--ff-primary)] mb-6"><ArrowLeft size={16} /> Back to Admin</Link>
        <p className="overline">Read-only administrative review</p>
        <h1 className="font-display text-5xl uppercase leading-none mt-2">{account.name || account.company_name || "Account review"}</h1>
        <p className="text-[var(--ff-muted-text)] mt-3">This view exposes operational state without impersonating the account or changing its permissions.</p>
        {loading && <div className="card mt-8">Loading review…</div>}
        {!loading && !data && <div className="card mt-8"><AlertTriangle className="mb-3" /> Review data is unavailable.</div>}
        {data && (
          <>
            <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
              {Object.entries(data.summary || {}).map(([key, value]) => (
                <div className="card" key={key}><p className="overline">{key.replaceAll("_", " ")}</p><p className="font-display text-4xl mt-2">{value}</p></div>
              ))}
            </section>
            <section className="grid lg:grid-cols-2 gap-6 mt-6">
              <article className="card">
                <h2 className="font-display text-3xl uppercase">Subscription and payout</h2>
                <dl className="mt-4 text-sm space-y-2">
                  <div className="flex justify-between gap-4"><dt>Subscription</dt><dd>{data.subscription?.status || "Unassigned"}</dd></div>
                  <div className="flex justify-between gap-4"><dt>Plan</dt><dd>{data.subscription?.plan_id || "None"}</dd></div>
                  <div className="flex justify-between gap-4"><dt>Payout verification</dt><dd>{data.payout_profile?.verification_status || "Not linked"}</dd></div>
                  <div className="flex justify-between gap-4"><dt>Bank account</dt><dd>{data.payout_profile?.account_number || "Not available"}</dd></div>
                </dl>
              </article>
              <article className="card">
                <h2 className="font-display text-3xl uppercase">Entitlements</h2>
                <div className="mt-4 max-h-72 overflow-y-auto space-y-2">
                  {Object.values(data.entitlements || {}).map((row) => (
                    <div key={row.feature_key} className="flex gap-3 text-sm border-b border-[var(--ff-card-border)] pb-2">
                      {row.allowed ? <CheckCircle2 size={16} className="text-[var(--ff-primary)] mt-0.5" /> : <AlertTriangle size={16} className="mt-0.5" />}
                      <div><strong>{row.feature_key.replaceAll("_", " ")}</strong><p className="text-[var(--ff-muted-text)]">{row.message}</p></div>
                    </div>
                  ))}
                </div>
              </article>
            </section>
            <section className="grid lg:grid-cols-3 gap-6 mt-6">
              <article className="card"><h2 className="font-display text-3xl uppercase">Products</h2><p className="text-sm text-[var(--ff-muted-text)] mt-2">{products.length} linked product records</p></article>
              <article className="card"><h2 className="font-display text-3xl uppercase">Production jobs</h2><p className="text-sm text-[var(--ff-muted-text)] mt-2">{jobs.length} operational job records</p></article>
              <article className="card"><h2 className="font-display text-3xl uppercase">Financial events</h2><p className="text-sm text-[var(--ff-muted-text)] mt-2">{wallet.length} wallet events</p></article>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
