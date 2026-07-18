import React, { Suspense, lazy } from "react";
import "@/App.css";
import "@/index.css";
import "./platformThemeOverrides.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import { usePlatformConfig } from "./lib/platform";
import Footer from "./components/Footer";
import ImagePerformanceHints from "./components/ImagePerformanceHints";
import EntitlementNotice from "./components/EntitlementNotice";

const lazyNamed = (importer, exportName) => lazy(
  () => importer().then((module) => ({ default: module[exportName] })),
);

const Home = lazy(() => import("./pages/Home"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const RegisterCreator = lazy(() => import("./pages/RegisterCreator"));
const RegisterPrinter = lazy(() => import("./pages/RegisterPrinter"));
const PolicyPage = lazy(() => import("./pages/PolicyPage"));
const LegalIndex = lazy(() => import("./pages/LegalIndex"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const BandStorefront = lazy(() => import("./pages/BandStorefront"));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const Cart = lazy(() => import("./pages/Cart"));
const Checkout = lazy(() => import("./pages/Checkout"));
const OrderConfirmation = lazy(() => import("./pages/OrderConfirmation"));
const OrderTracking = lazy(() => import("./pages/OrderTracking"));
const ApplyPrinter = lazy(() => import("./pages/ApplyPrinter"));
const BandProfileSetup = lazy(() => import("./pages/BandProfileSetup"));
const BandDashboard = lazy(() => import("./routes/CreatorDashboardRoute"));
const CreatorPayoutAccount = lazy(() => import("./pages/CreatorPayoutAccount"));
const CreatorCataloguePricing = lazy(() => import("./pages/CreatorCataloguePricing"));
const PrinterDashboard = lazy(() => import("./pages/PrinterDashboard"));
const AdminDashboard = lazy(() => import("./routes/AdminDashboardRoute"));
const AdminManufacturingRules = lazy(() => import("./routes/AdminManufacturingRulesRoute"));
const ManagerDashboard = lazy(() => import("./pages/ManagerDashboard"));
const Account = lazy(() => import("./pages/Account"));
const AccountPlans = lazy(() => import("./pages/AccountPlans"));
const Sell = lazy(() => import("./pages/Sell"));
const Print = lazy(() => import("./pages/Print"));
const Marketplace = lazy(() => import("./pages/Marketplace"));
const CreatorDirectory = lazyNamed(() => import("./pages/Marketplace"), "CreatorDirectory");
const StaticContentPage = lazy(() => import("./pages/StaticContentPage"));

const BecomeCreatorPage = lazyNamed(() => import("./pages/CreatorLaunchPages"), "BecomeCreatorPage");
const HowItWorksPage = lazyNamed(() => import("./pages/CreatorLaunchPages"), "HowItWorksPage");
const ProductsPricingPage = lazyNamed(() => import("./pages/CreatorLaunchPages"), "ProductsPricingPage");
const CreatorOnboardingPage = lazyNamed(() => import("./pages/CreatorLaunchPages"), "CreatorOnboardingPage");
const CommunityStoresPage = lazyNamed(() => import("./pages/CreatorLaunchPages"), "CommunityStoresPage");
const CreatorEarningsPage = lazyNamed(() => import("./pages/CreatorLaunchPages"), "CreatorEarningsPage");
const ShippingReturnsPage = lazyNamed(() => import("./pages/CreatorLaunchPages"), "ShippingReturnsPage");
const CreatorFaqPage = lazyNamed(() => import("./pages/CreatorLaunchPages"), "CreatorFaqPage");

function getRoleHome(role) {
  if (["owner", "super_admin", "admin"].includes(role)) return "/admin";
  if (role === "manager") return "/manager";
  if (role === "creator") return "/creator";
  if (role === "printer") return "/printer";
  return "/account";
}

function RouteLoading() {
  return (
    <div className="min-h-[55vh] page-shell flex items-center justify-center px-6">
      <div className="overline">Loading FandomForge…</div>
    </div>
  );
}

function Protected({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <RouteLoading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) {
    const fallbackPath = getRoleHome(user.role);
    if (location.pathname !== fallbackPath) return <Navigate to={fallbackPath} replace />;
    return (
      <div className="min-h-screen page-shell flex items-center justify-center px-6">
        <div className="card max-w-md">
          <p className="overline mb-2">Access issue</p>
          <h1 className="font-display text-3xl uppercase mb-3">Account role mismatch</h1>
          <p className="text-[var(--ff-muted-text)] text-sm mb-4">Your account role is not allowed for this page.</p>
          <p className="text-[var(--ff-muted-text)] text-xs">Current role: {user.role || "unknown"}</p>
        </div>
      </div>
    );
  }
  return children;
}

function PlatformToaster() {
  const { platform } = usePlatformConfig();
  return (
    <Toaster
      theme={platform.theme_mode === "dark" ? "dark" : "light"}
      position="bottom-right"
      toastOptions={{
        style: {
          background: "var(--ff-card-bg)",
          border: "1px solid var(--ff-card-border)",
          borderRadius: 0,
          color: "var(--ff-card-text)",
        },
      }}
    />
  );
}

function AppRoutes() {
  const accountRoles = ["buyer", "customer", "creator", "printer", "manager", "admin", "super_admin", "owner"];
  const platformRoles = ["owner", "super_admin", "admin"];
  return (
    <>
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/become-a-creator" element={<BecomeCreatorPage />} />
          <Route path="/how-it-works" element={<HowItWorksPage />} />
          <Route path="/products-and-pricing" element={<ProductsPricingPage />} />
          <Route path="/products-pricing" element={<Navigate to="/products-and-pricing" replace />} />
          <Route path="/creator-onboarding" element={<CreatorOnboardingPage />} />
          <Route path="/creator-earnings" element={<CreatorEarningsPage />} />
          <Route path="/clubs-schools-organisations" element={<CommunityStoresPage />} />
          <Route path="/clubs-organisations" element={<Navigate to="/clubs-schools-organisations" replace />} />
          <Route path="/shipping-production-returns" element={<ShippingReturnsPage />} />
          <Route path="/shipping-returns" element={<Navigate to="/shipping-production-returns" replace />} />
          <Route path="/faq" element={<CreatorFaqPage />} />

          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/register/creator" element={<RegisterCreator />} />
          <Route path="/register/printer" element={<RegisterPrinter />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          <Route path="/shop" element={<Marketplace />} />
          <Route path="/creators" element={<CreatorDirectory />} />
          <Route path="/creators/:slug" element={<BandStorefront />} />
          <Route path="/sell" element={<Sell />} />
          <Route path="/sell-online" element={<Navigate to="/become-a-creator" replace />} />
          <Route path="/print" element={<Print />} />
          <Route path="/product/:id" element={<ProductDetail />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/order-confirmation/:id" element={<OrderConfirmation />} />
          <Route path="/order-tracking/:token" element={<OrderTracking />} />

          <Route path="/legal" element={<LegalIndex />} />
          <Route path="/terms" element={<PolicyPage policyKeyOverride="terms_and_conditions" />} />
          <Route path="/shop-terms" element={<PolicyPage policyKeyOverride="terms_and_conditions" />} />
          <Route path="/privacy" element={<PolicyPage policyKeyOverride="privacy_policy" />} />
          <Route path="/privacy-policy" element={<PolicyPage policyKeyOverride="privacy_policy" />} />
          <Route path="/returns" element={<PolicyPage policyKeyOverride="returns_policy" />} />
          <Route path="/shipping-policy" element={<PolicyPage policyKeyOverride="shipping_policy" />} />
          <Route path="/delivery-terms" element={<PolicyPage policyKeyOverride="shipping_policy" />} />
          <Route path="/creator-terms" element={<PolicyPage policyKeyOverride="creator_terms" />} />
          <Route path="/printer-terms" element={<PolicyPage policyKeyOverride="printer_terms" />} />
          <Route path="/intellectual-property" element={<PolicyPage policyKeyOverride="intellectual_property" />} />
          <Route path="/prohibited-content" element={<PolicyPage policyKeyOverride="prohibited_content" />} />
          <Route path="/copyright-complaints" element={<PolicyPage policyKeyOverride="copyright_complaints" />} />
          <Route path="/payout-policy" element={<PolicyPage policyKeyOverride="payout_policy" />} />
          <Route path="/store-suspension-policy" element={<PolicyPage policyKeyOverride="store_suspension" />} />
          <Route path="/policies/:policyKey" element={<PolicyPage />} />
          <Route path="/store-suspension" element={<PolicyPage policyKeyOverride="store_suspension" />} />

          <Route path="/apply-printer" element={<ApplyPrinter />} />
          <Route path="/printer/apply" element={<Navigate to="/apply-printer" replace />} />

          <Route path="/account" element={<Protected roles={accountRoles}><Account /></Protected>} />
          <Route path="/account/plans" element={<Protected roles={["creator", "printer"]}><AccountPlans /></Protected>} />
          <Route path="/creator/profile-setup" element={<Protected roles={["buyer", "creator", ...platformRoles]}><BandProfileSetup /></Protected>} />
          <Route path="/creator/payouts" element={<Protected roles={["creator", ...platformRoles]}><CreatorPayoutAccount /></Protected>} />
          <Route path="/creator/catalogue-pricing" element={<Protected roles={["creator", ...platformRoles]}><CreatorCataloguePricing /></Protected>} />
          <Route path="/creator/*" element={<Protected roles={["creator", ...platformRoles]}><BandDashboard /></Protected>} />
          <Route path="/printer/*" element={<Protected roles={["printer", ...platformRoles]}><PrinterDashboard /></Protected>} />
          <Route path="/manager/*" element={<Protected roles={["manager", ...platformRoles]}><ManagerDashboard /></Protected>} />
          <Route path="/admin/manufacturing-rules" element={<Protected roles={platformRoles}><AdminManufacturingRules /></Protected>} />
          <Route path="/admin/*" element={<Protected roles={platformRoles}><AdminDashboard /></Protected>} />

          <Route path="/about" element={<StaticContentPage pageKey="about" />} />
          <Route path="/contact" element={<StaticContentPage pageKey="contact" />} />
          <Route path="/help/orders" element={<StaticContentPage pageKey="help-orders" />} />
          <Route path="/help/creators" element={<StaticContentPage pageKey="help-creators" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <Footer />
    </>
  );
}

export default function App() {
  return (
    <div className="App">
      <AuthProvider>
        <CartProvider>
          <BrowserRouter>
            <ImagePerformanceHints />
            <EntitlementNotice />
            <AppRoutes />
            <PlatformToaster />
          </BrowserRouter>
        </CartProvider>
      </AuthProvider>
    </div>
  );
}
