export const CREATOR_WORKSPACE_TABS = [
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
