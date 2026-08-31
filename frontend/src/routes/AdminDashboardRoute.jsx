import React from "react";
import { useLocation } from "react-router-dom";
import AdminDashboard from "../pages/AdminDashboard";
import AdminTemplateStudioRoute from "./AdminTemplateStudioRoute";
import AdminProductSystemRoute from "./AdminProductSystemRoute";
import AdminPlatformSettingsRoute from "./AdminPlatformSettingsRoute";
import "../components/product-builder/productBuilderStudioViewport.css";
import "../components/product-builder/productBuilderTextColourRuntime";
import "../components/admin/adminManufacturingRulesThemeRuntime";

function adminDashboardKey(pathname) {
  const path = String(pathname || "").replace(/\/+$/, "");
  return /^\/admin\/products\/(?:new|[^/]+)$/.test(path)
    ? path
    : "admin-dashboard";
}

function isTemplateStudioPath(pathname) {
  return /^\/admin\/product-templates\/(?:new|[^/]+)(?:\/[^/]+)?\/?$/.test(String(pathname || ""));
}

function isProductSystemPath(pathname) {
  const path = String(pathname || "").replace(/\/+$/, "");
  return new Set([
    "/admin/product-templates",
    "/admin/product-types",
    "/admin/products",
    "/admin/categories",
    "/admin/attributes",
    "/admin/print-options",
  ]).has(path);
}

function isPlatformSettingsPath(pathname) {
  return /^\/admin\/platform-settings(?:\/(?:general|package|branding|homepage|homepage-builder|signup|legal))?\/?$/.test(String(pathname || ""));
}

export default function AdminDashboardRoute() {
  const location = useLocation();

  if (isTemplateStudioPath(location.pathname)) {
    return <AdminTemplateStudioRoute />;
  }

  if (isProductSystemPath(location.pathname)) {
    return <AdminProductSystemRoute />;
  }

  if (isPlatformSettingsPath(location.pathname)) {
    return <AdminPlatformSettingsRoute />;
  }

  return <AdminDashboard key={adminDashboardKey(location.pathname)} />;
}
