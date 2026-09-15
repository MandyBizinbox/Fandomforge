jest.mock("./api", () => ({ http: {} }));

import {
  canPublishCreatorProduct,
  countCreatorProductsReadyToPublish,
  getCreatorProductReviewSubmissionStatus,
} from "./creatorProductPublishing";

function product(overrides = {}) {
  return {
    id: "product-1",
    title: "Launch Tee",
    published: false,
    estimated_creator_profit: 50,
    artwork_review_status: "not_required",
    creator_pricing_approval_status: "not_required",
    ...overrides,
  };
}

describe("creator product publishing workflow state", () => {
  test("explicit draft is never publish-ready even when artwork review is not required yet", () => {
    const draft = product({ review_submission_status: "draft" });

    expect(getCreatorProductReviewSubmissionStatus(draft)).toBe("draft");
    expect(canPublishCreatorProduct(draft)).toBe(false);
    expect(countCreatorProductsReadyToPublish([draft])).toBe(0);
  });

  test("submitted and approved creator product is publish-ready", () => {
    const approved = product({
      review_submission_status: "submitted",
      artwork_review_status: "approved",
    });

    expect(getCreatorProductReviewSubmissionStatus(approved)).toBe("submitted");
    expect(canPublishCreatorProduct(approved)).toBe(true);
    expect(countCreatorProductsReadyToPublish([approved])).toBe(1);
  });

  test("legacy products keep the pre-existing publish behavior", () => {
    const legacy = product({ artwork_review_status: "approved" });

    expect(getCreatorProductReviewSubmissionStatus(legacy)).toBe("legacy");
    expect(canPublishCreatorProduct(legacy)).toBe(true);
  });
});
