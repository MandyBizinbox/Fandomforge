import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, Save, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { http, assetUrl } from "../../lib/api";

function money(value) {
  return `R ${Number(value || 0).toFixed(2)}`;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.results)) return value.results;
  return [];
}

function variationLabel(variation) {
  const attrs = variation?.attribute_values || variation?.attributes || {};
  const attrText = Object.entries(attrs)
    .filter(([, value]) => String(value || "").trim())
    .map(([key, value]) => `${key}: ${value}`)
    .join(" / ");

  if (attrText) return attrText;

  const parts = [variation?.size, variation?.color, variation?.sku].filter(Boolean);
  return parts.length ? parts.join(" / ") : "Variation";
}

function productTitle(product, bandsById) {
  const creator = bandsById?.[product?.band_id]?.name;
  return creator ? `${product.title} — ${creator}` : product?.title || "Untitled product";
}

const emptyAddress = {
  full_name: "",
  email: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postal_code: "",
  country: "ZA",
};

function newLine() {
  return {
    product_id: "",
    variation_id: "",
    quantity: 1,
  };
}

export default function ManualOrderBuilder({ mode = "admin", backTo = "/admin/orders" }) {
  const navigate = useNavigate();
  const isAdmin = mode === "admin";

  const [products, setProducts] = useState([]);
  const [creators, setBands] = useState([]);
  const [selectedBandId, setSelectedBandId] = useState("all");
  const [lines, setLines] = useState([newLine()]);
  const [shippingAddress, setShippingAddress] = useState(emptyAddress);
  const [markPaid, setMarkPaid] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const bandsById = useMemo(() => {
    return creators.reduce((map, creator) => {
      map[creator.id] = creator;
      return map;
    }, {});
  }, [creators]);

  const filteredProducts = useMemo(() => {
    if (!isAdmin || selectedBandId === "all") return products;
    return products.filter((product) => product.band_id === selectedBandId);
  }, [isAdmin, products, selectedBandId]);

  const productById = useMemo(() => {
    return products.reduce((map, product) => {
      map[product.id] = product;
      return map;
    }, {});
  }, [products]);

  const totals = useMemo(() => {
    return lines.reduce(
      (summary, line) => {
        const product = productById[line.product_id];
        const quantity = Math.max(Number(line.quantity || 0), 0);

        if (!product || !quantity) return summary;

        const sale = Number(product.selling_price || 0) * quantity;
        const printCost = Number(product.print_cost || product.estimated_print_cost || 0) * quantity;
        const commissionRate = Number(product.commission_rate || 0.15);
        const commission = Number(product.estimated_commission || Number(product.selling_price || 0) * commissionRate) * quantity;
        const creatorProfit = Number(product.estimated_creator_profit || (Number(product.selling_price || 0) - Number(product.print_cost || 0) - Number(product.selling_price || 0) * commissionRate)) * quantity;

        summary.subtotal += sale;
        summary.printCost += printCost;
        summary.commission += commission;
        summary.creatorProfit += creatorProfit;
        return summary;
      },
      { subtotal: 0, printCost: 0, commission: 0, creatorProfit: 0 }
    );
  }, [lines, productById]);

  useEffect(() => {
    setLoading(true);

    const productRequest = isAdmin ? http.get("/admin/products") : http.get("/products/mine");
    const bandRequest = isAdmin ? http.get("/admin/creators") : Promise.resolve({ data: [] });

    Promise.all([productRequest, bandRequest])
      .then(([productsRes, bandsRes]) => {
        setProducts(asArray(productsRes.data));
        setBands(asArray(bandsRes.data));
      })
      .catch((error) => {
        toast.error(error.response?.data?.detail || "Could not load products for manual order");
      })
      .finally(() => setLoading(false));
  }, [isAdmin]);

  function updateAddress(key, value) {
    setShippingAddress((current) => ({ ...current, [key]: value }));
  }

  function updateLine(index, patch) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLines((current) => [...current, newLine()]);
  }

  function removeLine(index) {
    setLines((current) => current.filter((_, i) => i !== index));
  }

  function validate() {
    if (!shippingAddress.full_name.trim()) return "Customer name is required";
    if (!shippingAddress.email.trim()) return "Customer email is required";
    if (!shippingAddress.line1.trim()) return "Address line 1 is required";
    if (!shippingAddress.city.trim()) return "City is required";
    if (!shippingAddress.postal_code.trim()) return "Postal code is required";

    if (!lines.length) return "Add at least one order item";

    for (const [index, line] of lines.entries()) {
      const row = index + 1;
      const product = productById[line.product_id];

      if (!line.product_id || !product) return `Pick a product for line ${row}`;
      if (!line.variation_id) return `Pick a variation for line ${row}`;
      if (Number(line.quantity || 0) < 1) return `Quantity must be at least 1 on line ${row}`;
    }

    return null;
  }

  async function save(e) {
    e.preventDefault();

    const validationError = validate();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSaving(true);

    const payload = {
      items: lines.map((line) => ({
        product_id: line.product_id,
        variation_id: line.variation_id,
        quantity: Number(line.quantity || 1),
      })),
      shipping_address: {
        ...shippingAddress,
        full_name: shippingAddress.full_name.trim(),
        email: shippingAddress.email.trim(),
        phone: shippingAddress.phone.trim(),
        line1: shippingAddress.line1.trim(),
        line2: shippingAddress.line2.trim(),
        city: shippingAddress.city.trim(),
        state: shippingAddress.state.trim(),
        postal_code: shippingAddress.postal_code.trim(),
        country: shippingAddress.country.trim() || "ZA",
      },
      mark_paid: Boolean(markPaid),
    };

    try {
      const endpoint = isAdmin ? "/admin/orders" : "/orders/creator";
      const response = await http.post(endpoint, payload);
      toast.success(`Manual order ${response.data.order_number} created`);
      navigate(isAdmin ? `/admin/orders/${response.data.id}` : `/creator/orders/${response.data.id}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Manual order could not be created");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="card text-zinc-400">Loading manual order builder...</div>;
  }

  return (
    <div data-testid={`${mode}-manual-order-builder`}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between mb-8">
        <div>
          <div className="overline mb-2">Manual Order</div>
          <h1 className="font-display text-5xl uppercase">Create Order</h1>
          <p className="text-zinc-400 text-sm mt-3 max-w-3xl">
            Create a manual order from existing template-linked products. The order will still generate the production pack for printers.
          </p>
        </div>

        <button type="button" onClick={() => navigate(backTo)} className="btn-secondary">
          <ArrowLeft size={14} /> Back
        </button>
      </div>

      <form onSubmit={save} className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-6">
          {isAdmin && (
            <div className="card">
              <div className="overline mb-3">Creator Filter</div>
              <label htmlFor="creator-filter" className="label">Show products for creator</label>
              <select
                id="creator-filter"
                className="input-base"
                value={selectedBandId}
                onChange={(e) => setSelectedBandId(e.target.value)}
              >
                <option value="all">All creators</option>
                {creators.map((creator) => (
                  <option key={creator.id} value={creator.id}>{creator.name}</option>
                ))}
              </select>
              <p className="text-xs text-zinc-500 mt-2">
                This filters the product picker only. The order items remain linked to the product's owning creator.
              </p>
            </div>
          )}

          <div className="card">
            <div className="flex items-center justify-between gap-4 mb-5">
              <div>
                <div className="overline mb-1">Items</div>
                <h2 className="font-display text-3xl uppercase">Products</h2>
              </div>
              <button type="button" onClick={addLine} className="btn-secondary text-xs">
                <Plus size={14} /> Add Line
              </button>
            </div>

            <div className="space-y-4">
              {lines.map((line, index) => {
                const product = productById[line.product_id];
                const productOptions = filteredProducts;
                const variations = product?.variations || [];

                return (
                  <div key={index} className="border border-white/10 bg-black/30 p-4" data-testid={`manual-order-line-${index}`}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="overline">Line {index + 1}</div>
                      {lines.length > 1 && (
                        <button type="button" onClick={() => removeLine(index)} className="text-xs uppercase tracking-widest text-[#FF3B30] font-bold">
                          <Trash2 size={14} className="inline mr-1" /> Remove
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_120px] gap-3">
                      <div>
                        <label className="label" htmlFor={`product-${index}`}>Product</label>
                        <select
                          id={`product-${index}`}
                          className="input-base"
                          value={line.product_id}
                          onChange={(e) => updateLine(index, { product_id: e.target.value, variation_id: "" })}
                        >
                          <option value="">Pick product</option>
                          {productOptions.map((item) => (
                            <option key={item.id} value={item.id}>{productTitle(item, bandsById)}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="label" htmlFor={`variation-${index}`}>Variation</label>
                        <select
                          id={`variation-${index}`}
                          className="input-base"
                          value={line.variation_id}
                          onChange={(e) => updateLine(index, { variation_id: e.target.value })}
                          disabled={!product}
                        >
                          <option value="">Pick variation</option>
                          {variations.map((variation) => (
                            <option key={variation.id} value={variation.id}>{variationLabel(variation)}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="label" htmlFor={`qty-${index}`}>Qty</label>
                        <input
                          id={`qty-${index}`}
                          className="input-base"
                          type="number"
                          min="1"
                          value={line.quantity}
                          onChange={(e) => updateLine(index, { quantity: e.target.value })}
                        />
                      </div>
                    </div>

                    {product && (
                      <div className="mt-4 grid grid-cols-1 md:grid-cols-[72px_1fr] gap-3 text-xs text-zinc-400">
                        <div className="w-[72px] h-[72px] border border-white/10 bg-black flex items-center justify-center overflow-hidden">
                          {product.mockup_images?.[0] ? (
                            <img src={assetUrl(product.mockup_images[0])} alt={product.title} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-zinc-600">MF</span>
                          )}
                        </div>
                        <div className="grid sm:grid-cols-4 gap-3">
                          <div><span className="text-zinc-500">Price</span><br /><span className="text-white">{money(product.selling_price)}</span></div>
                          <div><span className="text-zinc-500">Print cost</span><br /><span className="text-white">{money(product.print_cost || product.estimated_print_cost)}</span></div>
                          <div><span className="text-zinc-500">Template</span><br /><span className="text-white">{product.template_id ? "Linked" : "Legacy"}</span></div>
                          <div><span className="text-zinc-500">Status</span><br /><span className="text-white">{product.published ? "Published" : "Draft"}</span></div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card">
            <div className="overline mb-3">Customer / Shipping</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="manual-full-name">Full name</label>
                <input id="manual-full-name" className="input-base" value={shippingAddress.full_name} onChange={(e) => updateAddress("full_name", e.target.value)} required />
              </div>
              <div>
                <label className="label" htmlFor="manual-email">Email</label>
                <input id="manual-email" className="input-base" type="email" value={shippingAddress.email} onChange={(e) => updateAddress("email", e.target.value)} required />
              </div>
              <div>
                <label className="label" htmlFor="manual-phone">Phone</label>
                <input id="manual-phone" className="input-base" value={shippingAddress.phone} onChange={(e) => updateAddress("phone", e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="manual-country">Country</label>
                <input id="manual-country" className="input-base" value={shippingAddress.country} onChange={(e) => updateAddress("country", e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <label className="label" htmlFor="manual-line1">Address line 1</label>
                <input id="manual-line1" className="input-base" value={shippingAddress.line1} onChange={(e) => updateAddress("line1", e.target.value)} required />
              </div>
              <div className="md:col-span-2">
                <label className="label" htmlFor="manual-line2">Address line 2</label>
                <input id="manual-line2" className="input-base" value={shippingAddress.line2} onChange={(e) => updateAddress("line2", e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="manual-city">City</label>
                <input id="manual-city" className="input-base" value={shippingAddress.city} onChange={(e) => updateAddress("city", e.target.value)} required />
              </div>
              <div>
                <label className="label" htmlFor="manual-state">Province</label>
                <input id="manual-state" className="input-base" value={shippingAddress.state} onChange={(e) => updateAddress("state", e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="manual-postal">Postal code</label>
                <input id="manual-postal" className="input-base" value={shippingAddress.postal_code} onChange={(e) => updateAddress("postal_code", e.target.value)} required />
              </div>
            </div>
          </div>
        </div>

        <aside className="card h-fit sticky top-24">
          <div className="overline mb-3">Summary</div>
          <div className="space-y-3 text-sm">
            {lines.map((line, index) => {
              const product = productById[line.product_id];
              if (!product) return null;
              const quantity = Number(line.quantity || 0);
              return (
                <div key={index} className="flex justify-between gap-4">
                  <span className="text-zinc-400">{product.title} × {quantity}</span>
                  <span>{money(Number(product.selling_price || 0) * quantity)}</span>
                </div>
              );
            })}
          </div>

          <div className="border-t border-white/15 mt-5 pt-5 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-zinc-400">Subtotal</span><span>{money(totals.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Est. print cost</span><span>{money(totals.printCost)}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Est. commission</span><span>{money(totals.commission)}</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Est. creator profit</span><span className="text-[#34C759]">{money(totals.creatorProfit)}</span></div>
          </div>

          <div className="border-t border-white/15 mt-5 pt-5 flex justify-between font-display text-2xl">
            <span>Total</span>
            <span>{money(totals.subtotal)}</span>
          </div>

          <label className="mt-5 flex items-start gap-3 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={markPaid}
              onChange={(e) => setMarkPaid(e.target.checked)}
              className="mt-1"
            />
            <span>
              Mark as paid and send to production immediately.
              {!isAdmin && <span className="block text-xs text-zinc-500 mt-1">Use this only for paid cash/EFT/manual orders.</span>}
            </span>
          </label>

          <button type="submit" className="btn-primary w-full mt-6" disabled={saving || totals.subtotal <= 0}>
            <Save size={14} /> {saving ? "Creating..." : "Create Manual Order"}
          </button>
        </aside>
      </form>
    </div>
  );
}
