import {
  CREATOR_STOREFRONT_PREVIEWED_KEY_PREFIX,
  creatorStorefrontPreviewStorageKey,
  deriveCreatorFirstRunChecklist,
} from "./creatorFirstRunChecklist";

const brandedCreator = {
  id: "creator-1",
  name: "Forge Club",
  slug: "forge-club",
  logo_url: "/uploads/logo.png",
};

describe("creator first-run checklist", () => {
  test("starts incomplete for a brand-new creator", () => {
    const result = deriveCreatorFirstRunChecklist({
      creator: { id: "creator-1", name: "Forge Club", slug: "forge-club" },
      products: [],
      payoutState: { payouts_enabled: true, ready_for_payouts: false },
      storefrontPreviewed: false,
    });

    expect(result.completedCount).toBe(0);
    expect(result.isComplete).toBe(false);
    expect(result.steps.map((step) => [step.key, step.complete])).toEqual([
      ["storefront", false],
      ["product", false],
      ["payouts", false],
      ["preview", false],
      ["publish", false],
    ]);
  });

  test("requires storefront branding, not only a generated name and slug", () => {
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

  test("is complete once the creator has branded, created, previewed, configured payouts and published", () => {
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

  test("uses a creator-scoped local preview marker", () => {
    expect(creatorStorefrontPreviewStorageKey(brandedCreator)).toBe(
      `${CREATOR_STOREFRONT_PREVIEWED_KEY_PREFIX}:creator-1`,
    );
    expect(creatorStorefrontPreviewStorageKey({ slug: "forge-club" })).toBe(
      `${CREATOR_STOREFRONT_PREVIEWED_KEY_PREFIX}:forge-club`,
    );
  });
});
