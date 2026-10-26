import React, { useMemo, useState } from "react";
import { bulkInvoicesHtml, paidOrder, pickingListHtml, productionOrder } from "../../../lib/orderPrintUtils";

function openPrintDocument(html) {
  const popup = window.open("", "_blank");
  if (!popup) return false;
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  return true;
}

export default function OrderBatchPrintControls({ orders = [], printers = [], onView, onReassign, onDelete, onBulkStatusUpdate }) {
  const [selected, setSelected] = useState([]);
  const [bulkStatus, setBulkStatus] = useState("");
  const [updating, setUpdating] = useState(false);
  const [bulkResult, setBulkResult] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const eligible = orders.filter(productionOrder);
  const chosen = orders.filter((order) => selected.includes(order.id) && paidOrder(order));
  const invoiceOrders = chosen.filter(paidOrder);
  const pickingOrders = chosen.filter(productionOrder);
  const setSelectedSafe = (ids) => setSelected([...new Set(ids)]);
  const filtered = useMemo(() => orders.filter(order => {
    const haystack = [order.order_number, order.buyer_email, order.status, order.payment_status]
      .map(value => String(value || "").toLowerCase()).join(" ");
    const matchesText = haystack.includes(query.trim().toLowerCase());
    const matchesFilter = filter === "all" ||
      (filter === "production" && productionOrder(order)) ||
      (filter === "paid" && paidOrder(order)) ||
      (filter === "pending" && !paidOrder(order));
    return matchesText && matchesFilter;
  }), [orders, query, filter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selectableVisible = visible.filter(paidOrder);
  const visibleFullySelected = selectableVisible.length > 0 && selectableVisible.every(order => selected.includes(order.id));
  const togglePage = () => setSelected(current => visibleFullySelected
    ? current.filter(id => !selectableVisible.some(order => order.id === id))
    : [...new Set([...current, ...selectableVisible.map(order => order.id)])]);
  const toggle = (id) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current,id]);
  const statusOptions = [
    { value: "awaiting_artwork_review", label: "Awaiting artwork review" },
    { value: "sent_to_printer", label: "Sent to printer" },
    { value: "in_production", label: "In production" },
    { value: "ready_for_dispatch", label: "Ready for dispatch" },
    { value: "completed", label: "Completed" },
  ];
  const bulkStatusOrders = chosen.filter(order =>
    productionOrder(order) && order.status !== bulkStatus
  );
  const applyBulkStatus = async () => {
    if (!bulkStatus || !bulkStatusOrders.length || updating || !onBulkStatusUpdate) return;
    const label = statusOptions.find(item => item.value === bulkStatus)?.label || bulkStatus;
    if (!window.confirm(`Change ${bulkStatusOrders.length} selected paid, non-final orders to "${label}"? This updates customer-visible order statuses. Payment statuses are not changed.`)) return;
    setUpdating(true);
    setBulkResult("");
    try {
      const result = await onBulkStatusUpdate(bulkStatusOrders, bulkStatus);
      const successful = result?.successful || [];
      const failed = result?.failed || [];
      setSelected(current => current.filter(id => !successful.includes(id)));
      setBulkResult(`Status update: ${successful.length} successful, ${failed.length} failed.${failed.length ? " Failed orders: " + failed.map(entry => entry.orderNumber).join(", ") : ""}`);
    } catch (error) {
      setBulkResult("Status update failed: " + (error?.message || "Unknown error"));
    } finally {
      setUpdating(false);
    }
  };
  const print = (html) => {
    if (!openPrintDocument(html)) window.alert("Your browser blocked the print window. Enable pop-ups for FandomForge and retry.");
  };
  return (
    <section className="ff-admin-card space-y-3" data-testid="order-batch-print-controls">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div>
          <div className="font-semibold">Production printing</div>
          <div className="text-xs ff-admin-muted">
            {eligible.length} paid production orders · {chosen.length} selected
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="ff-admin-button" onClick={() => setSelectedSafe(eligible.map((order) => order.id))}>Select paid for production</button>
          <button type="button" className="ff-admin-button" onClick={() => setSelectedSafe([])}>Clear</button>
          <button type="button" className="ff-admin-button ff-admin-button--primary" disabled={!pickingOrders.length} onClick={() => print(pickingListHtml(pickingOrders))}>Print picking list ({pickingOrders.length})</button>
          <button type="button" className="ff-admin-button ff-admin-button--primary" disabled={!invoiceOrders.length} onClick={() => print(bulkInvoicesHtml(invoiceOrders))}>Bulk print invoices ({invoiceOrders.length})</button>
          <span className="mx-1 h-6 border-l border-current opacity-20" aria-hidden="true" />
          <label className="text-xs">Bulk status
            <select aria-label="Bulk order status" className="ff-admin-control ml-2" value={bulkStatus} disabled={updating} onChange={event => setBulkStatus(event.target.value)}>
              <option value="">Choose status</option>
              {statusOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <button type="button" className="ff-admin-button" disabled={updating || !bulkStatusOrders.length || !bulkStatus} onClick={applyBulkStatus}>
            {updating ? "Updating..." : `Apply status (${bulkStatusOrders.length})`}
          </button>
        </div>
      </div>
      {bulkResult && <p role="status" className="text-sm">{bulkResult}</p>}
      <p className="text-xs ff-admin-muted">Only paid orders are selectable. Completed and shipped orders are excluded from picking. Printable invoices are order summaries until legal invoice details are implemented.</p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs">Search orders
          <input className="ff-admin-control ml-2" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Order number, email or status" />
        </label>
        <label className="text-xs">Show
          <select className="ff-admin-control ml-2" value={filter} onChange={event => { setFilter(event.target.value); setPage(1); }}>
            <option value="all">All orders</option>
            <option value="production">Production eligible</option>
            <option value="paid">Paid</option>
            <option value="pending">Unpaid / pending</option>
          </select>
        </label>
        <span className="text-xs ff-admin-muted">{filtered.length} matching · {selected.length} selected</span>
      </div>
      <div className="overflow-x-auto">
        <table className="table-brutal min-w-[1100px] w-full text-sm">
          <thead><tr>
            <th><input type="checkbox" aria-label="Select eligible orders on this page" checked={visibleFullySelected} disabled={!selectableVisible.length} onChange={togglePage} /></th>
            <th>Order</th><th>Buyer</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th>Printer</th><th>Actions</th>
          </tr></thead>
          <tbody>
            {visible.map(order => {
              const paid = paidOrder(order);
              return <tr key={order.id}>
                <td><input type="checkbox" aria-label={`Select order ${order.order_number}`}
                  checked={selected.includes(order.id)}
                  disabled={!paid}
                  onChange={() => toggle(order.id)} /></td>
                <td className="whitespace-nowrap">{order.order_number}</td>
                <td className="text-xs">{order.buyer_email}</td>
                <td>{order.items?.length || 0}</td>
                <td>R {Number(order.total || 0).toFixed(2)}</td>
                <td>{order.payment_status || "unknown"}</td>
                <td>{order.status || "unknown"}</td>
                <td><select className="ff-admin-control py-1 text-xs" defaultValue="" onChange={event => event.target.value && onReassign?.(order.id, event.target.value)}>
                  <option value="">Assign / reassign</option>
                  {printers.map(printer => <option key={printer.id} value={printer.id}>{printer.company_name}</option>)}
                </select></td>
                <td className="whitespace-nowrap">
                  <button type="button" onClick={() => onView?.(order.id)} className="text-xs uppercase tracking-widest text-[var(--ff-primary)] mr-3">View</button>
                  <button type="button" className="text-xs uppercase tracking-widest ff-admin-muted mr-3" onClick={() => onDelete?.(order)}>Delete</button>
                </td>
              </tr>;
            })}
            {!visible.length && <tr><td colSpan={9} className="p-10 text-center ff-admin-muted">No matching orders</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="ff-admin-muted">Showing {filtered.length ? (safePage - 1) * pageSize + 1 : 0}–{Math.min(safePage * pageSize, filtered.length)} of {filtered.length}</span>
        <div className="flex items-center gap-3">
          <button type="button" className="ff-admin-button" disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>Previous</button>
          <span>Page {safePage} / {pageCount}</span>
          <button type="button" className="ff-admin-button" disabled={safePage === pageCount} onClick={() => setPage(safePage + 1)}>Next</button>
        </div>
      </div>
    </section>
  );
}
