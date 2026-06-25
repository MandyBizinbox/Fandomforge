import React from "react";
import { CheckCircle2, Circle, Truck } from "lucide-react";

export default function CustomerOrderTimeline({ timeline = [], statusLabel = "" }) {
  const steps = Array.isArray(timeline) ? timeline : [];

  if (!steps.length) {
    return (
      <div className="card">
        <div className="overline mb-2">Order status</div>
        <div className="flex items-center gap-3 text-zinc-300">
          <Truck size={18} className="text-[#FF3B30]" />
          <span>{statusLabel || "Order received"}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="overline mb-5">Tracking Timeline</div>
      <div className="space-y-0">
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          const complete = Boolean(step.complete);
          const current = Boolean(step.current);

          return (
            <div key={step.key || index} className="relative flex gap-4 pb-6 last:pb-0">
              {!isLast && (
                <div
                  className={`absolute left-[9px] top-6 h-[calc(100%-1.5rem)] w-px ${complete ? "bg-[#34C759]" : "bg-white/15"}`}
                />
              )}
              <div className="relative z-10 pt-0.5">
                {complete ? (
                  <CheckCircle2 size={20} className={current ? "text-[#FF3B30]" : "text-[#34C759]"} />
                ) : (
                  <Circle size={20} className="text-zinc-600" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`font-bold uppercase tracking-wide text-sm ${current ? "text-white" : complete ? "text-zinc-200" : "text-zinc-500"}`}>
                  {step.label}
                </div>
                {step.description && (
                  <div className="text-sm text-zinc-500 mt-1">{step.description}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
