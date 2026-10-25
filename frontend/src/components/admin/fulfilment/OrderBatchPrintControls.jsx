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

export default function OrderBatchPrintControls({ orders = [] }) {
  const flags = useMemo(() => duplicateOrderFlags(orders), [orders]);
  const [selected, setSelected] = useState([]);
  const [reviewed, setReviewed] = useState([]);
  const validIds = new Set(orders.map((order) => order.id));
  const reviewedIds = reviewed.filter((id) => validIds.has(id));
  const isHeld = (order) => flags.has(order.id) && !reviewedIds.includes(order.id);
  const eligible = orders.filter((order) => productionOrder(order) && !isHeld(order));
  const chosen = orders.filter((order) => selected.includes(order.id) && !isHeld(order));
  const invoiceOrders = chosen.filter(paidOrder);
  const pickingOrders = chosen.filter(productionOrder);
  const setSelectedSafe = (ids) => setSelected([...new Set(ids)]);
  const toggle = (id) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current,id]);
  const review = (id) => setReviewed((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current,id]);
  const print = (html) => {
    if (!openPrintDocument(html)) window.alert("Your browser blocked the print window. Enable pop-ups for FandomForge and retry.");
  };
  return (
    <section className="ff-admin-card space-y-3" data-testid="order-batch-print-controls">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div>
          <div className="font-semibold">Production printing</div>
          <div className="text-xs ff-admin-muted">
            {eligible.length} eligible paid production orders · {flags.size} potential duplicate records · {chosen.length} selected
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="ff-admin-button" onClick={() => setSelectedSafe(eligible.map((order) => order.id))}>Select paid for production</button>
          <button type="button" className="ff-admin-button" onClick={() => setSelectedSafe([])}>Clear</button>
          <button type="button" className="ff-admin-button ff-admin-button--primary" disabled={!pickingOrders.length} onClick={() => print(pickingListHtml(pickingOrders))}>Print picking list ({pickingOrders.length})</button>
          <button type="button" className="ff-admin-button ff-admin-button--primary" disabled={!invoiceOrders.length} onClick={() => print(bulkInvoicesHtml(invoiceOrders))}>Bulk print invoices ({invoiceOrders.length})</button>
        </div>
      </div>
      <p className="text-xs ff-admin-muted">Print windows open a printable document. Use your browser Print command to print or save as PDF. Only paid orders are permitted; suspected duplicates are held for review by default. A review acknowledgement does not change payment or order status.</p>
      {flags.size > 0 && <div className="border border-amber-500/50 rounded-lg p-3 text-sm" role="alert">
        <strong>Possible duplicate checkouts detected.</strong> Matching buyer, basket and amount within 45 minutes are flagged. Confirm against PayFast before including either order in a print batch.
      </div>}
      <div className="overflow-x-auto">
        <table className="table-brutal min-w-[900px] w-full text-sm">
          <thead><tr><th>Choose</th><th>Order</th><th>Buyer</th><th>Total</th><th>Payment</th><th>Fulfilment</th><th>Duplicate review</th></tr></thead>
          <tbody>
            {orders.map((order) => {
              const paid = paidOrder(order);
              const duplicate = flags.has(order.id);
              const held = isHeld(order);
              return <tr key={order.id}>
                <td><input aria-label={`Select order ${order.order_number}`} type="checkbox" checked={!held && selected.includes(order.id)} disabled={!paid || held} onChange={() => toggle(order.id)} /></td>
                <td>{order.order_number}</td>
                <td className="text-xs">{order.buyer_email}</td>
                <td>R {Number(order.total || 0).toFixed(2)}</td>
                <td>{order.payment_status || "unknown"}</td>
                <td>{order.status || "unknown"}</td>
                <td>{duplicate ? <label className="flex gap-2 items-center"><input type="checkbox" checked={reviewedIds.includes(order.id)} onChange={() => review(order.id)} />Reviewed against gateway</label> : "—"}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
