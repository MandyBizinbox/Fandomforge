from pathlib import Path

DASHBOARD = Path("frontend/src/pages/AdminDashboard.jsx")
COMPONENT = Path("frontend/src/components/admin/creators/AdminCreatorsWorkspace.jsx")
ACCESS = Path("frontend/src/components/admin/creators/creatorWorkspaceAccess.js")
TEST = Path("frontend/src/components/admin/creators/AdminCreatorsWorkspace.test.jsx")

text = DASHBOARD.read_text()


def section(start: str, end: str) -> str:
    s = text.find(start)
    if s < 0:
        raise SystemExit(f"Missing start marker: {start}")
    e = text.find(end, s)
    if e < 0:
        raise SystemExit(f"Missing end marker: {end}")
    return text[s:e].rstrip() + "\n\n"

creator_constants = section("const emptyCreatorForm", "const PRINTER_PRODUCT_CAPABILITIES")
json_helpers = section("function safeJsonObjectFromText", "function csvText")
asset_upload = section("function AssetUploadField", "function BandsAdmin()")
bands_admin = section("function BandsAdmin()", "function PrintersAdmin()")
products_admin = section("function ProductsAdmin()", "function ProductTemplatesAdmin()")

component = '''import React, { useEffect, useMemo, useState } from "react";\nimport { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";\nimport { Plus, Save } from "lucide-react";\nimport { toast } from "sonner";\nimport { http, assetUrl } from "../../../lib/api";\nimport StatusBadge from "../../StatusBadge";\nimport UserAccessAdmin from "../UserAccessAdmin";\nimport ArtworkReviewAdmin from "../ArtworkReviewAdmin";\nimport SubscriptionManagerAdmin from "../SubscriptionManagerAdmin";\nimport PaystackPayoutsAdmin from "../PaystackPayoutsAdmin";\nimport { canAccessCreatorRoute, visibleCreatorTabs } from "./creatorWorkspaceAccess";\n\nfunction money(value) {\n  return `R ${Number(value || 0).toFixed(2)}`;\n}\n\n'''
component += creator_constants + json_helpers + asset_upload + bands_admin + products_admin
component += r'''export default function AdminCreatorsWorkspace({ modules = {}, user = null, mode = "admin", basePath = "/admin" }) {
  const root = `${basePath}/creators`;
  const tabs = useMemo(() => visibleCreatorTabs({ modules, user, mode, root }), [mode, modules, root, user]);

  const canAccounts = canAccessCreatorRoute({ permission: "manage_bands", modules, user, mode });
  const canUsers = canAccessCreatorRoute({ permission: "manage_band_users", modules, user, mode });
  const canProducts = canAccessCreatorRoute({ permission: "manage_products", modules, user, mode });
  const canArtwork = canAccessCreatorRoute({ permission: "manage_artwork_review", moduleKey: "artwork_review_enabled", modules, user, mode });
  const canSubscriptions = canAccessCreatorRoute({ permission: "manage_subscriptions", anyModule: ["creator_subscriptions_enabled", "printer_subscriptions_enabled"], modules, user, mode });
  const canPayouts = canAccessCreatorRoute({ permission: "manage_payouts", moduleKey: "payouts_enabled", modules, user, mode });
  const fallback = tabs[0]?.to || basePath;

  return (
    <div data-testid="admin-creators-workspace-routed" className="space-y-6">
      <div>
        <p className="overline mb-2">Accounts</p>
        <h1 className="font-display text-5xl uppercase">Creators</h1>
        <p className="text-[var(--ff-muted-text)] mt-2 max-w-3xl">Creator accounts, users, products, artwork review, subscriptions and payouts now own concrete routes while remaining API-backed.</p>
      </div>

      {!!tabs.length && (
        <nav className="flex flex-wrap gap-2 border-b border-[var(--ff-card-border)] pb-4">
          {tabs.map((tab) => (
            <NavLink key={tab.to} to={tab.to} className={({ isActive }) => `px-4 py-3 border text-xs uppercase tracking-widest font-bold ${isActive ? "border-[var(--ff-primary)] bg-[var(--ff-primary)] text-[var(--ff-card-text)]" : "border-[var(--ff-card-border)] text-[var(--ff-muted-text)] hover:text-[var(--ff-card-text)]"}`}>
              {tab.label}
            </NavLink>
          ))}
        </nav>
      )}

      <Routes>
        <Route index element={<Navigate to={fallback} replace />} />
        {canAccounts && <Route path="accounts" element={<BandsAdmin />} />}
        {canUsers && <Route path="users" element={<UserAccessAdmin />} />}
        {canProducts && <Route path="products" element={<ProductsAdmin />} />}
        {canArtwork && <Route path="artwork" element={<ArtworkReviewAdmin />} />}
        {canSubscriptions && <Route path="subscriptions" element={<SubscriptionManagerAdmin modules={modules} />} />}
        {canPayouts && <Route path="payouts" element={<PaystackPayoutsAdmin />} />}
        <Route path="*" element={<Navigate to={fallback} replace />} />
      </Routes>
    </div>
  );
}
'''

COMPONENT.parent.mkdir(parents=True, exist_ok=True)
COMPONENT.write_text(component)

ACCESS.write_text(r'''export const CREATOR_WORKSPACE_TABS = [
  { path: "accounts", label: "Accounts", permission: "manage_bands" },
  { path: "users", label: "Creator Users", permission: "manage_band_users" },
  { path: "products", label: "Products", permission: "manage_products" },
  { path: "artwork", label: "Artwork Review", permission: "manage_artwork_review", moduleKey: "artwork_review_enabled" },
  { path: "subscriptions", label: "Subscriptions", permission: "manage_subscriptions", anyModule: ["creator_subscriptions_enabled", "printer_subscriptions_enabled"] },
  { path: "payouts", label: "Payouts", permission: "manage_payouts", moduleKey: "payouts_enabled" },
];

export function canAccessCreatorRoute({ permission, moduleKey, anyModule, modules = {}, user = null, mode = "admin" }) {
  const isManager = mode === "manager" || user?.role === "manager";
  const managerPermissions = user?.manager_permissions || {};
  if (permission && isManager && managerPermissions[permission] === false) return false;
  if (moduleKey && modules?.[moduleKey] === false) return false;
  if (anyModule && !anyModule.some((key) => modules?.[key] !== false)) return false;
  return true;
}

export function visibleCreatorTabs({ modules = {}, user = null, mode = "admin", root = "/admin/creators" }) {
  return CREATOR_WORKSPACE_TABS
    .filter((tab) => canAccessCreatorRoute({ ...tab, modules, user, mode }))
    .map((tab) => ({ ...tab, to: `${root}/${tab.path}` }));
}
''')

import_anchor = 'import AdminPrintersWorkspace from "../components/admin/printers/AdminPrintersWorkspace";\n'
creator_import = 'import AdminCreatorsWorkspace from "../components/admin/creators/AdminCreatorsWorkspace";\n'
if text.count(import_anchor) != 1:
    raise SystemExit("Expected one printers workspace import anchor")
if creator_import not in text:
    text = text.replace(import_anchor, import_anchor + creator_import, 1)

old_route = '<Route path="creators" element={<CreatorsWorkspace modules={platformConfig?.modules || {}} user={user} mode={mode} />} />'
new_route = '<Route path="creators/*" element={<AdminCreatorsWorkspace modules={platformConfig?.modules || {}} user={user} mode={mode} basePath={basePath} />} />'
if text.count(old_route) != 1:
    raise SystemExit(f"Expected exactly one current creators workspace route, found {text.count(old_route)}")
text = text.replace(old_route, new_route, 1)
DASHBOARD.write_text(text)

TEST.write_text(r'''import { visibleCreatorTabs } from "./creatorWorkspaceAccess";

const openModules = {
  artwork_review_enabled: true,
  creator_subscriptions_enabled: true,
  printer_subscriptions_enabled: true,
  payouts_enabled: true,
};

test("shows all creator workspace routes for an admin when modules are enabled", () => {
  const paths = visibleCreatorTabs({ modules: openModules, user: { role: "admin" } }).map((tab) => tab.path);
  expect(paths).toEqual(["accounts", "users", "products", "artwork", "subscriptions", "payouts"]);
});

test("hides module-backed creator routes when their modules are disabled", () => {
  const paths = visibleCreatorTabs({
    modules: {
      ...openModules,
      artwork_review_enabled: false,
      creator_subscriptions_enabled: false,
      printer_subscriptions_enabled: false,
      payouts_enabled: false,
    },
    user: { role: "admin" },
  }).map((tab) => tab.path);
  expect(paths).toEqual(["accounts", "users", "products"]);
});

test("respects manager permissions independently per creator route", () => {
  const user = {
    role: "manager",
    manager_permissions: {
      manage_bands: true,
      manage_band_users: false,
      manage_products: true,
      manage_artwork_review: false,
      manage_subscriptions: true,
      manage_payouts: false,
    },
  };
  const paths = visibleCreatorTabs({ modules: openModules, user, mode: "manager" }).map((tab) => tab.path);
  expect(paths).toEqual(["accounts", "products", "subscriptions"]);
});
''')
