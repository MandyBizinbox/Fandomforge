import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Download,
  RefreshCw,
  SlidersHorizontal,
  WalletCards,
} from "lucide-react";
import StatusBadge from "../components/StatusBadge";
import { http } from "../lib/api";
import { toast } from "sonner";

const EMPTY_FILTERS = {
  date_from: "",
  date_to: "",
  product_id: "",
  order_number: "",
  payment_status: "paid",
  production_status: "all",
  payout_status: "all",
};

const money = (value) => `R ${Number(value || 0).toFixed(2)}`;
const percent = (value) => `${Number(value || 0).toFixed(2).replace(/\.00$/, "")}%`;

function dateLabel(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString("en-ZA");
}

function monthLabel(value) {
  if (!value || value === "Unknown") return "Unknown";
  const parsed = new Date(`${value}-01T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function SummaryCard({ label, value, note, emphasis = false }) {
  return (
    <div className="card min-w-0">
      <div className="overline mb-2">{label}</div>
      <div className={`font-display text-3xl md:text-4xl break-words ${emphasis ? "text-[var(--ff-primary)]" : ""}`}>
        {value}
      </div>
      {note && <p className="text-xs text-[var(--ff-muted-text)] mt-2">{note}</p>}
    </div>
  );
}

function FilterField({ label, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

export default function CreatorFinance() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (requestedFilters = filters) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(requestedFilters).forEach(([key, value]) => {
        if (value === "" || value === null || value === undefined) return;
        params.set(key, value);
      });
      const response = await http.get(`/creator-dash/earnings-report?${params.toString()}`);
      setReport(response.data || null);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not load creator finance report");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load(EMPTY_FILTERS);
    // The initial report intentionally uses the stable default filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    load(EMPTY_FILTERS);
  };

  const rows = report?.rows || [];
  const summary = report?.summary || {};
  const currentPlan = report?.current_plan || {};
  const bestUpgrade = useMemo(
    () => [...(report?.upgrade_options || [])].sort(
      (a, b) => Number(b.estimated_period_savings || 0) - Number(a.estimated_period_savings || 0),
    )[0] || null,
    [report],
  );

  const exportCsv = () => {
    if (!rows.length) {
      toast.error("There are no report rows to export");
      return;
    }

    const headers = [
      "Date",
      "Order Number",
      "Payment Status",
      "Product",
      "Variation",
      "Quantity",
      "Gross Sales",
      "Product and Production Cost",
      "Platform Fee",
      "Mark-Up / Fundraising",
      "Refund / Adjustment",
      "Net Earnings",
      "Production Status",
      "Payout Status",
      "Paid At",
    ];
    const body = rows.map((row) => [
      dateLabel(row.created_at),
      row.order_number,
      row.payment_status,
      row.product_title,
      row.variation,
      row.quantity,
      Number(row.gross_sales || 0).toFixed(2),
      Number(row.product_cost || 0).toFixed(2),
      Number(row.platform_fee || 0).toFixed(2),
      Number(row.creator_markup || 0).toFixed(2),
      Number(row.adjustment || 0).toFixed(2),
      Number(row.net_earnings || 0).toFixed(2),
      row.production_status,
      row.payout_status,
      dateLabel(row.paid_at),
    ]);

    const csv = `\uFEFF${[headers, ...body].map((record) => record.map(csvCell).join(",")).join("\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `fandomforge-creator-earnings-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    toast.success("Creator earnings CSV exported");
  };

  return (
    <div data-testid="creator-earnings-page" className="space-y-8">
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-5">
        <div>
          <div className="overline mb-2">Creator Finance</div>
          <h1 className="font-display text-5xl md:text-6xl uppercase leading-none">Earnings & Reports</h1>
          <p className="text-sm text-[var(--ff-muted-text)] mt-4 max-w-3xl">
            Track customer sales, product and production costs, platform fees, your Mark-Up / Fundraising,
            payout balances and completed Friday payout runs.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link to="/creator/payouts" className="btn-secondary">
            <WalletCards size={15} /> Payout Account
          </Link>
          <button type="button" onClick={() => load(filters)} disabled={loading} className="btn-secondary">
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button type="button" onClick={exportCsv} disabled={loading || !rows.length} className="btn-primary">
            <Download size={15} /> Export CSV
          </button>
        </div>
      </div>

      <section className="card">
        <div className="flex items-start gap-3 mb-5">
          <SlidersHorizontal className="text-[var(--ff-primary)] shrink-0" size={20} />
          <div>
            <div className="overline mb-1">Report controls</div>
            <h2 className="font-display text-3xl uppercase">Filter earnings</h2>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <FilterField label="From date">
            <input
              type="date"
              className="input-base"
              value={filters.date_from}
              onChange={(event) => updateFilter("date_from", event.target.value)}
            />
          </FilterField>
          <FilterField label="To date">
            <input
              type="date"
              className="input-base"
              value={filters.date_to}
              onChange={(event) => updateFilter("date_to", event.target.value)}
            />
          </FilterField>
          <FilterField label="Product">
            <select
              className="input-base"
              value={filters.product_id}
              onChange={(event) => updateFilter("product_id", event.target.value)}
            >
              <option value="">All products</option>
              {(report?.products || []).map((product) => (
                <option key={product.id} value={product.id}>{product.title}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Order number">
            <input
              className="input-base"
              value={filters.order_number}
              onChange={(event) => updateFilter("order_number", event.target.value)}
              placeholder="Search order number"
            />
          </FilterField>
          <FilterField label="Payment status">
            <select
              className="input-base"
              value={filters.payment_status}
              onChange={(event) => updateFilter("payment_status", event.target.value)}
            >
              <option value="paid">Paid only</option>
              <option value="all">All payment statuses</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </select>
          </FilterField>
          <FilterField label="Production status">
            <select
              className="input-base"
              value={filters.production_status}
              onChange={(event) => updateFilter("production_status", event.target.value)}
            >
              <option value="all">All production statuses</option>
              <option value="pending">Pending</option>
              <option value="accepted">Accepted</option>
              <option value="in_production">In production</option>
              <option value="ready">Ready</option>
              <option value="shipped">Shipped</option>
              <option value="delivered">Delivered</option>
            </select>
          </FilterField>
          <FilterField label="Payout status">
            <select
              className="input-base"
              value={filters.payout_status}
              onChange={(event) => updateFilter("payout_status", event.target.value)}
            >
              <option value="all">All payout statuses</option>
              <option value="available">Available</option>
              <option value="in_batch">In Friday batch</option>
              <option value="paid">Paid out</option>
              <option value="failed">Failed</option>
              <option value="reversed">Reversed</option>
              <option value="pending_ledger">Pending ledger</option>
            </select>
          </FilterField>
          <div className="flex items-end gap-3">
            <button type="button" className="btn-primary flex-1" onClick={() => load(filters)} disabled={loading}>
              Apply Filters
            </button>
            <button type="button" className="btn-secondary" onClick={resetFilters} disabled={loading}>
              Reset
            </button>
          </div>
        </div>
      </section>

      {loading && !report ? (
        <div className="card text-center py-16">
          <RefreshCw className="animate-spin mx-auto mb-4 text-[var(--ff-primary)]" />
          <div className="overline">Loading creator finance…</div>
        </div>
      ) : (
        <>
          <section className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            <SummaryCard
              label="Gross Sales"
              value={money(summary.gross_sales)}
              note={`${summary.order_count || 0} orders · ${summary.unit_count || 0} units in this report`}
            />
            <SummaryCard
              label="Mark-Up / Fundraising"
              value={money(summary.creator_markup)}
              note="Your amount earned before refunds or adjustments"
              emphasis
            />
            <SummaryCard
              label="Available for Payout"
              value={money(summary.available)}
              note="Eligible wallet balance not yet placed in a Friday batch"
            />
            <SummaryCard
              label="In Friday Batch"
              value={money(summary.in_batch)}
              note="Already reserved for an approved or processing payout run"
            />
            <SummaryCard
              label="Paid Out"
              value={money(summary.paid)}
              note="Creator earnings already marked paid"
            />
            <SummaryCard
              label="Refunds / Reversals"
              value={money(summary.refunds_reversals_all_time)}
              note="All-time wallet corrections from refunds and reversals"
            />
          </section>

          <section className="grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)] gap-6">
            <div className="card">
              <div className="overline mb-2">Selected report period</div>
              <h2 className="font-display text-3xl uppercase mb-5">Cost and earnings summary</h2>
              <div className="grid sm:grid-cols-2 gap-0 border border-[var(--ff-card-border)]">
                {[
                  ["Product & production costs", money(summary.product_costs)],
                  ["Platform fees", money(summary.platform_fees)],
                  ["Refunds / adjustments", money(summary.adjustments)],
                  ["Net creator earnings", money(summary.net_earnings)],
                ].map(([label, value], index) => (
                  <div key={label} className={`p-5 ${index % 2 === 0 ? "sm:border-r" : ""} ${index < 2 ? "border-b" : ""} border-[var(--ff-card-border)]`}>
                    <div className="text-xs uppercase tracking-widest text-[var(--ff-muted-text)]">{label}</div>
                    <div className="font-display text-2xl mt-2">{value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="overline mb-2">Current plan</div>
              <h2 className="font-display text-3xl uppercase">{currentPlan.name || "Creator plan"}</h2>
              <div className="mt-5 space-y-3 text-sm">
                <div className="flex justify-between gap-4 border-b border-[var(--ff-card-border)] pb-3">
                  <span className="text-[var(--ff-muted-text)]">Plan status</span>
                  <StatusBadge status={currentPlan.status || "manual"} />
                </div>
                <div className="flex justify-between gap-4 border-b border-[var(--ff-card-border)] pb-3">
                  <span className="text-[var(--ff-muted-text)]">Monthly price</span>
                  <strong>{money(currentPlan.monthly_price)}</strong>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--ff-muted-text)]">Platform fee rate</span>
                  <strong>{percent(currentPlan.commission_percent)}</strong>
                </div>
              </div>

              {bestUpgrade && Number(bestUpgrade.estimated_period_savings || 0) > 0 && (
                <div className="mt-6 border border-[var(--ff-primary)] bg-[var(--ff-surface-bg)] p-4">
                  <div className="overline mb-2">Configured lower-fee option</div>
                  <div className="font-display text-2xl uppercase">{bestUpgrade.name}</div>
                  <p className="text-sm text-[var(--ff-muted-text)] mt-2">
                    At {percent(bestUpgrade.commission_percent)}, this selected sales period would have saved an estimated {money(bestUpgrade.estimated_period_savings)} in platform fees.
                  </p>
                  <Link to="/account/plans" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest font-bold text-[var(--ff-primary)] mt-4">
                    View available plans <ArrowUpRight size={14} />
                  </Link>
                </div>
              )}
            </div>
          </section>

          <section>
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-4">
              <div>
                <div className="overline mb-2">Transaction report</div>
                <h2 className="font-display text-4xl uppercase">Order earnings ledger</h2>
              </div>
              <div className="text-xs text-[var(--ff-muted-text)]">
                {summary.record_count || 0} matching order items
              </div>
            </div>

            <div className="border border-[var(--ff-card-border)] overflow-x-auto">
              <table className="table-brutal min-w-[1420px]">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Order</th>
                    <th>Product / Variation</th>
                    <th>Qty</th>
                    <th>Gross Sales</th>
                    <th>Product Cost</th>
                    <th>Platform Fee</th>
                    <th>Mark-Up / Fundraising</th>
                    <th>Adjustment</th>
                    <th>Net Earnings</th>
                    <th>Production</th>
                    <th>Payout</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.order_item_id}-${row.order_number}`}>
                      <td>{dateLabel(row.created_at)}</td>
                      <td>
                        <Link to={`/creator/orders/${row.order_id}`} className="font-mono text-xs text-[var(--ff-primary)]">
                          {row.order_number || "—"}
                        </Link>
                        <div className="text-[10px] uppercase tracking-wider text-[var(--ff-muted-text)] mt-1">
                          {row.payment_status}
                        </div>
                      </td>
                      <td>
                        <div className="font-bold">{row.product_title}</div>
                        <div className="text-xs text-[var(--ff-muted-text)] mt-1">{row.variation}</div>
                      </td>
                      <td>{row.quantity}</td>
                      <td>{money(row.gross_sales)}</td>
                      <td>{money(row.product_cost)}</td>
                      <td>{money(row.platform_fee)}</td>
                      <td className="font-bold">{money(row.creator_markup)}</td>
                      <td>{money(row.adjustment)}</td>
                      <td className="font-bold text-[var(--ff-primary)]">{money(row.net_earnings)}</td>
                      <td><StatusBadge status={row.production_status} /></td>
                      <td><StatusBadge status={row.payout_status} /></td>
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr>
                      <td colSpan={12} className="p-12 text-center text-[var(--ff-muted-text)] overline">
                        No earnings match these filters
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid xl:grid-cols-2 gap-6">
            <div>
              <div className="mb-4">
                <div className="overline mb-2">Product report</div>
                <h2 className="font-display text-4xl uppercase">Best-selling products</h2>
              </div>
              <div className="border border-[var(--ff-card-border)] overflow-x-auto">
                <table className="table-brutal min-w-[720px]">
                  <thead>
                    <tr><th>Product</th><th>Orders</th><th>Units</th><th>Sales</th><th>Net Earnings</th></tr>
                  </thead>
                  <tbody>
                    {(report?.by_product || []).map((item) => (
                      <tr key={item.product_id || item.product_title}>
                        <td className="font-bold">{item.product_title}</td>
                        <td>{item.order_count}</td>
                        <td>{item.units}</td>
                        <td>{money(item.gross_sales)}</td>
                        <td className="font-bold text-[var(--ff-primary)]">{money(item.net_earnings)}</td>
                      </tr>
                    ))}
                    {!(report?.by_product || []).length && (
                      <tr><td colSpan={5} className="p-8 text-center overline text-[var(--ff-muted-text)]">No product totals</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <div className="mb-4">
                <div className="overline mb-2">Monthly report</div>
                <h2 className="font-display text-4xl uppercase">Earnings by month</h2>
              </div>
              <div className="border border-[var(--ff-card-border)] overflow-x-auto">
                <table className="table-brutal min-w-[720px]">
                  <thead>
                    <tr><th>Month</th><th>Orders</th><th>Units</th><th>Sales</th><th>Net Earnings</th></tr>
                  </thead>
                  <tbody>
                    {(report?.by_month || []).map((item) => (
                      <tr key={item.month}>
                        <td className="font-bold">{monthLabel(item.month)}</td>
                        <td>{item.order_count}</td>
                        <td>{item.units}</td>
                        <td>{money(item.gross_sales)}</td>
                        <td className="font-bold text-[var(--ff-primary)]">{money(item.net_earnings)}</td>
                      </tr>
                    ))}
                    {!(report?.by_month || []).length && (
                      <tr><td colSpan={5} className="p-8 text-center overline text-[var(--ff-muted-text)]">No monthly totals</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section>
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-4">
              <div>
                <div className="overline mb-2">Friday payouts</div>
                <h2 className="font-display text-4xl uppercase">Payout history</h2>
              </div>
              <div className="flex items-center gap-2 text-xs text-[var(--ff-muted-text)]">
                Account: <StatusBadge status={report?.payout?.profile_status || "not_configured"} />
              </div>
            </div>
            <div className="border border-[var(--ff-card-border)] overflow-x-auto">
              <table className="table-brutal min-w-[900px]">
                <thead>
                  <tr><th>Scheduled Friday</th><th>Batch</th><th>Amount</th><th>Reference</th><th>Status</th><th>Note</th></tr>
                </thead>
                <tbody>
                  {(report?.payout?.history || []).map((item) => (
                    <tr key={`${item.batch_id}-${item.reference || item.scheduled_for}`}>
                      <td>{dateLabel(item.scheduled_for)}</td>
                      <td>{item.title || String(item.batch_id || "").slice(0, 8)}</td>
                      <td>{money(item.amount)}</td>
                      <td className="font-mono text-xs">{item.reference || "—"}</td>
                      <td><StatusBadge status={item.status} /></td>
                      <td className="text-xs text-[var(--ff-muted-text)]">{item.failure_reason || ""}</td>
                    </tr>
                  ))}
                  {!(report?.payout?.history || []).length && (
                    <tr><td colSpan={6} className="p-8 text-center overline text-[var(--ff-muted-text)]">No payout runs yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
