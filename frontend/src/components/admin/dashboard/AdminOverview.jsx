import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { http } from "../../../lib/api";

function money(value) { return `R ${Number(value || 0).toFixed(2)}`; }

export default function AdminOverview() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [artworkReviewCount, setArtworkReviewCount] = useState(0);
  useEffect(() => {
    http.get("/admin/stats").then((r) => setStats(r.data)).catch(() => {});
    http.get("/admin/artwork-review?status=pending_review")
      .then((r) => setArtworkReviewCount(r.data?.counts?.pending_review ?? r.data?.items?.length ?? 0))
      .catch(() => {});
  }, []);
  if (!stats) return <div className="overline">Loading…</div>;
  const card = (label, value, tone = "") => (
    <div className="p-6 border-r border-b border-[var(--ff-card-border)]" data-testid={`admin-stat-${label.toLowerCase().replace(/ /g, '-')}`}>
      <div className="overline mb-2">{label}</div>
      <div className={`font-display text-3xl ${tone}`}>{value}</div>
    </div>
  );
  return (
    <div data-testid="admin-overview">
      <div className="overline mb-2">Platform</div>
      <h1 className="font-display text-5xl uppercase mb-8">Overview</h1>
      <button
        type="button"
        onClick={() => navigate("/admin/artwork-review")}
        className="ff-admin-card card-interactive mb-6 w-full text-left flex flex-col md:flex-row md:items-center md:justify-between gap-3"
      >
        <div>
          <div className="overline mb-1">Artwork reviews pending</div>
          <div className="text-sm text-[var(--ff-muted-text)]">Creator artwork waiting for admin review.</div>
        </div>
        <div className="font-display text-4xl text-[var(--ff-primary)]">{artworkReviewCount}</div>
      </button>
      <div className="grid grid-cols-2 md:grid-cols-4 border-t border-l border-[var(--ff-card-border)]">
        {card("Creators", stats.creators)}
        {card("Active Creators", stats.bands_active, "ff-admin-success-text")}
        {card("Printers", stats.printers)}
        {card("Products", stats.products)}
        {card("Total Orders", stats.orders_total)}
        {card("Paid Orders", stats.orders_paid, "ff-admin-success-text")}
        {card("Commission Revenue", money(stats.commission_revenue), "text-[var(--ff-primary)]")}
        {card("Subscription Revenue", money(stats.subscription_revenue), "text-[var(--ff-primary)]")}
      </div>
      <div className="mt-6 ff-admin-card">
        <div className="overline mb-2">Payouts Due</div>
        <div className="font-display text-4xl text-[var(--ff-primary)]">{money(stats.payouts_due)}</div>
      </div>
    </div>
  );
}
