import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import StatusBadge from "../components/StatusBadge";
import CustomerOrderTimeline from "../components/order/CustomerOrderTimeline";
import { http, assetUrl } from "../lib/api";
import { ArrowLeft, Copy, ExternalLink, Package, Truck } from "lucide-react";
import { toast } from "sonner";

function money(value) {
  return Number(value || 0).toFixed(2);
}

function customerAddressLabel(address = {}) {
  return [address.city, address.province, address.country].filter(Boolean).join(", ");
}

export default function OrderTracking() {
  const { token } = useParams();
  const [tracking, setTracking] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");

    http
      .get(`/orders/tracking/${token}`)
      .then((response) => {
        if (mounted) {
          setTracking(response.data);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err.response?.data?.detail || "Could not load this tracking link.");
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [token]);

  const items = useMemo(() => (Array.isArray(tracking?.items) ? tracking.items : []), [tracking]);
  const trackingNumbers = useMemo(() => (Array.isArray(tracking?.tracking_numbers) ? tracking.tracking_numbers : []), [tracking]);

  const copyTrackingLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Tracking link copied");
    } catch {
      toast.error("Could not copy link");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen page-shell">
        <Navbar />
        <main className="pt-32 pb-16 max-w-5xl mx-auto px-6 md:px-10">
          <div className="overline text-center">Loading tracking…</div>
        </main>
      </div>
    );
  }

  if (error || !tracking) {
    return (
      <div className="min-h-screen page-shell">
        <Navbar />
        <main className="pt-32 pb-16 max-w-3xl mx-auto px-6 md:px-10 text-center">
          <div className="card">
            <p className="overline mb-2 text-[var(--ff-primary)]">Tracking unavailable</p>
            <h1 className="font-display text-4xl uppercase mb-4">Order not found</h1>
            <p className="text-[var(--ff-muted-text)] mb-6">{error || "This tracking link is invalid or expired."}</p>
            <Link to="/" className="btn-secondary">
              <ArrowLeft size={16} /> Return home
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen page-shell">
      <Navbar />
      <main className="pt-24 pb-16 max-w-6xl mx-auto px-6 md:px-10">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5 mb-8">
          <div>
            <p className="overline mb-2 text-[var(--ff-primary)]">Order Tracking</p>
            <h1 className="font-display text-5xl md:text-6xl uppercase leading-none">
              {tracking.order_number}
            </h1>
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <StatusBadge status={tracking.status} />
              <StatusBadge status={tracking.payment_status} />
              <span className="text-sm text-[var(--ff-muted-text)]">{tracking.status_label}</span>
            </div>
          </div>
          <button type="button" onClick={copyTrackingLink} className="btn-secondary w-fit">
            <Copy size={15} /> Copy tracking link
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
          <div className="space-y-6">
            <CustomerOrderTimeline timeline={tracking.timeline} statusLabel={tracking.status_label} />

            <div className="card">
              <div className="flex items-center justify-between gap-4 mb-5">
                <div>
                  <div className="overline mb-1">Items</div>
                  <p className="text-sm text-[var(--ff-muted-text)]">Customer-facing item status and mockups.</p>
                </div>
                <Package className="text-[var(--ff-primary)]" />
              </div>

              <div className="divide-y divide-white/10">
                {items.map((item) => (
                  <div key={item.id} className="py-5 flex gap-4">
                    <div className="w-24 h-24 bg-[var(--ff-surface-bg)] border border-[var(--ff-card-border)] flex-shrink-0 flex items-center justify-center overflow-hidden">
                      {item.mockup_url ? (
                        <img src={assetUrl(item.mockup_url)} alt={item.product_title} className="w-full h-full object-contain" />
                      ) : (
                        <Package size={26} className="text-zinc-700" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-display text-xl uppercase leading-tight">{item.product_title}</div>
                      <div className="text-xs text-[var(--ff-muted-text)] uppercase tracking-widest mt-1">
                        {item.variation_label} × {item.quantity}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <StatusBadge status={item.production_status} />
                        <span className="text-sm text-[var(--ff-muted-text)]">{item.production_status_label}</span>
                      </div>
                      {(item.tracking_number || item.waybill_number) && (
                        <div className="text-xs mt-3 text-[var(--ff-muted-text)] space-y-1">
                          {item.courier_name && <div>Courier: <span className="text-[var(--ff-card-text)]">{item.courier_name}</span></div>}
                          {item.tracking_number && <div>Tracking: <span className="font-mono text-[var(--ff-card-text)]">{item.tracking_number}</span></div>}
                          {item.waybill_number && <div>Waybill: <span className="font-mono text-[var(--ff-card-text)]">{item.waybill_number}</span></div>}
                          {item.tracking_url && <a href={item.tracking_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[var(--ff-primary)] uppercase tracking-widest font-bold">Open courier tracking <ExternalLink size={12} /></a>}
                        </div>
                      )}
                    </div>
                    <div className="font-bold whitespace-nowrap self-start sm:self-center">R {money(item.line_total)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <aside className="space-y-6">
            <div className="card">
              <div className="overline mb-3">Summary</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--ff-muted-text)]">Subtotal</span>
                  <span>R {money(tracking.subtotal)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--ff-muted-text)]">Shipping{tracking.shipping_method_name ? ` · ${tracking.shipping_method_name}` : ""}</span>
                  <span>{Number(tracking.shipping_total || 0) === 0 ? "Free" : `R ${money(tracking.shipping_total)}`}</span>
                </div>
                {tracking.shipping_method_key === "group_delivery" && (
                  <div className="border border-[var(--ff-card-border)] bg-[var(--ff-surface-bg)] p-3 text-xs text-[var(--ff-muted-text)] space-y-1">
                    {tracking.group_delivery_batch_date && <div>Next batch date: <span className="font-bold text-[var(--ff-card-text)]">{new Date(tracking.group_delivery_batch_date).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</span></div>}
                    {tracking.group_delivery_point_name && <div>Collection point: <span className="font-bold text-[var(--ff-card-text)]">{tracking.group_delivery_point_name}</span></div>}
                    {[tracking.group_delivery_address_line_1, tracking.group_delivery_suburb, tracking.group_delivery_town, tracking.group_delivery_province, tracking.group_delivery_postal_code].filter(Boolean).length > 0 && (
                      <div>Address: {[tracking.group_delivery_address_line_1, tracking.group_delivery_suburb, tracking.group_delivery_town, tracking.group_delivery_province, tracking.group_delivery_postal_code].filter(Boolean).join(", ")}</div>
                    )}
                    {tracking.group_delivery_customer_instructions && <div>{tracking.group_delivery_customer_instructions}</div>}
                  </div>
                )}
                <div className="flex justify-between gap-4 border-t border-[var(--ff-card-border)] pt-2 mt-2">
                  <span className="text-[var(--ff-muted-text)]">Order total</span>
                  <span className="font-bold">R {money(tracking.total)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--ff-muted-text)]">Payment</span>
                  <span>{tracking.payment_status}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--ff-muted-text)]">Created</span>
                  <span>{tracking.created_at ? new Date(tracking.created_at).toLocaleDateString() : "—"}</span>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="overline mb-3">Delivery area</div>
              <div className="text-sm text-[var(--ff-muted-text)]">
                <div className="font-bold text-[var(--ff-card-text)]">{tracking.shipping_address?.full_name || "Customer"}</div>
                <div className="text-[var(--ff-muted-text)] mt-1">{customerAddressLabel(tracking.shipping_address)}</div>
              </div>
            </div>

            <div className="card">
              <div className="overline mb-3">Courier / tracking</div>
              {(tracking.tracking_number || tracking.waybill_number || tracking.courier_name || trackingNumbers.length > 0) ? (
                <div className="space-y-2 text-sm">
                  {tracking.courier_name && <div className="flex justify-between gap-4"><span className="text-[var(--ff-muted-text)]">Courier</span><span>{tracking.courier_name}</span></div>}
                  {tracking.tracking_number && <div className="flex justify-between gap-4"><span className="text-[var(--ff-muted-text)]">Tracking</span><span className="font-mono">{tracking.tracking_number}</span></div>}
                  {tracking.waybill_number && <div className="flex justify-between gap-4"><span className="text-[var(--ff-muted-text)]">Waybill</span><span className="font-mono">{tracking.waybill_number}</span></div>}
                  {tracking.tracking_url && <a href={tracking.tracking_url} target="_blank" rel="noreferrer" className="btn-secondary w-full mt-3"><Truck size={15} /> Open courier tracking</a>}
                  {trackingNumbers.filter((n) => n !== tracking.tracking_number).map((number) => (
                    <div key={number} className="border border-[var(--ff-card-border)] p-3 flex items-center justify-between gap-3">
                      <span className="font-mono text-sm">{number}</span>
                      <Truck size={15} className="text-[var(--ff-primary)]" />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--ff-muted-text)]">Tracking will appear here once dispatch has started.</p>
              )}
            </div>

            <div className="card">
              <div className="overline mb-3">Need help?</div>
              <p className="text-sm text-[var(--ff-muted-text)] mb-4">
                Use this order number when asking for support.
              </p>
              <div className="font-mono text-sm border border-[var(--ff-card-border)] p-3 bg-[var(--ff-surface-bg)]/40">{tracking.order_number}</div>
              <Link to="/contact" className="btn-secondary w-full mt-4">
                <ExternalLink size={15} /> Contact support
              </Link>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
