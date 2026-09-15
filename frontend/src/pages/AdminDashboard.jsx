import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import AdminOverview from "../components/admin/dashboard/AdminOverview";
import AdminActivityPage from "../components/admin/dashboard/AdminActivityPage";
import AdminNotificationsPage from "../components/admin/dashboard/AdminNotificationsPage";
import BillingFinanceWorkspace from "../components/admin/workspaces/BillingFinanceWorkspace";
import ShopSettingsWorkspace from "../components/admin/workspaces/ShopSettingsWorkspace";
import PlatformSettingsWorkspace from "../components/admin/workspaces/PlatformSettingsWorkspace";
import ProductsTemplatesWorkspace from "../components/admin/products/ProductsTemplatesWorkspace";
import { filterAdminLinks } from "../components/admin/dashboard/adminNavigation";
import AdminFulfilmentRoute from "../components/admin/fulfilment/AdminFulfilmentRoute";
import AdminPrintersWorkspace from "../components/admin/printers/AdminPrintersWorkspace";
import AdminCreatorsWorkspace from "../components/admin/creators/AdminCreatorsWorkspace";
import ProductBuilder from "../components/product-builder/ProductBuilder";
import OrderDetail from "../components/OrderDetail";
import ProductTemplateStudioPage from "../components/template-studio/ProductTemplateStudioPage";
import ProductTypeStudioPage from "../components/template-studio/ProductTypeStudioPage";
import ArtworkReviewAdmin from "../components/admin/ArtworkReviewAdmin";
import QuickProductCreator from "../components/admin/QuickProductCreator";
import UserAccessAdmin from "../components/admin/UserAccessAdmin";
import { http } from "../lib/api";

export default function AdminDashboard({ mode = "admin", basePath = "/admin", title = "Platform Admin" } = {}) {
  const { user } = useAuth();
  const [platformConfig, setPlatformConfig] = useState(null);
  const [artworkReviewPendingCount, setArtworkReviewPendingCount] = useState(0);

  useEffect(() => {
    http.get("/admin/platform-config").then((r) => setPlatformConfig(r.data)).catch(() => setPlatformConfig({ modules: {} }));
  }, []);

  const refreshArtworkReviewPendingCount = useCallback(async () => {
    const modules = platformConfig?.modules || {};
    const isManager = mode === "manager" || user?.role === "manager";
    const managerCanReview = !isManager || user?.manager_permissions?.manage_artwork_review !== false;
    if (modules.artwork_review_enabled === false || !managerCanReview) {
      setArtworkReviewPendingCount(0);
      return;
    }

    try {
      const response = await http.get("/admin/artwork-review?status=pending_review");
      setArtworkReviewPendingCount(Number(response.data?.counts?.pending_review ?? response.data?.items?.length ?? 0));
    } catch (error) {
      console.warn("Could not load artwork review pending count", error);
      setArtworkReviewPendingCount(0);
    }
  }, [mode, platformConfig?.modules, user?.manager_permissions?.manage_artwork_review, user?.role]);

  useEffect(() => {
    refreshArtworkReviewPendingCount();
  }, [refreshArtworkReviewPendingCount]);

  useEffect(() => {
    const handleArtworkReviewCount = (event) => {
      const pending = event?.detail?.pending_review;
      if (Number.isFinite(Number(pending))) {
        setArtworkReviewPendingCount(Number(pending));
        return;
      }
      refreshArtworkReviewPendingCount();
    };

    window.addEventListener("fandomforge:artwork-review-count-refresh", handleArtworkReviewCount);
    return () => window.removeEventListener("fandomforge:artwork-review-count-refresh", handleArtworkReviewCount);
  }, [refreshArtworkReviewPendingCount]);

  const visibleLinks = useMemo(() => (
    filterAdminLinks({ modules: platformConfig?.modules || {}, user, basePath, mode }).map((link) => {
      if (link.key !== "artwork-review") return link;
      return {
        ...link,
        badgeCount: artworkReviewPendingCount,
      };
    })
  ), [artworkReviewPendingCount, basePath, mode, platformConfig?.modules, user]);

  return (
    <Routes>
      <Route element={<DashboardLayout title={title} links={visibleLinks} testidPrefix={mode === "manager" ? "manager-dash" : "admin-dash"} notificationEndpoint="/admin/notifications" notificationPath={`${basePath}/notifications`} />}>
        <Route index element={<AdminOverview />} />
        <Route path="access" element={<UserAccessAdmin />} />
        <Route path="creators/*" element={<AdminCreatorsWorkspace modules={platformConfig?.modules || {}} user={user} mode={mode} basePath={basePath} />} />
        <Route path="printers-workspace/*" element={<AdminPrintersWorkspace modules={platformConfig?.modules || {}} user={user} mode={mode} basePath={basePath} />} />
        <Route path="product-templates" element={<ProductsTemplatesWorkspace modules={platformConfig?.modules || {}} user={user} mode={mode} />} />
        <Route path="fulfilment/*" element={<AdminFulfilmentRoute modules={platformConfig?.modules || {}} user={user} mode={mode} basePath={basePath} />} />
        <Route path="billing" element={<BillingFinanceWorkspace modules={platformConfig?.modules || {}} user={user} mode={mode} />} />
        <Route path="shop-settings" element={<ShopSettingsWorkspace modules={platformConfig?.modules || {}} user={user} mode={mode} />} />
        <Route path="platform-settings" element={<PlatformSettingsWorkspace modules={platformConfig?.modules || {}} user={user} mode={mode} />} />

        {/* Legacy direct routes kept for deep links and fast operational access. */}
        <Route path="printers" element={<Navigate to={`${basePath}/printers-workspace`} replace />} />
        <Route path="product-types/new" element={<ProductTypeStudioPage />} />
        <Route path="product-types/:id" element={<ProductTypeStudioPage />} />
        <Route path="product-templates/new" element={<ProductTemplateStudioPage />} />
        <Route path="product-templates/:id" element={<ProductTemplateStudioPage />} />
        <Route path="products" element={<Navigate to={`${basePath}/product-templates`} replace />} />
        <Route path="simple-products/new" element={<QuickProductCreator />} />
        <Route path="products/new" element={<ProductBuilder mode="admin" backTo="/admin/products" />} />
        <Route path="products/:id" element={<ProductBuilder mode="admin" backTo="/admin/products" />} />
        <Route path="artwork-review" element={<ArtworkReviewAdmin />} />
        <Route path="categories" element={<Navigate to={`${basePath}/product-templates`} replace />} />
        <Route path="attributes" element={<Navigate to={`${basePath}/product-templates`} replace />} />
        <Route path="print-options" element={<Navigate to={`${basePath}/product-templates`} replace />} />
        <Route path="orders" element={<Navigate to={`${basePath}/fulfilment`} replace />} />
        <Route path="notifications" element={<AdminNotificationsPage />} />
        <Route path="activity" element={<AdminActivityPage />} />
        <Route path="production" element={<Navigate to={`${basePath}/fulfilment`} replace />} />
        <Route path="printer-pricing" element={<Navigate to={`${basePath}/printers-workspace`} replace />} />
        <Route path="orders/new" element={<Navigate to={`${basePath}/fulfilment/manual`} replace />} />
        <Route path="orders/:id" element={<OrderDetail mode="admin" backTo="/admin/orders" testidPrefix="admin-order" />} />
        <Route path="commissions" element={<Navigate to={`${basePath}/billing`} replace />} />
        <Route path="paystack-payouts" element={<Navigate to={`${basePath}/billing`} replace />} />
        <Route path="settings" element={<Navigate to={`${basePath}/platform-settings`} replace />} />
      </Route>
    </Routes>
  );
}
