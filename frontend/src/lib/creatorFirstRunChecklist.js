export const CREATOR_STOREFRONT_PREVIEWED_KEY_PREFIX = "ff_creator_storefront_previewed";

export function creatorStorefrontPreviewStorageKey(creator) {
  const identity = creator?.id || creator?.slug || "unknown";
  return `${CREATOR_STOREFRONT_PREVIEWED_KEY_PREFIX}:${identity}`;
}

function hasStorefrontBranding(creator) {
  if (!creator?.name || !creator?.slug) return false;
  return Boolean(
    creator.profile_image_url ||
    creator.logo_url ||
    creator.banner_url,
  );
}

export function deriveCreatorFirstRunChecklist({
  creator,
  products = [],
  payoutState = null,
  storefrontPreviewed = false,
} = {}) {
  const safeProducts = Array.isArray(products) ? products : [];
  const payoutsEnabled = payoutState?.payouts_enabled !== false;
  const payoutReady = payoutsEnabled
    ? Boolean(payoutState?.ready_for_payouts)
    : true;

  const steps = [
    {
      key: "storefront",
      complete: hasStorefrontBranding(creator),
      unavailable: false,
    },
    {
      key: "product",
      complete: safeProducts.length > 0,
      unavailable: false,
    },
    {
      key: "payouts",
      complete: payoutReady,
      unavailable: !payoutsEnabled,
    },
    {
      key: "preview",
      complete: Boolean(storefrontPreviewed),
      unavailable: false,
    },
    {
      key: "publish",
      complete: safeProducts.some((product) => Boolean(product?.published)),
      unavailable: false,
    },
  ];

  const completedCount = steps.filter((step) => step.complete).length;

  return {
    steps,
    completedCount,
    totalCount: steps.length,
    isComplete: completedCount === steps.length,
  };
}
