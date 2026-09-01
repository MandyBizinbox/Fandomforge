export const PRINTER_WORKSPACE_TABS = [
  { path: "accounts", label: "Accounts", permission: "manage_printers", moduleKey: "printers_enabled" },
  { path: "users", label: "Printer Users", permission: "manage_printer_users", moduleKey: "printers_enabled" },
  { path: "production", label: "Production Jobs", permission: "manage_orders" },
  { path: "subscriptions", label: "Subscriptions", permission: "manage_subscriptions", anyModule: ["creator_subscriptions_enabled", "printer_subscriptions_enabled"] },
  { path: "payouts", label: "Payouts", permission: "manage_payouts", moduleKey: "payouts_enabled" },
];

export function canAccess({ permission, moduleKey, anyModule, modules = {}, user = null, mode = "admin" }) {
  const isManager = mode === "manager" || user?.role === "manager";
  const managerPermissions = user?.manager_permissions || {};
  if (permission && isManager && managerPermissions[permission] === false) return false;
  if (moduleKey && modules?.[moduleKey] === false) return false;
  if (anyModule && !anyModule.some((key) => modules?.[key] !== false)) return false;
  return true;
}

export function visiblePrinterTabs({ modules = {}, user = null, mode = "admin", root = "/admin/printers-workspace" }) {
  return PRINTER_WORKSPACE_TABS
    .filter((tab) => canAccess({ ...tab, modules, user, mode }))
    .map((tab) => ({ ...tab, to: `${root}/${tab.path}` }));
}
