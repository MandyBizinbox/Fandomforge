import React, { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { http } from "../../../lib/api";
import StatusBadge from "../../StatusBadge";
import ProductionJobCard from "../../production/ProductionJobCard";
import ManualOrderBuilder from "../../orders/ManualOrderBuilder";
import OrderDetail from "../../OrderDetail";
import ShippingSettings from "../ShippingSettings";

const money = (value) => `R ${Number(value || 0).toFixed(2)}`;

function canAccess({ permission, moduleKey, modules, user, mode }) {
  if (moduleKey && modules?.[moduleKey] === false) return false;
  const isManager = mode === "manager" || user?.role === "manager";
  if (permission && isManager && user?.manager_permissions?.[permission] === false) return false;
  return true;
}

function OrdersPage({ basePath }) {
  const [rows, setRows] = useState([]);
  const [printers, setPrinters] = useState([]);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    const [ordersRes, printersRes] = await Promise.all([
      http.get("/admin/orders"),
      http.get("/printers").catch(() => ({ data: [] })),
    ]);
    setRows(Array.isArray(ordersRes.data) ? ordersRes.data : []);
    setPrinters(Array.isArray(printersRes.data) ? printersRes.data : []);
  }, []);

  useEffect(() => { load().catch(() => setRows([])); }, [load]);

  const reassign = async (orderId, printerId) => {
    try {
      await http.post(`/orders/${orderId}/assign-printer?printer_id=${printerId}`);
      toast.success("Reassigned");
      await load();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed");
    }
  };

  const remove = async (order) => {
    if (!window.confirm(`Delete order ${order.order_number}?`)) return;
    try {
      await http.delete(`/orders/${order.id}`);
      toast.success("Deleted");
      await load();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed");
    }
  };

  return (
    <div data-testid="admin-orders-page" className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div><div className="overline mb-2">Orders</div><h2 className="font-display text-4xl uppercase">Order Queue</h2></div>
        <button onClick={() => navigate(`${basePath}/fulfilment/manual`)} className="btn-primary"><Plus size={14} /> New Order</button>
      </div>
      <div className="border border-[var(--ff-card-border)] overflow-x-auto">
        <table className="table-brutal min-w-[900px]">
          <thead><tr><th>Order</th><th>Buyer</th><th>Items</th><th>Total</th><th>Status</th><th>Printer</th><th></th></tr></thead>
          <tbody>
            {rows.map((order) => (
              <tr key={order.id}>
                <td>{order.order_number}</td>
                <td className="text-xs text-[var(--ff-muted-text)]">{order.buyer_email}</td>
                <td>{order.items?.length || 0}</td>
                <td>{money(order.total)}</td>
                <td><StatusBadge status={order.status} /></td>
                <td><select className="input-base py-1 text-xs" defaultValue="" onChange={(event) => event.target.value && reassign(order.id, event.target.value)}><option value="">Assign / reassign</option>{printers.map((printer) => <option key={printer.id} value={printer.id}>{printer.company_name}</option>)}</select></td>
                <td className="text-right whitespace-nowrap"><button onClick={() => navigate(`${basePath}/fulfilment/orders/${order.id}`)} className="text-xs uppercase tracking-widest text-[var(--ff-primary)] mr-3">View</button><button onClick={() => remove(order)} className="text-xs uppercase tracking-widest text-[var(--ff-muted-text)]">Delete</button></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="p-10 text-center overline text-[var(--ff-muted-text)]">No orders</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProductionPage({ basePath }) {
  const [jobs, setJobs] = useState([]);
  const [status, setStatus] = useState("all");
  const [printers, setPrinters] = useState([]);

  const load = useCallback(async () => {
    const qs = status !== "all" ? `?status=${status}` : "";
    const [jobsRes, printersRes] = await Promise.all([
      http.get(`/admin/production-jobs${qs}`).catch(() => ({ data: [] })),
      http.get("/printers").catch(() => ({ data: [] })),
    ]);
    setJobs(Array.isArray(jobsRes.data) ? jobsRes.data : []);
    setPrinters(Array.isArray(printersRes.data) ? printersRes.data : []);
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const reassignOrder = async (orderId, printerId) => {
    try { await http.post(`/orders/${orderId}/assign-printer?printer_id=${printerId}`); toast.success("Printer reassigned"); await load(); }
    catch (error) { toast.error(error.response?.data?.detail || "Could not reassign printer"); }
  };

  const autoAssignOrder = async (orderId) => {
    try { await http.post(`/admin/orders/${orderId}/auto-assign-printers`); toast.success("Best available printer assigned from pricing table"); await load(); }
    catch (error) { toast.error(error.response?.data?.detail || "Could not auto-assign printer"); }
  };

  return (
    <div data-testid="admin-production-page" className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div><div className="overline mb-2">Fulfilment</div><h2 className="font-display text-4xl uppercase">Production Jobs</h2></div>
        <select className="input-base md:w-56" value={status} onChange={(event) => setStatus(event.target.value)}>{["all", "pending", "accepted", "in_production", "ready", "shipped", "delivered"].map((item) => <option key={item} value={item}>{item.replace(/_/g, " ")}</option>)}</select>
      </div>
      <div className="grid gap-4">
        {jobs.map((job) => (
          <div key={`${job.order_id}-${job.item_id}`} className="grid gap-3 lg:grid-cols-[1fr_280px]">
            <ProductionJobCard job={job} basePath={`${basePath}/fulfilment/orders`} />
            <div className="card p-4">
              <div className="overline mb-3">Admin Controls</div>
              <div className="text-xs text-[var(--ff-muted-text)] mb-2">Current printer: <span className="text-[var(--ff-card-text)]">{job.printer_name || "Unassigned"}</span></div>
              <button type="button" onClick={() => autoAssignOrder(job.order_id)} className="btn-primary w-full mb-3 text-xs">Auto-assign best price</button>
              <select className="input-base text-sm" value="" onChange={(event) => event.target.value && reassignOrder(job.order_id, event.target.value)}><option value="">Assign/Reassign printer</option>{printers.map((printer) => <option key={printer.id} value={printer.id}>{printer.company_name}</option>)}</select>
              <div className="mt-3 text-xs text-[var(--ff-muted-text)]">Creator profit: {money(job.band_earnings)}<br />Commission: {money(job.commission_amount)}<br />Printer payout: {money(job.printer_payout)}</div>
            </div>
          </div>
        ))}
        {!jobs.length && <div className="card text-center text-[var(--ff-muted-text)] overline">No production jobs</div>}
      </div>
    </div>
  );
}

export default function AdminFulfilmentRoute({ modules = {}, user = null, mode = "admin", basePath = "/admin" }) {
  const root = `${basePath}/fulfilment`;
  const tabs = useMemo(() => [
    { to: `${root}/orders`, label: "Orders", permission: "manage_orders" },
    { to: `${root}/manual`, label: "Manual Order", permission: "manage_orders", moduleKey: "manual_orders_enabled" },
    { to: `${root}/production`, label: "Production Jobs", permission: "manage_orders" },
    { to: `${root}/shipping`, label: "Shipping", permission: "manage_shipping", moduleKey: "shipping_enabled" },
  ].filter((tab) => canAccess({ ...tab, modules, user, mode })), [mode, modules, root, user]);

  const canOrders = canAccess({ permission: "manage_orders", modules, user, mode });
  const canManual = canAccess({ permission: "manage_orders", moduleKey: "manual_orders_enabled", modules, user, mode });
  const canShipping = canAccess({ permission: "manage_shipping", moduleKey: "shipping_enabled", modules, user, mode });
  const fallback = tabs[0]?.to || basePath;

  return (
    <div data-testid="admin-fulfilment-workspace" className="space-y-6">
      <div><p className="overline mb-2">Operations</p><h1 className="font-display text-5xl uppercase">Orders & Fulfilment</h1><p className="text-[var(--ff-muted-text)] mt-2 max-w-3xl">Orders, manual creation, production jobs and shipping remain API-backed while each operational view owns a concrete route.</p></div>
      {!!tabs.length && <nav className="flex flex-wrap gap-2 border-b border-[var(--ff-card-border)] pb-4">{tabs.map(({ to, label }) => <NavLink key={to} to={to} className={({ isActive }) => `px-4 py-3 border text-xs uppercase tracking-widest font-bold ${isActive ? "border-[var(--ff-primary)] bg-[var(--ff-primary)] text-[var(--ff-card-text)]" : "border-[var(--ff-card-border)] text-[var(--ff-muted-text)] hover:text-[var(--ff-card-text)]"}`}>{label}</NavLink>)}</nav>}
      <Routes>
        <Route index element={<Navigate to={fallback} replace />} />
        {canOrders && <Route path="orders" element={<OrdersPage basePath={basePath} />} />}
        {canOrders && <Route path="orders/:id" element={<OrderDetail mode="admin" backTo={`${root}/orders`} testidPrefix="admin-order" />} />}
        {canManual && <Route path="manual" element={<ManualOrderBuilder mode="admin" backTo={`${root}/orders`} />} />}
        {canOrders && <Route path="production" element={<ProductionPage basePath={basePath} />} />}
        {canShipping && <Route path="shipping" element={<ShippingSettings />} />}
        <Route path="*" element={<Navigate to={fallback} replace />} />
      </Routes>
    </div>
  );
}
