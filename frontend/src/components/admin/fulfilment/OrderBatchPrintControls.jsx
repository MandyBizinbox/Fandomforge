import React, { useMemo, useState } from "react";
import { parsePayFastExport, reconcilePayFastOrders } from "../../../lib/payfastReconciliation";
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
  const [exportResult, setExportResult] = useState(null);
  const [exportError, setExportError] = useState("");
  const reconciliation = useMemo(() => exportResult ? reconcilePayFastOrders(orders, exportResult) : {}, [orders, exportResult]);
  const matched = (order) => reconciliation[order.id] === "gateway_matched";
  const loadExport = async (event) => {
    const file = event.target.files?.[0];
    setExportResult(null);
    setExportError("");
    setSelected([]);
    setReviewed([]);
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error("Transaction export exceeds 5 MB");
      const parsed = parsePayFastExport(await file.text());
      if (parsed.conflicts.length) throw new Error(parsed.conflicts.join("; "));
      setExportResult(parsed);
    } catch (error) { setExportError(error.message || "Could not parse transaction export"); }
  };
  const validIds = new Set(orders.map((order) => order.id));
  const reviewedIds = reviewed.filter((id) => validIds.has(id));
  const isHeld = (order) => flags.has(order.id) && !reviewedIds.includes(order.id);
  const eligible = orders.filter((order) => productionOrder(order) && matched(order) && !isHeld(order));
  const chosen = orders.filter((order) => selected.includes(order.id) && matched(order) && !isHeld(order));
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
            {eligible.length} gateway-matched production orders · {flags.size} potential duplicate records · {chosen.length} selected
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="ff-admin-button" onClick={() => setSelectedSafe(eligible.map((order) => order.id))} disabled={!exportResult}>Select gateway-confirmed for production</button>
          <button type="button" className="ff-admin-button" onClick={() => setSelectedSafe([])}>Clear</button>
          <button type="button" className="ff-admin-button ff-admin-button--primary" disabled={!pickingOrders.length} onClick={() => print(pickingListHtml(pickingOrders))}>Print picking list ({pickingOrders.length})</button>
          <button type="button" className="ff-admin-button ff-admin-button--primary" disabled={!invoiceOrders.length} onClick={() => print(bulkInvoicesHtml(invoiceOrders))}>Bulk print invoices ({invoiceOrders.length})</button>
        </div>
      </div>
      <label className="block text-sm font-semibold">PayFast transaction-history CSV (local comparison only)<input type="file" accept=".csv,text/csv" onChange={loadExport} className="block mt-2 text-xs" /></label>
      <p className="text-xs ff-admin-muted">No CSV data is uploaded or saved. Only orders marked paid AND matched by order number and exact gross amount to one PayFast Funds Received credit are selectable. Exports are point-in-time and must be refreshed. Any refund, reversal, or gateway exception requires manual review. Printable invoices are order summaries until legal invoice details are implemented.</p>
      {exportResult && <p className="text-sm">Matched paid orders: {orders.filter(o => paidOrder(o) && matched(o)).length} / {orders.filter(paidOrder).length}. Unmatched and ambiguous orders are held.</p>}
      {exportError && <p role="alert" className="text-red-600">{exportError}</p>}
      {flags.size > 0 && <div className="border border-amber-500/50 rounded-lg p-3 text-sm" role="alert">
        <strong>Possible duplicate checkouts detected.</strong> Matching buyer, basket and amount within 45 minutes are flagged. Confirm against PayFast before including either order in a print batch.
      </div>}
      <div className="overflow-x-auto">
        <table className="table-brutal min-w-[900px] w-full text-sm">
          <thead><tr><th>Choose</th><th>Order</th><th>Buyer</th><th>Total</th><th>Payment</th><th>Gateway export</th><th>Fulfilment</th><th>Duplicate review</th></tr></thead>
          <tbody>
            {orders.map((order) => {
              const paid = paidOrder(order);
              const duplicate = flags.has(order.id);
              const held = isHeld(order);
              return <tr key={order.id}>
                <td><input aria-label={`Select order ${order.order_number}`} type="checkbox" checked={!held && selected.includes(order.id)} disabled={!paid || !matched(order) || held} onChange={() => toggle(order.id)} /></td>
                <td>{order.order_number}</td>
                <td className="text-xs">{order.buyer_email}</td>
                <td>R {Number(order.total || 0).toFixed(2)}</td>
                <td>{order.payment_status || "unknown"}</td>
                <td>{exportResult ? (reconciliation[order.id] || "not_in_export") : "export required"}</td>
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
