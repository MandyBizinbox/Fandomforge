import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import {
  BarChart3,
  Bell,
  Brush,
  Factory,
  Package,
  Settings,
  ShoppingBag,
  Users,
  WalletCards,
} from "lucide-react";
import DashboardLayout from "../components/DashboardLayout";
import AdminManufacturingRulesUnified from "../pages/admin/AdminManufacturingRulesUnified";

const adminLinks = [
  { type: "section", label: "Command" },
  { to: "/admin", end: true, label: "Command Center", key: "overview", icon: <BarChart3 size={14} /> },
  { to: "/admin/access", label: "Users & Access", key: "access", icon: <Users size={14} /> },
  { type: "section", label: "Accounts" },
  { to: "/admin/creators", label: "Creators", key: "creators", icon: <Users size={14} /> },
  { to: "/admin/printers-workspace", label: "Printers", key: "printers-workspace", icon: <Factory size={14} /> },
  { type: "section", label: "Operations" },
  { to: "/admin/product-templates", label: "Products & Templates", key: "product-templates", icon: <Package size={14} /> },
  { to: "/admin/artwork-review", label: "Artwork Review", key: "artwork-review", icon: <Brush size={14} /> },
  { to: "/admin/fulfilment", label: "Orders & Fulfilment", key: "fulfilment", icon: <ShoppingBag size={14} /> },
  { to: "/admin/notifications", label: "Notifications", key: "notifications", icon: <Bell size={14} /> },
  { type: "section", label: "Money" },
  { to: "/admin/billing", label: "Billing & Finance", key: "billing", icon: <WalletCards size={14} /> },
  { type: "section", label: "Settings" },
  { to: "/admin/shop-settings", label: "Shop Settings", key: "shop-settings", icon: <Settings size={14} /> },
  { to: "/admin/platform-settings", label: "Platform Settings", key: "platform-settings", icon: <Settings size={14} /> },
];

export default function AdminManufacturingRulesRoute() {
  return (
    <Routes>
      <Route element={<DashboardLayout title="Platform Admin" links={adminLinks} testidPrefix="admin-dash" notificationEndpoint="/admin/notifications" notificationPath="/admin/notifications" />}>
        <Route index element={<Navigate to="methods" replace />} />
        <Route path="methods" element={<AdminManufacturingRulesUnified activeSection="methods" />} />
        <Route path="colours" element={<AdminManufacturingRulesUnified activeSection="colours" />} />
        <Route path="settings" element={<AdminManufacturingRulesUnified activeSection="settings" />} />
        <Route path="*" element={<Navigate to="methods" replace />} />
      </Route>
    </Routes>
  );
}
