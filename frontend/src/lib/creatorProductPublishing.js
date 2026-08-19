import { http } from "./api";

export const CREATOR_PRODUCTS_READY_REFRESH_EVENT = "fandomforge:creator-products-ready-refresh";

export function getCreatorProductArtworkStatus(product = {}) {
  const status = String(product?.artwork_review_status || "").toLowerCase();
  if (["approved", "rejected", "pending_review", "not_required"].includes(status)) return status;
  return status || "not_required";
}

export function isCreatorProductPublished(product = {}) {
  return Boolean(product?.published || product?.is_published || product?.published_at);
}

export function needsCreatorPricingApproval(product = {}) {
  return ["pending_creator_approval", "price_below_minimum"].includes(effectiveCreatorPricingStatus(product));
}

export function effectiveCreatorPricingStatus(product = {}) {
  if (product?.pricing_override_approved) return "override_approved";
  if (product?.manual_pricing_override_active) return Number(product?.effective_creator_amount ?? product?.estimated_creator_profit ?? 0) < 0 ? "price_below_minimum" : "not_required";
  if (Number(product?.estimated_creator_profit || 0) < 0) return "price_below_minimum";
  if (product?.requires_creator_pricing_approval || product?.creator_pricing_approval_status === "pending_creator_approval") return "pending_creator_approval";
  return product?.creator_pricing_approval_status || "not_required";
}

export function canPublishCreatorProduct(product = {}) {
  if (isCreatorProductPublished(product) || needsCreatorPricingApproval(product)) return false;
  if (!product?.id) {
    return Boolean(product?.title) && Number(product?.estimated_creator_profit ?? 0) >= 0;
  }
  const artworkStatus = getCreatorProductArtworkStatus(product);
  return artworkStatus === "approved" || artworkStatus === "not_required";
}

export function countCreatorProductsReadyToPublish(products = []) {
  return products.filter((product) => canPublishCreatorProduct(product)).length;
}

export function getCreatorProductRejectionReason(product = {}) {
  if (product?.artwork_review_notes) return product.artwork_review_notes;
  if (product?.rejection_reason) return product.rejection_reason;
  const groups = Array.isArray(product?.artwork_groups) ? product.artwork_groups : [];
  for (const group of groups) {
    const artworks = Array.isArray(group?.artworks) ? group.artworks : [];
    const rejected = artworks.find((slot) => slot?.status === "rejected" && (slot?.rejection_reason || slot?.review_note || slot?.notes));
    if (rejected) return rejected.rejection_reason || rejected.review_note || rejected.notes;
  }
  const artworks = Array.isArray(product?.artworks) ? product.artworks : [];
  const rejected = artworks.find((slot) => slot?.status === "rejected" && (slot?.rejection_reason || slot?.review_note || slot?.notes));
  return rejected?.rejection_reason || rejected?.review_note || rejected?.notes || "";
}

export async function setCreatorProductPublished(httpClientOrProductId, productOrPublished, publishedValue) {
  if (typeof httpClientOrProductId === "string") {
    const response = await http.patch(`/products/${httpClientOrProductId}`, { published: Boolean(productOrPublished) });
    return response;
  }
  const response = await httpClientOrProductId.patch(`/products/${productOrPublished.id}`, { published: Boolean(publishedValue) });
  return response.data;
}

export function emitCreatorProductsReadyRefresh(detail = {}) {
  window.dispatchEvent(new CustomEvent(CREATOR_PRODUCTS_READY_REFRESH_EVENT, { detail }));
}
