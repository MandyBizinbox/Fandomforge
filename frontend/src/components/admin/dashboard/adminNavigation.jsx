import React from "react";
import { BarChart3, Users, Factory, Package, ShoppingBag, Settings as SettingsIcon, Image as ImageIcon, Clock3, Bell, WalletCards } from "lucide-react";

export function buildAdminLinks(basePath = "/admin") {
  return [
    { type: "section", label: "Command" },
    { to: basePath, end: true, label: "Command Center", key: "overview", permission: "manage_reports", icon: <BarChart3 size={14} /> },
    { to: `${basePath}/access`, label: "Users & Access", key: "access", permission: "manage_users", icon: <Users size={14} /> },

    { type: "section", label: "Accounts" },
    { to: `${basePath}/creators`, label: "Creators", key: "creators", permission: "manage_bands", icon: <Users size={14} /> },
    { to: `${basePath}/printers-workspace`, label: "Printers", key: "printers-workspace", permission: "manage_printers", icon: <Factory size={14} /> },

    { type: "section", label: "Operations" },
    { to: `${basePath}/product-templates`, label: "Products & Templates", key: "product-templates", permission: "manage_product_templates", icon: <Package size={14} /> },
      { to: `${basePath}/artwork-review`, label: "Artwork Review", key: "artwork-review", permission: "manage_artwork_review", icon: <ImageIcon size={14} /> },
    { to: `${basePath}/fulfilment`, label: "Orders & Fulfilment", key: "fulfilment", permission: "manage_orders", icon: <ShoppingBag size={14} /> },
    { to: `${basePath}/notifications`, label: "Notifications", key: "notifications", permission: "manage_orders", icon: <Bell size={14} /> },
    { to: `${basePath}/activity`, label: "Activity", key: "activity", permission: "manage_reports", icon: <Clock3 size={14} /> },

    { type: "section", label: "Money" },
    { to: `${basePath}/billing`, label: "Billing & Finance", key: "billing", permission: "manage_subscriptions", icon: <WalletCards size={14} /> },

    { type: "section", label: "Settings" },
    { to: `${basePath}/shop-settings`, label: "Shop Settings", key: "shop-settings", permission: "manage_shop_payment_gateways", icon: <SettingsIcon size={14} /> },
    { to: `${basePath}/platform-settings`, label: "Platform Settings", key: "platform-settings", ownerOnly: true, icon: <SettingsIcon size={14} /> },
  ];
}

export function filterAdminLinks({ modules = {}, user = null, basePath = "/admin", mode = "admin" } = {}) {
  const isManager = mode === "manager" || user?.role === "manager";
  const managerPermissions = user?.manager_permissions || {};

  const filtered = buildAdminLinks(basePath).filter((link) => {
    if (link.type === "section") return true;

    if (isManager) {
      if (link.ownerOnly) return false;
      if (link.permission && managerPermissions[link.permission] === false) return false;
    }

    if (link.key === "printers-workspace") return modules.printers_enabled !== false && modules.printer_marketplace_enabled !== false;
    if (link.key === "billing") return modules.payouts_enabled !== false || modules.creator_subscriptions_enabled !== false || modules.printer_subscriptions_enabled !== false;
    if (link.key === "product-templates") return modules.product_templates_enabled !== false;
    if (link.key === "artwork-review") return modules.artwork_review_enabled !== false;
    return true;
  });

  return filtered.filter((link, index) => {
    if (link.type !== "section") return true;
    const next = filtered[index + 1];
    return next && next.type !== "section";
  });
}
