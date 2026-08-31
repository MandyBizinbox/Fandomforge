import React from "react";
import { NavLink, Route, Routes } from "react-router-dom";
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
import ProductTemplatesPage from "../components/template-studio/ProductTemplatesPage";
import ProductTypesPage from "../components/template-studio/ProductTypesPage";
import SellableProductsPage from "../components/product-system/SellableProductsPage";
import CategoriesAdmin from "../pages/admin/CategoriesAdmin";
import AttributesAdmin from "../pages/admin/AttributesAdmin";

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

const productSystemLinks = [
  { to: "/admin/product-templates", label: "Templates" },
  { to: "/admin/product-types", label: "Product Types" },
  { to: "/admin/products", label: "Sellable Products" },
  { to: "/admin/categories", label: "Categories" },
  { to: "/admin/attributes", label: "Attributes" },
];

function ProductSystemPage({ children }) {
  return (
    <div data-testid="admin-product-system-workspace" className="space-y-6">
      <header className="space-y-4">
        <div>
          <p className="overline mb-2">Product System</p>
          <h1 className="font-display text-5xl uppercase">Products & Templates</h1>
          <p className="text-sm text-[var(--ff-muted-text)] mt-2 max-w-3xl">
            Product definitions now use real routes instead of JavaScript-selected workspace tabs. Each tool can be deep-linked, refreshed and maintained independently.
          </p>
        </div>

        <nav className="flex flex-wrap gap-2" aria-label="Product system">
          {productSystemLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end
              className={({ isActive }) => [
                "px-3 py-2 border text-xs uppercase tracking-widest font-bold transition",
                isActive
                  ? "border-[var(--ff-primary)] bg-[color-mix(in_srgb,var(--ff-primary)_12%,transparent)] text-[var(--ff-card-text)]"
                  : "border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] text-[var(--ff-muted-text)] hover:border-[var(--ff-primary)] hover:text-[var(--ff-card-text)]",
              ].join(" ")}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <section className="min-w-0">{children}</section>
    </div>
  );
}

function Wrapped({ children }) {
  return <ProductSystemPage>{children}</ProductSystemPage>;
}

export default function AdminProductSystemRoute() {
  return (
    <Routes>
      <Route element={<DashboardLayout title="Platform Admin" links={adminLinks} testidPrefix="admin-dash" notificationEndpoint="/admin/notifications" notificationPath="/admin/notifications" />}>
        <Route path="product-templates" element={<Wrapped><ProductTemplatesPage /></Wrapped>} />
        <Route path="product-types" element={<Wrapped><ProductTypesPage /></Wrapped>} />
        <Route path="products" element={<Wrapped><SellableProductsPage /></Wrapped>} />
        <Route path="categories" element={<Wrapped><CategoriesAdmin /></Wrapped>} />
        <Route path="attributes" element={<Wrapped><AttributesAdmin /></Wrapped>} />
      </Route>
    </Routes>
  );
}
