import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { http } from "../../lib/api";

const ADDRESS_FIELDS = [
  ["full_name", "Customer / recipient name", true],
  ["email", "Customer email", true],
  ["phone", "Phone", false],
  ["line1", "Street address", true],
  ["line2", "Address line 2", false],
  ["city", "City", true],
  ["state", "Province", false],
  ["postal_code", "Postal code", true],
  ["country", "Country", true],
];

const LOCKED_STATUSES = new Set([
  "sent_to_printer", "in_production", "ready_for_dispatch", "shipped",
  "delivered", "completed", "cancelled", "canceled", "refunded",
]);

function initialAddress(order) {
  const address = order?.shipping_address || {};
  return Object.fromEntries(ADDRESS_FIELDS.map(([key]) => [
    key, String(address[key] || (key === "email" ? order?.buyer_email : key === "country" ? "ZA" : "")),
  ]));
}

function initialItems(order) {
  return (order?.items || []).map(item => ({
    item_id: item.id,
    product_title: item.product_title || "Order item",
    product_id: item.product_id || "",
    variation_id: item.variation_id || "",
    size: item.size || "",
    color: item.color || "",
    quantity: item.quantity || 1,
    production_status: item.production_status || "pending",
  }));
}

export default function SuperAdminOrderEditor({ order, onSaved }) {
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState(() => initialAddress(order));
  const [items, setItems] = useState(() => initialItems(order));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [catalog, setCatalog] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const itemChangesLocked = LOCKED_STATUSES.has(order?.status) || Boolean(order?.collection_receipt);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setCatalogLoading(true);
    http.get("/admin/products").then(({ data }) => {
      if (active) setCatalog(Array.isArray(data) ? data : []);
    }).catch(() => {
      if (active) toast.error("Could not load product variations from catalogue");
    }).finally(() => { if (active) setCatalogLoading(false); });
    return () => { active = false; };
  }, [open]);

  useEffect(() => {
    setAddress(initialAddress(order));
    setItems(initialItems(order));
    setReason("");
    setOpen(false);
  }, [order?.id, order?.updated_at]);

  const corrections = useMemo(() => items.filter(row => {
    const original = (order?.items || []).find(item => item.id === row.item_id);
    return original && (row.size.trim() !== String(original.size || "") ||
      row.color.trim() !== String(original.color || ""));
  }).map(row => ({
    item_id: row.item_id,
    size: row.size.trim(),
    color: row.color.trim(),
  })), [items, order]);

  const addressChanged = JSON.stringify(initialAddress(order)) !== JSON.stringify(address);
  const hasChanges = addressChanged || corrections.length > 0;

  const save = async event => {
    event.preventDefault();
    if (saving || !hasChanges) return;
    if (reason.trim().length < 5) {
      toast.error("Add a reason for the correction (at least 5 characters)");
      return;
    }
    if (!window.confirm("Save these corrections? The previous details and your reason will be retained in the order audit history. Payment amounts will not change.")) return;
    setSaving(true);
    try {
      await http.patch(`/admin/orders/${encodeURIComponent(order.id)}/corrections`, {
        reason: reason.trim(),
        expected_updated_at: order.updated_at,
        shipping_address: addressChanged ? address : null,
        item_corrections: corrections,
      });
      toast.success("Order corrections saved");
      await onSaved?.();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not save order corrections");
    } finally {
      setSaving(false);
    }
  };

  return <section className="ff-ui-card p-4 md:p-5 space-y-4" data-testid="super-admin-order-editor">
    <div className="flex flex-wrap justify-between items-center gap-3">
      <div>
        <div className="overline">Super Admin</div>
        <h2 className="font-display text-2xl uppercase">Edit order</h2>
      </div>
      <button type="button" className="ff-ui-button ff-ui-button--secondary"
        onClick={() => setOpen(value => !value)}>
        {open ? "Close editor" : "Edit order details"}
      </button>
    </div>
    {itemChangesLocked && <div role="status" className="text-sm ff-ui-muted">
      Customer and delivery details can still be corrected. Item amendments after production or collection require a separate financial and fulfilment amendment record.
    </div>}
    {open && <form onSubmit={save} className="space-y-5">
      <p className="text-sm ff-ui-muted">
        Contact and delivery corrections are available for every order status. For shipped or completed orders, this updates the record only; previously issued labels and collection evidence remain unchanged.
        Product variations are selected from the live catalogue and can only be corrected before production at the same price.
        Add/remove items, replacements with price differences and payment adjustments will require the separate audited amendment workflow.
      </p>
      <div>
        <h3 className="font-bold mb-3">Customer and delivery</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ADDRESS_FIELDS.map(([key, label, required]) => <label key={key} className="block text-sm">
            <span className="ff-ui-label">{label}</span>
            <input className="ff-ui-control w-full mt-1" name={key}
              type={key === "email" ? "email" : "text"} required={required}
              value={address[key]}
              onChange={event => setAddress(current => ({ ...current, [key]: event.target.value }))}/>
          </label>)}
        </div>
      </div>
      <div>
        <h3 className="font-bold mb-3">Product variations</h3>
        <div className="grid gap-3">
          {catalogLoading && <p className="text-sm ff-ui-muted">Loading catalogue variations…</p>}
          {items.map(row => {
            const product = catalog.find(item => item.id === row.product_id);
            const variations = product?.variations || [];
            const currentLabel = [row.size, row.color].filter(Boolean).join(" / ") || "Not specified";
            const selectedVariation = variations.find(variation =>
              variation.id === row.variation_id ||
              (String(variation.size || "").toLowerCase() === row.size.toLowerCase() &&
               String(variation.color || "").toLowerCase() === row.color.toLowerCase())
            );
            const locked = itemChangesLocked || row.production_status !== "pending";
            return <div key={row.item_id}
              className="border border-[var(--ff-card-border)] p-3 grid gap-3 sm:grid-cols-[minmax(0,2fr)_2fr]">
              <div className="text-sm">
                <strong>{row.product_title}</strong>
                <div className="ff-ui-muted">Qty: {row.quantity} · {row.production_status.replaceAll("_", " ")}</div>
                <div className="ff-ui-muted">Current: {currentLabel}</div>
              </div>
              <label className="text-sm"><span className="ff-ui-label">Product variation</span>
                <select className="ff-ui-control w-full mt-1"
                  value={selectedVariation?.id || ""}
                  disabled={locked || catalogLoading || !product || !variations.length}
                  onChange={event => {
                    const selected = variations.find(variation => variation.id === event.target.value);
                    if (!selected) return;
                    setItems(current => current.map(item => item.item_id === row.item_id ? {
                      ...item, variation_id: selected.id, size: selected.size || "", color: selected.color || "",
                    } : item));
                  }}>
                  {!selectedVariation && <option value="">Current: {currentLabel}</option>}
                  {variations.map(variation => <option key={variation.id} value={variation.id}>
                    {[variation.size, variation.color].filter(Boolean).join(" / ") || variation.sku || variation.id}
                    {variation.effective_selling_price != null ? ` · R ${Number(variation.effective_selling_price).toFixed(2)}` : ""}
                  </option>)}
                </select>
                {!product && !catalogLoading && <div className="text-xs ff-ui-muted mt-1">This product is not in the current catalogue.</div>}
                {locked && <div className="text-xs ff-ui-muted mt-1">Item editing locked after production starts.</div>}
              </label>
            </div>;
          })}
        </div>
      </div>
      <label className="block text-sm font-semibold">Reason for changes
        <textarea className="ff-ui-control w-full mt-2 min-h-24" maxLength={500} required
          placeholder="Client requested change before production..."
          value={reason} onChange={event => setReason(event.target.value)} />
      </label>
      <button type="submit" disabled={!hasChanges || saving || reason.trim().length < 5}
        className="ff-ui-button ff-ui-button--primary w-full sm:w-auto">
        {saving ? "Saving…" : "Save audited corrections"}
      </button>
    </form>}
  </section>;
}
