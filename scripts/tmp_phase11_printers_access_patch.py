from pathlib import Path

component_path = Path("frontend/src/components/admin/printers/AdminPrintersWorkspace.jsx")
access_path = Path("frontend/src/components/admin/printers/printerWorkspaceAccess.js")
test_path = Path("frontend/src/components/admin/printers/AdminPrintersWorkspace.test.jsx")

component = component_path.read_text()
import_anchor = 'import PaystackPayoutsAdmin from "../PaystackPayoutsAdmin";\n'
access_import = 'import { canAccess, visiblePrinterTabs } from "./printerWorkspaceAccess";\n'
if component.count(import_anchor) != 1:
    raise SystemExit("Expected one payout import anchor")
component = component.replace(import_anchor, import_anchor + access_import, 1)

start = component.find("function canAccess({ permission, moduleKey, anyModule, modules, user, mode }) {")
end = component.find("export default function AdminPrintersWorkspace", start)
if start < 0 or end < 0:
    raise SystemExit("Could not locate inline printer access helper")
component = component[:start] + component[end:]

old_tabs = '''  const tabs = useMemo(() => [\n    { path: "accounts", to: `${root}/accounts`, label: "Accounts", permission: "manage_printers", moduleKey: "printers_enabled" },\n    { path: "users", to: `${root}/users`, label: "Printer Users", permission: "manage_printer_users", moduleKey: "printers_enabled" },\n    { path: "production", to: `${root}/production`, label: "Production Jobs", permission: "manage_orders" },\n    { path: "subscriptions", to: `${root}/subscriptions`, label: "Subscriptions", permission: "manage_subscriptions", anyModule: ["creator_subscriptions_enabled", "printer_subscriptions_enabled"] },\n    { path: "payouts", to: `${root}/payouts`, label: "Payouts", permission: "manage_payouts", moduleKey: "payouts_enabled" },\n  ].filter((tab) => canAccess({ ...tab, modules, user, mode })), [mode, modules, root, user]);\n'''
new_tabs = '''  const tabs = useMemo(() => visiblePrinterTabs({ modules, user, mode, root }), [mode, modules, root, user]);\n'''
if component.count(old_tabs) != 1:
    raise SystemExit(f"Expected one inline printer tab block, found {component.count(old_tabs)}")
component = component.replace(old_tabs, new_tabs, 1)
component_path.write_text(component)

access_path.write_text(r'''export const PRINTER_WORKSPACE_TABS = [
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
''')

test_path.write_text(r'''import { visiblePrinterTabs } from "./printerWorkspaceAccess";

const openModules = {
  printers_enabled: true,
  printer_marketplace_enabled: true,
  creator_subscriptions_enabled: true,
  printer_subscriptions_enabled: true,
  payouts_enabled: true,
};

test("shows all printer workspace routes for an admin when modules are enabled", () => {
  const paths = visiblePrinterTabs({ modules: openModules, user: { role: "admin" } }).map((tab) => tab.path);
  expect(paths).toEqual(["accounts", "users", "production", "subscriptions", "payouts"]);
});

test("hides printer account routes but preserves production when printer accounts are disabled", () => {
  const paths = visiblePrinterTabs({ modules: { ...openModules, printers_enabled: false }, user: { role: "admin" } }).map((tab) => tab.path);
  expect(paths).not.toContain("accounts");
  expect(paths).not.toContain("users");
  expect(paths).toContain("production");
});

test("respects manager permissions independently per printer workspace route", () => {
  const user = {
    role: "manager",
    manager_permissions: {
      manage_printers: false,
      manage_printer_users: true,
      manage_orders: true,
      manage_subscriptions: false,
      manage_payouts: true,
    },
  };
  const paths = visiblePrinterTabs({ modules: openModules, user, mode: "manager" }).map((tab) => tab.path);
  expect(paths).toEqual(["users", "production", "payouts"]);
});
''')
