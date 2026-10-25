import React, { useMemo, useState } from "react";
import { bulkInvoicesHtml, duplicateOrderFlags, paidOrder, pickingListHtml, productionOrder } from "../../../lib/orderPrintUtils";

function openPrintDocument(html) {
  const popup = window.open("", "_blank");
  if (!popup) return false;
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  return true;
}

export default function OrderBatchPrintControls({ orders = [], printers = [], onView, onReassign, onDelete }) {
  const flags = useMemo(() => duplicateOrderFlags(orders), [orders]);
  const [selected, setSelected] = useState([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [reviewed, setReviewed] = useState([]);
  const validIds = new Set(orders.map((order) => order.id));
  const reviewedIds = reviewed.filter((id) => validIds.has(id));
  const isHeld = (order) => flags.has(order.id) && !reviewedIds.includes(order.id);
  const eligible = orders.filter((order) => productionOrder(order) && !isHeld(order));
  const chosen = orders.filter((order) => selected.includes(order.id) && paidOrder(order) && !isHeld(order));
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
      (filter === "pending" && !paidOrder(order)) ||
      (filter === "duplicates" && flags.has(order.id));
    return matchesText && matchesFilter;
  }), [orders, query, filter, flags]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selectableVisible = visible.filter(order => paidOrder(order) && !isHeld(order));
  const visibleFullySelected = selectableVisible.length > 0 && selectableVisible.every(order => selected.includes(order.id));
  const togglePage = () => setSelected(current => visibleFullySelected
    ? current.filter(id => !selectableVisible.some(order => order.id === id))
    : [...new Set([...current, ...selectableVisible.map(order => order.id)])]);
  const toggle = (id) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current,id]);
  const review = (order) => {
    if (reviewedIds.includes(order.id)) {
      setReviewed((current) => current.filter((item) => item !== order.id));
      return;
    }
    if (!paidOrder(order)) return;
    const confirmation = window.prompt(
      `Confirm this order is legitimate and has NOT already been produced. Type ${order.order_number} to release this print hold:`
    );
    if (confirmation === order.order_number) setReviewed((current) => [...current, order.id]);
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
            {eligible.length} paid production orders · {flags.size} potential duplicate records · {chosen.length} selected
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="ff-admin-button" onClick={() => setSelectedSafe(eligible.map((order) => order.id))}>Select paid for production</button>
          <button type="button" className="ff-admin-button" onClick={() => setSelectedSafe([])}>Clear</button>
          <button type="button" className="ff-admin-button ff-admin-button--primary" disabled={!pickingOrders.length} onClick={() => print(pickingListHtml(pickingOrders))}>Print picking list ({pickingOrders.length})</button>
          <button type="button" className="ff-admin-button ff-admin-button--primary" disabled={!invoiceOrders.length} onClick={() => print(bulkInvoicesHtml(invoiceOrders))}>Bulk print invoices ({invoiceOrders.length})</button>
        </div>
      </div>
      <p className="text-xs ff-admin-muted">Only paid orders are selectable. Completed and shipped orders are excluded from picking. Printable invoices are order summaries until legal invoice details are implemented.</p>
      {flags.size > 0 && <div className="border border-amber-500/50 rounded-lg p-3 text-sm" role="alert">
        <strong>Possible duplicate checkouts detected.</strong> Matching buyer, basket and amount within 45 minutes are flagged. Paid records can be released by explicitly entering the order number. This does not establish whether an order has already been fulfilled.
      </div>}
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
            <option value="duplicates">Possible duplicates</option>
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
              const duplicate = flags.has(order.id);
              const held = isHeld(order);
              return <tr key={order.id}>
                <td><input type="checkbox" aria-label={`Select order ${order.order_number}`}
                  checked={!held && selected.includes(order.id)}
                  disabled={!paid || held}
                  onChange={() => toggle(order.id)} /></td>
                <td className="whitespace-nowrap">{order.order_number}{duplicate && <div className="text-xs text-amber-600">Possible duplicate</div>}</td>
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
                  {duplicate && <button type="button" disabled={!paid} className="text-xs underline"
                    onClick={() => review(order)}>{reviewedIds.includes(order.id) ? "Revoke review" : "Confirm for printing"}</button>}
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
