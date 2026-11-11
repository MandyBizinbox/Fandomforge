import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CreditCard, LockKeyhole, Package, RefreshCw } from "lucide-react";
import Navbar from "../components/Navbar";
import { http } from "../lib/api";
import { toast } from "sonner";

function zar(amount) {
  return `R ${Number(amount || 0).toFixed(2)}`;
}

/**
 * Server-backed order recovery. Deliberately does NOT overwrite the visitor's
 * localStorage cart or create a duplicate checkout/order.
 */
export default function OrderPaymentRecovery() {
  const { token } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    http.get(`/order-payment-recovery/${encodeURIComponent(token)}`)
      .then(({ data }) => {
        if (mounted) {
          setOrder(data);
          setError("");
        }
      })
      .catch((err) => {
        if (mounted) setError(err.response?.data?.detail || "This secure payment link is unavailable.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [token]);

  const resumePayment = async () => {
    if (!order?.can_continue_payment || paying) return;
    setPaying(true);
    try {
      const { data } = await http.post(
        `/order-payment-recovery/${encodeURIComponent(token)}/continue`
      );
      if (data.payment_action !== "redirect" || !data.payment_url ||
          !/^https:\/\//i.test(data.payment_url)) {
        throw new Error("The payment provider did not return a secure checkout link.");
      }
      window.location.assign(data.payment_url);
    } catch (err) {
      const reason = err.response?.data?.detail || err.message || "Could not open checkout.";
      toast.error(reason);
      setError(reason);
      setPaying(false);
    }
  };

  return (
    <div className="min-h-screen page-shell">
      <Navbar />
      <main className="pt-24 pb-16 max-w-5xl mx-auto px-4 sm:px-6">
        <Link to="/" className="inline-flex items-center gap-2 text-sm mb-8 text-[var(--ff-muted-text)]">
          <ArrowLeft size={16} /> Back to FandomForge
        </Link>

        {loading ? (
          <div className="card text-center py-12" role="status">
            <RefreshCw className="mx-auto mb-4 animate-spin" />
            Retrieving your saved order…
          </div>
        ) : !order ? (
          <div className="card text-center py-12" role="alert">
            <h1 className="font-display text-4xl uppercase mb-4">Link unavailable</h1>
            <p>{error || "The order could not be found. Please contact support."}</p>
          </div>
        ) : (
          <>
            <div className="overline mb-2 text-[var(--ff-primary)]">Your saved order</div>
            <h1 className="font-display text-4xl sm:text-6xl uppercase mb-3">Ready when you are</h1>
            <p className="text-[var(--ff-muted-text)] mb-8">
              We saved your FandomForge order <strong>{order.order_number}</strong>.
              Review it below and continue to secure payment without creating another order.
            </p>
            <div className="grid lg:grid-cols-[1fr_320px] gap-6">
              <section className="card" aria-label="Saved order products">
                <div className="flex items-center gap-2 mb-6">
                  <Package size={18} className="text-[var(--ff-primary)]" />
                  <h2 className="font-display text-2xl uppercase">Your Products</h2>
                </div>
                <div className="divide-y divide-[var(--ff-card-border)]">
                  {(order.items || []).map((item) => (
                    <div key={item.id} className="flex justify-between gap-4 py-4">
                      <div>
                        <div className="font-bold">{item.product_title}</div>
                        <div className="text-sm text-[var(--ff-muted-text)]">
                          {[item.size, item.color].filter(Boolean).join(" / ") || "Standard"} · Qty {item.quantity}
                        </div>
                      </div>
                      <div className="font-semibold whitespace-nowrap">
                        {zar(item.unit_price * item.quantity)}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <aside className="card h-fit" aria-label="Payment summary">
                <div className="overline mb-3">Payment Summary</div>
                <div className="flex justify-between text-sm mb-3">
                  <span>Subtotal</span><span>{zar(order.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm mb-3">
                  <span>{order.shipping_method_name || "Shipping"}</span>
                  <span>{zar(order.shipping_total)}</span>
                </div>
                <div className="border-t border-[var(--ff-card-border)] pt-4 flex justify-between items-center mb-5">
                  <strong>Total</strong>
                  <span className="font-display text-3xl">{zar(order.total)}</span>
                </div>
                {order.payment_status === "paid" ? (
                  <p className="text-sm" role="status">
                    Payment has already been received. No further payment is required.
                  </p>
                ) : !order.can_continue_payment ? (
                  <p className="text-sm" role="alert">
                    This order is no longer available for automatic payment.
                    Please contact FandomForge support before placing a new order.
                  </p>
                ) : order.payment_provider !== "payfast" ? (
                  <p className="text-sm" role="status">
                    Please contact support to resume this payment method.
                  </p>
                ) : (
                  <button
                    type="button"
                    className="btn-primary w-full justify-center"
                    onClick={resumePayment}
                    disabled={paying}
                  >
                    <CreditCard size={17} />
                    {paying ? "Checking Payment…" : "Continue Secure Payment"}
                  </button>
                )}
                <div className="flex items-center gap-2 mt-4 text-xs text-[var(--ff-muted-text)]">
                  <LockKeyhole size={14} />
                  We check your previous payment before reopening checkout.
                </div>
                {error && <p className="mt-4 text-sm text-red-500" role="alert">{error}</p>}
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
