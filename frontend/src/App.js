import React from "react";
import "@/App.css";
import "@/index.css";
import "./platformThemeOverrides.css";
import "./components/product-builder/productBuilderStudioViewport.css";
import "./components/product-builder/productBuilderV2Runtime";
import "./components/product-builder/productBuilderTextColourRuntime";
import "./components/product-builder/productBuilderDraftButtonRuntime";
// Builder V2 now owns manufacturing profile selection, stocked colour state,
// artwork dimensions and pricing in React. These legacy DOM helpers mutate the
// same selects/totals after render and are intentionally no longer loaded here.
import "./components/admin/adminManufacturingRulesThemeRuntime";
import "./components/admin/legacyPrintOptionCostingSeedRuntime";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import { usePlatformConfig } from "./lib/platform";

import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import RegisterCreator from "./pages/RegisterCreator";
import RegisterPrinter from "./pages/RegisterPrinter";
import PolicyPage from "./pages/PolicyPage";
import AuthCallback from "./pages/AuthCallback";
import BandStorefront from "./pages/BandStorefront";
import ProductDetail from "./pages/ProductDetail";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import OrderConfirmation from "./pages/OrderConfirmation";
import OrderTracking from "./pages/OrderTracking";
import ApplyPrinter from "./pages/ApplyPrinter";
import BandProfileSetup from "./pages/BandProfileSetup";
import BandDashboard from "./pages/BandDashboard";
import CreatorCataloguePricing from "./pages/CreatorCataloguePricing";
import PrinterDashboard from "./pages/PrinterDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import AdminManufacturingRules from "./pages/admin/AdminManufacturingRules";
import ManagerDashboard from "./pages/ManagerDashboard";
import Account from "./pages/Account";
import Sell from "./pages/Sell";
import Print from "./pages/Print";
import {
  BecomeCreatorPage,
  HowItWorksPage,
  ProductsPricingPage,
  CreatorOnboardingPage,
  CommunityStoresPage,
  CreatorEarningsPage,
  ShippingReturnsPage,
  CreatorFaqPage,
} from "./pages/CreatorLaunchPages";

import StaticContentPage from "./pages/StaticContentPage";
import Footer from "./components/Footer";

function getRoleHome(role) {
  if (["super_admin", "admin"].includes(role)) return "/admin";
  if (role === "manager") return "/manager";
  if (role === "creator") return "/creator";
  if (role === "printer") return "/printer";
  return "/account";
}

function Protected({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen page-shell flex items-center justify-center overline">
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (roles && !roles.includes(user.role)) {
    const fallbackPath = getRoleHome(user.role);

    if (location.pathname !== fallbackPath) {
      return <Navigate to={fallbackPath} replace />;
    }

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
  return (
    <>
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

        <Route path="/shop" element={<Navigate to="/sell" replace />} />
        <Route path="/creators" element={<Navigate to="/sell" replace />} />
        <Route path="/creators/:slug" element={<BandStorefront />} />
        <Route path="/sell" element={<Sell />} />
        <Route path="/sell-online" element={<Navigate to="/become-a-creator" replace />} />
        <Route path="/print" element={<Print />} />

        <Route path="/product/:id" element={<ProductDetail />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/order-confirmation/:id" element={<OrderConfirmation />} />
        <Route path="/order-tracking/:token" element={<OrderTracking />} />
        <Route path="/policies/:policyKey" element={<PolicyPage />} />
        <Route path="/terms" element={<PolicyPage />} />
        <Route path="/privacy" element={<PolicyPage />} />
        <Route path="/returns" element={<PolicyPage />} />
        <Route path="/shipping-policy" element={<PolicyPage />} />
        <Route path="/creator-terms" element={<PolicyPage />} />
        <Route path="/printer-terms" element={<PolicyPage />} />

        <Route path="/apply-printer" element={<ApplyPrinter />} />
        <Route path="/printer/apply" element={<Navigate to="/apply-printer" replace />} />

        <Route
          path="/account"
          element={
            <Protected roles={["buyer", "customer", "creator", "printer", "manager", "admin", "super_admin"]}>
              <Account />
            </Protected>
          }
        />

        <Route
          path="/creator/profile-setup"
          element={
            <Protected roles={["buyer", "creator", "admin", "super_admin"]}>
              <BandProfileSetup />
            </Protected>
          }
        />

        <Route
          path="/creator/catalogue-pricing"
          element={
            <Protected roles={["creator", "admin", "super_admin"]}>
              <CreatorCataloguePricing />
            </Protected>
          }
        />

        <Route
          path="/creator/*"
          element={
            <Protected roles={["creator", "admin", "super_admin"]}>
              <BandDashboard />
            </Protected>
          }
        />

        <Route
          path="/printer/*"
          element={
            <Protected roles={["printer", "admin", "super_admin"]}>
              <PrinterDashboard />
            </Protected>
          }
        />

        <Route
          path="/manager/*"
          element={
            <Protected roles={["manager", "admin", "super_admin"]}>
              <ManagerDashboard />
            </Protected>
          }
        />

        <Route
          path="/admin/manufacturing-rules"
          element={
            <Protected roles={["admin", "super_admin"]}>
              <AdminManufacturingRules />
            </Protected>
          }
        />

        <Route
          path="/admin/*"
          element={
            <Protected roles={["admin", "super_admin"]}>
              <AdminDashboard />
            </Protected>
          }
        />

        <Route path="/about" element={<StaticContentPage pageKey="about" />} />
        <Route path="/contact" element={<StaticContentPage pageKey="contact" />} />
        <Route path="/help/orders" element={<StaticContentPage pageKey="help-orders" />} />
        <Route path="/help/creators" element={<StaticContentPage pageKey="help-creators" />} />
        <Route path="/privacy-policy" element={<StaticContentPage pageKey="privacy-policy" />} />
        <Route path="/delivery-terms" element={<StaticContentPage pageKey="delivery-terms" />} />
        <Route path="/shop-terms" element={<StaticContentPage pageKey="shop-terms" />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
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
            <AppRoutes />
            <PlatformToaster />
          </BrowserRouter>
        </CartProvider>
      </AuthProvider>
    </div>
  );
}
