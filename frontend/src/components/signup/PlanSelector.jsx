import React from "react";

function money(value) {
  return Number(value || 0).toFixed(2);
}

export default function PlanSelector({ plans = [], value, onChange, emptyLabel = "No paid creator plans are currently available." }) {
  if (!Array.isArray(plans) || plans.length === 0) {
    return (
      <div className="card bg-[var(--ff-card-bg)]">
        <p className="overline mb-2">Creator access</p>
        <p className="text-[var(--ff-muted-text)] text-sm">{emptyLabel}</p>
        <p className="text-[var(--ff-muted-text)] text-xs mt-2">
          Continue to create your store using the currently available launch access.
        </p>
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {plans.map((plan) => {
        const active = value === plan.id;
        const monthlyPrice = Number(plan.monthly_price || 0);

        return (
          <button
            type="button"
            key={plan.id}
            onClick={() => onChange(plan.id)}
            aria-pressed={active}
            className={`text-left border p-5 transition bg-[var(--ff-card-bg)] ${active ? "border-[var(--ff-primary)]" : "border-[var(--ff-card-border)] hover:border-[var(--ff-primary)]"}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-display text-2xl uppercase">{plan.name}</p>
                <p className="text-[var(--ff-muted-text)] text-sm mt-1">{plan.description || "Creator subscription plan"}</p>
              </div>
              <div className="font-display text-2xl whitespace-nowrap text-[var(--ff-primary)]">
                {monthlyPrice === 0 ? "Free" : `R ${money(monthlyPrice)}`}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {plan.billing_cycle && (
                <span className="px-2 py-1 border border-[var(--ff-card-border)] text-[10px] uppercase tracking-widest text-[var(--ff-muted-text)]">
                  {plan.billing_cycle}
                </span>
              )}
              {plan.trial_days > 0 && (
                <span className="px-2 py-1 border border-[var(--ff-card-border)] text-[10px] uppercase tracking-widest text-[var(--ff-muted-text)]">
                  {plan.trial_days} day trial
                </span>
              )}
              {plan.limits?.max_products && (
                <span className="px-2 py-1 border border-[var(--ff-card-border)] text-[10px] uppercase tracking-widest text-[var(--ff-muted-text)]">
                  {plan.limits.max_products} products
                </span>
              )}
              {plan.limits?.max_jobs_per_month && (
                <span className="px-2 py-1 border border-[var(--ff-card-border)] text-[10px] uppercase tracking-widest text-[var(--ff-muted-text)]">
                  {plan.limits.max_jobs_per_month} jobs per month
                </span>
              )}
            </div>

            {Array.isArray(plan.features) && plan.features.length > 0 && (
              <ul className="mt-4 space-y-1 text-xs text-[var(--ff-muted-text)]">
                {plan.features.slice(0, 5).map((feature) => <li key={feature}>• {feature}</li>)}
              </ul>
            )}

            <span className="block mt-5 text-xs uppercase tracking-widest font-bold text-[var(--ff-primary)]">
              {active ? "Selected" : "Select plan"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
