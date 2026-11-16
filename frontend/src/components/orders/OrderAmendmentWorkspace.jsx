import React, { useCallback, useEffect, useMemo, useState } from "react";
import { http } from "../../lib/api";
import { toast } from "sonner";

const money = value => `R ${Number(value || 0).toFixed(2)}`;
const initialRows = order => (order?.items || []).map(item => ({
  key: item.id,
  existing_item_id: item.id,
  product_id: item.product_id,
  variation_id: item.variation_id,
  quantity: Number(item.quantity || 1),
}));
const itemLabel = (product, variation) => {
  const attributes = [variation?.size, variation?.color].filter(Boolean).join(" / ");
  return [product?.title || "Unknown product", attributes].filter(Boolean).join(" • ");
};

export default function OrderAmendmentWorkspace({ order }) {
  const [catalog, setCatalog] = useState([]);
  const [rows, setRows] = useState(() => initialRows(order));
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [catalogueError, setCatalogueError] = useState("");
  const [version, setVersion] = useState(0);

  const refreshDrafts = useCallback(async () => {
    const res = await http.get(`/admin/orders/${encodeURIComponent(order.id)}/amendments`);
    setDrafts(res.data?.drafts || []);
  }, [order.id]);

  useEffect(() => {
    let mounted = true;
    setRows(initialRows(order));
    setReason("");
    setPreview(null);
    setCatalog([]);
    setLoading(true);
    Promise.all([
      http.get("/admin/products"),
      http.get(`/admin/orders/${encodeURIComponent(order.id)}/amendments`),
    ]).then(([products, amendments]) => {
      if (!mounted) return;
      setCatalog(Array.isArray(products.data) ? products.data : []);
      setDrafts(amendments.data?.drafts || []);
    }).catch(error => {
      if (mounted) setCatalogueError(error.response?.data?.detail || "Could not load amendment catalogue");
    }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [order.id, order.updated_at, version]);

  const productsById = useMemo(
    () => new Map(catalog.map(item => [item.id, item])),
    [catalog],
  );

  const changeRow = (key, update) => {
    setRows(current => current.map(row => row.key === key ? { ...row, ...update } : row));
    setPreview(null);
  };

  const addRow = () => {
    const product = catalog.find(item => item.published && item.variations?.length);
    if (!product) return toast.error("No published products with variations found");
    setRows(current => [...current, {
      key: `new-${Date.now()}-${current.length}`,
      existing_item_id: null,
      product_id: product.id,
      variation_id: product.variations[0].id,
      quantity: 1,
    }]);
    setPreview(null);
  };

  const deleteRow = key => {
    setRows(current => current.filter(row => row.key !== key));
    setPreview(null);
  };

  const payload = () => ({
    expected_updated_at: order.updated_at,
    reason: reason.trim(),
    items: rows.map(row => ({
      existing_item_id: row.existing_item_id,
      product_id: row.product_id,
      variation_id: row.variation_id,
      quantity: Number(row.quantity),
    })),
  });

  const submit = async save => {
    if (busy || rows.length === 0 || reason.trim().length < 5) return;
    setBusy(true);
    try {
      const endpoint = save ? "drafts" : "preview";
      const response = await http.post(
        `/admin/orders/${encodeURIComponent(order.id)}/amendments/${endpoint}`,
        payload(),
      );
      setPreview(response.data.preview);
      if (save) {
        toast.success("Amendment draft saved for financial review. Original order unchanged.");
        await refreshDrafts();
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Amendment could not be prepared");
    } finally {
      setBusy(false);
    }
  };

  const unchangedRows = new Set((order.items || []).map(item => item.id));
  const currentRows = rows.filter(row => unchangedRows.has(row.existing_item_id));
  const removals = (order.items || []).filter(item => !currentRows.some(row => row.existing_item_id === item.id));

  return <section className="ff-ui-card p-4 md:p-6 space-y-5" data-testid="super-admin-order-amendments">
    <div>
      <div className="overline">Super Admin / Financial review</div>
      <h2 className="font-display text-2xl uppercase">Order amendments</h2>
      <p className="text-sm ff-ui-muted mt-2">
        Build a proposed revised order. Select products and actual catalogue variations;
        change quantities, remove lines or add products. Preview existing receipts against the
        revised total. Saving creates an audited draft, not a live order or a payment request.
      </p>
    </div>
    <p className="text-sm border-l-4 border-amber-500 p-3 bg-amber-500/10">
      Payment links and item activation are intentionally disabled until the separate
      PayFast supplement and payout accounting flow is validated. Never ask the customer
      to pay a duplicate full-order amount.
    </p>
    {loading && <p className="text-sm ff-ui-muted">Loading products and amendment records…</p>}
    {catalogueError && <div role="alert" className="text-red-500 text-sm">{catalogueError}</div>}

    <div className="space-y-3">
      {rows.map(row => {
        const product = productsById.get(row.product_id);
        const variation = product?.variations?.find(item => item.id === row.variation_id);
        const original = (order.items || []).find(item => item.id === row.existing_item_id);
        return <div key={row.key} className="border border-[var(--ff-card-border)] p-3 grid gap-3">
          <div className="flex justify-between items-start gap-2">
            <div className="text-sm font-semibold">
              {original ? `Original item: ${original.product_title}` : "Added item"}
              {original?.production_status && <span className="block text-xs ff-ui-muted">Production: {original.production_status}</span>}
            </div>
            <button type="button" onClick={() => deleteRow(row.key)}
              className="ff-ui-button ff-ui-button--secondary text-xs">Remove</button>
          </div>
          <div className="grid sm:grid-cols-[2fr_2fr_100px] gap-3">
            <label className="text-sm"><span className="ff-ui-label">Product</span>
              <select className="ff-ui-control w-full mt-1" value={row.product_id || ""}
                onChange={event => {
                  const next = productsById.get(event.target.value);
                  changeRow(row.key, { product_id: event.target.value, variation_id: next?.variations?.[0]?.id || "" });
                }}>
                {!product && <option value={row.product_id || ""}>Product unavailable in catalogue</option>}
                {catalog.filter(p => p.published || p.id === row.product_id).map(p =>
                  <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </label>
            <label className="text-sm"><span className="ff-ui-label">Variation</span>
              <select className="ff-ui-control w-full mt-1" value={row.variation_id || ""}
                onChange={event => changeRow(row.key, { variation_id: event.target.value })}>
                {!variation && <option value={row.variation_id || ""}>Original variation unavailable</option>}
                {(product?.variations || []).map(v => <option key={v.id} value={v.id}>
                  {itemLabel(product, v)} · {money(v.effective_selling_price)}
                </option>)}
              </select>
            </label>
            <label className="text-sm"><span className="ff-ui-label">Qty</span>
              <input className="ff-ui-control w-full mt-1" type="number" min={1} max={1000} step={1}
                value={row.quantity} onChange={event => changeRow(row.key, { quantity: event.target.value })} />
            </label>
          </div>
        </div>;
      })}
      {removals.length > 0 && <p className="text-sm ff-ui-muted">
        Proposed removals: {removals.map(item => item.product_title).join(", ")}
      </p>}
      <button type="button" disabled={loading || !catalog.length}
        onClick={addRow} className="ff-ui-button ff-ui-button--secondary w-full sm:w-auto">
        Add product
      </button>
    </div>

    <label className="text-sm block font-semibold">Reason for amendment
      <textarea className="ff-ui-control w-full mt-2 min-h-20" value={reason} maxLength={500}
        onChange={event => { setReason(event.target.value); setPreview(null); }}
        placeholder="What did the customer request?"/>
    </label>

    <div className="flex flex-wrap gap-2">
      <button type="button" className="ff-ui-button ff-ui-button--secondary"
        disabled={busy || rows.length === 0 || reason.trim().length < 5}
        onClick={() => submit(false)}>{busy ? "Checking…" : "Calculate balance"}</button>
      <button type="button" className="ff-ui-button ff-ui-button--primary"
        disabled={busy || rows.length === 0 || reason.trim().length < 5}
        onClick={() => submit(true)}>Save amendment draft</button>
    </div>

    {preview && <div className="border border-[var(--ff-card-border)] p-4 space-y-2" role="status">
      <h3 className="font-display text-xl">Revised order summary</h3>
      <div className="flex justify-between text-sm"><span>Existing order total</span><strong>{money(preview.order_total_before)}</strong></div>
      <div className="flex justify-between text-sm"><span>Revised total (incl. original shipping)</span><strong>{money(preview.revised_total)}</strong></div>
      <div className="flex justify-between text-sm"><span>Completed recorded payments</span><strong>{money(preview.paid_to_date)}</strong></div>
      <div className="flex justify-between text-lg font-bold border-t border-[var(--ff-card-border)] pt-2"><span>Balance due</span><span>{money(preview.balance_due)}</span></div>
      {preview.overpayment_review > 0 && <div className="text-sm text-amber-400">Credit/refund review: {money(preview.overpayment_review)}</div>}
      <div className="text-sm ff-ui-muted">Status: {preview.financial_status.replaceAll("_", " ")}. No charges are generated.</div>
      <button type="button" className="ff-ui-button ff-ui-button--secondary opacity-50" disabled>PayFast top-up link: not yet available</button>
    </div>}

    {drafts.length > 0 && <div>
      <h3 className="font-display text-xl mb-2">Amendment history</h3>
      <div className="space-y-2">{drafts.map(draft => <div key={draft.id} className="border border-[var(--ff-card-border)] p-3 text-sm">
        <strong>{draft.status.replaceAll("_", " ")}</strong> · {new Date(draft.created_at).toLocaleString()}
        <div>{draft.reason}</div>
        <div>Revised total: {money(draft.preview?.revised_total)} · Balance due: {money(draft.preview?.balance_due)}</div>
      </div>)}</div>
    </div>}
  </section>;
}
