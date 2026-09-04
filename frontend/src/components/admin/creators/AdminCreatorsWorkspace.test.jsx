import { visibleCreatorTabs } from "./creatorWorkspaceAccess";

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
