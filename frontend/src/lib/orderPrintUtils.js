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
  .invoice-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;border-bottom:2px solid #111;padding-bottom:14px;margin-bottom:18px}
  .invoice-heading h1{margin:2px 0 0;font-size:26px}.eyebrow{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#666}
  .invoice-reference{text-align:right;line-height:1.7;font-size:12px}
  .invoice-parties{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;margin:0 0 18px;align-items:stretch}
  .party-card{border:1px solid #ccc;border-top:3px solid #111;padding:13px;min-width:0;overflow-wrap:anywhere;line-height:1.45}
  .party-label{font-size:10px;letter-spacing:1.1px;text-transform:uppercase;color:#666;font-weight:bold;margin-bottom:8px}
  .party-name{font-weight:bold;font-size:15px;margin-bottom:8px}
  .detail-row{display:grid;grid-template-columns:70px minmax(0,1fr);gap:6px;margin:4px 0}
  .detail-label{font-size:10px;color:#666}.detail-value{white-space:pre-line}
  .invoice-meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;background:#f5f5f5;border:1px solid #ddd;padding:10px;margin-bottom:16px;font-size:11px}
  .invoice-meta strong{font-size:10px;text-transform:uppercase;color:#555}.invoice-items{margin-top:0}
  .invoice-items td.number,.invoice-items th.number{text-align:right}
  .invoice-totals{width:270px;max-width:100%;margin:14px 0 0 auto}
  .invoice-totals>div{display:flex;justify-content:space-between;gap:20px;padding:5px 0}
  .invoice-totals .grand-total{font-size:16px;border-top:2px solid #111;margin-top:6px;padding-top:10px}
  .invoice-footer{border-top:1px solid #ddd;margin-top:32px;padding-top:10px;font-size:10px;color:#666}
  @media print{.invoice-parties{grid-template-columns:1fr 1fr}.invoice{break-after:page}.party-card,.invoice-heading,.invoice-meta,.invoice-totals{break-inside:avoid}}
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
function invoiceDetailRows(entries) {
  return entries.filter(([, value]) => asText(value)).map(([label, value]) =>
    `<div class="detail-row"><span class="detail-label">${escapePrintHtml(label)}</span><span class="detail-value">${escapePrintHtml(value)}</span></div>`
  ).join("");
}

function sellerDetailsHtml(platform = {}) {
  const business = asText(platform.business_name) || asText(platform.platform_name) || "FandomForge";
  const rows = invoiceDetailRows([
    ["Registration", platform.business_registration],
    ["Email", platform.public_contact_email || platform.support_email],
    ["Phone", platform.public_contact_phone || platform.support_phone],
    ["WhatsApp", platform.support_whatsapp],
    ["Country", platform.country],
  ]);
  return `<div class="party-card"><div class="party-label">From / Seller</div>
    <div class="party-name">${escapePrintHtml(business)}</div>${rows}</div>`;
}

function buyerDetailsHtml(order) {
  const address = order.shipping_address || {};
  const name = asText(address.full_name) || asText(order.buyer_name) || asText(order.buyer_email) || "Buyer";
  const lines = [
    address.line1, address.line2,
    [address.city, address.state, address.postal_code].filter(value => asText(value)).join(", "),
    address.country,
  ].filter(value => asText(value));
  return `<div class="party-card"><div class="party-label">Bill To / Customer</div>
    <div class="party-name">${escapePrintHtml(name)}</div>
    ${invoiceDetailRows([
      ["Email", address.email || order.buyer_email],
      ["Phone", address.phone || order.buyer_phone],
      ["Address", lines.join("\\n")],
    ])}</div>`;
}

export function bulkInvoicesHtml(orders, platform = {}) {
  const eligible = asArray(orders).filter(paidOrder);
  return documentShell("Order invoices", eligible.map((order) => {
    const lineItems = asArray(order.items).map(item => `<tr>
      <td>${escapePrintHtml(item.product_title)}</td><td>${escapePrintHtml(item.size)}</td>
      <td>${escapePrintHtml(item.color)}</td><td>${Number(item.quantity || 0)}</td>
      <td>${escapePrintHtml(currency(item.unit_price))}</td>
      <td>${escapePrintHtml(currency(Number(item.unit_price || 0)*Number(item.quantity || 0)))}</td></tr>`).join("");
    return `<section class="invoice">
      <div class="invoice-heading"><div><div class="eyebrow">${escapePrintHtml(platform.platform_name || "FandomForge")}</div>
        <h1>Order invoice</h1></div><div class="invoice-reference">
        <strong>${escapePrintHtml(order.order_number)}</strong><br>
        <span class="muted">${escapePrintHtml(String(order.created_at || "").slice(0,10))}</span></div></div>
      <div class="invoice-parties">${sellerDetailsHtml(platform)}${buyerDetailsHtml(order)}</div>
      <div class="invoice-meta">
        <div><strong>Order</strong><br>${escapePrintHtml(order.order_number)}</div>
        <div><strong>Payment status</strong><br>${escapePrintHtml(order.payment_status)}</div>
        <div><strong>Payment method</strong><br>${escapePrintHtml(order.payment_provider)}</div>
        <div><strong>Delivery</strong><br>${escapePrintHtml(order.shipping_method_name || order.shipping_method_key || "Not specified")}</div>
      </div>
      <table class="invoice-items"><thead><tr><th>Product</th><th>Size</th><th>Colour</th><th class="number">Qty</th><th class="number">Unit</th><th class="number">Line total</th></tr></thead><tbody>${lineItems}</tbody></table>
      <div class="invoice-totals">
        <div><span>Subtotal</span><strong>${escapePrintHtml(currency(order.subtotal))}</strong></div>
        <div><span>Shipping</span><strong>${escapePrintHtml(currency(order.shipping_total))}</strong></div>
        <div class="grand-total"><span>Total</span><strong>${escapePrintHtml(currency(order.total))}</strong></div>
      </div>
      <div class="invoice-footer">Order reference: ${escapePrintHtml(order.order_number)}</div>
    </section>`;
  }).join(""));
}

// All items are grouped by their own creator, not by the order's first item.
// An order containing products from two creators therefore appears on both
// creator sheets, but each sheet contains only its own products.
export function creatorCollectionGroups(orders, creatorNames = {}) {
  const groups = new Map();
  for (const order of asArray(orders)) {
    if (!paidOrder(order) || ["cancelled", "canceled", "refunded"].includes(asText(order.status).toLowerCase())) continue;
    for (const item of asArray(order.items)) {
      const creatorId = asText(item.band_id);
      const creatorName = asText(creatorNames[creatorId]) || asText(item.creator_name) ||
        asText(item.band_name) || (creatorId ? `Creator ${creatorId}` : "Unassigned creator");
      const groupKey = creatorId || "__unassigned__";
      if (!groups.has(groupKey)) groups.set(groupKey, { id: groupKey, name: creatorName, lines: [] });
      groups.get(groupKey).lines.push({
        orderNumber: asText(order.order_number) || asText(order.id),
        orderDate: asText(order.created_at).slice(0, 10),
        buyer: asText(order.shipping_address?.full_name) || asText(order.buyer_email),
        product: asText(item.product_title) || "Untitled product",
        size: asText(item.size),
        color: asText(item.color),
        quantity: Number(item.quantity || 0),
        shippingMethod: asText(order.shipping_method_name || order.shipping_method_key),
        status: asText(order.status),
      });
    }
  }
  return [...groups.values()].map(group => ({
    ...group,
    lines: group.lines.sort((a, b) => a.orderNumber.localeCompare(b.orderNumber) ||
      a.product.localeCompare(b.product) || a.size.localeCompare(b.size)),
  })).sort((a, b) => a.name.localeCompare(b.name));
}

export function creatorCollectionSheetHtml(orders, creatorNames = {}, creatorId = "all") {
  const groups = creatorCollectionGroups(orders, creatorNames)
    .filter(group => creatorId === "all" || group.id === creatorId);
  const contents = groups.map(group => {
    const rows = group.lines.map(line => `<tr>
      <td>${escapePrintHtml(line.orderNumber)}</td>
      <td>${escapePrintHtml(line.buyer)}</td>
      <td>${escapePrintHtml(line.product)}</td>
      <td>${escapePrintHtml(line.size)}</td>
      <td>${escapePrintHtml(line.color)}</td>
      <td>${line.quantity}</td>
      <td>${escapePrintHtml(line.shippingMethod)}</td>
      <td>□</td>
    </tr>`).join("");
    const pieces = group.lines.reduce((total, line) => total + line.quantity, 0);
    const orderCount = new Set(group.lines.map(line => line.orderNumber)).size;
    return `<section class="invoice">
      <h1>Order collection sheet — ${escapePrintHtml(group.name)}</h1>
      <div class="summary">Orders: ${orderCount} | Product lines: ${group.lines.length} | Total pieces: ${pieces}<br>
      Generated: ${escapePrintHtml(new Date().toLocaleDateString("en-ZA", { timeZone: "Africa/Johannesburg" }))}</div>
      <table><thead><tr><th>Order</th><th>Customer</th><th>Product</th><th>Size</th><th>Colour</th><th>Qty</th><th>Delivery</th><th>Collected</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="summary">Collected by: _____________________ &nbsp; Date: ______________</div>
    </section>`;
  }).join("");
  return documentShell("Creator order collection sheets",
    contents || "<h1>Order collection sheet</h1><p>No eligible paid order items match this selection.</p>");
}

function safeSpreadsheetCell(value) {
  const text = asText(value);
  // Prevent spreadsheet formula execution when an untrusted customer/product
  // field starts with a spreadsheet formula trigger.
  const safe = /^[=+@\-\t\r]/.test(text) ? "'" + text : text;
  return '"' + safe.replace(/"/g, '""') + '"';
}

export function creatorCollectionSheetCsv(orders, creatorNames = {}, creatorId = "all") {
  const header = ["Creator", "Order", "Order date", "Customer", "Product", "Size",
    "Colour", "Quantity", "Delivery", "Order status", "Collected", "Collected by"];
  const rows = [header];
  for (const group of creatorCollectionGroups(orders, creatorNames)) {
    if (creatorId !== "all" && group.id !== creatorId) continue;
    for (const line of group.lines) {
      rows.push([group.name, line.orderNumber, line.orderDate, line.buyer, line.product,
        line.size, line.color, line.quantity, line.shippingMethod, line.status, "", ""]);
    }
  }
  return "\uFEFF" + rows.map(row => row.map(safeSpreadsheetCell).join(",")).join("\r\n") + "\r\n";
}
