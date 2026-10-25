import { aggregatePickingLines, bulkInvoicesHtml, duplicateOrderFlags, paidOrder, pickingListHtml, productionOrder } from "./orderPrintUtils";

const sample = (id, time, overrides = {}) => ({
  id, order_number: "MF-"+id, buyer_email: "shop@example.com",
  created_at: time, payment_status: "paid", status: "sent_to_printer",
  subtotal: 200, shipping_total: 50, total: 250, payment_provider: "payfast",
  items: [{ product_id: "tee", variation_id: "black-large", product_title: "Tee", size: "L", color: "Black", quantity: 2, unit_price: 100 }],
  ...overrides,
});

test("flags same-basket same-buyer near-time checkouts without deleting either", () => {
  const a = sample("1","2026-10-23T10:00:00Z");
  const b = sample("2","2026-10-23T10:05:00Z",{payment_status:"pending"});
  const flags=duplicateOrderFlags([a,b]);
  expect(flags.has(a.id)).toBe(true);
  expect(flags.has(b.id)).toBe(true);
  expect(a.payment_status).toBe("paid");
});

test("different baskets, customers and distant orders are not flagged", () => {
  const a=sample("1","2026-10-23T10:00:00Z");
  expect(duplicateOrderFlags([a,sample("2","2026-10-23T11:00:00Z")]).size).toBe(0);
  expect(duplicateOrderFlags([a,sample("2","2026-10-23T10:05:00Z",{buyer_email:"other@example.com"})]).size).toBe(0);
  expect(duplicateOrderFlags([a,sample("2","2026-10-23T10:05:00Z",{items:[{...a.items[0],quantity:1}]})]).size).toBe(0);
});

test("only paid unshipped orders count toward picking", () => {
  const paid=sample("1","2026-10-23T10:00:00Z");
  const pending=sample("2","2026-10-23T11:00:00Z",{payment_status:"pending"});
  const refunded=sample("3","2026-10-23T11:00:00Z",{payment_status:"refunded"});
  const shipped=sample("4","2026-10-23T11:00:00Z",{status:"shipped"});
  const completed=sample("5","2026-10-23T11:00:00Z",{status:"completed"});
  expect(paidOrder(paid)).toBe(true);
  expect(productionOrder(shipped)).toBe(false);
  expect(productionOrder(completed)).toBe(false);
  expect(aggregatePickingLines([paid,pending,refunded,shipped,completed])[0].quantity).toBe(2);
  expect(pickingListHtml([paid,pending])).toContain("MF-1");
  expect(pickingListHtml([paid,pending])).not.toContain("MF-2");
});

test("invoice print escapes user content and excludes unpaid orders", () => {
  const paid=sample("1","2026-10-23T10:00:00Z",{buyer_email:"<script>alert(1)</script>"});
  const pending=sample("2","2026-10-23T11:00:00Z",{payment_status:"pending"});
  const html=bulkInvoicesHtml([paid,pending]);
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>");
  expect(html).toContain("MF-1");
  expect(html).not.toContain("MF-2");
});
