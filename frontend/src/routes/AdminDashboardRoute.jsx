import React from "react";
import { useLocation } from "react-router-dom";
import AdminDashboard from "../pages/AdminDashboard";
import "../components/product-builder/productBuilderStudioViewport.css";
import "../components/product-builder/productBuilderV2Runtime";
import "../components/product-builder/productBuilderPricingSimplificationRuntime";
import "../components/product-builder/productBuilderTextColourRuntime";
import "../components/product-builder/productBuilderDraftButtonRuntime";
import "../components/admin/adminManufacturingRulesThemeRuntime";
import "../components/admin/legacyPrintOptionCostingSeedRuntime";

function adminDashboardKey(pathname) {
  const path = String(pathname || "").replace(/\/+$/, "");
  return /^\/admin\/products\/(?:new|[^/]+)$/.test(path)
    ? path
    : "admin-dashboard";
}

export default function AdminDashboardRoute() {
  const location = useLocation();
  return <AdminDashboard key={adminDashboardKey(location.pathname)} />;
}
