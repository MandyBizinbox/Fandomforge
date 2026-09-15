from creator_product_review import (
    REVIEW_DRAFT,
    REVIEW_SUBMITTED,
    reset_product_artwork_review,
    review_is_locked,
    review_queue_includes_product,
    review_submission_status,
)


def sample_product(status="approved"):
    slot = {
        "id": "slot-1",
        "print_area_id": "front",
        "original_url": "/uploads/artwork.png",
        "status": status,
        "reviewed_by_user_id": "admin-1",
        "reviewed_at": "2026-09-15T10:00:00+00:00",
        "review_note": "Looks good",
    }
    return {
        "id": "product-1",
        "published": True,
        "artwork_review_status": status,
        "artwork_groups": [{"id": "all", "artworks": [dict(slot)]}],
        "artworks": [dict(slot)],
        "artwork": {"original_url": slot["original_url"], "status": status},
    }


def test_explicit_draft_is_hidden_from_review_queue_but_legacy_product_remains_visible():
    assert review_queue_includes_product(sample_product()) is True
    draft = {**sample_product(), "review_submission_status": REVIEW_DRAFT}
    assert review_queue_includes_product(draft) is False
    assert review_submission_status(draft) == REVIEW_DRAFT


def test_submitted_pending_review_is_locked_and_visible():
    product = {
        **sample_product("pending_review"),
        "review_submission_status": REVIEW_SUBMITTED,
    }
    assert review_queue_includes_product(product) is True
    assert review_is_locked(product) is True


def test_saving_draft_resets_prior_approval_without_submitting_it():
    product, count = reset_product_artwork_review(
        sample_product("approved"),
        submission_status=REVIEW_DRAFT,
    )
    assert count == 1
    assert product["review_submission_status"] == REVIEW_DRAFT
    assert product["review_submitted_at"] is None
    assert product["artwork_review_status"] == "not_required"
    assert product["published"] is False
    assert product["artwork_groups"][0]["artworks"][0]["status"] == "pending_review"
    assert product["artwork_groups"][0]["artworks"][0]["reviewed_by_user_id"] is None
    assert review_is_locked(product) is False
    assert review_queue_includes_product(product) is False


def test_submit_for_review_resets_slots_and_records_submission_time():
    submitted_at = "2026-09-15T12:00:00+00:00"
    product, count = reset_product_artwork_review(
        sample_product("rejected"),
        submission_status=REVIEW_SUBMITTED,
        submitted_at=submitted_at,
    )
    assert count == 1
    assert product["review_submission_status"] == REVIEW_SUBMITTED
    assert product["review_submitted_at"] == submitted_at
    assert product["artwork_review_status"] == "pending_review"
    assert review_is_locked(product) is True
    assert review_queue_includes_product(product) is True
