"""Draft product routes for Builder V2."""
from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from auth import get_current_user
from models import Product, User, uid, utcnow
from routes_main import (
    get_creator_account_for_user,
    iso_dates,
    normalize_template_product_payload,
    slugify,
)


builder_drafts_router = APIRouter(prefix="/builder-drafts")


class BuilderDraftProductPayload(BaseModel):
    template_id: Optional[str] = None
    product_option_choice: Optional[str] = None
    product_type_choice: Optional[str] = None
    title: Optional[str] = None
    description: str = ""
    specs: str = ""
    selling_price: Optional[float] = None
    draft_product_id: Optional[str] = None


def _normalise_match_text(value: Any) -> str:
    return " ".join(str(value or "").lower().split())


def _template_match_score(template: dict, choice: str) -> int:
    choice_norm = _normalise_match_text(choice)
    if not choice_norm:
        return 0

    name = _normalise_match_text(template.get("name"))
    slug = _normalise_match_text(template.get("slug"))
    category = _normalise_match_text(template.get("category"))
    description = _normalise_match_text(template.get("description"))

    score = 0
    if name and choice_norm == name:
        score += 1000
    if name and name in choice_norm:
        score += 600 + min(len(name), 200)
    if slug and slug in choice_norm:
        score += 250
    if category and category in choice_norm:
        score += 80
    if description and description[:80] and description[:80] in choice_norm:
        score += 60
    return score


async def _resolve_builder_template(db, payload: BuilderDraftProductPayload) -> dict:
    if payload.template_id:
        doc = await db.product_templates.find_one({"id": payload.template_id}, {"_id": 0})
        if doc:
            return doc

    docs = await db.product_templates.find({"status": "active"}, {"_id": 0}).to_list(500)
    if not docs:
        raise HTTPException(status_code=400, detail="No active product templates are available")

    choice_text = payload.product_option_choice or ""
    scored = sorted((( _template_match_score(doc, choice_text), doc) for doc in docs), key=lambda row: row[0], reverse=True)
    if scored and scored[0][0] > 0:
        return scored[0][1]

    raise HTTPException(status_code=400, detail="Could not match the selected product option to a template")


def _default_selling_price(template: dict, supplied: Optional[float]) -> float:
    if supplied and supplied > 0:
        return float(supplied)
    blank = float(template.get("creator_blank_price") or template.get("base_price") or template.get("base_blank_cost") or 0)
    suggested = (blank + 80) / 0.85 if blank else 1
    return round(max(suggested, 1), 2)


@builder_drafts_router.post("/product", response_model=Product)
async def create_or_update_builder_draft_product(
    payload: BuilderDraftProductPayload,
    request: Request,
    user: User = Depends(get_current_user),
):
    db = request.app.state.db
    creator = await get_creator_account_for_user(db, user, permission="manage_products")
    template = await _resolve_builder_template(db, payload)

    title = (payload.title or "").strip() or f"Draft - {template.get('name') or 'Product'}"
    base_data = {
        "template_id": template.get("id"),
        "title": title,
        "description": payload.description or "",
        "specs": payload.specs or template.get("description") or "",
        "category": template.get("category") or "",
        "selling_price": _default_selling_price(template, payload.selling_price),
        "print_cost": 0,
        "mockup_images": [],
        "mockup_image_url": template.get("product_image_url") or template.get("mockup_url") or "",
        "primary_mockup_image_url": template.get("product_image_url") or template.get("mockup_url") or "",
        "variations": [],
        "attribute_ids": template.get("attribute_ids") or [],
        "spec_attributes": {},
        "customization_enabled": False,
        "published": False,
        "publish_on_approval": False,
        "selected_template_variation_ids": [],
        "selected_print_area_id": "",
        "selected_print_option_id": "",
        "artworks": [],
        "artwork_groups": [],
        "estimated_blank_cost": 0,
        "estimated_print_cost": 0,
        "estimated_total_cost": 0,
        "commission_rate": 0.15,
        "estimated_commission": 0,
        "estimated_creator_profit": 0,
        "artwork_review_status": "not_required",
        "creator_pricing_approval_status": "not_required",
        "requires_creator_pricing_approval": False,
    }

    normalized = await normalize_template_product_payload(
        db=db,
        data=base_data,
        creator=creator,
        user=user,
        allow_admin_publish=False,
    )

    existing = None
    if payload.draft_product_id:
        existing = await db.products.find_one({"id": payload.draft_product_id, "band_id": creator["id"]}, {"_id": 0})

    now = utcnow()
    if existing:
        update_doc = {k: v for k, v in normalized.items() if k not in ("id", "band_id", "slug", "created_at", "created_by_user_id", "created_by_role")}
        update_doc.update({
            "builder_draft": True,
            "builder_draft_step": "details",
            "builder_draft_updated_at": now.isoformat(),
            "updated_at": now.isoformat(),
        })
        await db.products.update_one({"id": existing["id"]}, {"$set": update_doc})
        doc = await db.products.find_one({"id": existing["id"]}, {"_id": 0})
        return Product(**doc)

    default_printer = await db.printers.find_one({"status": "active"}, {"_id": 0})
    product = Product(
        **normalized,
        band_id=creator["id"],
        slug=f"{slugify(title)}-{uid()[:4]}",
        assigned_printer_id=default_printer["id"] if default_printer else None,
        created_by_user_id=user.id,
        created_by_role=user.role,
        created_at=now,
        updated_at=now,
    )
    doc = iso_dates(product.model_dump())
    doc.update({
        "builder_draft": True,
        "builder_draft_step": "details",
        "builder_draft_created_at": now.isoformat(),
        "builder_draft_updated_at": now.isoformat(),
    })
    await db.products.insert_one(doc)
    return Product(**doc)
