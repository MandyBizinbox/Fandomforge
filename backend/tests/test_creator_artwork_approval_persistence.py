"""Regression tests: commercial edits must not change artwork approval identity."""
from creator_product_review import artwork_review_signature


def _product():
    slot = {
        "id": "art-1",
        "original_url": "/uploads/approved.png",
        "print_area_id": "back",
        "print_option_id": "htv",
        "status": "approved",
        "placement": {"x": 12, "y": 22, "width": 38, "height": 40},
        "mockup_image_url": "/mockups/old.jpg",
        "calculated_print_cost": 30,
    }
    return {
        "description": "Original",
        "selling_price": 550,
        "published": True,
        "artwork_review_status": "approved",
        "artwork_groups": [{
            "id": "group-1",
            "scope_type": "all",
            "variation_ids": [],
            "artworks": [slot],
        }],
    }


def test_copy_price_mockups_and_review_metadata_do_not_change_artwork():
    import copy
    initial = _product()
    edited = copy.deepcopy(initial)
    edited["description"] = "Updated"
    edited["selling_price"] = 600
    edited["mockup_images"] = ["/mockups/new.jpg"]
    edited["artwork_groups"][0]["artworks"][0]["mockup_image_url"] = "/mockups/new.jpg"
    edited["artwork_groups"][0]["artworks"][0]["calculated_print_cost"] = 45
    edited["artwork_groups"][0]["artworks"][0]["status"] = "pending_review"
    assert artwork_review_signature(initial) == artwork_review_signature(edited)


def test_replacement_and_placement_changes_invalidate_signature():
    import copy
    initial = _product()
    replacement = copy.deepcopy(initial)
    replacement["artwork_groups"][0]["artworks"][0]["original_url"] = "/uploads/new.png"
    assert artwork_review_signature(initial) != artwork_review_signature(replacement)
    placement = copy.deepcopy(initial)
    placement["artwork_groups"][0]["artworks"][0]["placement"]["x"] = 30
    assert artwork_review_signature(initial) != artwork_review_signature(placement)


def test_print_method_or_artwork_removal_changes_signature():
    import copy
    initial = _product()
    method = copy.deepcopy(initial)
    method["artwork_groups"][0]["artworks"][0]["print_option_id"] = "dtf"
    assert artwork_review_signature(initial) != artwork_review_signature(method)
    removed = copy.deepcopy(initial)
    removed["artwork_groups"][0]["artworks"] = []
    assert artwork_review_signature(initial) != artwork_review_signature(removed)
