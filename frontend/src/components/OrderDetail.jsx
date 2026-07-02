import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { http, assetUrl } from "../lib/api";
import StatusBadge from "./StatusBadge";
import { toast } from "sonner";
import { Download, ArrowLeft, Copy } from "lucide-react";
import ProductionPackSummary from "./production/ProductionPackSummary";
import ActivityTimeline from "./activity/ActivityTimeline";

const ALL_ORDER_STATUS = [
  "pending_payment", "paid", "awaiting_artwork_review", "sent_to_printer",
  "in_production", "ready_for_dispatch", "shipped", "completed", "cancelled", "refunded",
];

const ITEM_STATUS = ["pending", "accepted", "in_production", "ready", "shipped", "delivered"];

function formatMoney(value, currency = "ZAR") {
  const amount = Number(value || 0).toFixed(2);
  return currency === "ZAR" ? `R ${amount}` : `${currency} ${amount}`;
}

function shortValue(value, length = 14) {
  if (!value) return "—";
  const text = String(value);
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

function safeNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function itemCreatorFinance(item) {
  const quantity = Math.max(Number(item?.quantity || 1), 1);
  const apiFinance = item?.creator_finance || {};

  const sellingUnit = safeNumber(apiFinance.selling_price_unit ?? item?.unit_price);
  const productionUnit = safeNumber(apiFinance.production_cost_unit ?? item?.print_cost_unit);
  const platformFeeTotal = safeNumber(apiFinance.platform_fee_total ?? item?.commission_amount);
  const creatorMarkupTotal = safeNumber(apiFinance.creator_markup_total ?? item?.band_earnings);

  return {
    sellingUnit,
    sellingTotal: safeNumber(apiFinance.selling_price_total ?? sellingUnit * quantity),
    productionUnit,
    productionTotal: safeNumber(apiFinance.production_cost_total ?? productionUnit * quantity),
    platformFeeUnit: safeNumber(apiFinance.platform_fee_unit ?? platformFeeTotal / quantity),
    platformFeeTotal,
    creatorMarkupUnit: safeNumber(apiFinance.creator_markup_unit ?? creatorMarkupTotal / quantity),
    creatorMarkupTotal,
    creatorPayoutTotal: safeNumber(apiFinance.creator_payout_total ?? creatorMarkupTotal),
  };
}

function itemPrinterFinance(item) {
  const quantity = Math.max(Number(item?.quantity || 1), 1);
  const apiFinance = item?.printer_finance || {};
  const payoutTotal = safeNumber(apiFinance.printer_payout_total ?? item?.printer_payout);
  return {
    payoutTotal,
    payoutUnit: safeNumber(apiFinance.printer_payout_unit ?? payoutTotal / quantity),
  };
}

function creatorOrderTotals(order) {
  const apiSummary = order?.creator_finance_summary || {};
  if (Object.keys(apiSummary).length) {
    return {
      sellingTotal: safeNumber(apiSummary.selling_total),
      productionTotal: safeNumber(apiSummary.production_cost_total),
      platformFeeTotal: safeNumber(apiSummary.platform_fee_total),
      creatorMarkupTotal: safeNumber(apiSummary.creator_markup_total),
      creatorPayoutTotal: safeNumber(apiSummary.creator_payout_total),
    };
  }

  return (order?.items || []).reduce((totals, item) => {
    const finance = itemCreatorFinance(item);
    totals.sellingTotal += finance.sellingTotal;
    totals.productionTotal += finance.productionTotal;
    totals.platformFeeTotal += finance.platformFeeTotal;
    totals.creatorMarkupTotal += finance.creatorMarkupTotal;
    totals.creatorPayoutTotal += finance.creatorPayoutTotal;
    return totals;
  }, {
    sellingTotal: 0,
    productionTotal: 0,
    platformFeeTotal: 0,
    creatorMarkupTotal: 0,
    creatorPayoutTotal: 0,
  });
}

function assignedPrinterName(order) {
  for (const item of order?.items || []) {
    const printer = item?.production_snapshot?.assigned_printer || {};
    const name = printer.company_name || printer.name || item.printer_company_name || item.printer_name;
    if (name) return name;
  }
  return "Printer assignment pending";
}

export default function OrderDetail({ mode = "view", backTo, testidPrefix = "order" }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [printers, setPrinters] = useState([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpMessage, setHelpMessage] = useState("");
  const [submittingHelp, setSubmittingHelp] = useState(false);

  const isCreatorView = mode === "creator" || String(testidPrefix || "").startsWith("creator");
  const isPrinterView = mode === "printer";
  const isAdminView = mode === "admin" || mode === "edit";

  const load = () => {
    const endpoint = mode === "printer" ? `/printer-dash/orders/${id}` : `/orders/${id}`;
    return http.get(endpoint).then((r) => setOrder(r.data));
  };

  useEffect(() => {
    load();
    if (isAdminView) {
      http.get("/printers").then((r) => setPrinters(r.data)).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!order) return <div className="overline">Loading…</div>;

  const setOrderStatus = async (status) => {
    try {
      await http.patch(`/orders/${id}/status`, { status });
      toast.success(`Order → ${status.replace(/_/g, " ")}`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  const setItemPatch = async (itemId, patch) => {
    try {
      await http.patch(`/orders/${id}/status`, { item_id: itemId, ...patch });
      toast.success("Updated");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  const submitCreatorHelp = async (event) => {
    event.preventDefault();
    const message = helpMessage.trim();

    if (!message) {
      toast.error("Add a short help message first");
      return;
    }

    try {
      setSubmittingHelp(true);
      await http.post(`/orders/${id}/notes`, {
        message: `Creator help request for order ${order.order_number}: ${message}`,
        audience: ["admin", "creator"],
      });
      setHelpMessage("");
      setHelpOpen(false);
      toast.success("Help request sent");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not send help request");
    } finally {
      setSubmittingHelp(false);
    }
  };

  const reassignPrinter = async (printerId) => {
    try {
      await http.post(`/orders/${id}/assign-printer?printer_id=${printerId}`);
      toast.success("Printer reassigned");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  const canEditStatus = isAdminView || isPrinterView;
  const canReassign = isAdminView;
  const showInternalProductionPack = isAdminView;
  const showPrinterProductionPack = isPrinterView;
  const showProductionPack = showInternalProductionPack || showPrinterProductionPack;

  const copyMessage = async (message) => {
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Message copied");
    } catch {
      toast.error("Could not copy message");
    }
  };

  const customerName = order.shipping_address?.full_name || "there";
  const firstTracking = (order.items || []).find((item) => item.tracking_number)?.tracking_number;
  const trackingUrl = order.tracking_token ? `${window.location.origin}/order-tracking/${order.tracking_token}` : "";
  const customerMessages = [
    {
      label: "Order received",
      body: `Hi ${customerName}, your order ${order.order_number} has been received and is being prepared for production.${trackingUrl ? ` You can track it here: ${trackingUrl}` : ""}`,
    },
    {
      label: "In production",
      body: `Hi ${customerName}, your order ${order.order_number} is now in production. We will update you once it is ready for dispatch.${trackingUrl ? ` Track it here: ${trackingUrl}` : ""}`,
    },
    {
      label: "Ready / shipped",
      body: `Hi ${customerName}, your order ${order.order_number} has been dispatched${firstTracking ? ` with tracking number ${firstTracking}` : ""}.${trackingUrl ? ` Track it here: ${trackingUrl}` : ""}`,
    },
  ];

  const creatorTotals = creatorOrderTotals(order);
  const printerName = assignedPrinterName(order);

  return (
    <div data-testid={`${testidPrefix}-detail-page`}>
      {backTo && (
        <button onClick={() => navigate(backTo)} className="text-xs uppercase tracking-widest text-zinc-400 hover:text-white mb-4 flex items-center gap-2" data-testid={`${testidPrefix}-back`}>
          <ArrowLeft size={14} /> Back
        </button>
      )}
      <div className="overline mb-2">Order {mode === "edit" ? "Edit" : "View"}</div>
      <h1 className="font-display text-5xl uppercase mb-2" data-testid={`${testidPrefix}-number`}>{order.order_number}</h1>
      <div className="flex items-center gap-3 mb-8">
        <StatusBadge status={order.status} testId={`${testidPrefix}-status`} />
        <StatusBadge status={order.payment_status} />
        <span className="text-xs text-zinc-500">{new Date(order.created_at).toLocaleString()}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {order.items.map((it) => {
            const creatorFinance = itemCreatorFinance(it);
            const printerFinance = itemPrinterFinance(it);
            return (
              <div key={it.id} className="card" data-testid={`${testidPrefix}-item-${it.id}`}>
                <div className="flex items-start gap-4">
                  {it.artwork_file_url ? (
                    <img src={assetUrl(it.artwork_file_url)} alt="" className="w-24 h-24 object-cover border border-white/15" onError={(e) => { e.target.style.display = "none"; }} />
                  ) : (
                    <div className="w-24 h-24 border border-white/15 flex items-center justify-center text-xs text-zinc-600">no art</div>
                  )}
                  <div className="flex-1">
                    <div className="font-display text-xl uppercase">{it.product_title}</div>
                    <div className="overline mt-1">{it.size} / {it.color} × {it.quantity}</div>

                    {isCreatorView ? (
                      <div className="mt-2 space-y-1 text-xs">
                        <div className="text-zinc-400">
                          Selling {formatMoney(creatorFinance.sellingUnit)} · Production cost {formatMoney(creatorFinance.productionUnit)} · Platform fee {formatMoney(creatorFinance.platformFeeUnit)}
                        </div>
                        <div className="text-[#34C759]">
                          Creator markup {formatMoney(creatorFinance.creatorMarkupTotal)} · Total payout {formatMoney(creatorFinance.creatorPayoutTotal)}
                        </div>
                      </div>
                    ) : isPrinterView ? (
                      <div className="mt-2 space-y-1 text-xs">
                        <div className="text-zinc-400">Quantity {it.quantity} · Job payout {formatMoney(printerFinance.payoutTotal)}</div>
                      </div>
                    ) : (
                      <>
                        <div className="text-xs text-zinc-400 mt-2">
                          Unit {formatMoney(it.unit_price)} · Production {formatMoney(it.print_cost_unit)} · Commission {safeNumber(it.commission_rate * 100).toFixed(0)}% ({formatMoney(it.commission_amount)})
                        </div>
                        <div className="text-xs text-[#34C759] mt-1">Creator earn: {formatMoney(it.band_earnings)} · Printer payout: {formatMoney(it.printer_payout)}</div>
                      </>
                    )}

                    <div className="mt-2"><StatusBadge status={it.production_status} /></div>
                    {it.tracking_number && <div className="text-xs mt-1">Tracking: <span className="font-mono">{it.tracking_number}</span></div>}
                    {it.courier_name && <div className="text-xs mt-1">Courier: <span className="font-mono">{it.courier_name}</span></div>}
                    {it.waybill_number && <div className="text-xs mt-1">Waybill: <span className="font-mono">{it.waybill_number}</span></div>}
                    {it.tracking_url && <a href={it.tracking_url} target="_blank" rel="noreferrer" className="text-xs mt-1 inline-block text-[#FF3B30] uppercase tracking-widest font-bold">Open courier tracking</a>}
                  </div>
                </div>

                {!isCreatorView && it.artwork_file_url && (
                  <a href={assetUrl(it.artwork_file_url)} target="_blank" rel="noreferrer" className="btn-secondary mt-3 text-xs inline-flex" data-testid={`${testidPrefix}-art-${it.id}`}>
                    <Download size={12} /> Download Artwork
                  </a>
                )}
                {it.customization?.preview_image && (
                  <div className="mt-3">
                    <div className="overline mb-1">Buyer customization</div>
                    <img src={it.customization.preview_image} alt="" className="w-40 border border-white/15" />
                    <div className="text-xs text-zinc-400 mt-1">{it.customization.text_entries?.length || 0} text · {it.customization.uploaded_files?.length || 0} image layer(s)</div>
                  </div>
                )}

                {showProductionPack && (
                  <ProductionPackSummary item={it} testidPrefix={`${testidPrefix}-pack-${it.id}`} showInternalMoney={showInternalProductionPack} />
                )}

                {canEditStatus && (
                  <>
                    <div className="flex flex-wrap gap-2 mt-4">
                      {ITEM_STATUS.map((s) => (
                        <button key={s} onClick={() => setItemPatch(it.id, { item_production_status: s })}
                          className={`text-xs uppercase tracking-widest font-bold px-3 py-2 border ${it.production_status === s ? 'bg-[#FF3B30] border-[#FF3B30] text-white' : 'border-white/20 hover:bg-white hover:text-black'}`}
                          data-testid={`${testidPrefix}-istatus-${s}-${it.id}`}>{s}</button>
                      ))}
                    </div>
                    <div className="mt-3 grid md:grid-cols-2 gap-3">
                      <div>
                        <label className="label">Courier</label>
                        <input className="input-base" placeholder="e.g. Bob Go / Courier Guy" defaultValue={it.courier_name || order.courier_name || ""}
                          onBlur={(e) => { if (e.target.value && e.target.value !== it.courier_name) setItemPatch(it.id, { courier_name: e.target.value }); }} />
                      </div>
                      <div>
                        <label className="label">Tracking number</label>
                        <input className="input-base" placeholder="e.g. SZ123456…" defaultValue={it.tracking_number || ""}
                          onBlur={(e) => { if (e.target.value && e.target.value !== it.tracking_number) setItemPatch(it.id, { tracking_number: e.target.value }); }}
                          data-testid={`${testidPrefix}-track-${it.id}`} />
                      </div>
                      <div>
                        <label className="label">Waybill number</label>
                        <input className="input-base" placeholder="Optional waybill" defaultValue={it.waybill_number || ""}
                          onBlur={(e) => { if (e.target.value && e.target.value !== it.waybill_number) setItemPatch(it.id, { waybill_number: e.target.value }); }} />
                      </div>
                      <div>
                        <label className="label">Tracking URL</label>
                        <input className="input-base" placeholder="Optional direct courier URL" defaultValue={it.tracking_url || ""}
                          onBlur={(e) => { if (e.target.value && e.target.value !== it.tracking_url) setItemPatch(it.id, { tracking_url: e.target.value }); }} />
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {isCreatorView && (
            <div className="card">
              <div className="overline mb-3">Order totals</div>
              <div className="text-sm space-y-2 max-w-md">
                <div className="flex justify-between gap-3">
                  <span className="text-zinc-400">Subtotal</span>
                  <span className="font-mono text-right">{formatMoney(order.subtotal)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-zinc-400">Shipping</span>
                  <span className="font-mono text-right">{Number(order.shipping_total || 0) === 0 ? "Free" : formatMoney(order.shipping_total)}</span>
                </div>
                <div className="flex justify-between gap-3 border-t border-white/10 pt-2">
                  <span className="font-bold">Customer total</span>
                  <span className="font-display text-xl text-right">{formatMoney(order.total)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="card">
            <div className="overline mb-3">Buyer</div>
            <div className="text-sm space-y-1">
              <div className="font-bold">{order.shipping_address.full_name}</div>
              <div className="text-zinc-400">{order.shipping_address.email}</div>
              {order.shipping_address.phone && <div className="text-zinc-400">{order.shipping_address.phone}</div>}
            </div>
          </div>
          <div className="card">
            <div className="overline mb-3">Shipping</div>
            <div className="text-sm space-y-1">
              <div>{order.shipping_address.line1}</div>
              {order.shipping_address.line2 && <div>{order.shipping_address.line2}</div>}
              <div>{order.shipping_address.city}, {order.shipping_address.state} {order.shipping_address.postal_code}</div>
              <div>{order.shipping_address.country}</div>
              {order.shipping_method_name && <div className="text-zinc-400 pt-2">Method: {order.shipping_method_name}</div>}
              {order.courier_name && <div className="text-zinc-400">Courier: {order.courier_name}</div>}
              {order.tracking_number && <div className="text-zinc-400">Tracking: <span className="font-mono text-white">{order.tracking_number}</span></div>}
              {order.tracking_url && <a href={order.tracking_url} target="_blank" rel="noreferrer" className="text-[#FF3B30] uppercase tracking-widest text-xs font-bold">Open courier tracking</a>}
            </div>
          </div>
          {!isCreatorView && (
            <div className="card">
              <div className="overline mb-3">Totals</div>
              <div className="text-sm flex justify-between"><span className="text-zinc-400">Subtotal</span><span>{formatMoney(order.subtotal)}</span></div>
              <div className="text-sm flex justify-between"><span className="text-zinc-400">Shipping</span><span>{Number(order.shipping_total || 0) === 0 ? "Free" : formatMoney(order.shipping_total)}</span></div>
              <div className="text-sm flex justify-between border-t border-white/10 pt-2 mt-2"><span className="font-bold">Total</span><span className="font-display text-xl" data-testid={`${testidPrefix}-total`}>{formatMoney(order.total)}</span></div>
            </div>
          )}

          {isCreatorView && (
            <div className="card">
              <div className="overline mb-3">Assigned printer</div>
              <div className="font-display text-2xl uppercase">{printerName}</div>
              <p className="text-xs text-zinc-500 mt-2">This is the production partner assigned to fulfil the order. FandomForge support still manages order issues and escalations.</p>
            </div>
          )}

          {isCreatorView && (
            <div className="card border-[#34C759]/30 bg-[#34C759]/5">
              <div className="overline mb-3 text-[#34C759]">Creator payout summary</div>
              <div className="text-sm space-y-2">
                <div className="flex justify-between gap-3"><span className="text-zinc-400">Selling prices</span><span className="font-mono text-right">{formatMoney(creatorTotals.sellingTotal)}</span></div>
                <div className="flex justify-between gap-3"><span className="text-zinc-400">Production cost</span><span className="font-mono text-right">{formatMoney(creatorTotals.productionTotal)}</span></div>
                <div className="flex justify-between gap-3"><span className="text-zinc-400">Platform fee</span><span className="font-mono text-right">{formatMoney(creatorTotals.platformFeeTotal)}</span></div>
                <div className="flex justify-between gap-3"><span className="text-zinc-400">Total markup on order</span><span className="font-mono text-right text-[#34C759]">{formatMoney(creatorTotals.creatorMarkupTotal)}</span></div>
                <div className="flex justify-between gap-3 border-t border-white/10 pt-2"><span className="font-bold">Total payout for order</span><span className="font-mono text-right font-bold text-[#34C759]">{formatMoney(creatorTotals.creatorPayoutTotal)}</span></div>
              </div>
            </div>
          )}

          {isCreatorView && (
            <div className="card">
              <div className="overline mb-3">Need help?</div>
              <p className="text-xs text-zinc-500 mb-3">Submit a help request to FandomForge support for this order.</p>

              {!helpOpen ? (
                <button type="button" className="btn-secondary w-full" onClick={() => setHelpOpen(true)}>
                  Submit help request
                </button>
              ) : (
                <form onSubmit={submitCreatorHelp} className="space-y-3">
                  <textarea
                    className="input-base"
                    rows={4}
                    value={helpMessage}
                    onChange={(event) => setHelpMessage(event.target.value)}
                    placeholder="Tell us what you need help with on this order."
                  />
                  <div className="flex gap-2">
                    <button type="submit" className="btn-primary flex-1" disabled={submittingHelp}>
                      {submittingHelp ? "Sending…" : "Send request"}
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => { setHelpOpen(false); setHelpMessage(""); }}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          <div className="card" data-testid={`${testidPrefix}-payment-details`}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div className="overline mb-1">Payment</div>
                <div className="font-display text-2xl uppercase">{order.payment_details?.provider || order.payment_provider || "—"}</div>
              </div>
              <StatusBadge status={order.payment_status} />
            </div>
            <div className="text-sm space-y-2">
              <div className="flex justify-between gap-3"><span className="text-zinc-400">Payment status</span><span className="font-mono text-right">{order.payment_details?.status || order.payment_status || "—"}</span></div>
              <div className="flex justify-between gap-3"><span className="text-zinc-400">Amount</span><span className="font-mono text-right">{formatMoney(order.payment_details?.amount || order.total, order.payment_details?.currency || "ZAR")}</span></div>
              {isAdminView && (
                <>
                  <div className="flex justify-between gap-3"><span className="text-zinc-400">Gateway reference</span><span className="font-mono text-right" title={order.payment_details?.reference || order.payment_reference || ""}>{shortValue(order.payment_details?.reference || order.payment_reference)}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-zinc-400">Provider payment ID</span><span className="font-mono text-right" title={order.payment_details?.provider_payment_id || order.provider_payment_id || ""}>{shortValue(order.payment_details?.provider_payment_id || order.provider_payment_id)}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-zinc-400">Internal payment ID</span><span className="font-mono text-right" title={order.payment_details?.id || order.payment_id || ""}>{shortValue(order.payment_details?.id || order.payment_id)}</span></div>
                </>
              )}
              {order.payment_details?.completed_at && <div className="flex justify-between gap-3"><span className="text-zinc-400">Completed</span><span className="font-mono text-right">{new Date(order.payment_details.completed_at).toLocaleString()}</span></div>}
              {!order.payment_details && isAdminView && <div className="text-xs text-zinc-500 pt-2">No payment record has been attached to this order yet.</div>}
            </div>
          </div>

          {trackingUrl && (
            <div className="card border-[#34C759]/30 bg-[#34C759]/5">
              <div className="overline mb-3 text-[#34C759]">Customer tracking link</div>
              <p className="text-xs text-zinc-400 mb-3 break-all">{trackingUrl}</p>
              <button
                type="button"
                onClick={() => copyMessage(trackingUrl)}
                className="btn-secondary w-full"
              >
                <Copy size={14} /> Copy tracking link
              </button>
            </div>
          )}

          <div className="card">
            <div className="overline mb-3">Customer messages</div>
            <div className="space-y-2">
              {customerMessages.map((msg) => (
                <button
                  key={msg.label}
                  type="button"
                  onClick={() => copyMessage(msg.body)}
                  className="w-full text-left border border-white/15 p-3 hover:border-[#FF3B30] hover:bg-[#FF3B30]/5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs uppercase tracking-widest font-bold text-white">{msg.label}</span>
                    <Copy size={13} className="text-[#FF3B30]" />
                  </div>
                  <p className="text-xs text-zinc-500 mt-2 line-clamp-2">{msg.body}</p>
                </button>
              ))}
            </div>
          </div>

          <ActivityTimeline
            orderId={id}
            title="Order Timeline"
            canAddNote={canEditStatus}
            defaultAudience={isPrinterView ? ["admin", "printer"] : isAdminView ? ["admin", "creator", "printer"] : ["admin"]}
          />

          {canEditStatus && (
            <div className="card">
              <div className="overline mb-3">Order status</div>
              <div className="grid grid-cols-1 gap-2">
                {ALL_ORDER_STATUS.map((s) => (
                  <button key={s} onClick={() => setOrderStatus(s)}
                    className={`text-xs uppercase tracking-widest font-bold px-3 py-2 border text-left ${order.status === s ? 'bg-[#FF3B30] border-[#FF3B30] text-white' : 'border-white/20 hover:bg-white hover:text-black'}`}
                    data-testid={`${testidPrefix}-set-${s}`}>{s.replace(/_/g, " ")}</button>
                ))}
              </div>
            </div>
          )}

          {canReassign && (
            <div className="card">
              <div className="overline mb-3">Reassign printer (all items)</div>
              <select className="input-base" defaultValue="" onChange={(e) => e.target.value && reassignPrinter(e.target.value)} data-testid={`${testidPrefix}-reassign`}>
                <option value="">— pick printer —</option>
                {printers.map((p) => <option key={p.id} value={p.id}>{p.company_name} {p.location && `· ${p.location}`}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
