import React, { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";
import AdminDashboard from "../pages/AdminDashboard";
import AdminTemplateStudioRoute from "./AdminTemplateStudioRoute";
import "../components/product-builder/productBuilderStudioViewport.css";
import "../components/product-builder/productBuilderV2Runtime";
import "../components/product-builder/productBuilderPricingSimplificationRuntime";
import "../components/product-builder/productBuilderTextColourRuntime";
import "../components/product-builder/productBuilderDraftButtonRuntime";
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

function activateTemplatesWorkspaceTab() {
  const workspace = document.querySelector('[data-testid="admin-product-templates-workspace"]');
  if (!workspace) return false;

  const templatesTab = Array.from(workspace.querySelectorAll("button")).find(
    (button) => String(button.textContent || "").trim() === "Templates"
  );

  if (!templatesTab) return false;
  templatesTab.click();
  return true;
}

export default function AdminDashboardRoute() {
  const location = useLocation();

  useLayoutEffect(() => {
    const path = String(location.pathname || "").replace(/\/+$/, "");
    if (path !== "/admin/product-templates") return undefined;

    if (activateTemplatesWorkspaceTab()) return undefined;

    const observer = new MutationObserver(() => {
      if (activateTemplatesWorkspaceTab()) observer.disconnect();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [location.pathname]);

  if (isTemplateStudioPath(location.pathname)) {
    return <AdminTemplateStudioRoute />;
  }

  return <AdminDashboard key={adminDashboardKey(location.pathname)} />;
}
