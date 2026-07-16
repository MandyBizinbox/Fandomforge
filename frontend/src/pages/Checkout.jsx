import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LockKeyhole, ShoppingBag } from "lucide-react";
import Navbar from "../components/Navbar";
import { useCart } from "../context/CartContext";
import { http, assetUrl } from "../lib/api";
import { toast } from "sonner";
import { getCartImage, getCartVariationLabel } from "../components/product/productDisplayUtils";
import PaymentMethodSelector from "../components/checkout/PaymentMethodSelector";
import ShippingMethodSelector from "../components/checkout/ShippingMethodSelector";
import { creatorStorePath, getCreatorStoreFromItems, getLastCreatorStore } from "../lib/creatorStoreContext";

export default function Checkout() {
  const { items, subtotal, clear } = useCart();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [selectedGateway, setSelectedGateway] = useState(null);
  const [shippingMethod, setShippingMethod] = useState("");
  const [selectedShippingMethod, setSelectedShippingMethod] = useState(null);
  const [collectionSlotId, setCollectionSlotId] = useState("");
  const [selectedCollectionSlot, setSelectedCollectionSlot] = useState(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    postal_code: "",
    country: "ZA",
  });
  const creatorStore = getCreatorStoreFromItems(items) || getLastCreatorStore();
  const shoppingPath = creatorStore ? creatorStorePath(creatorStore) : "/";
  const orderTotal = subtotal + Number(selectedShippingMethod?.amount || 0);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    if (items.length === 0) return;
    if (!shippingMethod) {
      toast.error("Choose a delivery method.");
      return;
    }
    if (!paymentMethod) {
      toast.error("Choose a payment method.");
      return;
    }
    if (shippingMethod === "creator_bulk_collection" && !collectionSlotId) {
      toast.error("Choose a collection slot.");
      return;
    }
    if (!acceptedTerms) {
      toast.error("Accept the Customer Terms, Shipping Policy and Returns Policy before placing the order.");
      return;
    }

    setLoading(true);

    try {
      const response = await http.post("/orders/checkout", {
        items: items.map((item) => ({
          id: item.id,
          product_id: item.product_id,
          product_title: item.product_title,
          band_id: item.band_id,
          variation_id: item.variation_id,
          size: item.size,
          color: item.color,
          unit_price: item.unit_price,
          quantity: item.quantity,
          mockup_url: item.mockup_url,
          customization: {
            ...(item.customization || {}),
            preview_image: item.customization?.preview_image || item.mockup_url,
            design_json: {
              ...(item.customization?.design_json || {}),
              variation_label: item.variation_label,
              attribute_values: item.attribute_values || {},
              artwork_group_id: item.artwork_group_id || null,
              artwork_group_label: item.artwork_group_label || null,
              mockup_images: item.mockup_images || [],
            },
          },
        })),
        shipping_address: form,
        shipping_method_key: shippingMethod,
        collection_slot_id: collectionSlotId || null,
        payment_provider: paymentMethod,
      });

      const data = response.data || {};

      if (paymentMethod === "mock") {
        await http.post(`/orders/${data.order_id}/mock-complete`);
        clear();
        navigate(`/order-confirmation/${data.order_id}`);
        return;
      }

      if (data.payment_action === "redirect" && data.payment_url) {
        sessionStorage.setItem("ff_pending_order_id", data.order_id || "");
        window.location.assign(data.payment_url);
        return;
      }

      clear();
      navigate(`/order-confirmation/${data.order_id}`, {
        state: {
          payment_method: paymentMethod,
          manual_payment_details: data.manual_payment_details || null,
          tracking_url: data.tracking_url || null,
          reference: data.reference || null,
        },
      });
    } catch (error) {
      toast.error(error.response?.data?.detail || "Checkout could not be completed. Your cart has been kept so you can try again.");
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen page-shell">
        <Navbar />
        <main className="pt-28 pb-16 max-w-3xl mx-auto px-4 sm:px-6 md:px-10 text-center">
          <div className="card py-16">
            <ShoppingBag className="mx-auto text-[var(--ff-primary)] mb-5" size={38} />
            <p className="overline mb-3">Checkout</p>
            <h1 className="font-display text-4xl sm:text-5xl uppercase mb-4">Your cart is empty</h1>
            <p className="text-[var(--ff-muted-text)] mb-6">Add a product before starting checkout.</p>
            <Link to={shoppingPath} className="btn-primary">
              {creatorStore ? `Return to ${creatorStore.name}` : "Return home"}
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const paymentActionLabel = selectedGateway?.display_name
    ? `Continue to ${selectedGateway.display_name}`
    : "Continue to payment";

  return (
    <div className="min-h-screen page-shell">
      <Navbar />
      <main className="pt-24 pb-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-10 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-6 lg:gap-8">
          <div>
            <div className="overline mb-2">Secure checkout</div>
            <h1 className="font-display text-3xl sm:text-5xl uppercase mb-4 sm:mb-6">Finish your order</h1>
            {creatorStore && (
              <Link to={shoppingPath} className="btn-secondary mb-6">
                Back to {creatorStore.name}
              </Link>
            )}

            <form onSubmit={submit} className="space-y-8" data-testid="checkout-form">
              <section className="card space-y-4">
                <div>
                  <p className="overline mb-2">Customer</p>
                  <h2 className="font-display text-3xl uppercase">Contact and delivery details</h2>
                  <p className="text-sm text-[var(--ff-muted-text)] mt-2">Order confirmation and delivery updates will be sent using these details.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className="label">Full name</label><input className="input-base" value={form.full_name} onChange={(event) => set("full_name", event.target.value)} required autoComplete="name" data-testid="checkout-name" /></div>
                  <div><label className="label">Email</label><input className="input-base" type="email" value={form.email} onChange={(event) => set("email", event.target.value)} required autoComplete="email" data-testid="checkout-email" /></div>
                </div>
                <div><label className="label">Phone / WhatsApp</label><input className="input-base" type="tel" value={form.phone} onChange={(event) => set("phone", event.target.value)} required autoComplete="tel" data-testid="checkout-phone" /></div>
                <div><label className="label">Street address</label><input className="input-base" value={form.line1} onChange={(event) => set("line1", event.target.value)} required autoComplete="address-line1" data-testid="checkout-line1" /></div>
                <div><label className="label">Complex, unit or additional address information</label><input className="input-base" value={form.line2} onChange={(event) => set("line2", event.target.value)} autoComplete="address-line2" data-testid="checkout-line2" /></div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div><label className="label">City / Town</label><input className="input-base" value={form.city} onChange={(event) => set("city", event.target.value)} required autoComplete="address-level2" data-testid="checkout-city" /></div>
                  <div><label className="label">Province</label><input className="input-base" value={form.state} onChange={(event) => set("state", event.target.value)} required autoComplete="address-level1" data-testid="checkout-state" /></div>
                  <div><label className="label">Postal code</label><input className="input-base" inputMode="numeric" value={form.postal_code} onChange={(event) => set("postal_code", event.target.value)} required autoComplete="postal-code" data-testid="checkout-postal" /></div>
                </div>
                <div>
                  <label className="label">Country</label>
                  <input className="input-base" value="South Africa" readOnly aria-readonly="true" />
                </div>
              </section>

              <ShippingMethodSelector
                value={shippingMethod}
                selectedSlotId={collectionSlotId}
                items={items}
                subtotal={subtotal}
                shippingAddress={form}
                onChange={(key, method) => {
                  setShippingMethod(key);
                  setSelectedShippingMethod(method || null);
                  if (key !== "creator_bulk_collection") {
                    setCollectionSlotId("");
                    setSelectedCollectionSlot(null);
                  }
                }}
                onSlotChange={(slotId, slot) => {
                  setCollectionSlotId(slotId || "");
                  setSelectedCollectionSlot(slot || null);
                }}
              />

              <PaymentMethodSelector
                value={paymentMethod}
                onChange={(key, gateway) => {
                  setPaymentMethod(key);
                  setSelectedGateway(gateway || null);
                }}
              />

              {selectedGateway?.key === "manual_eft" && (
                <div className="card border-[var(--ff-primary)]">
                  <p className="overline mb-2">Electronic funds transfer</p>
                  <p className="text-sm text-[var(--ff-muted-text)]">
                    Your order will be recorded as awaiting payment. Use the order number as the payment reference. Production starts after the payment is confirmed.
                  </p>
                </div>
              )}

              <label className="card flex gap-3 items-start text-sm text-[var(--ff-muted-text)]">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={acceptedTerms}
                  onChange={(event) => setAcceptedTerms(event.target.checked)}
                  required
                />
                <span>
                  I have checked my order and delivery details and agree to the <Link to="/terms" className="text-[var(--ff-primary)] underline">Customer Terms</Link>, <Link to="/shipping-policy" className="text-[var(--ff-primary)] underline">Shipping Policy</Link> and <Link to="/returns" className="text-[var(--ff-primary)] underline">Returns Policy</Link>. I acknowledge the <Link to="/privacy-policy" className="text-[var(--ff-primary)] underline">Privacy Policy</Link>.
                </span>
              </label>

              {(!shippingMethod || !paymentMethod || !acceptedTerms || (shippingMethod === "creator_bulk_collection" && !collectionSlotId)) && (
                <div className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-3 text-xs text-[var(--ff-muted-text)]" role="status">
                  {!shippingMethod && <div>Select a delivery method before continuing.</div>}
                  {shippingMethod === "creator_bulk_collection" && !collectionSlotId && <div>Select a collection slot before continuing.</div>}
                  {!paymentMethod && <div>Select a payment method before continuing.</div>}
                  {!acceptedTerms && <div>Accept the order and policy terms before continuing.</div>}
                </div>
              )}

              <button
                type="submit"
                className="btn-primary w-full mt-4 justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={loading || !shippingMethod || !paymentMethod || !acceptedTerms || (shippingMethod === "creator_bulk_collection" && !collectionSlotId)}
                data-testid="checkout-submit"
              >
                {loading
                  ? "Processing…"
                  : paymentMethod === "manual_eft"
                    ? `Place order — R ${orderTotal.toFixed(2)}`
                    : `${paymentActionLabel} · R ${orderTotal.toFixed(2)}`}
              </button>

              <p className="text-xs text-[var(--ff-muted-text)] flex items-center justify-center gap-2">
                <LockKeyhole size={14} /> Payment details are completed through the selected secure payment provider.
              </p>
            </form>
          </div>

          <aside className="card h-fit lg:sticky lg:top-24" data-testid="checkout-summary">
            <div className="overline mb-4">Order summary</div>
            <div className="space-y-4 mb-4">
              {items.map((item) => {
                const image = getCartImage(item);
                return (
                  <div key={item.id} className="flex gap-3 text-sm">
                    <div className="w-16 h-16 bg-[var(--ff-surface-bg)] border border-[var(--ff-card-border)] flex-shrink-0 overflow-hidden flex items-center justify-center">
                      {image ? (
                        <img src={assetUrl(image)} alt={item.product_title || "Order item"} className="w-full h-full object-contain" />
                      ) : (
                        <div className="font-display text-[var(--ff-muted-text)]">FF</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold leading-tight">{item.product_title}</div>
                      <div className="text-xs text-[var(--ff-muted-text)] mt-1">{getCartVariationLabel(item)}</div>
                      {item.artwork_group_label && <div className="text-xs text-[var(--ff-muted-text)]">{item.artwork_group_label}</div>}
                      <div className="flex justify-between mt-2">
                        <span className="text-[var(--ff-muted-text)]">× {item.quantity}</span>
                        <span>R {(Number(item.unit_price || 0) * Number(item.quantity || 0)).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-[var(--ff-card-border)] pt-4 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-[var(--ff-muted-text)]">Subtotal</span><span>R {subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-[var(--ff-muted-text)]">Delivery</span><span>{selectedShippingMethod ? (Number(selectedShippingMethod.amount || 0) === 0 ? "Free" : `R ${Number(selectedShippingMethod.amount || 0).toFixed(2)}`) : "—"}</span></div>
              {selectedCollectionSlot && (
                <div className="text-xs text-[var(--ff-muted-text)]">
                  Collection: {selectedCollectionSlot.label}
                  {selectedCollectionSlot.date ? ` · ${selectedCollectionSlot.date}` : ""}
                  {selectedCollectionSlot.start_time ? ` · ${selectedCollectionSlot.start_time}` : ""}
                </div>
              )}
              <div className="flex justify-between items-baseline border-t border-[var(--ff-card-border)] pt-3">
                <div className="overline">Total</div>
                <div className="font-display text-2xl sm:text-3xl">R {orderTotal.toFixed(2)}</div>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
