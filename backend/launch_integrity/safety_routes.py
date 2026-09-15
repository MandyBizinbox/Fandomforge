"""Non-destructive overrides for legacy product and artwork mutation routes."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile

from auth import get_current_user
from models import Product, ProductCreate, ProductVariation, User
import routes_main as core

from .audit import write_audit_event
from .design import content_hash_for_url, product_integrity_fields
from .permissions import require_manager_permission, role_of

safety_router = APIRouter(tags=["launch-integrity-safety"])


def utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@safety_router.post("/products")
async def create_creator_product(
    payload: ProductCreate,
    request: Request,
    user: User = Depends(get_current_user),
):
    """Authoritative Creator product creation with one ownership assignment."""
    db = request.app.state.db
    creator = await core.get_creator_account_for_user(db, user, permission="manage_products")
    normalized = await core.normalize_template_product_payload(
        db=db,
        data=payload.model_dump(),
        creator=creator,
        user=user,
        allow_admin_publish=False,
    )

    if not normalized.get("variations"):
        if normalized.get("template_id"):
            template = await db.product_templates.find_one(
                {"id": normalized.get("template_id")}, {"_id": 0}
            ) or {}
            normalized["variations"] = [core._standard_template_product_variation(template, [])]
        else:
            normalized["variations"] = [
                ProductVariation(size="M", color="Black").model_dump(),
                ProductVariation(size="L", color="Black").model_dump(),
                ProductVariation(size="XL", color="Black").model_dump(),
            ]

    default_printer = await db.printers.find_one({"status": "active"}, {"_id": 0})
    now = core.utcnow()
    product_input = {
        **normalized,
        "band_id": creator["id"],
        "slug": core.slugify(normalized["title"]) + "-" + core.uid()[:4],
        "assigned_printer_id": normalized.get("assigned_printer_id")
        or ((default_printer or {}).get("id")),
        "created_by_user_id": user.id,
        "created_by_role": user.role,
        "created_at": now,
        "updated_at": now,
    }
    validated = Product(**product_input)
    # Product is a compatibility response model and ignores additive integrity fields.
    # Merge its validated core fields back over the normalized document so canonical
    # ownership/design/version fields remain stored without passing duplicate kwargs.
    document = core.iso_dates({**normalized, **validated.model_dump()})
    await db.products.insert_one(document.copy())
    stored = await db.products.find_one({"id": validated.id}, {"_id": 0})
    await write_audit_event(
        db,
        action="product.create",
        entity_type="product",
        entity_id=validated.id,
        actor=user,
        before=None,
        after={
            "creator_id": creator.get("id"),
            "title": stored.get("title"),
            "published": stored.get("published"),
            "product_version": stored.get("product_version"),
            "design_sha256": stored.get("design_sha256"),
        },
        reason="Creator product created",
        request=request,
        related_creator_id=creator.get("id"),
        related_product_id=validated.id,
    )
    return stored


@safety_router.post("/admin/quick-products")
async def create_quick_product_for_creator(
    payload: core.QuickProductCreate,
    request: Request,
    user: User = Depends(get_current_user),
):
    if role_of(user) not in {"owner", "super_admin", "admin"}:
        raise HTTPException(status_code=403, detail="Platform Owner or Admin access required")
    db = request.app.state.db
    creator = await db.creators.find_one({"id": payload.creator_id}, {"_id": 0})
    if not creator:
        raise HTTPException(status_code=404, detail="Creator/store not found")

    # The legacy implementation contains a literal super_admin check. Call it with
    # a transient policy adapter, then restore the real actor role on the product
    # and in the audit event. No user or token record is changed.
    policy_user = user.model_copy(update={"role": "super_admin"})
    created = await core._admin_create_quick_product_impl(payload, request, policy_user)
    product_id = created.id if hasattr(created, "id") else created.get("id")
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    integrity = product_integrity_fields(product or {}, creator, user)
    patch = {
        **integrity,
        "created_by_user_id": user.id,
        "created_by_role": user.role,
        "last_edited_by_user_id": user.id,
        "last_edited_by_role": user.role,
        "updated_at": utc_iso(),
    }
    await db.products.update_one({"id": product_id}, {"$set": patch})
    updated = await db.products.find_one({"id": product_id}, {"_id": 0})
    await write_audit_event(
        db,
        action="product.create_for_creator",
        entity_type="product",
        entity_id=product_id,
        actor=user,
        before=None,
        after={
            "creator_id": creator.get("id"),
            "title": updated.get("title"),
            "published": updated.get("published"),
            "product_version": updated.get("product_version"),
        },
        reason="Platform-created Creator product",
        request=request,
        related_creator_id=creator.get("id"),
        related_product_id=product_id,
    )
    return updated


async def _archive_product(db, product: dict, user: User, request: Request, reason: str):
    before = {
        "status": product.get("status"),
        "published": product.get("published"),
        "archived_at": product.get("archived_at"),
    }
    patch = {
        "status": "archived",
        "published": False,
        "active": False,
        "is_active": False,
        "archived_at": utc_iso(),
        "archived_by_user_id": user.id,
        "archived_by_role": user.role,
        "archive_reason": reason,
        "updated_at": utc_iso(),
        "product_version": int(product.get("product_version") or 1) + 1,
    }
    result = await db.products.update_one(
        {"id": product.get("id"), "status": {"$ne": "archived"}},
        {"$set": patch},
    )
    await write_audit_event(
        db,
        action="product.archive",
        entity_type="product",
        entity_id=product.get("id"),
        actor=user,
        before=before,
        after=patch,
        reason=reason,
        request=request,
        related_creator_id=product.get("band_id"),
        related_product_id=product.get("id"),
    )
    return {"status": "archived", "already_archived": result.modified_count == 0, "product_id": product.get("id")}


@safety_router.delete("/products/{product_id}")
async def archive_creator_product(
    product_id: str,
    request: Request,
    reason: str = "Archived through product management",
    user: User = Depends(get_current_user),
):
    db = request.app.state.db
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    allowed = await core.user_can_access_band(db, user, product.get("band_id"), permission="manage_products")
    if not allowed:
        raise HTTPException(status_code=403, detail="Not your product")
    return await _archive_product(db, product, user, request, reason)


@safety_router.delete("/admin/products/{product_id}")
async def archive_admin_product(
    product_id: str,
    request: Request,
    reason: str = "Archived by Platform administration",
    user: User = Depends(get_current_user),
):
    require_manager_permission(user, "manage_products")
    db = request.app.state.db
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return await _archive_product(db, product, user, request, reason)


@safety_router.post("/artworks/upload")
async def immutable_artwork_upload(
    request: Request,
    product_id: str = Form(...),
    placement: str = Form("front"),
    notes: str = Form(""),
    dimensions: str = Form(""),
    dpi: int = Form(300),
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    db = request.app.state.db
    before = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not before:
        raise HTTPException(status_code=404, detail="Product not found")
    result = await core.upload_artwork(
        request=request,
        product_id=product_id,
        placement=placement,
        notes=notes,
        dimensions=dimensions,
        dpi=dpi,
        file=file,
        user=user,
    )
    uploaded = result.model_dump() if hasattr(result, "model_dump") else dict(result)
    url = uploaded.get("file_url") or uploaded.get("url")
    digest, provenance = content_hash_for_url(url or "")
    now = utc_iso()
    asset_patch = {
        "immutable_asset_url": url,
        "content_sha256": digest,
        "hash_provenance": provenance,
        "asset_version": 1,
        "asset_version_id": f"asset-{digest[:24]}",
        "asset_created_at": now,
        "uploaded_by_user_id": user.id,
        "uploaded_by_role": user.role,
    }
    await db.artworks.update_one({"id": uploaded.get("id")}, {"$set": asset_patch})

    product = await db.products.find_one({"id": product_id}, {"_id": 0}) or before
    if role_of(user) in {"owner", "super_admin", "admin"}:
        groups = product.get("artwork_groups") or []
        for group in groups:
            for slot in group.get("artworks") or []:
                if slot.get("original_url") == url:
                    slot["status"] = "approved"
                    slot["reviewed_by_user_id"] = user.id
                    slot["reviewed_at"] = now
        flat = product.get("artworks") or []
        for slot in flat:
            if slot.get("original_url") == url:
                slot["status"] = "approved"
                slot["reviewed_by_user_id"] = user.id
                slot["reviewed_at"] = now
        product["artwork_groups"] = groups
        product["artworks"] = flat
        product["artwork_review_status"] = core._derive_artwork_review_status(product)

    creator = await db.creators.find_one({"id": product.get("band_id")}, {"_id": 0}) or {"id": product.get("band_id")}
    integrity = product_integrity_fields(product, creator, user)
    integrity["updated_at"] = now
    await db.products.update_one(
        {"id": product_id},
        {"$set": {
            **integrity,
            "artwork_groups": product.get("artwork_groups") or [],
            "artworks": product.get("artworks") or [],
            "artwork_review_status": product.get("artwork_review_status"),
        }},
    )
    after = await db.products.find_one({"id": product_id}, {"_id": 0})
    await write_audit_event(
        db,
        action="artwork.asset_version_create",
        entity_type="artwork_asset",
        entity_id=asset_patch["asset_version_id"],
        actor=user,
        before=None,
        after={**asset_patch, "product_version": after.get("product_version")},
        reason=notes or "Artwork uploaded",
        request=request,
        related_creator_id=product.get("band_id"),
        related_product_id=product_id,
    )
    return {
        **uploaded,
        **asset_patch,
        "product_version": after.get("product_version"),
        "design_sha256": after.get("design_sha256"),
    }
