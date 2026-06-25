import React, { useEffect, useState } from "react";
import { http } from "../../lib/api";
import { toast } from "sonner";

export default function PaymentMethodSelector({ value, onChange }) {
  const [methods, setMethods] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    http.get("/orders/payment-gateways/checkout")
      .then((response) => {
        if (!mounted) return;
        const rows = response.data || [];
        setMethods(rows);
        if (!value && rows[0]) onChange(rows[0].key, rows[0]);
      })
      .catch((error) => {
        toast.error(error.response?.data?.detail || "Could not load payment methods");
        setMethods([]);
      })
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!value && methods[0]) onChange(methods[0].key, methods[0]);
  }, [methods, value, onChange]);

  if (loading) return <div className="card text-[var(--ff-muted-text)]">Loading payment methods…</div>;

  if (methods.length === 0) {
    return (
      <div className="card border-[var(--ff-primary)]">
        <p className="overline mb-2">Payment methods</p>
        <p className="text-[var(--ff-muted-text)] text-sm">No checkout payment methods are enabled. Please contact the platform administrator.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
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
              className={`text-left border p-4 transition ${selected ? "border-[var(--ff-primary)] bg-[var(--ff-surface-bg)]" : "border-[var(--ff-card-border)] bg-[var(--ff-surface-bg)] hover:border-[var(--ff-primary)]"}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-bold uppercase tracking-wide">{method.display_name}</div>
                  <div className="text-sm text-[var(--ff-muted-text)] mt-1">{method.description}</div>
                  {["paystack", "payfast", "peach", "yoco"].includes(method.key) && (
                    <div className="text-xs text-[var(--ff-muted-text)] mt-2">
                      Secure hosted payment. You will be redirected to complete payment.
                    </div>
                  )}
                  {method.key === "manual_eft" && (
                    <div className="text-xs text-[var(--ff-muted-text)] mt-2">
                      Your order will remain pending until payment is manually confirmed.
                    </div>
                  )}
                </div>
                <div className={`w-5 h-5 border rounded-full flex-shrink-0 ${selected ? "border-[var(--ff-primary)] bg-[var(--ff-primary)]" : "border-[var(--ff-card-border)]"}`} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
