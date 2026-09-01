import { visiblePrinterTabs } from "./printerWorkspaceAccess";

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
