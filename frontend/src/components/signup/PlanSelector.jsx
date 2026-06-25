import React from "react";

function money(value) {
  return Number(value || 0).toFixed(2);
}

export default function PlanSelector({ plans = [], value, onChange, emptyLabel = "No paid plans available yet." }) {
  if (!Array.isArray(plans) || plans.length === 0) {
    return (
      <div className="card bg-white/[0.02]">
        <p className="overline mb-2">Subscription</p>
        <p className="text-zinc-400 text-sm">{emptyLabel}</p>
        <p className="text-zinc-500 text-xs mt-2">Your account can still be created with manual billing/approval if the platform allows it.</p>
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {plans.map((plan) => {
        const active = value === plan.id;
        return (
          <button
            type="button"
            key={plan.id}
            onClick={() => onChange(plan.id)}
            className={`text-left border p-5 transition ${active ? "border-[#FF3B30] bg-[#FF3B30]/10" : "border-white/15 bg-white/[0.03] hover:border-white/40"}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-display text-2xl uppercase">{plan.name}</p>
                <p className="text-zinc-400 text-sm mt-1">{plan.description || "Subscription plan"}</p>
              </div>
              <div className="font-display text-2xl whitespace-nowrap">
                {Number(plan.monthly_price || 0) === 0 ? "Free" : `R ${money(plan.monthly_price)}`}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="px-2 py-1 border border-white/10 text-[10px] uppercase tracking-widest text-zinc-400">{plan.billing_cycle}</span>
              {plan.trial_days > 0 && <span className="px-2 py-1 border border-white/10 text-[10px] uppercase tracking-widest text-zinc-400">{plan.trial_days} day trial</span>}
              {plan.limits?.max_products && <span className="px-2 py-1 border border-white/10 text-[10px] uppercase tracking-widest text-zinc-400">{plan.limits.max_products} products</span>}
              {plan.limits?.max_jobs_per_month && <span className="px-2 py-1 border border-white/10 text-[10px] uppercase tracking-widest text-zinc-400">{plan.limits.max_jobs_per_month} jobs/mo</span>}
            </div>
            {Array.isArray(plan.features) && plan.features.length > 0 && (
              <ul className="mt-4 space-y-1 text-xs text-zinc-400">
                {plan.features.slice(0, 5).map((feature) => <li key={feature}>• {feature}</li>)}
              </ul>
            )}
          </button>
        );
      })}
    </div>
  );
}
