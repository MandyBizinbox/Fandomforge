// Client-side reconciliation for an operator-supplied PayFast transaction export.
// No records are sent to the server or persisted. This is an export comparison,
// not an authoritative gateway API lookup.
export function csvRows(text) {
  const rows = [];
  let field = "", row = [], quoted = false;
  const source = String(text || "").replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && char === ",") { row.push(field); field = ""; }
    else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && source[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some(v => v.trim())) rows.push(row);
      row = [];
    } else field += char;
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted value");
  row.push(field);
  if (row.some(v => v.trim())) rows.push(row);
  return rows;
}

export function parsePayFastExport(csv) {
  const [head, ...body] = csvRows(csv);
  if (!head) throw new Error("PayFast CSV is empty");
  const required = ["Type", "Name", "Gross", "M Payment ID", "PF Payment ID"];
  if (required.some(key => !head.includes(key))) throw new Error("This is not the expected PayFast transaction-history CSV");
  const index = (key) => head.indexOf(key);
  const transactions = [];
  const conflicts = [];
  const seen = new Set();
  for (const fields of body) {
    if (fields.length !== head.length) throw new Error("Malformed CSV: inconsistent column count");
    const get = (key) => String(fields[index(key)] || "").trim();
    if (!/^FandomForge Order MF-[A-Z0-9]+$/i.test(get("Name"))) continue;
    const orderNumber = get("Name").match(/MF-[A-Z0-9]+/i)?.[0].toUpperCase();
    const amount = Number(get("Gross").replace(/,/g, ""));
    const transactionId = get("PF Payment ID");
    if (!Number.isFinite(amount) || !transactionId) {
      conflicts.push(`Incomplete FandomForge transaction for ${orderNumber}`);
      continue;
    }
    if (seen.has(transactionId)) {
      conflicts.push(`Repeated PayFast reference for ${orderNumber}`);
      continue;
    }
    seen.add(transactionId);
    transactions.push({
      orderNumber, amount, transactionId,
      merchantReference: get("M Payment ID"),
      type: get("Type"), sign: index("Sign") >= 0 ? get("Sign") : "",
    });
  }
  return { transactions, conflicts };
}

export function reconcilePayFastOrders(orders, exportResult) {
  const byNumber = new Map();
  for (const tx of exportResult.transactions || []) {
    if (!byNumber.has(tx.orderNumber)) byNumber.set(tx.orderNumber, []);
    byNumber.get(tx.orderNumber).push(tx);
  }
  const results = {};
  for (const order of orders) {
    const matches = byNumber.get(String(order.order_number || "").toUpperCase()) || [];
    const credited = matches.filter(tx => tx.type === "Funds Received" && tx.sign.toLowerCase() === "credit");
    const other = matches.filter(tx => tx.type !== "Funds Received" || tx.sign.toLowerCase() !== "credit");
    const exact = credited.filter(tx => Math.abs(tx.amount - Number(order.total)) < 0.01);
    const valid = credited.length === 1 && exact.length === 1 && other.length === 0;
    results[order.id] = valid ? "gateway_matched"
      : matches.length ? "gateway_exception"
      : "not_in_export";
  }
  return results;
}
