import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const CartCtx = createContext(null);
const CART_STORAGE_KEY = "ff_cart";
const LEGACY_CART_STORAGE_KEY = "mf_cart";

function makeLineKey(item) {
  return [
    item.product_id,
    item.variation_id,
    item.artwork_group_id || "default",
    item.customization ? JSON.stringify(item.customization) : "standard",
  ].join("::");
}

function readStoredCart() {
  try {
    const current = localStorage.getItem(CART_STORAGE_KEY);
    const legacy = localStorage.getItem(LEGACY_CART_STORAGE_KEY);
    const stored = JSON.parse(current || legacy || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(readStoredCart);

  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    localStorage.removeItem(LEGACY_CART_STORAGE_KEY);
  }, [items]);

  const addItem = useCallback((item) => {
    const normalized = {
      ...item,
      quantity: Math.max(1, Number(item.quantity || 1)),
    };

    setItems((previous) => {
      const key = makeLineKey(normalized);
      const existing = previous.find((row) => makeLineKey(row) === key);

      if (existing) {
        return previous.map((row) => (
          makeLineKey(row) === key
            ? { ...row, quantity: Number(row.quantity || 1) + normalized.quantity }
            : row
        ));
      }

      return [
        ...previous,
        {
          ...normalized,
          id: crypto.randomUUID(),
        },
      ];
    });
  }, []);

  const removeItem = useCallback((id) => {
    setItems((previous) => previous.filter((item) => item.id !== id));
  }, []);

  const updateQuantity = useCallback((id, quantity) => {
    setItems((previous) => previous.map((item) => (
      item.id === id
        ? { ...item, quantity: Math.max(1, Number(quantity || 1)) }
        : item
    )));
  }, []);

  const clear = useCallback(() => {
    setItems((current) => (current.length ? [] : current));
  }, []);

  const subtotal = useMemo(() => {
    return items.reduce((sum, item) => sum + Number(item.unit_price || 0) * Number(item.quantity || 0), 0);
  }, [items]);

  const value = useMemo(() => ({
    items,
    addItem,
    removeItem,
    updateQuantity,
    clear,
    subtotal,
  }), [items, addItem, removeItem, updateQuantity, clear, subtotal]);

  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}

export const useCart = () => useContext(CartCtx);
