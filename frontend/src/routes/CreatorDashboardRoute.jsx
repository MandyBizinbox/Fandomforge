import React, { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import {
  BarChart3,
  Bell,
  Clock3,
  DollarSign,
  Package,
  Settings as SettingsIcon,
  ShoppingBag,
} from "lucide-react";
import DashboardLayout from "../components/DashboardLayout";
import CreatorFinance from "../pages/CreatorFinance";
import BandDashboard from "../pages/BandDashboard";
import "../components/product-builder/productBuilderStudioViewport.css";
import "../components/product-builder/productBuilderV2Runtime";
import "../components/product-builder/productBuilderPricingSimplificationRuntime";
import "../components/product-builder/productBuilderTextColourRuntime";
import "../components/product-builder/productBuilderDraftButtonRuntime";

const financeLinks = [
  { type: "section", label: "Command" },
  { to: "/creator", end: true, label: "Overview", key: "overview", icon: <BarChart3 size={14} /> },
  { type: "section", label: "Storefront" },
  { to: "/creator/products", label: "Products", key: "products", icon: <Package size={14} /> },
  { to: "/creator/settings", label: "Settings", key: "settings", icon: <SettingsIcon size={14} /> },
  { type: "section", label: "Orders" },
  { to: "/creator/orders", label: "Orders", key: "orders", icon: <ShoppingBag size={14} /> },
  { to: "/creator/notifications", label: "Notifications", key: "notifications", icon: <Bell size={14} /> },
  { to: "/creator/activity", label: "Activity", key: "activity", icon: <Clock3 size={14} /> },
  { type: "section", label: "Money" },
  { to: "/creator/earnings", label: "Earnings & Reports", key: "earnings", icon: <DollarSign size={14} /> },
];

function CreatorFinanceDashboard() {
  return (
    <Routes>
      <Route
        element={(
          <DashboardLayout
            title="Creator Console"
            links={financeLinks}
            testidPrefix="creator-dash"
            notificationEndpoint="/creator-dash/notifications"
            notificationPath="/creator/notifications"
          />
        )}
      >
        <Route path="earnings" element={<CreatorFinance />} />
      </Route>
    </Routes>
  );
}

function updateCreatorFinanceNavigationLabel() {
  const link = document.querySelector('[data-testid="creator-dash-nav-earnings"]');
  if (!link) return;
  link.setAttribute("title", "Earnings & Reports");
  const text = [...link.querySelectorAll("span")].find((element) => element.classList.contains("hidden"));
  if (text && text.textContent !== "Earnings & Reports") text.textContent = "Earnings & Reports";
}

function creatorDashboardKey(pathname) {
  const path = String(pathname || "").replace(/\/+$/, "");
  return /^\/creator\/products\/(?:new|[^/]+)$/.test(path)
    ? path
    : "creator-dashboard";
}

export default function CreatorDashboardRoute() {
  const location = useLocation();

  useEffect(() => {
    updateCreatorFinanceNavigationLabel();
    const observer = new MutationObserver(updateCreatorFinanceNavigationLabel);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [location.pathname]);

  const path = location.pathname.replace(/\/+$/, "");
  if (path === "/creator/earnings") return <CreatorFinanceDashboard />;
  return <BandDashboard key={creatorDashboardKey(path)} />;
}
