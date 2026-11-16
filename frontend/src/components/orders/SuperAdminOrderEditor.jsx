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
  const [productSearch, setProductSearch] = useState("");
  const itemChangesLocked = ["completed", "cancelled", "refunded"].includes(order?.status) || Boolean(order?.collection_receipt);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const timer = setTimeout(() => {
      setCatalogLoading(true);
      http.get("/admin/orders/catalogue-search", { params: { q: productSearch } })
        .then(({ data }) => {
          if (!active) return;
          // Keep previously selected results when search text changes.
          setCatalog(previous => {
            const byId = new Map(previous.map(product => [product.id, product]));
            (Array.isArray(data) ? data : []).forEach(product => byId.set(product.id, product));
            return Array.from(byId.values());
          });
        })
        .catch(error => {
          if (active) toast.error(error.response?.data?.detail || "Product search failed");
        })
        .finally(() => { if (active) setCatalogLoading(false); });
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [open, productSearch]);

  useEffect(() => {
    setAddress(initialAddress(order));
    setItems(initialItems(order));
    setReason("");
    setOpen(false);
    setProductSearch("");
  }, [order?.id, order?.updated_at]);

  const corrections = useMemo(() => items.filter(row => {
    const original = (order?.items || []).find(item => item.id === row.item_id);
    return original && (row.product_id !== original.product_id ||
      row.variation_id !== original.variation_id ||
      row.size.trim() !== String(original.size || "") ||
      row.color.trim() !== String(original.color || ""));
  }).map(row => ({
    item_id: row.item_id,
    product_id: row.product_id,
    variation_id: row.variation_id,
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
      const response = await http.patch(`/admin/orders/${encodeURIComponent(order.id)}/corrections`, {
        reason: reason.trim(),
        expected_updated_at: order.updated_at,
        shipping_address: addressChanged ? address : null,
        item_corrections: corrections,
      });
      // Read back the authoritative order after the write. A green toast
      // must never claim the shirt changed while the order still says otherwise.
      const confirmed = await http.get(`/orders/${encodeURIComponent(order.id)}`);
      const serverItems = confirmed.data?.items || [];
      for (const requested of corrections) {
        const saved = serverItems.find(item => item.id === requested.item_id);
        if (!saved || saved.product_id !== requested.product_id ||
            saved.variation_id !== requested.variation_id) {
          throw new Error("Save was acknowledged, but the actual order product did not update. Refresh and check the order.");
        }
      }
      toast.success("Order record updated and verified");
      await onSaved?.();
    } catch (error) {
      toast.error(error.response?.data?.detail || error.message || "Could not save order corrections");
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
      Contact details may be corrected. Completed or collected items are locked.
    </div>}
    {open && <form onSubmit={save} className="space-y-5">
      <p className="text-sm ff-ui-muted">
        Contact and delivery corrections are available for every order status. For shipped or completed orders, this updates the record only; previously issued labels and collection evidence remain unchanged.
        Super Admin can replace a T-shirt with another product and variation from the live catalogue, including during production, provided it has the same price, creator and printer. Changes are audited without sending status-change emails.
        Quantity, price, payment records and collected items cannot be changed here. Notify production staff of any replacement already in progress.
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
        <h3 className="font-bold mb-3">Replace product or variation</h3>
        <label className="block text-sm mb-3">
          <span className="ff-ui-label">Find replacement product (e.g. Scouter)</span>
          <input className="ff-ui-control w-full mt-1" value={productSearch}
            onChange={event => setProductSearch(event.target.value)}
            placeholder="Search all published catalogue products..." />
        </label>
        <div className="grid gap-3">
          {catalogLoading && <p className="text-sm ff-ui-muted">Loading catalogue variations…</p>}
          {items.map(row => {
            const product = catalog.find(item => item.id === row.product_id);
            const originalLine = (order?.items || []).find(item => item.id === row.item_id);
            const searchResults = catalog.filter(item =>
              !productSearch.trim() ||
              item.title?.toLowerCase().includes(productSearch.trim().toLowerCase())
            );
            const productsToShow = [
              ...searchResults,
              ...(product && !searchResults.some(candidate => candidate.id === product.id) ? [product] : []),
            ].sort((a, b) => String(a.title).localeCompare(String(b.title)));
            const variations = product?.variations || [];
            const currentLabel = [row.size, row.color].filter(Boolean).join(" / ") || "Not specified";
            const selectedVariation = variations.find(variation =>
              variation.id === row.variation_id ||
              (String(variation.size || "").toLowerCase() === row.size.toLowerCase() &&
               String(variation.color || "").toLowerCase() === row.color.toLowerCase())
            );
            const locked = itemChangesLocked || ["shipped", "delivered"].includes(row.production_status);
            return <div key={row.item_id}
              className="border border-[var(--ff-card-border)] p-3 grid gap-3 sm:grid-cols-[minmax(0,2fr)_2fr]">
              <div className="text-sm">
                <strong>Original: {originalLine?.product_title || row.product_title}</strong>
                <div className="ff-ui-muted">Qty: {row.quantity} · {row.production_status.replaceAll("_", " ")}</div>
                <div className="ff-ui-muted">Current: {currentLabel}</div>
              </div>
              <div className="space-y-3">
                <label className="block text-sm"><span className="ff-ui-label">Replacement product</span>
                  <select className="ff-ui-control w-full mt-1"
                    value={row.product_id}
                    disabled={locked || catalogLoading}
                    onChange={event => {
                      const selected = catalog.find(candidate => candidate.id === event.target.value);
                      if (!selected) return;
                      const matching = (selected.variations || []).filter(variation =>
                        variation.effective_selling_price != null &&
                        Math.abs(Number(variation.effective_selling_price) - Number(originalLine?.unit_price || 0)) < 0.005);
                      const preferred = matching.find(variation => variation.size === row.size && variation.color === row.color) || matching[0];
                      setItems(current => current.map(item => item.item_id === row.item_id ? {
                        ...item, product_id: selected.id, product_title: selected.title,
                        variation_id: preferred?.id || "", size: preferred?.size || "", color: preferred?.color || "",
                      } : item));
                    }}>
                    {!productsToShow.some(option => option.id === row.product_id) &&
                      <option value={row.product_id}>Original product (search to replace)</option>}
                    {productsToShow.map(option => <option key={option.id} value={option.id}>
                      {option.title}
                    </option>)}
                  </select>
                  <div className="text-xs ff-ui-muted mt-1">
                    Choose the replacement product here, then its size/colour below. Only same-price replacements can be saved.
                  </div>
                </label>
                <label className="block text-sm"><span className="ff-ui-label">Product variation</span>
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
                  {variations.map(variation => <option key={variation.id} value={variation.id}
                    disabled={variation.effective_selling_price == null || Math.abs(Number(variation.effective_selling_price) - Number(originalLine?.unit_price || 0)) > 0.005}>
                    {[variation.size, variation.color].filter(Boolean).join(" / ") || variation.sku || variation.id}
                    {variation.effective_selling_price != null ? ` · R ${Number(variation.effective_selling_price).toFixed(2)}` : ""}
                  </option>)}
                </select>
                {product && !variations.some(variation =>
                  variation.effective_selling_price != null &&
                  Math.abs(Number(variation.effective_selling_price) - Number(originalLine?.unit_price || 0)) < 0.005) &&
                  <div className="text-xs text-red-500 mt-1">This product has no R {Number(originalLine?.unit_price || 0).toFixed(2)} variation. Financial review is required.</div>}
                {!product && !catalogLoading && <div className="text-xs ff-ui-muted mt-1">Search for a replacement product above.</div>}
                {locked && <div className="text-xs ff-ui-muted mt-1">Already shipped or delivered items cannot be corrected here.</div>}
              </label>
              </div>
            </div>;
          })}
        </div>
      </div>
      <label className="block text-sm font-semibold">Reason for changes
        <textarea className="ff-ui-control w-full mt-2 min-h-24" maxLength={500} required
          placeholder="Replace Meerkat Camp shirt with Scouter shirt as requested..."
          value={reason} onChange={event => setReason(event.target.value)} />
      </label>
      <button type="submit" disabled={!hasChanges || saving || reason.trim().length < 5}
        className="ff-ui-button ff-ui-button--primary w-full sm:w-auto">
        {saving ? "Saving…" : "Save audited corrections"}
      </button>
    </form>}
  </section>;
}
