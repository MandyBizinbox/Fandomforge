"""Creator product draft/review state helpers.

Creator products may be saved repeatedly as drafts without appearing in the
admin artwork-review queue. Submitting for review explicitly resets uploaded
artwork slots to pending_review and locks the creator product until review is
completed.
"""
from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, Tuple

REVIEW_DRAFT = "draft"
REVIEW_SUBMITTED = "submitted"


def review_submission_status(product: Dict[str, Any] | None) -> str:
    value = str((product or {}).get("review_submission_status") or REVIEW_DRAFT).strip().lower()
    return REVIEW_SUBMITTED if value == REVIEW_SUBMITTED else REVIEW_DRAFT


def review_is_locked(product: Dict[str, Any] | None) -> bool:
    product = product or {}
    return (
        review_submission_status(product) == REVIEW_SUBMITTED
        and str(product.get("artwork_review_status") or "") == "pending_review"
    )


def review_queue_includes_product(product: Dict[str, Any] | None) -> bool:
    """Keep legacy products visible, but hide explicit creator drafts."""
    product = product or {}
    if "review_submission_status" not in product:
        return True
    return review_submission_status(product) == REVIEW_SUBMITTED


def _slot_key(slot: Dict[str, Any] | None) -> str:
    slot = slot or {}
    if slot.get("id"):
        return f"id:{slot.get('id')}"
    return "fallback:{area}:{url}".format(
        area=slot.get("print_area_id") or "",
        url=slot.get("original_url") or "",
    )


def _reset_slot(slot: Dict[str, Any]) -> Dict[str, Any]:
    row = dict(slot or {})
    if not row.get("original_url"):
        return row
    row["status"] = "pending_review"
    row["reviewed_by_user_id"] = None
    row["reviewed_at"] = None
    row["review_note"] = None
    row["rejection_reason"] = None
    return row


def reset_product_artwork_review(
    product: Dict[str, Any],
    *,
    submission_status: str,
    submitted_at: str | None = None,
) -> Tuple[Dict[str, Any], int]:
    """Return a copy with uploaded artwork reset for a fresh review cycle."""
    data = deepcopy(product or {})
    groups = deepcopy(data.get("artwork_groups") or [])
    flat = deepcopy(data.get("artworks") or [])
    by_key: Dict[str, Dict[str, Any]] = {}
    changed = 0

    for group in groups:
        next_slots = []
        for slot in group.get("artworks") or []:
            next_slot = _reset_slot(slot)
            if next_slot.get("original_url"):
                changed += 1
                by_key[_slot_key(next_slot)] = next_slot
            next_slots.append(next_slot)
        group["artworks"] = next_slots

    next_flat = []
    for slot in flat:
        key = _slot_key(slot)
        if key in by_key:
            next_flat.append({**slot, **by_key[key]})
            continue
        next_slot = _reset_slot(slot)
        if next_slot.get("original_url"):
            changed += 1
        next_flat.append(next_slot)

    data["artwork_groups"] = groups
    data["artworks"] = next_flat
    data["artwork_review_status"] = "pending_review" if changed else "not_required"
    data["artwork_review_notes"] = None
    data["review_submission_status"] = (
        REVIEW_SUBMITTED if submission_status == REVIEW_SUBMITTED else REVIEW_DRAFT
    )
    data["review_submitted_at"] = submitted_at if submission_status == REVIEW_SUBMITTED else None
    data["published"] = False

    legacy = dict(data.get("artwork") or {})
    if legacy.get("original_url"):
        legacy["status"] = "pending_review"
        data["artwork"] = legacy

    return data, changed
