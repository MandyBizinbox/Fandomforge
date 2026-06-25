import React from "react";
import { useNavigate } from "react-router-dom";
import StatusBadge from "../StatusBadge";
import { assetUrl } from "../../lib/api";

function money(value) {
  return `R ${Number(value || 0).toFixed(2)}`;
}

export default function ProductionJobCard({ job, basePath = "/printer/orders" }) {
  const navigate = useNavigate();
  const mockup = job.mockup_image_url || job.artwork?.url;
  const variationLabel = job.variation?.label || "Variation";
  const printLabel = [job.print_option?.print_method, job.print_option?.print_size].filter(Boolean).join(" / ") || "Print method";

  return (
    <div className="border border-white/15 bg-white/[0.03] p-4 hover:border-[#FF3B30]" data-testid={`production-job-${job.order_id}-${job.item_id}`}>
      <div className="flex gap-4">
        <div className="h-24 w-24 border border-white/10 bg-black flex shrink-0 items-center justify-center overflow-hidden">
          {mockup ? <img src={assetUrl(mockup)} alt="" className="h-full w-full object-contain" /> : <span className="text-[10px] uppercase tracking-widest text-zinc-600">No image</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-widest text-zinc-500">{job.order_number}</p>
              <h3 className="font-display text-xl uppercase leading-tight">{job.product_title}</h3>
            </div>
            <StatusBadge status={job.production_status || "pending"} />
          </div>
          <div className="mt-2 grid gap-1 text-xs text-zinc-400 md:grid-cols-2">
            <div>Creator: <span className="text-white">{job.band_name || "—"}</span></div>
            <div>Qty: <span className="text-white">{job.quantity || 1}</span></div>
            <div>Variation: <span className="text-white">{variationLabel}</span></div>
            <div>Print: <span className="text-white">{printLabel}</span></div>
            <div>Area: <span className="text-white">{job.print_area?.name || "—"}</span></div>
            <div>Payout: <span className="text-[#34C759]">{money(job.printer_payout)}</span></div>
          </div>
          <button onClick={() => navigate(`${basePath}/${job.order_id}`)} className="mt-3 text-xs uppercase tracking-widest text-[#FF3B30] font-bold hover:text-white">
            Open Production Pack →
          </button>
        </div>
      </div>
    </div>
  );
}
