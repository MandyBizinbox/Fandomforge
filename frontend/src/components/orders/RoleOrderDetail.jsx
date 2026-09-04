import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Copy, Download, FileText, Printer as PrinterIcon } from "lucide-react";
import { toast } from "sonner";
import { http, assetUrl } from "../../lib/api";
import StatusBadge from "../StatusBadge";
import ProductionPackSummary from "../production/ProductionPackSummary";
import ActivityTimeline from "../activity/ActivityTimeline";

const ORDER_STATUS = [
  "pending_payment", "paid", "awaiting_artwork_review", "sent_to_printer",
  "in_production", "ready_for_dispatch", "shipped", "completed", "cancelled", "refunded",
];
const ITEM_STATUS = ["pending", "accepted", "in_production", "ready", "shipped", "delivered"];

function money(value, currency = "ZAR") {
  const amount = Number(value || 0).toFixed(2);
  return currency === "ZAR" ? `R ${amount}` : `${currency} ${amount}`;
}
function number(value) {
  const result = Number(value || 0);
  return Number.isFinite(result) ? result : 0;
}
function short(value, length = 16) {
  if (!value) return "—";
  const text = String(value);
  return text.length > length ? `${text.slice(0, length)}…` : text;
}
function htmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function creatorFinance(item) {
  const quantity = Math.max(number(item?.quantity), 1);
  const finance = item?.creator_finance || {};
  const sellingUnit = number(finance.selling_price_unit ?? item?.unit_price);
  const productionUnit = number(finance.production_cost_unit ?? item?.print_cost_unit);
  const platformFeeTotal = number(finance.platform_fee_total ?? item?.commission_amount);
  const markupTotal = number(finance.creator_markup_total ?? item?.band_earnings);
  return {
    sellingUnit,
    sellingTotal: number(finance.selling_price_total ?? sellingUnit * quantity),
    productionUnit,
    productionTotal: number(finance.production_cost_total ?? productionUnit * quantity),
    platformFeeTotal,
    markupTotal,
    payoutTotal: number(finance.creator_payout_total ?? markupTotal),
  };
}
function printerFinance(item) {
  const quantity = Math.max(number(item?.quantity), 1);
  const finance = item?.printer_finance || {};
  const payoutTotal = number(finance.printer_payout_total ?? item?.printer_payout);
  return { payoutTotal, payoutUnit: number(finance.printer_payout_unit ?? payoutTotal / quantity) };
}
function creatorTotals(order) {
  if (order?.creator_finance_summary && Object.keys(order.creator_finance_summary).length) {
    const s = order.creator_finance_summary;
    return {
      selling: number(s.selling_total), production: number(s.production_cost_total), fee: number(s.platform_fee_total),
      markup: number(s.creator_markup_total), payout: number(s.creator_payout_total),
    };
  }
  return (order?.items || []).reduce((acc, item) => {
    const f = creatorFinance(item);
    acc.selling += f.sellingTotal; acc.production += f.productionTotal; acc.fee += f.platformFeeTotal;
    acc.markup += f.markupTotal; acc.payout += f.payoutTotal;
    return acc;
  }, { selling: 0, production: 0, fee: 0, markup: 0, payout: 0 });
}
function addressLines(address = {}) {
  return [address.line1, address.line2, [address.city, address.state, address.postal_code].filter(Boolean).join(" "), address.country].filter(Boolean);
}

function Stat({ label, value, emphasis = false }) {
  return <div className="ff-ui-stat-card px-4 py-3"><div className="text-[10px] uppercase tracking-widest ff-ui-muted">{label}</div><div className={`${emphasis ? "text-2xl font-display" : "text-sm font-semibold"} mt-1 text-[var(--ff-card-text)]`}>{value}</div></div>;
}
function Section({ title, children, className = "" }) {
  return <section className={`ff-ui-card ${className}`}><div className="overline mb-4">{title}</div>{children}</section>;
}
function TabButton({ active, children, onClick }) {
  return <button type="button" onClick={onClick} className={`px-4 py-3 text-xs uppercase tracking-widest font-bold border-b-2 whitespace-nowrap ${active ? "ff-ui-tab--active" : "border-transparent ff-ui-muted hover:text-[var(--ff-card-text)]"}`}>{children}</button>;
}

export default function RoleOrderDetail({ mode = "view", backTo, testidPrefix = "order" }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const isAdmin = mode === "admin" || mode === "edit";
  const isCreator = mode === "creator" || String(testidPrefix || "").startsWith("creator");
  const isPrinter = mode === "printer";
  const isCustomer = !isAdmin && !isCreator && !isPrinter;
  const [order, setOrder] = useState(null);
  const [printers, setPrinters] = useState([]);
  const [activeTab, setActiveTab] = useState("overview");
  const [helpMessage, setHelpMessage] = useState("");
  const [sendingHelp, setSendingHelp] = useState(false);

  const load = async () => {
    const endpoint = isPrinter ? `/printer-dash/orders/${id}` : `/orders/${id}`;
    const response = await http.get(endpoint);
    setOrder(response.data);
  };

  useEffect(() => {
    load().catch((error) => toast.error(error.response?.data?.detail || "Could not load order"));
    if (isAdmin) http.get("/printers").then((r) => setPrinters(r.data || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, mode]);

  const tabs = useMemo(() => {
    if (isAdmin) return ["overview", "items", "production", "shipping", "payment", "activity"];
    if (isCreator) return ["overview", "items", "earnings", "shipping", "activity"];
    if (isPrinter) return ["overview", "production", "shipping", "activity"];
    return ["overview", "items", "shipping", "payment"];
  }, [isAdmin, isCreator, isPrinter]);

  if (!order) return <div className="overline">Loading…</div>;

  const shipping = order.shipping_address || {};
  const totals = creatorTotals(order);
  const tracking = order.tracking_number || (order.items || []).find((item) => item.tracking_number)?.tracking_number || "";
  const courier = order.courier_name || (order.items || []).find((item) => item.courier_name)?.courier_name || "";
  const trackingUrl = order.tracking_url || (order.items || []).find((item) => item.tracking_url)?.tracking_url || (order.tracking_token ? `${window.location.origin}/order-tracking/${order.tracking_token}` : "");

  const patchOrderStatus = async (status) => {
    try { await http.patch(`/orders/${id}/status`, { status }); toast.success(`Order → ${status.replaceAll("_", " ")}`); await load(); }
    catch (error) { toast.error(error.response?.data?.detail || "Could not update order"); }
  };
  const patchItem = async (itemId, patch) => {
    try { await http.patch(`/orders/${id}/status`, { item_id: itemId, ...patch }); toast.success("Item updated"); await load(); }
    catch (error) { toast.error(error.response?.data?.detail || "Could not update item"); }
  };
  const reassignPrinter = async (printerId) => {
    if (!printerId) return;
    try { await http.post(`/orders/${id}/assign-printer?printer_id=${printerId}`); toast.success("Printer reassigned"); await load(); }
    catch (error) { toast.error(error.response?.data?.detail || "Could not reassign printer"); }
  };
  const copy = async (text, label = "Copied") => {
    try { await navigator.clipboard.writeText(text); toast.success(label); }
    catch { toast.error("Could not copy"); }
  };
  const submitHelp = async (event) => {
    event.preventDefault();
    const message = helpMessage.trim();
    if (!message) return toast.error("Add a help message first");
    try {
      setSendingHelp(true);
      await http.post(`/orders/${id}/notes`, { message: `Creator help request for order ${order.order_number}: ${message}`, audience: ["admin", "creator"] });
      setHelpMessage(""); toast.success("Help request sent");
    } catch (error) { toast.error(error.response?.data?.detail || "Could not send help request"); }
    finally { setSendingHelp(false); }
  };

  const printDispatchInvoice = () => {
    const itemRows = (order.items || []).map((item) => `
      <tr>
        <td>${htmlEscape(item.product_title)}</td>
        <td>${htmlEscape([item.size, item.color].filter(Boolean).join(" / "))}</td>
        <td class="num">${htmlEscape(item.quantity)}</td>
        <td class="num">${htmlEscape(money(item.unit_price))}</td>
        <td class="num">${htmlEscape(money(number(item.unit_price) * number(item.quantity)))}</td>
      </tr>`).join("");
    const popup = window.open("", "_blank", "width=980,height=800");
    if (!popup) return toast.error("Pop-ups are blocked. Allow pop-ups to print the invoice.");
    popup.document.write(`<!doctype html><html><head><title>${htmlEscape(order.order_number)} Dispatch Invoice</title><style>
      body{font-family:Arial,sans-serif;color:#111;margin:32px;font-size:12px}.top{display:flex;justify-content:space-between;gap:32px}.title{font-size:28px;font-weight:800;margin:0}.muted{color:#666}.block{margin-top:24px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{padding:9px 8px;border-bottom:1px solid #ddd;text-align:left}th{font-size:10px;text-transform:uppercase;letter-spacing:.08em;background:#f4f4f4}.num{text-align:right}.totals{margin-left:auto;width:320px}.totals td:first-child{color:#666}.total{font-size:16px;font-weight:800}.dispatch{border:1px solid #bbb;padding:14px}.footer{margin-top:36px;padding-top:12px;border-top:1px solid #ddd;color:#777;font-size:10px}@media print{body{margin:12mm}.no-print{display:none}}
    </style></head><body>
      <div class="top"><div><div class="muted">FandomForge</div><h1 class="title">Dispatch Invoice</h1><div>Order ${htmlEscape(order.order_number)}</div></div><div><strong>${htmlEscape(new Date(order.created_at).toLocaleDateString())}</strong><br><span class="muted">Status: ${htmlEscape(order.status?.replaceAll("_", " "))}</span></div></div>
      <div class="grid block"><div><strong>Deliver to</strong><br>${htmlEscape(shipping.full_name)}<br>${addressLines(shipping).map(htmlEscape).join("<br>")}<br>${htmlEscape(shipping.phone || "")}<br>${htmlEscape(shipping.email || "")}</div><div class="dispatch"><strong>Dispatch</strong><br>Method: ${htmlEscape(order.shipping_method_name || "—")}<br>Courier: ${htmlEscape(courier || "—")}<br>Tracking: ${htmlEscape(tracking || "—")}</div></div>
      <div class="block"><strong>Items</strong><table><thead><tr><th>Product</th><th>Variation</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Line total</th></tr></thead><tbody>${itemRows}</tbody></table></div>
      <table class="totals block"><tr><td>Subtotal</td><td class="num">${htmlEscape(money(order.subtotal))}</td></tr><tr><td>Shipping</td><td class="num">${number(order.shipping_total) === 0 ? "Free" : htmlEscape(money(order.shipping_total))}</td></tr><tr class="total"><td>Total</td><td class="num">${htmlEscape(money(order.total))}</td></tr></table>
      <div class="footer">Generated from FandomForge · ${htmlEscape(order.order_number)}</div>
      <script>window.onload=()=>{window.print();}</script>
    </body></html>`);
    popup.document.close();
  };

  const renderItems = ({ production = false } = {}) => (
    <div className="space-y-4">
      {(order.items || []).map((item) => {
        const cf = creatorFinance(item); const pf = printerFinance(item);
        return <Section key={item.id} title={production ? "Production item" : "Order item"}>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="w-24 h-24 border border-[var(--ff-card-border)] bg-[var(--ff-surface-bg)] flex-shrink-0 overflow-hidden">
              {(item.mockup_url || item.artwork_file_url) ? <img src={assetUrl(item.mockup_url || item.artwork_file_url)} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} /> : <div className="h-full flex items-center justify-center text-[10px] ff-ui-muted">NO IMAGE</div>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display text-2xl uppercase">{item.product_title}</div>
              <div className="text-xs ff-ui-muted mt-1">{[item.size, item.color].filter(Boolean).join(" / ") || "Standard"} · Qty {item.quantity}</div>
              <div className="flex flex-wrap items-center gap-2 mt-3"><StatusBadge status={item.production_status} />{!production && <span className="text-sm font-mono">{money(item.unit_price)} each</span>}</div>
              {isCreator && <div className="text-xs ff-ui-muted mt-3">Selling {money(cf.sellingUnit)} · Production {money(cf.productionUnit)} · Your markup <span className="ff-ui-success-text">{money(cf.markupTotal)}</span></div>}
              {isPrinter && <div className="text-xs ff-ui-muted mt-3">Job payout <span className="ff-ui-success-text">{money(pf.payoutTotal)}</span></div>}
              {isAdmin && !production && <div className="text-xs ff-ui-muted mt-3">Production {money(item.print_cost_unit)} · Creator {money(item.band_earnings)} · Printer {money(item.printer_payout)}</div>}
              {item.artwork_file_url && (isAdmin || isPrinter) && <a href={assetUrl(item.artwork_file_url)} target="_blank" rel="noreferrer" className="ff-ui-button ff-ui-button--secondary inline-flex mt-3 text-xs"><Download size={12} /> Download artwork</a>}
            </div>
          </div>
          {production && <div className="mt-5"><ProductionPackSummary item={item} testidPrefix={`${testidPrefix}-pack-${item.id}`} showInternalMoney={isAdmin} /></div>}
          {(isAdmin || isPrinter) && <div className="mt-5 pt-4 border-t border-[var(--ff-card-border)] space-y-4">
            <div><div className="ff-ui-label">Production status</div><div className="flex flex-wrap gap-2">{ITEM_STATUS.map((status) => <button key={status} type="button" onClick={() => patchItem(item.id, { item_production_status: status })} className={`text-[10px] uppercase tracking-widest font-bold px-3 py-2 border ${item.production_status === status ? "ff-ui-choice--active" : "ff-ui-choice--idle"}`}>{status.replaceAll("_", " ")}</button>)}</div></div>
            <div className="grid md:grid-cols-2 gap-3">
              <label><span className="ff-ui-label">Courier</span><input className="ff-ui-control" defaultValue={item.courier_name || order.courier_name || ""} onBlur={(e) => e.target.value !== (item.courier_name || "") && patchItem(item.id, { courier_name: e.target.value })} /></label>
              <label><span className="ff-ui-label">Tracking number</span><input className="ff-ui-control" defaultValue={item.tracking_number || ""} onBlur={(e) => e.target.value !== (item.tracking_number || "") && patchItem(item.id, { tracking_number: e.target.value })} /></label>
              <label><span className="ff-ui-label">Waybill</span><input className="ff-ui-control" defaultValue={item.waybill_number || ""} onBlur={(e) => e.target.value !== (item.waybill_number || "") && patchItem(item.id, { waybill_number: e.target.value })} /></label>
              <label><span className="ff-ui-label">Tracking URL</span><input className="ff-ui-control" defaultValue={item.tracking_url || ""} onBlur={(e) => e.target.value !== (item.tracking_url || "") && patchItem(item.id, { tracking_url: e.target.value })} /></label>
            </div>
          </div>}
        </Section>;
      })}
    </div>
  );

  return <div data-testid={`${testidPrefix}-detail-page`} className="space-y-5">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div>
        {backTo && <button type="button" onClick={() => navigate(backTo)} className="text-xs uppercase tracking-widest ff-ui-muted hover:text-[var(--ff-card-text)] mb-4 inline-flex items-center gap-2"><ArrowLeft size={14} /> Back</button>}
        <div className="overline mb-1">Order</div>
        <h1 className="font-display text-4xl md:text-5xl uppercase" data-testid={`${testidPrefix}-number`}>{order.order_number}</h1>
        <div className="flex flex-wrap items-center gap-2 mt-3"><StatusBadge status={order.status} testId={`${testidPrefix}-status`} /><StatusBadge status={order.payment_status} /><span className="text-xs ff-ui-muted">{new Date(order.created_at).toLocaleString()}</span></div>
      </div>
      <div className="flex flex-wrap gap-2">
        {(isAdmin || isCreator) && <button type="button" className="ff-ui-button ff-ui-button--secondary" onClick={printDispatchInvoice}><FileText size={14} /> Print / PDF invoice</button>}
        {trackingUrl && <button type="button" className="ff-ui-button ff-ui-button--secondary" onClick={() => copy(trackingUrl, "Tracking link copied")}><Copy size={14} /> Tracking link</button>}
      </div>
    </div>

    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Stat label="Items" value={(order.items || []).reduce((sum, item) => sum + number(item.quantity), 0)} />
      <Stat label="Order total" value={money(order.total)} emphasis />
      <Stat label="Payment" value={(order.payment_status || "—").replaceAll("_", " ")} />
      <Stat label="Delivery" value={tracking ? "Tracking assigned" : (order.shipping_method_name || "Pending")} />
    </div>

    <div className="ff-ui-tabs overflow-x-auto"><div className="flex min-w-max">{tabs.map((tab) => <TabButton key={tab} active={activeTab === tab} onClick={() => setActiveTab(tab)}>{tab}</TabButton>)}</div></div>

    {activeTab === "overview" && <div className="grid lg:grid-cols-3 gap-4">
      <Section title="Customer" className="lg:col-span-1"><div className="font-bold text-[var(--ff-card-text)]">{shipping.full_name || "—"}</div><div className="text-sm ff-ui-muted mt-2 space-y-1"><div>{shipping.email || "—"}</div>{shipping.phone && <div>{shipping.phone}</div>}</div></Section>
      <Section title="Delivery" className="lg:col-span-1"><div className="text-sm space-y-1">{addressLines(shipping).map((line) => <div key={line}>{line}</div>)}<div className="ff-ui-muted pt-2">{order.shipping_method_name || "Shipping method pending"}</div>{courier && <div>Courier: {courier}</div>}{tracking && <div>Tracking: <span className="font-mono">{tracking}</span></div>}</div></Section>
      <Section title="Totals" className="lg:col-span-1"><div className="space-y-2 text-sm"><div className="flex justify-between"><span className="ff-ui-muted">Subtotal</span><span>{money(order.subtotal)}</span></div><div className="flex justify-between"><span className="ff-ui-muted">Shipping</span><span>{number(order.shipping_total) === 0 ? "Free" : money(order.shipping_total)}</span></div><div className="flex justify-between border-t border-[var(--ff-card-border)] pt-2"><strong>Total</strong><strong className="font-display text-xl">{money(order.total)}</strong></div></div></Section>
      {isAdmin && <Section title="Admin actions" className="lg:col-span-2"><div className="grid md:grid-cols-2 gap-5"><div><div className="ff-ui-label">Order status</div><div className="flex flex-wrap gap-2">{ORDER_STATUS.map((status) => <button key={status} type="button" onClick={() => patchOrderStatus(status)} className={`text-[10px] uppercase tracking-widest font-bold px-3 py-2 border ${order.status === status ? "ff-ui-choice--active" : "ff-ui-choice--idle"}`}>{status.replaceAll("_", " ")}</button>)}</div></div><label><span className="ff-ui-label">Reassign printer</span><select className="ff-ui-control" defaultValue="" onChange={(e) => reassignPrinter(e.target.value)}><option value="">Choose printer</option>{printers.map((printer) => <option key={printer.id} value={printer.id}>{printer.company_name}{printer.location ? ` · ${printer.location}` : ""}</option>)}</select></label></div></Section>}
      {isCreator && <Section title="Need help?" className="lg:col-span-2"><form onSubmit={submitHelp} className="flex flex-col md:flex-row gap-3"><textarea className="ff-ui-control flex-1" rows={3} value={helpMessage} onChange={(e) => setHelpMessage(e.target.value)} placeholder="Ask FandomForge support about this order" /><button className="ff-ui-button ff-ui-button--primary md:self-end" disabled={sendingHelp}>{sendingHelp ? "Sending…" : "Send request"}</button></form></Section>}
    </div>}

    {activeTab === "items" && renderItems()}
    {activeTab === "production" && renderItems({ production: true })}

    {activeTab === "earnings" && <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-3"><Stat label="Selling total" value={money(totals.selling)} /><Stat label="Production" value={money(totals.production)} /><Stat label="Platform fee" value={money(totals.fee)} /><Stat label="Your markup" value={money(totals.markup)} /><Stat label="Your payout" value={money(totals.payout)} emphasis /></div>}

    {activeTab === "shipping" && <div className="grid lg:grid-cols-2 gap-4"><Section title="Delivery address"><div className="font-bold">{shipping.full_name || "—"}</div><div className="text-sm mt-2 space-y-1">{addressLines(shipping).map((line) => <div key={line}>{line}</div>)}</div></Section><Section title="Tracking"><div className="space-y-2 text-sm"><div className="flex justify-between gap-4"><span className="ff-ui-muted">Method</span><span>{order.shipping_method_name || "—"}</span></div><div className="flex justify-between gap-4"><span className="ff-ui-muted">Courier</span><span>{courier || "—"}</span></div><div className="flex justify-between gap-4"><span className="ff-ui-muted">Tracking</span><span className="font-mono">{tracking || "—"}</span></div>{trackingUrl && <button type="button" className="ff-ui-button ff-ui-button--secondary w-full mt-3" onClick={() => copy(trackingUrl)}><Copy size={14} /> Copy tracking link</button>}</div></Section></div>}

    {activeTab === "payment" && <Section title="Payment"><div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3"><Stat label="Provider" value={order.payment_details?.provider || order.payment_provider || "—"} /><Stat label="Status" value={order.payment_details?.status || order.payment_status || "—"} /><Stat label="Amount" value={money(order.payment_details?.amount || order.total, order.payment_details?.currency || "ZAR")} />{isAdmin && <Stat label="Reference" value={short(order.payment_details?.reference || order.payment_reference)} />}</div>{isAdmin && <div className="mt-4 text-xs ff-ui-muted">Provider ID: {short(order.payment_details?.provider_payment_id || order.provider_payment_id, 28)} · Internal ID: {short(order.payment_details?.id || order.payment_id, 28)}</div>}</Section>}

    {activeTab === "activity" && <ActivityTimeline orderId={id} title="Order Timeline" canAddNote={isAdmin || isPrinter} defaultAudience={isPrinter ? ["admin", "printer"] : isAdmin ? ["admin", "creator", "printer"] : ["admin"]} />}
  </div>;
}
