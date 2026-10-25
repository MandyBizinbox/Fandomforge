const asArray = (value) => Array.isArray(value) ? value : [];
const asText = (value) => String(value ?? "").trim();
export const escapePrintHtml = (value) => asText(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));

const fingerprint = (order) => JSON.stringify(asArray(order?.items).map((item) => [
  asText(item.product_id || item.product_title).toLowerCase(),
  asText(item.variation_id), asText(item.size).toLowerCase(),
  asText(item.color).toLowerCase(), Number(item.quantity || 0),
]).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));

export function duplicateOrderFlags(orders, minutes = 45) {
  const flags = new Set();
  const sorted = [...asArray(orders)].sort((a,b) =>
    Date.parse(a.created_at || 0) - Date.parse(b.created_at || 0));
  sorted.forEach((order, index) => {
    const at = Date.parse(order.created_at || "");
    if (!Number.isFinite(at)) return;
    const buyer = asText(order.buyer_email).toLowerCase();
    if (!buyer) return;
    for (let j = index - 1; j >= 0; j--) {
      const other = sorted[j];
      const previous = Date.parse(other.created_at || "");
      if (!Number.isFinite(previous) || at - previous > minutes * 60000) break;
      if (buyer === asText(other.buyer_email).toLowerCase()
        && Math.abs(Number(order.total || 0) - Number(other.total || 0)) < 0.01
        && fingerprint(order) === fingerprint(other)) {
        flags.add(order.id);
        flags.add(other.id);
      }
    }
  });
  return flags;
}

export function paidOrder(order) {
  return asText(order?.payment_status).toLowerCase() === "paid";
}

export function productionOrder(order) {
  return paidOrder(order) && !["cancelled","canceled","refunded","delivered","shipped","completed"].includes(
    asText(order?.status).toLowerCase()
  );
}

export function aggregatePickingLines(orders) {
  const results = new Map();
  for (const order of asArray(orders)) {
    if (!productionOrder(order)) continue;
    for (const item of asArray(order.items)) {
      const name = asText(item.product_title) || "Untitled product";
      const size = asText(item.size) || "N/A";
      const color = asText(item.color) || "N/A";
      const variation = asText(item.variation_id);
      const key = JSON.stringify([item.product_id || name, variation, size, color]);
      if (!results.has(key)) results.set(key, { name, size, color, variation, quantity: 0, orders: [] });
      const line = results.get(key);
      line.quantity += Number(item.quantity || 0);
      line.orders.push(asText(order.order_number) || asText(order.id));
    }
  }
  return [...results.values()].sort((a,b) =>
    a.name.localeCompare(b.name) || a.size.localeCompare(b.size) || a.color.localeCompare(b.color));
}

const currency = (value) => "R " + Number(value || 0).toFixed(2);
function documentShell(title, inner) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapePrintHtml(title)}</title><style>
  @page{size:A4;margin:14mm}body{font:12px Arial,sans-serif;color:#111}h1{font-size:22px;margin:0 0 12px}
  .muted{color:#666}.summary{margin:9px 0 18px}table{border-collapse:collapse;width:100%;margin-top:12px}
  th,td{text-align:left;border-bottom:1px solid #bbb;padding:7px 5px;vertical-align:top}th{background:#eee}
  .invoice{break-after:page;page-break-after:always}.invoice:last-child{break-after:auto;page-break-after:auto}
  .totals{text-align:right;font-weight:bold;margin-top:12px}.alert{border:2px solid #a00;padding:9px;margin:12px 0}
  </style></head><body>${inner}</body></html>`;
}
export function pickingListHtml(orders) {
  const eligible = asArray(orders).filter(productionOrder);
  const lines = aggregatePickingLines(eligible);
  const rows = lines.map(line => `<tr><td>${escapePrintHtml(line.name)}</td><td>${escapePrintHtml(line.size)}</td><td>${escapePrintHtml(line.color)}</td><td>${line.quantity}</td><td>${escapePrintHtml([...new Set(line.orders)].join(", "))}</td><td>□</td></tr>`).join("");
  return documentShell("Production picking list", `<h1>Production picking list</h1>
  <div class="summary">Paid production orders: ${eligible.length} | Total pieces: ${lines.reduce((sum,l)=>sum+l.quantity,0)}</div>
  <table><thead><tr><th>Product</th><th>Size</th><th>Colour</th><th>Qty</th><th>Order(s)</th><th>Picked</th></tr></thead><tbody>${rows}</tbody></table>`);
}
export function bulkInvoicesHtml(orders) {
  const eligible = asArray(orders).filter(paidOrder);
  return documentShell("Order invoices", eligible.map((order) => {
    const lineItems = asArray(order.items).map(item => `<tr>
      <td>${escapePrintHtml(item.product_title)}</td><td>${escapePrintHtml(item.size)}</td>
      <td>${escapePrintHtml(item.color)}</td><td>${Number(item.quantity || 0)}</td>
      <td>${escapePrintHtml(currency(item.unit_price))}</td>
      <td>${escapePrintHtml(currency(Number(item.unit_price || 0)*Number(item.quantity || 0)))}</td></tr>`).join("");
    return `<section class="invoice"><h1>Order invoice</h1>
      <p>Order: <strong>${escapePrintHtml(order.order_number)}</strong><br>
      Date: ${escapePrintHtml(String(order.created_at || "").slice(0,10))}<br>
      Buyer: ${escapePrintHtml(order.buyer_email)}<br>
      Payment: ${escapePrintHtml(order.payment_status)} (${escapePrintHtml(order.payment_provider)})</p>
      <table><thead><tr><th>Product</th><th>Size</th><th>Colour</th><th>Qty</th><th>Unit</th><th>Line total</th></tr></thead><tbody>${lineItems}</tbody></table>
      <div class="totals">Subtotal: ${escapePrintHtml(currency(order.subtotal))}<br>
      Shipping: ${escapePrintHtml(currency(order.shipping_total))}<br>
      Total: ${escapePrintHtml(currency(order.total))}</div>
      <p class="muted">Order record for fulfilment. Tax invoice status, VAT details and legal invoice numbering must be confirmed before use as a statutory tax invoice.</p>
    </section>`;
  }).join(""));
}
