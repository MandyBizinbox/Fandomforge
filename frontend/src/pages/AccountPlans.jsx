import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, LockKeyhole } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import Navbar from "../components/Navbar";
import { http } from "../lib/api";

function money(value) {
  return `R ${Number(value || 0).toFixed(2)}`;
}

export default function AccountPlans() {
  const [plans, setPlans] = useState([]);
  const [entitlements, setEntitlements] = useState({});
  const [loading, setLoading] = useState(true);
  const [changing, setChanging] = useState("");

  useEffect(() => {
    let mounted = true;
    Promise.all([
      http.get("/subscriptions/plans/available"),
      http.get("/entitlements/me"),
    ]).then(([planResponse, entitlementResponse]) => {
      if (!mounted) return;
      setPlans(Array.isArray(planResponse.data) ? planResponse.data : []);
      setEntitlements(entitlementResponse.data || {});
    }).catch((error) => {
      toast.error(error?.response?.data?.detail || "Could not load account plans.");
    }).finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  const currentPlan = useMemo(() => {
    const row = Object.values(entitlements).find((value) => value?.current_plan);
    return row?.current_plan || "Current plan";
  }, [entitlements]);

  const changePlan = async (plan) => {
    setChanging(plan.id);
    try {
      const response = await http.post("/subscriptions/me/change-plan", {
        plan_id: plan.id,
        activation_mode: Number(plan.monthly_price || 0) > 0 ? "paystack_test" : "free",
        reason: `Account selected ${plan.name}`,
      });
      if (response.data?.checkout_url) {
        window.location.href = response.data.checkout_url;
        return;
      }
      toast.success(`${plan.name} is now active.`);
      const refreshed = await http.get("/entitlements/me");
      setEntitlements(refreshed.data || {});
    } catch (error) {
      const detail = error?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : detail?.message || "Plan change could not be completed.");
    } finally {
      setChanging("");
    }
  };

  return (
    <div className="min-h-screen page-shell">
      <Navbar />
      <main className="max-w-6xl mx-auto px-6 md:px-10 pt-28 pb-16">
        <Link to="/account" className="inline-flex items-center gap-2 text-sm mb-6 text-[var(--ff-muted-text)] hover:text-[var(--ff-primary)]">
          <ArrowLeft size={16} /> Back to account
        </Link>
        <p className="overline mb-2">Subscription and entitlements</p>
        <h1 className="font-display text-5xl md:text-6xl uppercase leading-none">Choose the plan that fits</h1>
        <p className="mt-4 text-[var(--ff-muted-text)] max-w-3xl">
          Existing products and data remain intact when a plan changes. A downgrade blocks only new restricted actions.
        </p>
        <div className="card mt-6">
          <p className="text-sm text-[var(--ff-muted-text)]">Current plan</p>
          <p className="font-display text-3xl uppercase">{currentPlan}</p>
        </div>

        {loading ? (
          <div className="card mt-6">Loading available plans…</div>
        ) : plans.length ? (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5 mt-8">
            {plans.map((plan) => {
              const features = Array.isArray(plan.features) ? plan.features : [];
              const active = currentPlan === plan.name;
              return (
                <article key={plan.id} className="card flex flex-col min-h-[360px]">
                  <p className="overline">{plan.audience || "Account"}</p>
                  <h2 className="font-display text-4xl uppercase leading-none mt-2">{plan.name}</h2>
                  <p className="text-[var(--ff-muted-text)] text-sm mt-3 flex-1">{plan.description}</p>
                  <div className="my-5">
                    <span className="font-display text-4xl">{money(plan.monthly_price)}</span>
                    <span className="text-sm text-[var(--ff-muted-text)]"> / {plan.billing_cycle || "month"}</span>
                  </div>
                  <div className="space-y-2 mb-6">
                    {features.slice(0, 8).map((feature) => (
                      <div key={feature} className="flex gap-2 text-sm"><CheckCircle2 size={16} className="text-[var(--ff-primary)] mt-0.5" /> {feature}</div>
                    ))}
                    {!features.length && <div className="flex gap-2 text-sm text-[var(--ff-muted-text)]"><LockKeyhole size={16} /> Entitlements are defined by this approved plan.</div>}
                  </div>
                  <button
                    type="button"
                    className={active ? "btn-secondary justify-center" : "btn-primary justify-center"}
                    disabled={active || changing === plan.id}
                    onClick={() => changePlan(plan)}
                  >
                    {active ? "Current plan" : changing === plan.id ? "Preparing…" : Number(plan.monthly_price || 0) > 0 ? "Upgrade in Paystack test" : "Select free plan"}
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="card mt-8">
            <h2 className="font-display text-3xl uppercase">No approved plans available</h2>
            <p className="text-[var(--ff-muted-text)] mt-2">New plan pricing must be approved and activated by the Platform Owner before it appears here.</p>
          </div>
        )}
      </main>
    </div>
  );
}
