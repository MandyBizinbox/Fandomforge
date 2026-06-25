#!/usr/bin/env python3
"""
Emergency Super Admin Quick Product Creator for FandomForge.

Creates a simple storefront product without requiring:
- product template
- artwork studio
- print areas
- production template assignment

Use this for fast live order intake.
Production should be handled manually from the order/admin view.
"""

import argparse
import asyncio
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from motor.motor_asyncio import AsyncIOMotorClient


def read_env(path=".env"):
    env = {}
    p = Path(path)
    if p.exists():
        for line in p.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def slugify(value):
    value = str(value or "").strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = re.sub(r"-+", "-", value).strip("-")
    return value or f"product-{uuid.uuid4().hex[:8]}"


def money(value):
    return round(float(value or 0), 2)


def parse_sizes(value):
    rows = []
    for size in str(value or "").split(","):
        size = size.strip()
        if size:
            rows.append(size)
    return rows or ["One Size"]


async def find_creator(db, creator_id=None, creator_name=None):
    candidate_collections = [
        "creators",
        "bands",
        "stores",
        "users",
        "profiles",
        "creator_profiles",
        "storefronts",
    ]

    names = await db.list_collection_names()
    candidate_collections = [name for name in candidate_collections if name in names]

    def display_name(doc):
        return (
            doc.get("store_name")
            or doc.get("display_name")
            or doc.get("name")
            or doc.get("title")
            or doc.get("email")
            or "Creator"
        )

    if creator_id:
        for collection in candidate_collections:
            creator = await db[collection].find_one({
                "$or": [
                    {"id": creator_id},
                    {"creator_id": creator_id},
                    {"store_id": creator_id},
                    {"owner_id": creator_id},
                    {"slug": creator_id},
                    {"email": creator_id},
                ]
            }, {"_id": 0})
            if creator:
                creator["_quick_display_name"] = display_name(creator)
                return creator, collection
        raise SystemExit(f"Creator/store not found by id: {creator_id}")

    if creator_name:
        regex = {"$regex": re.escape(creator_name), "$options": "i"}
        for collection in candidate_collections:
            creator = await db[collection].find_one({
                "$or": [
                    {"name": regex},
                    {"title": regex},
                    {"store_name": regex},
                    {"display_name": regex},
                    {"email": regex},
                    {"slug": regex},
                ]
            }, {"_id": 0})
            if creator:
                creator["_quick_display_name"] = display_name(creator)
                return creator, collection
        raise SystemExit(f"Creator/store not found by name: {creator_name}")

    print("Available creators/stores:")
    found = False

    for collection in candidate_collections:
        rows = await db[collection].find(
            {},
            {
                "_id": 0,
                "id": 1,
                "creator_id": 1,
                "store_id": 1,
                "owner_id": 1,
                "name": 1,
                "title": 1,
                "store_name": 1,
                "display_name": 1,
                "email": 1,
                "role": 1,
                "type": 1,
                "owner_type": 1,
                "slug": 1,
            }
        ).limit(30).to_list(30)

        if not rows:
            continue

        found = True
        print(f"\n== {collection} ==")
        for c in rows:
            cid = c.get("id") or c.get("creator_id") or c.get("store_id") or c.get("owner_id") or c.get("slug") or c.get("email")
            label = display_name(c)
            meta = ", ".join(str(c.get(k)) for k in ["role", "type", "owner_type"] if c.get(k))
            print("-", cid, "|", label, f"| {meta}" if meta else "")

    if not found:
        print("No obvious creator/store records found.")
        print("Run a product listing next so we can infer the required owner fields from existing products.")

    raise SystemExit("Pass --creator-id or --creator-name")


async def ensure_unique_slug(db, base_slug):
    slug = base_slug
    index = 2
    while await db.products.find_one({"slug": slug}, {"_id": 1}):
        slug = f"{base_slug}-{index}"
        index += 1
    return slug


async def main():
    parser = argparse.ArgumentParser(description="Create a simple no-template product quickly.")
    parser.add_argument("--creator-id", default="")
    parser.add_argument("--creator-name", default="")
    parser.add_argument("--name", required=True)
    parser.add_argument("--price", required=True, type=float)
    parser.add_argument("--description", default="")
    parser.add_argument("--image-url", required=True, help="Existing public/upload URL, for example /api/uploads/products/image.png")
    parser.add_argument("--sizes", default="XS,S,M,L,XL,2XL,3XL")
    parser.add_argument("--colour", "--color", dest="colour", default="")
    parser.add_argument("--sku-prefix", default="")
    parser.add_argument("--status", default="published", choices=["draft", "published"])
    parser.add_argument("--category", default="")
    parser.add_argument("--stock", default=999, type=int)
    args = parser.parse_args()

    env = read_env(".env")
    db = AsyncIOMotorClient(
        env.get("MONGO_URL") or "mongodb://localhost:27017"
    )[env.get("DB_NAME") or "fandomforge"]

    creator, creator_collection = await find_creator(db, creator_id=args.creator_id, creator_name=args.creator_name)
    creator_id = creator.get("id")
    creator_name = creator.get("name") or creator.get("title") or creator.get("store_name") or "Creator"

    product_id = str(uuid.uuid4())
    title = args.name.strip()
    base_slug = slugify(title)
    slug = await ensure_unique_slug(db, base_slug)
    price = money(args.price)
    sizes = parse_sizes(args.sizes)
    sku_prefix = args.sku_prefix.strip() or slug.upper().replace("-", "")[:10]

    variations = []
    for size in sizes:
        variation_id = str(uuid.uuid4())
        variation_label = f"{size}{' / ' + args.colour if args.colour else ''}"
        variations.append({
            "id": variation_id,
            "sku": f"{sku_prefix}-{slugify(size).upper()}",
            "label": variation_label,
            "size": size,
            "color": args.colour,
            "colour": args.colour,
            "attributes": {
                "Size": size,
                **({"Colour": args.colour} if args.colour else {}),
            },
            "price": price,
            "unit_price": price,
            "base_price": price,
            "stock": int(args.stock),
            "enabled": True,
            "status": "active",
            "image_url": args.image_url,
            "mockup_url": args.image_url,
            "mockup_image_url": args.image_url,
        })

    doc = {
        "id": product_id,
        "title": title,
        "name": title,
        "slug": slug,
        "description": args.description or "",
        "short_description": args.description[:180] if args.description else "",
        "status": args.status,
        "published": args.status == "published",
        "visibility": "public",
        "type": "simple_quick_product",
        "product_type": "simple_quick_product",
        "quick_product": True,
        "template_required": False,
        "template_id": None,
        "product_template_id": None,

        # Creator/store compatibility.
        "band_id": creator_id,
        "creator_id": creator_id,
        "store_id": creator_id,
        "band_name": creator_name,
        "creator_name": creator_name,
        "creator_collection": creator_collection,

        # Pricing.
        "price": price,
        "base_price": price,
        "unit_price": price,
        "selling_price": price,
        "print_cost": 0,
        "sale_price": None,
        "currency": "ZAR",

        # Images.
        "image_url": args.image_url,
        "product_image_url": args.image_url,
        "mockup_url": args.image_url,
        "mockup_image_url": args.image_url,
        "primary_mockup_image_url": args.image_url,
        "mockup_images": [args.image_url],

        # Variations.
        "has_variations": True,
        "variation_type": "size",
        "selected_template_variation_ids": [],
        "variations": variations,
        "sizes": sizes,
        "available_sizes": sizes,
        "colors": [args.colour] if args.colour else [],
        "colours": [args.colour] if args.colour else [],

        # Production fallback.
        "production_mode": "manual_no_template",
        "requires_manual_production_review": True,
        "production_notes": "Quick product created without template/artwork studio. Fulfil manually from product image and order details.",
        "artworks": [],
        "artwork_groups": [],
        "print_areas": [],
        "production_template_id": None,

        # Storefront/search.
        "category": args.category,
        "attribute_ids": [],
        "spec_attributes": {
            "Size": sizes,
        },
        "customization_enabled": False,
        "artwork_review_status": "not_required",
        "tags": ["quick-product"],
        "featured": False,

        "created_at": now_iso(),
        "updated_at": now_iso(),
    }

    await db.products.insert_one(doc)

    print()
    print("Quick product created")
    print("=====================")
    print("Product:", title)
    print("ID:", product_id)
    print("Slug:", slug)
    print("Creator:", creator_name, creator_id)
    print("Price:", price)
    print("Sizes:", ", ".join(sizes))
    print("Image:", args.image_url)
    print("Status:", args.status)
    print()
    print("Storefront URL:")
    print(f"/product/{product_id}")
    print()
    print("Admin/helper slug:")
    print(slug)


if __name__ == "__main__":
    asyncio.run(main())
