"""Privacy-safe public homepage data helpers for FandomForge."""
from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Query, Request


public_homepage_router = APIRouter(prefix="/public/homepage")


def _bounded_limit(value: int, maximum: int) -> int:
    return max(1, min(int(value or 1), maximum))


def _creator_card(doc: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": doc.get("id"),
        "slug": doc.get("slug"),
        "name": doc.get("name"),
        "display_name": doc.get("gallery_display_name") or doc.get("name"),
        "logo_url": doc.get("gallery_logo_url") or doc.get("logo_url") or doc.get("profile_image_url"),
        "banner_url": doc.get("gallery_banner_url") or doc.get("banner_url"),
        "visibility": "public",
        "show_on_platform_gallery": True,
    }


def _public_artwork_groups(groups: Any) -> List[Dict[str, Any]]:
    public_groups: List[Dict[str, Any]] = []
    for group in groups if isinstance(groups, list) else []:
        if not isinstance(group, dict):
            continue
        public_artworks = []
        for artwork in group.get("artworks") or []:
            if isinstance(artwork, dict) and artwork.get("mockup_image_url"):
                public_artworks.append({"mockup_image_url": artwork.get("mockup_image_url")})
        public_groups.append({
            "primary_mockup_image_url": group.get("primary_mockup_image_url"),
            "artworks": public_artworks,
        })
    return public_groups


def _public_product(doc: Dict[str, Any], creator: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": doc.get("id"),
        "slug": doc.get("slug"),
        "band_id": doc.get("band_id"),
        "title": doc.get("title"),
        "description": doc.get("description") or "",
        "category": doc.get("category") or "",
        "selling_price": float(doc.get("selling_price") or 0),
        "effective_selling_price": doc.get("effective_selling_price"),
        "customer_selling_price": doc.get("customer_selling_price"),
        "mockup_images": doc.get("mockup_images") or [],
        "mockup_image_url": doc.get("mockup_image_url"),
        "primary_mockup_image_url": doc.get("primary_mockup_image_url"),
        "artwork_groups": _public_artwork_groups(doc.get("artwork_groups")),
        "customization_enabled": bool(doc.get("customization_enabled", False)),
        "published": True,
        "creator_name": creator.get("gallery_display_name") or creator.get("name") or "",
        "creator_slug": creator.get("slug") or "",
        "creator_visibility": "public",
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
    }


def _created_at_key(doc: Dict[str, Any]) -> str:
    value = doc.get("created_at")
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value or "")


async def _public_creators(db, *, gallery_only: bool) -> List[Dict[str, Any]]:
    query: Dict[str, Any] = {"status": "active", "visibility": "public"}
    if gallery_only:
        query["show_on_platform_gallery"] = True

    projection = {
        "_id": 0,
        "id": 1,
        "slug": 1,
        "name": 1,
        "logo_url": 1,
        "banner_url": 1,
        "profile_image_url": 1,
        "gallery_logo_url": 1,
        "gallery_banner_url": 1,
        "gallery_display_name": 1,
        "created_at": 1,
    }

    merged: Dict[str, Dict[str, Any]] = {}
    for collection_name in ("bands", "creators"):
        collection = getattr(db, collection_name)
        docs = await collection.find(query, projection).sort("created_at", -1).to_list(5000)
        for doc in docs:
            creator_id = doc.get("id")
            if creator_id:
                merged[creator_id] = doc

    return sorted(merged.values(), key=_created_at_key, reverse=True)


@public_homepage_router.get("/creators")
async def homepage_creators(
    request: Request,
    limit: int = Query(default=6, ge=1, le=24),
) -> List[Dict[str, Any]]:
    """Return only active public creators who explicitly allow gallery discovery."""
    safe_limit = _bounded_limit(limit, 24)
    creators = await _public_creators(request.app.state.db, gallery_only=True)
    return [_creator_card(creator) for creator in creators[:safe_limit]]


@public_homepage_router.get("/products")
async def homepage_products(
    request: Request,
    limit: int = Query(default=8, ge=1, le=32),
) -> List[Dict[str, Any]]:
    """Return recent published merchandise only from active public storefronts."""
    db = request.app.state.db
    safe_limit = _bounded_limit(limit, 32)

    creators = await _public_creators(db, gallery_only=False)
    creators_by_id = {creator.get("id"): creator for creator in creators if creator.get("id")}

    if not creators_by_id:
        return []

    product_projection = {
        "_id": 0,
        "id": 1,
        "slug": 1,
        "band_id": 1,
        "title": 1,
        "description": 1,
        "category": 1,
        "selling_price": 1,
        "effective_selling_price": 1,
        "customer_selling_price": 1,
        "mockup_images": 1,
        "mockup_image_url": 1,
        "primary_mockup_image_url": 1,
        "artwork_groups": 1,
        "customization_enabled": 1,
        "created_at": 1,
        "updated_at": 1,
    }
    products = await db.products.find(
        {"published": True, "band_id": {"$in": list(creators_by_id.keys())}},
        product_projection,
    ).sort("created_at", -1).limit(safe_limit).to_list(safe_limit)

    return [
        _public_product(product, creators_by_id[product.get("band_id")])
        for product in products
        if product.get("band_id") in creators_by_id
    ]
