import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import DashboardLayout from "../components/DashboardLayout";
import AdminOverview from "../components/admin/dashboard/AdminOverview";
import AdminWorkspaceTabs from "../components/admin/workspaces/AdminWorkspaceTabs";
import BillingFinanceWorkspace from "../components/admin/workspaces/BillingFinanceWorkspace";
import ShopSettingsWorkspace from "../components/admin/workspaces/ShopSettingsWorkspace";
import PlatformSettingsWorkspace from "../components/admin/workspaces/PlatformSettingsWorkspace";
import ProductsTemplatesWorkspace from "../components/admin/products/ProductsTemplatesWorkspace";
import { filterAdminLinks } from "../components/admin/dashboard/adminNavigation";
import LegacyPrintersAdmin from "../components/admin/legacy/LegacyPrintersAdmin";
import AdminFulfilmentRoute from "../components/admin/fulfilment/AdminFulfilmentRoute";
import AdminPrintersWorkspace from "../components/admin/printers/AdminPrintersWorkspace";
import AdminCreatorsWorkspace from "../components/admin/creators/AdminCreatorsWorkspace";
import ProductBuilder from "../components/product-builder/ProductBuilder";
import ProductionJobCard from "../components/production/ProductionJobCard";
import OrderDetail from "../components/OrderDetail";
import ProductTemplateStudioPage from "../components/template-studio/ProductTemplateStudioPage";
import ProductTypeStudioPage from "../components/template-studio/ProductTypeStudioPage";
import ArtworkReviewAdmin from "../components/admin/ArtworkReviewAdmin";
import QuickProductCreator from "../components/admin/QuickProductCreator";
import ActivityTimeline from "../components/activity/ActivityTimeline";
import NotificationList from "../components/notifications/NotificationList";
import PaystackPayoutsAdmin from "../components/admin/PaystackPayoutsAdmin";
import PaymentGatewaySettings from "../components/admin/PaymentGatewaySettings";
import EmailSettings from "../components/admin/EmailSettings";
import ShippingSettings from "../components/admin/ShippingSettings";
import FeaturePackageSettings from "../components/admin/FeaturePackageSettings";
import SubscriptionManagerAdmin from "../components/admin/SubscriptionManagerAdmin";
import SubscriptionBillingSettings from "../components/admin/SubscriptionBillingSettings";
import InstanceBrandingSettings from "../components/admin/InstanceBrandingSettings";
import UserAccessAdmin from "../components/admin/UserAccessAdmin";
import AttributeVariationEditor from "../components/AttributeVariationEditor";
import { http } from "../lib/api";
import StatusBadge from "../components/StatusBadge";
import { toast } from "sonner";
import {
  Users,
  Package,
  Percent,
  Plus,
} from "lucide-react";

function splitCsv(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function money(value) {
  return `R ${Number(value || 0).toFixed(2)}`;
}

function ProductFormAdmin() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;
  const [creators, setBands] = useState([]), [printers, setPrinters] = useState([]), [categories, setCategories] = useState([]), [attributes, setAttributes] = useState([]);
  const [form, setForm] = useState({ band_id: "", assigned_printer_id: "", title: "", description: "", category: "", selling_price: 35, print_cost: 12, mockup_images: "", customization_enabled: false, published: false });
  const [variations, setVariations] = useState([]), [attributeIds, setAttributeIds] = useState([]), [specAttributes, setSpecAttributes] = useState({});
  useEffect(() => { http.get("/admin/creators").then((r) => setBands(r.data)); http.get("/printers").then((r) => setPrinters(r.data)); http.get("/categories").then((r) => setCategories(r.data)); http.get("/attributes").then((r) => setAttributes(r.data)); if (!isNew) http.get(`/products/${id}`).then((r) => { setForm({ band_id: r.data.band_id, assigned_printer_id: r.data.assigned_printer_id || "", title: r.data.title, description: r.data.description || "", category: r.data.category, selling_price: r.data.selling_price, print_cost: r.data.print_cost, mockup_images: (r.data.mockup_images || []).join(", "), customization_enabled: r.data.customization_enabled, published: r.data.published }); setVariations(r.data.variations || []); setAttributeIds(r.data.attribute_ids || []); setSpecAttributes(r.data.spec_attributes || {}); }); }, [id, isNew]);
  const save = async (e) => { e.preventDefault(); if (isNew && !form.band_id) { toast.error("Pick a creator"); return; } const payload = { title: form.title, description: form.description, category: form.category, selling_price: Number(form.selling_price), print_cost: Number(form.print_cost), mockup_images: splitCsv(form.mockup_images), customization_enabled: form.customization_enabled, published: form.published, variations, attribute_ids: attributeIds, spec_attributes: specAttributes }; try { if (isNew) { const r = await http.post("/admin/products", { ...payload, band_id: form.band_id, assigned_printer_id: form.assigned_printer_id || null }); toast.success("Product created"); navigate(`/admin/products/${r.data.id}`); } else { await http.patch(`/products/${id}`, payload); toast.success("Saved"); } } catch (e) { toast.error(e.response?.data?.detail || "Failed"); } };
  return <div data-testid="admin-product-form"><div className="overline mb-2">{isNew ? "Create" : "Edit"}</div><h1 className="font-display text-5xl uppercase mb-8">{isNew ? "New Product" : form.title || "Edit"}</h1><form onSubmit={save} className="grid grid-cols-1 lg:grid-cols-2 gap-6"><div className="space-y-4"><div><label className="label">Creator</label><select className="input-base" value={form.band_id} disabled={!isNew} onChange={(e) => setForm({ ...form, band_id: e.target.value })} required><option value="">— pick —</option>{creators.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div><div><label className="label">Assigned printer</label><select className="input-base" value={form.assigned_printer_id} onChange={(e) => setForm({ ...form, assigned_printer_id: e.target.value })}><option value="">— auto —</option>{printers.map((p) => <option key={p.id} value={p.id}>{p.company_name}</option>)}</select></div><input className="input-base" required placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /><textarea className="input-base" rows={4} placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /><select className="input-base" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required><option value="">— category —</option>{categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}</select><div className="grid grid-cols-2 gap-4"><input type="number" step="0.01" className="input-base" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: e.target.value })} /><input type="number" step="0.01" className="input-base" value={form.print_cost} onChange={(e) => setForm({ ...form, print_cost: e.target.value })} /></div><input className="input-base" placeholder="Mockup URLs" value={form.mockup_images} onChange={(e) => setForm({ ...form, mockup_images: e.target.value })} /><label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={form.customization_enabled} onChange={(e) => setForm({ ...form, customization_enabled: e.target.checked })} /> Allow buyer customization</label><label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} /> Publish</label></div><div className="space-y-4"><AttributeVariationEditor allAttributes={attributes} attributeIds={attributeIds} onAttributeIdsChange={setAttributeIds} variations={variations} onVariationsChange={setVariations} specAttributes={specAttributes} onSpecChange={setSpecAttributes} /><button type="submit" className="btn-primary w-full">{isNew ? "Create product" : "Save"}</button></div></form></div>;
}


function ProductionAdmin() {
  const [jobs, setJobs] = useState([]);
  const [status, setStatus] = useState("all");
  const [printers, setPrinters] = useState([]);

  const load = () => {
    const qs = status !== "all" ? `?status=${status}` : "";
    http.get(`/admin/production-jobs${qs}`).then((r) => setJobs(Array.isArray(r.data) ? r.data : [])).catch(() => setJobs([]));
  };

  useEffect(() => {
    load();
    http.get("/printers").then((r) => setPrinters(Array.isArray(r.data) ? r.data : [])).catch(() => setPrinters([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const reassignOrder = async (orderId, printerId) => {
    try {
      await http.post(`/orders/${orderId}/assign-printer?printer_id=${printerId}`);
      toast.success("Printer reassigned");
      load();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not reassign printer");
    }
  };

  const autoAssignOrder = async (orderId) => {
    try {
      await http.post(`/admin/orders/${orderId}/auto-assign-printers`);
      toast.success("Best available printer assigned from pricing table");
      load();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Could not auto-assign printer");
    }
  };

  return (
    <div data-testid="admin-production-page">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-8">
        <div>
          <div className="overline mb-2">Fulfilment</div>
          <h1 className="font-display text-5xl uppercase">Production Jobs</h1>
        </div>
        <select className="input-base md:w-56" value={status} onChange={(e) => setStatus(e.target.value)}>
          {['all', 'pending', 'accepted', 'in_production', 'ready', 'shipped', 'delivered'].map((item) => (
            <option key={item} value={item}>{item.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>
      <div className="grid gap-4">
        {jobs.map((job) => (
          <div key={`${job.order_id}-${job.item_id}`} className="grid gap-3 lg:grid-cols-[1fr_280px]">
            <ProductionJobCard job={job} basePath="/admin/orders" />
            <div className="border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] p-4">
              <div className="overline mb-3">Admin Controls</div>
              <div className="text-xs text-[var(--ff-muted-text)] mb-2">Current printer: <span className="text-[var(--ff-card-text)]">{job.printer_name || 'Unassigned'}</span></div>
              <button type="button" onClick={() => autoAssignOrder(job.order_id)} className="btn-primary w-full mb-3 text-xs">Auto-assign best price</button>
              <select className="input-base text-sm" value="" onChange={(e) => e.target.value && reassignOrder(job.order_id, e.target.value)}>
                <option value="">Assign/Reassign printer</option>
                {printers.map((printer) => <option key={printer.id} value={printer.id}>{printer.company_name}</option>)}
              </select>
              <div className="mt-3 text-xs text-[var(--ff-muted-text)]">
                Creator profit: {money(job.band_earnings)}<br />
                Commission: {money(job.commission_amount)}<br />
                Printer payout: {money(job.printer_payout)}
              </div>
            </div>
          </div>
        ))}
        {jobs.length === 0 && <div className="card text-center text-[var(--ff-muted-text)] overline">No production jobs</div>}
      </div>
    </div>
  );
}


function AdminNotifications() {
  return <NotificationList endpoint="/admin/notifications" title="Notifications" subtitle="Admin workflow alerts, artwork reviews, production updates and internal notes" />;
}

function ActivityAdmin() {
  return (
    <div data-testid="admin-activity-page">
      <div className="overline mb-2">Platform</div>
      <h1 className="font-display text-5xl uppercase mb-8">Activity Log</h1>
      <ActivityTimeline endpoint="/admin/activity-log" title="Recent Platform Activity" canAddNote={false} />
    </div>
  );
}

function CreatorsWorkspace({ modules = {}, user = null, mode = "admin" } = {}) {
  return (
    <div data-testid="admin-creators-workspace" className="space-y-6">
      <div>
        <p className="overline mb-2">Accounts</p>
        <h1 className="font-display text-5xl uppercase">Creators</h1>
        <p className="text-[var(--ff-muted-text)] mt-2 max-w-3xl">Creator accounts, users, products, orders, subscriptions, payouts and artwork review are grouped here so manager workflows stay account-focused.</p>
      </div>
      <AdminWorkspaceTabs
        modules={modules}
        user={user}
        mode={mode}
        tabs={[
          { key: "accounts", label: "Accounts", permission: "manage_bands", element: <BandsAdmin /> },
          { key: "users", label: "Creator Users", permission: "manage_band_users", element: <UserAccessAdmin /> },
          { key: "products", label: "Products", permission: "manage_products", element: <ProductsAdmin /> },
          { key: "artwork", label: "Artwork Review", permission: "manage_artwork_review", moduleKey: "artwork_review_enabled", element: <ArtworkReviewAdmin /> },
          { key: "subscriptions", label: "Subscriptions", permission: "manage_subscriptions", anyModule: ["creator_subscriptions_enabled", "printer_subscriptions_enabled"], element: <SubscriptionManagerAdmin modules={modules} /> },
          { key: "payouts", label: "Payouts", permission: "manage_payouts", moduleKey: "payouts_enabled", element: <PaystackPayoutsAdmin /> },
        ]}
      />
    </div>
  );
}

function PrintersWorkspace({ modules = {}, user = null, mode = "admin" } = {}) {
  return (
    <div data-testid="admin-printers-workspace" className="space-y-6">
      <div>
        <p className="overline mb-2">Production Network</p>
        <h1 className="font-display text-5xl uppercase">Printers</h1>
        <p className="text-[var(--ff-muted-text)] mt-2 max-w-3xl">Printer accounts, printer users, pricing, jobs, subscriptions and payout controls are grouped here.</p>
      </div>
      <AdminWorkspaceTabs
        modules={modules}
        user={user}
        mode={mode}
        tabs={[
          { key: "accounts", label: "Accounts", permission: "manage_printers", moduleKey: "printers_enabled", element: <LegacyPrintersAdmin /> },
          { key: "users", label: "Printer Users", permission: "manage_printer_users", moduleKey: "printers_enabled", element: <UserAccessAdmin /> },
          { key: "jobs", label: "Production Jobs", permission: "manage_orders", element: <ProductionAdmin /> },
          { key: "subscriptions", label: "Subscriptions", permission: "manage_subscriptions", anyModule: ["creator_subscriptions_enabled", "printer_subscriptions_enabled"], element: <SubscriptionManagerAdmin modules={modules} /> },
          { key: "payouts", label: "Payouts", permission: "manage_payouts", moduleKey: "payouts_enabled", element: <PaystackPayoutsAdmin /> },
        ]}
      />
    </div>
  );
}

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
        <Route path="notifications" element={<AdminNotifications />} />
        <Route path="activity" element={<ActivityAdmin />} />
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
