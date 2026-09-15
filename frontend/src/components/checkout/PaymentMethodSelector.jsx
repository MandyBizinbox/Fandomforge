import React, { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { http } from "../../lib/api";
import { toast } from "sonner";

const HOSTED_PAYMENT_METHODS = ["paystack", "payfast", "peach", "yoco"];

export default function PaymentMethodSelector({ value, onChange }) {
  const [methods, setMethods] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    http.get("/orders/payment-gateways/checkout")
      .then((response) => {
        if (!mounted) return;
        const rows = (Array.isArray(response.data) ? response.data : []).filter((method) => method?.key && method.key !== "mock");
        setMethods(rows);
      })
      .catch((error) => {
        if (!mounted) return;
        toast.error(error.response?.data?.detail || "Could not load payment methods.");
        setMethods([]);
      })
      .finally(() => mounted && setLoading(false));

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!value && methods[0]) onChange(methods[0].key, methods[0]);
  }, [methods, value, onChange]);

  if (loading) return <div className="card text-[var(--ff-muted-text)]">Loading payment methods…</div>;

  if (methods.length === 0) {
    return (
      <div className="card border-[var(--ff-primary)]">
        <p className="overline mb-2">Payment methods</p>
        <h2 className="font-display text-3xl uppercase mb-3">Payment is temporarily unavailable</h2>
        <p className="text-[var(--ff-muted-text)] text-sm">
          No customer payment method is currently available. Please contact FandomForge support before attempting to place the order again.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div>
        <p className="overline mb-2">Payment method</p>
        <h2 className="font-display text-3xl uppercase">Choose how to pay</h2>
      </div>
      <div className="grid gap-3">
        {methods.map((method) => {
          const selected = value === method.key;
          return (
            <button
              key={method.key}
              type="button"
              onClick={() => onChange(method.key, method)}
              aria-pressed={selected}
              className={`text-left border p-4 transition ${selected ? "border-[var(--ff-primary)] bg-[var(--ff-surface-bg)]" : "border-[var(--ff-card-border)] bg-[var(--ff-surface-bg)] hover:border-[var(--ff-primary)]"}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-bold uppercase tracking-wide">{method.display_name}</div>
                  {method.description && <div className="text-sm text-[var(--ff-muted-text)] mt-1">{method.description}</div>}
                  {HOSTED_PAYMENT_METHODS.includes(method.key) && (
                    <div className="text-xs text-[var(--ff-muted-text)] mt-2 flex items-center gap-2">
                      <ShieldCheck size={14} className="text-[var(--ff-primary)]" />
                      Secure hosted payment. You will be redirected to complete payment.
                    </div>
                  )}
                  {method.key === "manual_eft" && (
                    <div className="text-xs text-[var(--ff-muted-text)] mt-2">
                      The order remains awaiting payment until the transfer is confirmed.
                    </div>
                  )}
                </div>
                <div className={`w-5 h-5 border rounded-full flex-shrink-0 ${selected ? "border-[var(--ff-primary)] bg-[var(--ff-primary)]" : "border-[var(--ff-card-border)]"}`} aria-hidden="true" />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
