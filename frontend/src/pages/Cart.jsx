import React from "react";
import { Link, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import { useCart } from "../context/CartContext";
import { assetUrl } from "../lib/api";
import { ShoppingBag, Trash2 } from "lucide-react";
import { getCartImage, getCartVariationLabel } from "../components/product/productDisplayUtils";
import { creatorStorePath, getCreatorStoreFromItems, getLastCreatorStore } from "../lib/creatorStoreContext";

export default function Cart() {
  const { items, removeItem, updateQuantity, subtotal } = useCart();
  const navigate = useNavigate();
  const creatorStore = getCreatorStoreFromItems(items) || getLastCreatorStore();
  const shoppingPath = creatorStore ? creatorStorePath(creatorStore) : "/";

  return (
    <div className="min-h-screen page-shell">
      <Navbar />
      <main className="pt-24 pb-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 md:px-10">
          <div className="overline mb-2">Your order</div>
          <h1 className="font-display text-3xl sm:text-6xl uppercase mb-4 sm:mb-6">Cart</h1>

          {items.length > 0 && creatorStore && (
            <Link to={shoppingPath} className="btn-secondary mb-6">
              Continue shopping at {creatorStore.name}
            </Link>
          )}

          {items.length === 0 ? (
            <div className="card text-center py-16 sm:py-20" data-testid="cart-empty">
              <ShoppingBag className="mx-auto text-[var(--ff-primary)] mb-5" size={38} />
              <div className="overline mb-3">Your cart is empty</div>
              <p className="text-[var(--ff-muted-text)] mb-6">
                Add a product from a creator store to begin your order.
              </p>
              <Link to={shoppingPath} className="btn-primary" data-testid="cart-shop-btn">
                {creatorStore ? `Return to ${creatorStore.name}` : "Return home"}
              </Link>
            </div>
          ) : (
            <>
              <div className="border border-[var(--ff-card-border)] divide-y divide-[var(--ff-card-border)]" data-testid="cart-items">
                {items.map((item) => {
                  const image = getCartImage(item);
                  const variationLabel = getCartVariationLabel(item);

                  return (
                    <div key={item.id} className="flex flex-col sm:flex-row sm:items-center items-start gap-4 p-4" data-testid={`cart-item-${item.id}`}>
                      <div className="w-full sm:w-24 h-40 sm:h-24 bg-[var(--ff-surface-bg)] border border-[var(--ff-card-border)] flex-shrink-0 flex items-center justify-center overflow-hidden">
                        {image ? (
                          <img src={assetUrl(image)} alt={item.product_title || "Cart item"} className="w-full h-full object-contain" />
                        ) : (
                          <div className="font-display text-2xl text-[var(--ff-muted-text)]">FF</div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <h2 className="font-display text-base sm:text-xl uppercase leading-tight max-w-full" style={{ overflowWrap: "anywhere" }}>{item.product_title}</h2>
                        <div className="overline mt-2 text-[var(--ff-muted-text)]">{variationLabel}</div>
                        {item.artwork_group_label && (
                          <div className="text-xs text-[var(--ff-muted-text)] mt-1">Artwork: {item.artwork_group_label}</div>
                        )}
                        {item.customization && (
                          <div className="text-xs text-[var(--ff-primary)] mt-1 uppercase tracking-widest">Customised</div>
                        )}
                      </div>

                      <div className="inline-flex border border-[var(--ff-card-border)]" aria-label={`Quantity for ${item.product_title}`}>
                        <button type="button" aria-label="Decrease quantity" onClick={() => updateQuantity(item.id, item.quantity - 1)} className="px-3 py-1 hover:bg-[var(--ff-button-primary-bg)] hover:text-[var(--ff-button-primary-text)]" data-testid={`cart-minus-${item.id}`}>−</button>
                        <span className="px-4 py-1 min-w-[30px] text-center">{item.quantity}</span>
                        <button type="button" aria-label="Increase quantity" onClick={() => updateQuantity(item.id, item.quantity + 1)} className="px-3 py-1 hover:bg-[var(--ff-button-primary-bg)] hover:text-[var(--ff-button-primary-text)]" data-testid={`cart-plus-${item.id}`}>+</button>
                      </div>

                      <div className="font-bold w-full sm:w-24 text-left sm:text-right">R {(Number(item.unit_price || 0) * Number(item.quantity || 0)).toFixed(2)}</div>
                      <button type="button" aria-label={`Remove ${item.product_title} from cart`} onClick={() => removeItem(item.id)} className="p-2 hover:text-[var(--ff-primary)]" data-testid={`cart-remove-${item.id}`}><Trash2 size={16} /></button>
                    </div>
                  );
                })}
              </div>

              <div className="mt-8 flex flex-col sm:flex-row sm:items-center sm:justify-between items-start gap-3">
                <div className="text-sm text-[var(--ff-muted-text)]">Subtotal before delivery</div>
                <div className="font-display text-4xl" data-testid="cart-subtotal">R {subtotal.toFixed(2)}</div>
              </div>

              <button type="button" onClick={() => navigate("/checkout")} className="btn-primary w-full mt-6 justify-center" data-testid="cart-checkout-btn">
                Continue to checkout — R {subtotal.toFixed(2)}
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
