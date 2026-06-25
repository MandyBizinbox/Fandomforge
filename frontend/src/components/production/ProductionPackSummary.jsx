import React from "react";
import { Download, ExternalLink, Package, Shirt, Factory, WalletCards, MapPin } from "lucide-react";
import { assetUrl } from "../../lib/api";
import StatusBadge from "../StatusBadge";

function money(value) {
  return `R ${Number(value || 0).toFixed(2)}`;
}

function valueOrDash(value) {
  return value || "—";
}

function titleCase(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function DataRow({ label, value, mono = false, highlight = false }) {
  return (
    <div className="flex justify-between gap-4 border-b border-white/10 py-2 text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className={`text-right ${mono ? "font-mono text-xs" : ""} ${highlight ? "text-[#34C759] font-bold" : ""}`}>
        {valueOrDash(value)}
      </span>
    </div>
  );
}

function SectionCard({ icon, title, children, className = "" }) {
  return (
    <div className={`border border-white/10 bg-black/20 p-4 ${className}`}>
      <div className="overline mb-3 flex items-center gap-2">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

export default function ProductionPackSummary({ item, testidPrefix = "production-pack", showInternalMoney = true }) {
  const snapshot = item?.production_snapshot || {};
  const variation = snapshot.variation || {};
  const printArea = snapshot.print_area || {};
  const printOption = snapshot.print_option || {};
  const artwork = snapshot.artwork || {};
  const assignedPrinter = snapshot.assigned_printer || {};
  const costing = snapshot.costing_breakdown || {};
  const artworks = Array.isArray(snapshot.artworks) && snapshot.artworks.length ? snapshot.artworks : artwork.url ? [artwork] : [];
  const placement = snapshot.placement || {};
  const artworkUrl = artwork.url || item?.artwork_file_url;
  const mockupUrl = artwork.mockup_image_url || snapshot.mockup_image_url || item?.mockup_url || item?.artwork_file_url;

  const printLabel = [printOption.print_method, printOption.print_size].filter(Boolean).join(" / ");
  const areaSizeLabel = [printArea.width_mm, printArea.height_mm].filter(Boolean).length
    ? `${printArea.width_mm || 0} × ${printArea.height_mm || 0} mm`
    : printArea.print_size;

  const hasAssignmentData = Boolean(snapshot.assignment_model || assignedPrinter.id || item?.printer_id);
  const hasCostingBreakdown = Boolean(snapshot.costing_model || Object.keys(costing).length);

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2" data-testid={testidPrefix}>
      <SectionCard icon={<Factory size={13} />} title="Assignment & Routing">
        <DataRow label="Assigned Printer" value={assignedPrinter.company_name || item?.printer_name || item?.printer_id} highlight={Boolean(item?.printer_id)} />
        <DataRow label="Printer ID" value={item?.printer_id || assignedPrinter.id} mono />
        <DataRow label="Assignment Model" value={titleCase(snapshot.assignment_model)} />
        <DataRow label="Delivery Province" value={snapshot.delivery_province_key || assignedPrinter.province_key} />
        <DataRow label="Printer Location" value={[assignedPrinter.city, assignedPrinter.province].filter(Boolean).join(", ")} />
        {!hasAssignmentData && (
          <p className="mt-3 text-xs text-[#FFCC00]">
            No assignment metadata stored on this snapshot. The order may pre-date capability/province assignment.
          </p>
        )}
      </SectionCard>

      <SectionCard icon={<WalletCards size={13} />} title="Commercial Model">
        <DataRow label="Costing Model" value={titleCase(snapshot.costing_model)} />
        <DataRow label="Blank Supplier Cost" value={costing.blank_supplier_cost !== undefined ? money(costing.blank_supplier_cost) : "—"} />
        <DataRow label="Blank Payout Unit" value={costing.blank_payout_unit !== undefined ? money(costing.blank_payout_unit) : "—"} />
        <DataRow label="Platform Print Cost" value={costing.platform_print_cost !== undefined ? money(costing.platform_print_cost) : "—"} />
        <DataRow label="Print Payout Unit" value={costing.print_payout_unit !== undefined ? money(costing.print_payout_unit) : "—"} />
        <DataRow label="Production Unit Cost" value={costing.production_unit_cost !== undefined ? money(costing.production_unit_cost) : "—"} highlight />
        {!hasCostingBreakdown && (
          <p className="mt-3 text-xs text-[#FFCC00]">
            No costing breakdown stored on this snapshot. Totals below are still taken from the order item.
          </p>
        )}
      </SectionCard>

      <SectionCard icon={<Package size={13} />} title="Blank Product">
        <DataRow label="Template" value={snapshot.template_name} />
        <DataRow label="Category" value={snapshot.template_category} />
        <DataRow label="Brand" value={snapshot.blank_brand} />
        <DataRow label="Blank SKU" value={snapshot.blank_sku} mono />
        <DataRow label="Supplier" value={snapshot.supplier_name} />
        {snapshot.supplier_url && (
          <a href={snapshot.supplier_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#FF3B30] font-bold">
            Supplier Link <ExternalLink size={12} />
          </a>
        )}
        {snapshot.supplier_notes && <p className="mt-3 text-xs text-zinc-400 whitespace-pre-wrap">{snapshot.supplier_notes}</p>}
      </SectionCard>

      <SectionCard icon={<Shirt size={13} />} title="Primary Production Specs">
        <DataRow label="Variation" value={variation.label || [item?.size, item?.color].filter(Boolean).join(" / ")} />
        <DataRow label="Variation SKU" value={variation.sku} mono />
        <DataRow label="Supplier SKU" value={variation.supplier_sku} mono />
        <DataRow label="Print Area" value={printArea.name} />
        <DataRow label="Area Key" value={printArea.area_key} />
        <DataRow label="Area Size" value={areaSizeLabel} />
        <DataRow label="View" value={printArea.screen_view} />
        <DataRow label="Print Method" value={printLabel} />
        <DataRow label="Method Key" value={printOption.method_key} />
        <DataRow label="Standard Print Size" value={printOption.standard_print_size_key} />
        <DataRow label="Platform Print Cost" value={money(printOption.print_cost_max)} />
      </SectionCard>

      <SectionCard icon={<MapPin size={13} />} title="Production Status" className="lg:col-span-2">
        <div className="grid md:grid-cols-4 gap-4">
          <DataRow label="Order Item Status" value={<StatusBadge status={item?.production_status || "pending"} />} />
          <DataRow label="Qty" value={item?.quantity || 1} />
          <DataRow label="Unit Price" value={money(item?.unit_price)} />
          <DataRow label="Artwork File" value={artwork.file_name} />
        </div>
      </SectionCard>

      <SectionCard title="Artwork Slots & Mockups" className="lg:col-span-2">
        {artworks.length ? (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {artworks.map((row, index) => {
              const rowArtworkUrl = row.url || row.original_url;
              const rowMockupUrl = row.mockup_image_url || (index === 0 ? mockupUrl : "");
              const rowPlacement = row.placement || placement || {};
              const rowPrintLabel = [row.print_method, row.print_size].filter(Boolean).join(" / ");

              return (
                <div key={row.id || index} className="border border-white/10 bg-white/[0.02] p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="aspect-square border border-white/10 bg-black flex items-center justify-center overflow-hidden">
                      {rowMockupUrl ? <img src={assetUrl(rowMockupUrl)} alt="Mockup" className="h-full w-full object-contain" /> : <span className="text-xs text-zinc-600">No mockup</span>}
                    </div>
                    <div className="aspect-square border border-white/10 bg-black flex items-center justify-center overflow-hidden">
                      {rowArtworkUrl ? <img src={assetUrl(rowArtworkUrl)} alt="Artwork" className="h-full w-full object-contain" /> : <span className="text-xs text-zinc-600">No artwork</span>}
                    </div>
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-zinc-500">
                    <div>File: {row.file_name || "—"}</div>
                    <div>Print: {rowPrintLabel || "—"}</div>
                    <div>Area ID: {row.print_area_id || "—"}</div>
                    <div>Option ID: {row.print_option_id || "—"}</div>
                    <div>Placement: {Number(rowPlacement.x || 0).toFixed(1)}%, {Number(rowPlacement.y || 0).toFixed(1)}% / {Number(rowPlacement.width || 0).toFixed(1)}×{Number(rowPlacement.height || 0).toFixed(1)}%</div>
                    <div>Rotation: {Number(rowPlacement.rotation || 0).toFixed(1)}°</div>
                  </div>
                  {rowArtworkUrl && (
                    <a href={assetUrl(rowArtworkUrl)} target="_blank" rel="noreferrer" className="btn-secondary text-xs inline-flex mt-3">
                      <Download size={12} /> Download Artwork
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-zinc-500">No artwork snapshot available.</div>
        )}
      </SectionCard>

      <SectionCard title="Money" className="lg:col-span-2">
        <div className={`grid gap-4 ${showInternalMoney ? "md:grid-cols-4" : "md:grid-cols-2"}`}>
          <DataRow label="Production Cost" value={money(snapshot.production_cost || item?.printer_payout)} />
          <DataRow label="Printer Payout" value={money(item?.printer_payout || snapshot.printer_payout)} highlight />
          {showInternalMoney && (
            <>
              <DataRow label="Creator Profit" value={money(item?.band_earnings || snapshot.creator_profit)} />
              <DataRow label="Platform Commission" value={money(item?.commission_amount || snapshot.platform_commission)} />
            </>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
