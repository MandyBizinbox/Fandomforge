import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const CartCtx = createContext(null);

function makeLineKey(item) {
  return [
    item.product_id,
    item.variation_id,
    item.artwork_group_id || "default",
    item.customization ? JSON.stringify(item.customization) : "standard",
  ].join("::");
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("mf_cart") || "[]");
      return Array.isArray(stored) ? stored : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem("mf_cart", JSON.stringify(items));
  }, [items]);

  const addItem = (item) => {
    const normalized = {
      ...item,
      quantity: Math.max(1, Number(item.quantity || 1)),
    };

    setItems((prev) => {
      const key = makeLineKey(normalized);
      const existing = prev.find((row) => makeLineKey(row) === key);

      if (existing) {
        return prev.map((row) => (
          makeLineKey(row) === key
            ? { ...row, quantity: Number(row.quantity || 1) + normalized.quantity }
            : row
        ));
      }

      return [
        ...prev,
        {
          ...normalized,
          id: crypto.randomUUID(),
        },
      ];
    });
  };

  const removeItem = (id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const updateQuantity = (id, qty) => {
    setItems((prev) => prev.map((item) => (
      item.id === id
        ? { ...item, quantity: Math.max(1, Number(qty || 1)) }
        : item
    )));
  };

  const clear = () => setItems([]);

  const subtotal = useMemo(() => {
    return items.reduce((sum, item) => sum + Number(item.unit_price || 0) * Number(item.quantity || 0), 0);
  }, [items]);

  return (
    <CartCtx.Provider value={{ items, addItem, removeItem, updateQuantity, clear, subtotal }}>
      {children}
    </CartCtx.Provider>
  );
}

export const useCart = () => useContext(CartCtx);
