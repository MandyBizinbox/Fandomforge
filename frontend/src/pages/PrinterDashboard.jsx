import React, { useEffect, useMemo, useState } from "react";
import { Route, Routes } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import OrderDetail from "../components/OrderDetail";
import ProductionJobCard from "../components/production/ProductionJobCard";
import PrinterSettings from "../components/pricing/PrinterSettings";
import ActivityTimeline from "../components/activity/ActivityTimeline";
import NotificationList from "../components/notifications/NotificationList";
import { http } from "../lib/api";
import StatusBadge from "../components/StatusBadge";
import { BarChart3, Inbox, DollarSign, Calculator, Clock3, Bell, Settings as SettingsIcon } from "lucide-react";

const allPrinterLinks = [
  { type: "section", label: "Command" },
  { to: "/printer", end: true, label: "Overview", key: "overview", icon: <BarChart3 size={14} /> },

  { type: "section", label: "Production" },
  { to: "/printer/orders", label: "Production Jobs", key: "orders", icon: <Inbox size={14} /> },
  { to: "/printer/notifications", label: "Notifications", key: "notifications", icon: <Bell size={14} /> },
  { to: "/printer/activity", label: "Activity", key: "activity", icon: <Clock3 size={14} /> },

  { type: "section", label: "Account" },
  { to: "/printer/settings", label: "Settings", key: "settings", icon: <SettingsIcon size={14} /> },

  { type: "section", label: "Money" },
  { to: "/printer/pricing", label: "Pricing", key: "pricing", icon: <Calculator size={14} /> },
  { to: "/printer/payouts", label: "Payouts", key: "payouts", icon: <DollarSign size={14} /> },
];

function filterPrinterLinksByModules(modules = {}) {
  const filtered = allPrinterLinks.filter((link) => {
    if (link.type === "section") return true;
    if (link.key === "pricing") return modules.printer_marketplace_enabled !== false;
    if (link.key === "payouts") return modules.payouts_enabled !== false;
    return true;
  });

  return filtered.filter((link, index) => {
    if (link.type !== "section") return true;
    const next = filtered[index + 1];
    return next && next.type !== "section";
  });
}

const STATUS_FILTERS = ["all", "pending", "accepted", "in_production", "ready", "shipped", "delivered"];

function money(value) {
  return `R ${Number(value || 0).toFixed(2)}`;
}

function flattenJobs(orders) {
  const jobs = [];
  for (const order of orders || []) {
    for (const item of order.items || []) {
      const snapshot = item.production_snapshot || {};
      jobs.push({
        order_id: order.id,
        order_number: order.order_number,
        order_status: order.status,
        payment_status: order.payment_status,
        created_at: order.created_at,
        buyer_email: order.buyer_email,
        item_id: item.id,
        product_id: item.product_id,
        product_title: item.product_title,
        quantity: item.quantity,
        variation: snapshot.variation || { label: [item.size, item.color].filter(Boolean).join(" / ") },
        print_area: snapshot.print_area || {},
        print_option: snapshot.print_option || {},
        artwork: snapshot.artwork || {},
        mockup_image_url: snapshot.mockup_image_url || item.artwork_file_url,
        production_status: item.production_status,
        tracking_number: item.tracking_number,
        printer_payout: item.printer_payout,
      });
    }
  }
  return jobs;
}

function Overview() {
  const [stats, setStats] = useState(null);
  const [subscription, setSubscription] = useState(null);
  useEffect(() => {
    http.get("/printer-dash/stats").then((r) => setStats(r.data)).catch(() => {});
    http.get("/printers/me/subscription").then((r) => setSubscription(r.data)).catch(() => {});
  }, []);
  return (
    <div data-testid="printer-overview">
      <div className="overline mb-2">Fulfilment</div>
      <h1 className="font-display text-5xl uppercase mb-8">Overview</h1>

      {subscription && (
        <div className={`card mb-6 ${["past_due", "suspended", "cancelled"].includes(subscription.status) ? "border-[var(--ff-primary)] bg-[var(--ff-surface-bg)]" : ""}`}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="overline mb-1">Subscription</div>
              <div className="font-display text-2xl uppercase">{subscription.plan_name || "Manual / Custom"}</div>
              <p className="text-xs text-[var(--ff-muted-text)] mt-1">Next billing: {subscription.next_billing_date ? new Date(subscription.next_billing_date).toLocaleDateString() : "Manual"}</p>
            </div>
            <StatusBadge status={subscription.status} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border border-[var(--ff-card-border)]">
        <div className="p-6 border-r border-[var(--ff-card-border)]"><div className="overline mb-2">Active Jobs</div><div className="font-display text-4xl">{stats?.active_orders ?? 0}</div></div>
        <div className="p-6 border-r border-[var(--ff-card-border)]"><div className="overline mb-2">Payouts Due</div><div className="font-display text-4xl text-[var(--ff-primary)]">{money(stats?.payouts_due)}</div></div>
        <div className="p-6"><div className="overline mb-2">Paid Out</div><div className="font-display text-4xl text-[#34C759]">{money(stats?.payouts_paid)}</div></div>
      </div>
    </div>
  );
}

function AssignedOrders() {
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState("all");

  useEffect(() => {
    http.get("/printer-dash/orders").then((r) => setOrders(Array.isArray(r.data) ? r.data : [])).catch(() => setOrders([]));
  }, []);

  const jobs = useMemo(() => {
    const all = flattenJobs(orders);
    if (status === "all") return all;
    return all.filter((job) => job.production_status === status);
  }, [orders, status]);

  return (
    <div data-testid="printer-orders-page">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-8">
        <div>
          <div className="overline mb-2">Queue</div>
          <h1 className="font-display text-5xl uppercase">Production Jobs</h1>
        </div>
        <select className="input-base md:w-56" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_FILTERS.map((item) => <option key={item} value={item}>{item.replace(/_/g, " ")}</option>)}
        </select>
      </div>

      <div className="grid gap-4">
        {jobs.map((job) => <ProductionJobCard key={`${job.order_id}-${job.item_id}`} job={job} basePath="/printer/orders" />)}
        {jobs.length === 0 && <div className="card text-center text-[var(--ff-muted-text)] overline">No production jobs</div>}
      </div>
    </div>
  );
}

function Payouts() {
  const [rows, setRows] = useState([]);
  useEffect(() => { http.get("/printer-dash/payouts").then((r) => setRows(Array.isArray(r.data) ? r.data : [])); }, []);
  return (
    <div data-testid="printer-payouts-page">
      <div className="overline mb-2">Finance</div>
      <h1 className="font-display text-5xl uppercase mb-8">Payouts</h1>
      <div className="border border-[var(--ff-card-border)]">
        <table className="table-brutal">
          <thead><tr><th>Date</th><th>Order item</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}><td>{new Date(p.created_at).toLocaleDateString()}</td><td className="font-mono text-xs">{p.order_item_id.slice(0,8)}</td><td>{money(p.amount)}</td><td><StatusBadge status={p.status} /></td></tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="p-10 text-center text-[var(--ff-muted-text)] overline">No payouts</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PrinterNotifications() {
  return <NotificationList endpoint="/printer-dash/notifications" title="Notifications" subtitle="Assigned jobs, production updates and internal notes" />;
}

function PrinterActivity() {
  return (
    <div data-testid="printer-activity-page">
      <div className="overline mb-2">Fulfilment</div>
      <h1 className="font-display text-5xl uppercase mb-8">Activity</h1>
      <ActivityTimeline endpoint="/printer-dash/activity" title="Recent Printer Activity" canAddNote={false} />
    </div>
  );
}

export default function PrinterDashboard() {
  const [platformConfig, setPlatformConfig] = useState({ modules: {} });

  useEffect(() => {
    http.get("/orders/platform-config").then((r) => setPlatformConfig(r.data || { modules: {} })).catch(() => {});
  }, []);

  const visibleLinks = filterPrinterLinksByModules(platformConfig.modules || {});

  return (
    <Routes>
      <Route element={<DashboardLayout title="Printer Console" links={visibleLinks} testidPrefix="printer-dash" notificationEndpoint="/printer-dash/notifications" notificationPath="/printer/notifications" />}>
        <Route index element={<Overview />} />
        <Route path="orders" element={<AssignedOrders />} />
        <Route path="notifications" element={<PrinterNotifications />} />
        <Route path="activity" element={<PrinterActivity />} />
        <Route path="settings" element={<PrinterSettings />} />
        <Route path="orders/:id" element={<OrderDetail mode="printer" backTo="/printer/orders" testidPrefix="printer-order" />} />
        <Route path="pricing" element={<Navigate to="/printer/settings" replace />} />
        <Route path="payouts" element={<Payouts />} />
      </Route>
    </Routes>
  );
}
