import React from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
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
import FeaturePackageSettings from "../components/admin/FeaturePackageSettings";
import InstanceSettingsSectionPage from "../components/admin/InstanceSettingsSectionPage";
import PlatformGeneralSettingsPage from "../components/admin/PlatformGeneralSettingsPage";
import PlatformAppearanceSettingsPage from "../components/admin/PlatformAppearanceSettingsPage";

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

const settingsLinks = [
  { to: "/admin/platform-settings/general", label: "General" },
  { to: "/admin/platform-settings/package", label: "Package & Modules" },
  { to: "/admin/platform-settings/branding", label: "Branding" },
  { to: "/admin/platform-settings/appearance", label: "Appearance" },
  { to: "/admin/platform-settings/homepage", label: "Homepage Copy" },
  { to: "/admin/platform-settings/homepage-builder", label: "Homepage Builder" },
  { to: "/admin/platform-settings/signup", label: "Signup" },
  { to: "/admin/platform-settings/legal", label: "Legal" },
];

function SettingsPage({ children }) {
  return (
    <div data-testid="admin-platform-settings-routed-workspace" className="space-y-6">
      <header className="space-y-4">
        <div>
          <p className="overline mb-2">Owner controls</p>
          <h1 className="font-display text-5xl uppercase">Platform Settings</h1>
          <p className="text-[var(--ff-muted-text)] mt-2 max-w-3xl">
            Each settings domain has a concrete URL while persistent values continue to load from and save to the Mongo platform settings document.
          </p>
        </div>
        <nav className="flex flex-wrap gap-2" aria-label="Platform settings">
          {settingsLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => [
                "px-3 py-2 border text-xs uppercase tracking-widest font-bold transition",
                isActive
                  ? "border-[var(--ff-primary)] bg-[var(--ff-surface-bg)] text-[var(--ff-card-text)]"
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

export default function AdminPlatformSettingsRoute() {
  return (
    <Routes>
      <Route element={<DashboardLayout title="Platform Admin" links={adminLinks} testidPrefix="admin-dash" notificationEndpoint="/admin/notifications" notificationPath="/admin/notifications" />}>
        <Route path="platform-settings" element={<Navigate to="/admin/platform-settings/branding" replace />} />
        <Route path="platform-settings/general" element={<SettingsPage><PlatformGeneralSettingsPage /></SettingsPage>} />
        <Route path="platform-settings/package" element={<SettingsPage><FeaturePackageSettings /></SettingsPage>} />
        <Route path="platform-settings/branding" element={<SettingsPage><InstanceSettingsSectionPage section="branding" /></SettingsPage>} />
        <Route path="platform-settings/appearance" element={<SettingsPage><PlatformAppearanceSettingsPage /></SettingsPage>} />
        <Route path="platform-settings/homepage" element={<SettingsPage><InstanceSettingsSectionPage section="homepage" /></SettingsPage>} />
        <Route path="platform-settings/homepage-builder" element={<SettingsPage><InstanceSettingsSectionPage section="builder" /></SettingsPage>} />
        <Route path="platform-settings/signup" element={<SettingsPage><InstanceSettingsSectionPage section="signup" /></SettingsPage>} />
        <Route path="platform-settings/legal" element={<SettingsPage><InstanceSettingsSectionPage section="legal" /></SettingsPage>} />
      </Route>
    </Routes>
  );
}
