import React from "react";
import AdminWorkspaceTabs from "./AdminWorkspaceTabs";
import PaymentGatewaySettings from "../PaymentGatewaySettings";
import ShippingSettings from "../ShippingSettings";
import EmailSettings from "../EmailSettings";

export default function ShopSettingsWorkspace({ modules = {}, user = null, mode = "admin" } = {}) {
  return (
    <div data-testid="admin-shop-settings-workspace" className="space-y-6">
      <div>
        <p className="overline mb-2">Client-facing settings</p>
        <h1 className="font-display text-5xl uppercase">Shop Settings</h1>
        <p className="text-[var(--ff-muted-text)] mt-2 max-w-3xl">These settings are safe for a platform manager/client to control: buyer payment gateways, shipping and basic shop fulfilment settings.</p>
      </div>
      <AdminWorkspaceTabs
        modules={modules}
        user={user}
        mode={mode}
        tabs={[
          { key: "checkout", label: "Checkout Payments", permission: "manage_shop_payment_gateways", element: <PaymentGatewaySettings /> },
          { key: "shipping", label: "Shipping / Fulfilment", permission: "manage_shipping", moduleKey: "shipping_enabled", element: <ShippingSettings /> },
          { key: "email", label: "Email", permission: "manage_orders", element: <EmailSettings /> },
        ]}
      />
    </div>
  );
}
