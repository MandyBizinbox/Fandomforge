import { establishAuthSession } from "./authSession";
import { legacyCreatorProfileSetupDestination } from "./creatorOnboardingRouting";
import {
  CREATOR_STOREFRONT_PREVIEWED_KEY_PREFIX,
  creatorStorefrontPreviewStorageKey,
  deriveCreatorFirstRunChecklist,
} from "./creatorFirstRunChecklist";
import {
  AUTH_TOKEN_KEY,
  E2E_AUTH_TOKEN_ALIAS,
  LEGACY_AUTH_TOKEN_KEY,
} from "./authToken";

describe("establishAuthSession", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("persists the canonical token and updates auth state", () => {
    const user = {
      id: "creator-1",
      email: "creator@example.com",
      role: "creator",
    };
    const setUser = jest.fn();

    const result = establishAuthSession(
      { access_token: "creator-token", user },
      setUser,
    );

    expect(result).toEqual(user);
    expect(window.localStorage.getItem(AUTH_TOKEN_KEY)).toBe("creator-token");
    expect(window.localStorage.getItem(E2E_AUTH_TOKEN_ALIAS)).toBe("creator-token");
    expect(window.localStorage.getItem(LEGACY_AUTH_TOKEN_KEY)).toBeNull();
    expect(setUser).toHaveBeenCalledWith(user);
  });

  test("rejects an incomplete session instead of leaving auth half-established", () => {
    expect(() => establishAuthSession({ user: { role: "creator" } }, jest.fn()))
      .toThrow("Authentication session response is incomplete.");
    expect(window.localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
  });
});

describe("legacy creator profile setup routing", () => {
  test.each(["creator", "owner", "super_admin", "admin"])(
    "routes %s accounts to the canonical Creator Console",
    (role) => {
      expect(legacyCreatorProfileSetupDestination(role)).toBe("/creator");
    },
  );

  test.each(["buyer", "customer", "printer", "manager", undefined, null])(
    "does not expose the retired creator-creation flow to %s",
    (role) => {
      expect(legacyCreatorProfileSetupDestination(role)).toBe("/account");
    },
  );
});

describe("creator first-run checklist", () => {
  const brandedCreator = {
    id: "creator-1",
    name: "Forge Club",
    slug: "forge-club",
    logo_url: "/uploads/logo.png",
  };

  test("starts incomplete for a brand-new creator", () => {
    const result = deriveCreatorFirstRunChecklist({
      creator: { id: "creator-1", name: "Forge Club", slug: "forge-club" },
      products: [],
      payoutState: { payouts_enabled: true, ready_for_payouts: false },
      storefrontPreviewed: false,
    });

    expect(result.completedCount).toBe(0);
    expect(result.isComplete).toBe(false);
  });

  test("requires storefront branding rather than only a generated name and slug", () => {
    const unbranded = deriveCreatorFirstRunChecklist({
      creator: { name: "Forge Club", slug: "forge-club" },
    });
    const branded = deriveCreatorFirstRunChecklist({ creator: brandedCreator });

    expect(unbranded.steps.find((step) => step.key === "storefront").complete).toBe(false);
    expect(branded.steps.find((step) => step.key === "storefront").complete).toBe(true);
  });

  test("tracks first product separately from first published product", () => {
    const result = deriveCreatorFirstRunChecklist({
      creator: brandedCreator,
      products: [{ id: "product-1", published: false }],
    });

    expect(result.steps.find((step) => step.key === "product").complete).toBe(true);
    expect(result.steps.find((step) => step.key === "publish").complete).toBe(false);
  });

  test("does not block onboarding when platform payouts are disabled", () => {
    const result = deriveCreatorFirstRunChecklist({
      creator: brandedCreator,
      payoutState: { payouts_enabled: false, ready_for_payouts: false },
    });
    const payoutStep = result.steps.find((step) => step.key === "payouts");

    expect(payoutStep.complete).toBe(true);
    expect(payoutStep.unavailable).toBe(true);
  });

  test("completes after branding, product creation, payout readiness, preview and publish", () => {
    const result = deriveCreatorFirstRunChecklist({
      creator: brandedCreator,
      products: [{ id: "product-1", published: true }],
      payoutState: { payouts_enabled: true, ready_for_payouts: true },
      storefrontPreviewed: true,
    });

    expect(result.completedCount).toBe(5);
    expect(result.totalCount).toBe(5);
    expect(result.isComplete).toBe(true);
  });

  test("uses a creator-scoped storefront preview marker", () => {
    expect(creatorStorefrontPreviewStorageKey(brandedCreator)).toBe(
      `${CREATOR_STOREFRONT_PREVIEWED_KEY_PREFIX}:creator-1`,
    );
  });
});
