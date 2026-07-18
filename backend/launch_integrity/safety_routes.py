"""Non-destructive overrides for legacy product and artwork mutation routes."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile

from auth import get_current_user
from models import User
import routes_main as core

from .audit import write_audit_event
from .design import content_hash_for_url, product_integrity_fields
from .permissions import require_manager_permission, role_of

safety_router = APIRouter(tags=["launch-integrity-safety"])


def utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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
    return {**uploaded, **asset_patch, "product_version": after.get("product_version"), "design_sha256": after.get("design_sha256")}
