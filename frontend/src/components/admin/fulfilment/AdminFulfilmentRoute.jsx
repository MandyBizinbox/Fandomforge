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
        <button onClick={() => navigate(`${basePath}/fulfilment/manual`)} className="ff-admin-button ff-admin-button--primary"><Plus size={14} /> New Order</button>
      </div>
      <div className="ff-admin-card p-0 overflow-x-auto">
        <table className="table-brutal min-w-[900px] w-full">
          <thead><tr><th>Order</th><th>Buyer</th><th>Items</th><th>Total</th><th>Status</th><th>Printer</th><th></th></tr></thead>
          <tbody>
            {rows.map((order) => (
              <tr key={order.id}>
                <td>{order.order_number}</td>
                <td className="text-xs ff-admin-muted">{order.buyer_email}</td>
                <td>{order.items?.length || 0}</td>
                <td>{money(order.total)}</td>
                <td><StatusBadge status={order.status} /></td>
                <td><select className="ff-admin-control py-1 text-xs" defaultValue="" onChange={(event) => event.target.value && reassign(order.id, event.target.value)}><option value="">Assign / reassign</option>{printers.map((printer) => <option key={printer.id} value={printer.id}>{printer.company_name}</option>)}</select></td>
                <td className="text-right whitespace-nowrap"><button onClick={() => navigate(`${basePath}/fulfilment/orders/${order.id}`)} className="text-xs uppercase tracking-widest text-[var(--ff-primary)] mr-3">View</button><button onClick={() => remove(order)} className="text-xs uppercase tracking-widest ff-admin-muted">Delete</button></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="p-10 text-center overline ff-admin-muted">No orders</td></tr>}
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
        <select className="ff-admin-control md:w-56" value={status} onChange={(event) => setStatus(event.target.value)}>{["all", "pending", "accepted", "in_production", "ready", "shipped", "delivered"].map((item) => <option key={item} value={item}>{item.replace(/_/g, " ")}</option>)}</select>
      </div>
      <div className="grid gap-4">
        {jobs.map((job) => (
          <div key={`${job.order_id}-${job.item_id}`} className="grid gap-3 lg:grid-cols-[1fr_280px]">
            <ProductionJobCard job={job} basePath={`${basePath}/fulfilment/orders`} />
            <div className="ff-admin-card p-4">
              <div className="overline mb-3">Admin Controls</div>
              <div className="text-xs ff-admin-muted mb-2">Current printer: <span className="text-[var(--ff-card-text)]">{job.printer_name || "Unassigned"}</span></div>
              <button type="button" onClick={() => autoAssignOrder(job.order_id)} className="ff-admin-button ff-admin-button--primary w-full mb-3 text-xs">Auto-assign best price</button>
              <select className="ff-admin-control text-sm" value="" onChange={(event) => event.target.value && reassignOrder(job.order_id, event.target.value)}><option value="">Assign/Reassign printer</option>{printers.map((printer) => <option key={printer.id} value={printer.id}>{printer.company_name}</option>)}</select>
              <div className="mt-3 text-xs ff-admin-muted">Creator profit: {money(job.band_earnings)}<br />Commission: {money(job.commission_amount)}<br />Printer payout: {money(job.printer_payout)}</div>
            </div>
          </div>
        ))}
        {!jobs.length && <div className="ff-admin-card text-center ff-admin-muted overline">No production jobs</div>}
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
    <div data-testid="admin-fulfilment-workspace" className="ff-admin-page"><div className="ff-admin-page__inner">
      <div><p className="overline mb-2">Operations</p><h1 className="ff-admin-page-title">Orders & Fulfilment</h1><p className="ff-admin-page-description">Orders, manual creation, production jobs and shipping remain API-backed while each operational view owns a concrete route.</p></div>
      {!!tabs.length && <nav className="ff-admin-section-nav">{tabs.map(({ to, label }) => <NavLink key={to} to={to} className={({ isActive }) => `ff-admin-section-link ${isActive ? "is-active" : ""}`}>{label}</NavLink>)}</nav>}
      <Routes>
        <Route index element={<Navigate to={fallback} replace />} />
        {canOrders && <Route path="orders" element={<OrdersPage basePath={basePath} />} />}
        {canOrders && <Route path="orders/:id" element={<OrderDetail mode="admin" backTo={`${root}/orders`} testidPrefix="admin-order" />} />}
        {canManual && <Route path="manual" element={<ManualOrderBuilder mode="admin" backTo={`${root}/orders`} />} />}
        {canOrders && <Route path="production" element={<ProductionPage basePath={basePath} />} />}
        {canShipping && <Route path="shipping" element={<ShippingSettings />} />}
        <Route path="*" element={<Navigate to={fallback} replace />} />
      </Routes>
    </div></div>
  );
}
