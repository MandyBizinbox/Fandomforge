import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import { http, assetUrl } from "../lib/api";
import StatusBadge from "../components/StatusBadge";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

function safeMoney(value) {
  return Number(value || 0).toFixed(2);
}

function getVariationLabel(item) {
  const design = item?.customization?.design_json || {};

  if (design.variation_label) {
    return design.variation_label;
  }

  const snapshotVariation = item?.production_snapshot?.variation || {};
  if (snapshotVariation.label) {
    return snapshotVariation.label;
  }

  const attrs = snapshotVariation.attributes || design.attribute_values || item?.attribute_values || {};
  const attrLabel = Object.entries(attrs)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")
    .map(([key, value]) => `${key}: ${value}`)
    .join(" / ");

  if (attrLabel) {
    return attrLabel;
  }

  const size = item?.size || "";
  const color = item?.color || "";
  const fallback = [size, color].filter(Boolean).join(" / ");

  return fallback || "Selected variation";
}

function getArtworkGroupLabel(item) {
  const design = item?.customization?.design_json || {};
  return design.artwork_group_label || item?.artwork_group_label || "";
}

function getOrderItemImage(item) {
  const design = item?.customization?.design_json || {};
  const snapshot = item?.production_snapshot || {};

  return (
    item?.customization?.preview_image ||
    item?.mockup_url ||
    item?.mockup_image_url ||
    item?.primary_mockup_image_url ||
    snapshot?.mockup_image_url ||
    snapshot?.primary_mockup_image_url ||
    snapshot?.artwork?.mockup_image_url ||
    (Array.isArray(design.mockup_images) && design.mockup_images.length > 0 ? design.mockup_images[0] : "") ||
    (Array.isArray(item?.mockup_images) && item.mockup_images.length > 0 ? item.mockup_images[0] : "") ||
    item?.artwork_file_url ||
    snapshot?.artwork?.url ||
    ""
  );
}

export default function OrderConfirmation() {
  const { id } = useParams();
  const location = useLocation();
  const [order, setOrder] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    const params = new URLSearchParams(location.search);
    const reference = params.get("reference") || params.get("trxref");

    async function loadOrder() {
      try {
        if (reference) {
          setVerifying(true);
          try {
            await http.get(`/payments/verify/${reference}`);
          } catch (verifyError) {
            console.warn("Payment verification failed", verifyError.response?.data || verifyError.message);
          } finally {
            setVerifying(false);
          }
        }

        const response = await http.get(`/orders/${id}`);
        if (mounted) {
          setOrder(response.data);
          setError("");
        }
      } catch (err) {
        if (mounted) {
          setError(err.response?.data?.detail || "Could not load this order.");
        }
      }
    }

    loadOrder();

    return () => {
      mounted = false;
    };
  }, [id, location.search]);

  const items = useMemo(() => (Array.isArray(order?.items) ? order.items : []), [order]);
  const trackingUrl = order?.tracking_token ? `${window.location.origin}/order-tracking/${order.tracking_token}` : "";

  const copyTrackingUrl = async () => {
    try {
      await navigator.clipboard.writeText(trackingUrl);
      toast.success("Tracking link copied");
    } catch {
      toast.error("Could not copy tracking link");
    }
  };

  if (error) {
    return (
      <div className="min-h-screen page-shell">
        <Navbar />
        <div className="pt-32 pb-16 max-w-3xl mx-auto px-6 md:px-10 text-center">
          <div className="card">
            <p className="overline mb-2 text-[var(--ff-primary)]">Order error</p>
            <h1 className="font-display text-4xl uppercase mb-4">Could not load order</h1>
            <p className="text-[var(--ff-muted-text)] mb-6">{error}</p>
            <Link to="/shop" className="btn-secondary">Keep shopping</Link>
          </div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen page-shell">
        <Navbar />
        <div className="pt-32 overline text-center">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen page-shell">
      <Navbar />
      <div className="pt-24 pb-16">
        <div className="max-w-4xl mx-auto px-6 md:px-10 text-center">
          <div className="overline mb-4 text-[#34C759]">{order.payment_status === "paid" ? "Order confirmed" : "Order received"}</div>
          <h1 className="font-display text-6xl uppercase mb-2" data-testid="oc-order-number">
            {order.order_number}
          </h1>
          <div className="mb-6">
            <StatusBadge status={order.status} testId="oc-status" />
          </div>
          <p className="text-[var(--ff-muted-text)] mb-8">
            {verifying
              ? "Verifying your payment…"
              : order.payment_status === "paid"
              ? "Thanks for your order. You can track production and dispatch from your tracking page."
              : "Your order has been created and is waiting for payment confirmation."}
          </p>

          <div className="flex justify-center gap-3 mb-8">
            <StatusBadge status={order.payment_status === "paid" ? "paid" : order.payment_status || "pending"} />
            <StatusBadge status={order.payment_provider || "payment"} />
          </div>

          {trackingUrl && (
            <div className="card text-left mb-6 border-[#34C759]/40 bg-[#34C759]/5">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <div className="overline mb-2 text-[#34C759]">Tracking link</div>
                  <p className="text-sm text-[var(--ff-muted-text)] break-all">{trackingUrl}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={copyTrackingUrl} className="btn-secondary">
                    <Copy size={15} /> Copy
                  </button>
                  <Link to={`/order-tracking/${order.tracking_token}`} className="btn-primary">
                    Track order <ExternalLink size={15} />
                  </Link>
                </div>
              </div>
            </div>
          )}

          <div className="card text-left" data-testid="oc-items">
            <div className="overline mb-4">Items</div>
            <div className="divide-y divide-white/10">
              {items.map((item) => {
                const image = getOrderItemImage(item);
                const variationLabel = getVariationLabel(item);
                const artworkGroupLabel = getArtworkGroupLabel(item);
                const lineTotal = Number(item.unit_price || 0) * Number(item.quantity || 0);

                return (
                  <div key={item.id} className="py-4 flex items-center gap-4">
                    <div className="w-20 h-20 bg-[var(--ff-surface-bg)] border border-[var(--ff-card-border)] flex-shrink-0 overflow-hidden flex items-center justify-center">
                      {image ? (
                        <img
                          src={assetUrl(image)}
                          alt={item.product_title || "Order item"}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="font-display text-zinc-700 text-xl">MF</div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="font-display text-lg uppercase leading-tight">
                        {item.product_title}
                      </div>
                      <div className="text-xs text-[var(--ff-muted-text)] uppercase tracking-widest mt-1">
                        {variationLabel} × {item.quantity}
                      </div>
                      {artworkGroupLabel && (
                        <div className="text-xs text-[var(--ff-muted-text)] uppercase tracking-widest mt-1">
                          Artwork: {artworkGroupLabel}
                        </div>
                      )}
                    </div>

                    <div className="font-bold whitespace-nowrap self-start sm:self-center">R {safeMoney(lineTotal)}</div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-[var(--ff-card-border)] mt-4 pt-4 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-[var(--ff-muted-text)]">Subtotal</span><span>R {safeMoney(order.subtotal)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-[var(--ff-muted-text)]">Shipping{order.shipping_method_name ? ` · ${order.shipping_method_name}` : ""}</span><span>{Number(order.shipping_total || 0) === 0 ? "Free" : `R ${safeMoney(order.shipping_total)}`}</span></div>
              {order.shipping_method_key === "group_delivery" && (
                <div className="border border-[var(--ff-card-border)] bg-[var(--ff-surface-bg)] p-3 text-xs text-[var(--ff-muted-text)] space-y-1">
                  {order.group_delivery_batch_date && <div>Next batch date: <span className="font-bold text-[var(--ff-card-text)]">{new Date(order.group_delivery_batch_date).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</span></div>}
                  {order.group_delivery_point_name && <div>Collection point: <span className="font-bold text-[var(--ff-card-text)]">{order.group_delivery_point_name}</span></div>}
                  {[order.group_delivery_address_line_1, order.group_delivery_suburb, order.group_delivery_town, order.group_delivery_province, order.group_delivery_postal_code].filter(Boolean).length > 0 && (
                    <div>Address: {[order.group_delivery_address_line_1, order.group_delivery_suburb, order.group_delivery_town, order.group_delivery_province, order.group_delivery_postal_code].filter(Boolean).join(", ")}</div>
                  )}
                  {order.group_delivery_customer_instructions && <div>{order.group_delivery_customer_instructions}</div>}
                </div>
              )}
              <div className="flex justify-between items-baseline border-t border-[var(--ff-card-border)] pt-3">
                <div className="overline">Total paid</div>
                <div className="font-display text-2xl" data-testid="oc-total">
                  R {safeMoney(order.total)}
                </div>
              </div>
            </div>
          </div>

          <Link to="/shop" className="btn-secondary mt-10" data-testid="oc-continue">
            Keep shopping
          </Link>
        </div>
      </div>
    </div>
  );
}
