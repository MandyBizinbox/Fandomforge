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
        "variations": doc.get("variations") or [],
        "artwork_groups": doc.get("artwork_groups") or [],
        "customization_enabled": bool(doc.get("customization_enabled", False)),
        "published": True,
        "creator_name": creator.get("gallery_display_name") or creator.get("name") or "",
        "creator_slug": creator.get("slug") or "",
        "creator_visibility": "public",
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
    }


@public_homepage_router.get("/creators")
async def homepage_creators(
    request: Request,
    limit: int = Query(default=6, ge=1, le=24),
) -> List[Dict[str, Any]]:
    """Return only active creators who explicitly allow public gallery discovery."""
    db = request.app.state.db
    safe_limit = _bounded_limit(limit, 24)
    query = {
        "status": "active",
        "visibility": "public",
        "show_on_platform_gallery": True,
    }
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
    }
    docs = await db.creators.find(query, projection).sort("created_at", -1).limit(safe_limit).to_list(safe_limit)
    return [_creator_card(doc) for doc in docs]


@public_homepage_router.get("/products")
async def homepage_products(
    request: Request,
    limit: int = Query(default=8, ge=1, le=32),
) -> List[Dict[str, Any]]:
    """Return recent published merchandise only from active public storefronts."""
    db = request.app.state.db
    safe_limit = _bounded_limit(limit, 32)

    creator_projection = {
        "_id": 0,
        "id": 1,
        "slug": 1,
        "name": 1,
        "gallery_display_name": 1,
    }
    creators = await db.creators.find(
        {"status": "active", "visibility": "public"},
        creator_projection,
    ).to_list(5000)
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
        "variations": 1,
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
