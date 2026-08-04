import React from "react";
import { Route, Routes } from "react-router-dom";
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
import ProductTemplateStudioV3Page from "../components/template-studio/ProductTemplateStudioV3Page";
import "../components/template-studio/templateStudioV3Compatibility.css";

const links = [
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

export default function AdminTemplateStudioRoute() {
  return (
    <Routes>
      <Route element={<DashboardLayout title="Platform Admin" links={links} testidPrefix="admin-dash" notificationEndpoint="/admin/notifications" notificationPath="/admin/notifications" />}>
        <Route path="product-templates/new/:section?" element={<ProductTemplateStudioV3Page />} />
        <Route path="product-templates/:id/:section?" element={<ProductTemplateStudioV3Page />} />
      </Route>
    </Routes>
  );
}
