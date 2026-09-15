"""Product ownership, immutable artwork versions and canonical design snapshots."""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
import mimetypes
from pathlib import Path
from typing import Any, Dict, List, Optional

from storage import UPLOAD_ROOT

DESIGN_CONTRACT_VERSION = "design_spec_v1"


def utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _hash_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _hash_json(value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")
    return _hash_bytes(payload)


def _local_upload_path(url: str) -> Optional[Path]:
    marker = "/api/uploads/"
    if not url or marker not in url:
        return None
    relative = url.split(marker, 1)[1].lstrip("/")
    candidate = (Path(UPLOAD_ROOT) / relative).resolve()
    root = Path(UPLOAD_ROOT).resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        return None
    return candidate if candidate.exists() and candidate.is_file() else None


def content_hash_for_url(url: str) -> tuple[str, str]:
    path = _local_upload_path(url)
    if path:
        return _hash_bytes(path.read_bytes()), "file_content"
    return _hash_bytes(str(url or "").encode("utf-8")), "url_reference"


def _placement(row: Dict[str, Any]) -> Dict[str, Any]:
    placement = dict(row.get("placement") or {})
    return {
        "screen_id": placement.get("screen_id") or row.get("screen_id"),
        "print_area_id": placement.get("print_area_id") or row.get("print_area_id"),
        "x": float(placement.get("x") if placement.get("x") is not None else 0),
        "y": float(placement.get("y") if placement.get("y") is not None else 0),
        "width": float(placement.get("width") if placement.get("width") is not None else 100),
        "height": float(placement.get("height") if placement.get("height") is not None else 100),
        "rotation": float(placement.get("rotation") or 0),
        "scale": float(placement.get("scale") or 1),
        "crop": deepcopy(placement.get("crop")) if isinstance(placement.get("crop"), dict) else None,
    }


def typed_text_layer(row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not (row.get("text_layer") or row.get("text_content")):
        return None
    font_identifier = row.get("text_font_identifier") or row.get("text_font_family") or "Arial"
    return {
        "contract_version": "text_layer_v1",
        "text": str(row.get("text_content") or row.get("text") or ""),
        "font_identifier": str(font_identifier),
        "font_source": row.get("text_font_source") or "platform_approved",
        "font_licence": row.get("text_font_licence") or "approved_internal_reference",
        "font_weight": str(row.get("text_font_weight") or "400"),
        "font_size": float(row.get("text_font_size") or 0),
        "colour": str(row.get("text_color") or "#000000"),
        "alignment": str(row.get("text_alignment") or "center"),
        "rotation": float((row.get("placement") or {}).get("rotation") or 0),
        "scale": float((row.get("placement") or {}).get("scale") or 1),
        "curvature": row.get("text_curvature"),
        "effect": deepcopy(row.get("text_effect")) if isinstance(row.get("text_effect"), dict) else None,
        "print_area_id": row.get("print_area_id"),
        "layer_order": int(row.get("sort_order") or 0),
        "rendered_preview_url": row.get("mockup_image_url"),
        "production_render_url": row.get("original_url"),
    }


def artwork_asset_version(row: Dict[str, Any], product_version: int) -> Dict[str, Any]:
    url = str(row.get("original_url") or row.get("url") or "")
    digest, provenance = content_hash_for_url(url)
    text = typed_text_layer(row)
    version_id = f"asset-{digest[:24]}"
    return {
        "asset_version_id": version_id,
        "asset_version": int(row.get("asset_version") or 1),
        "product_version": product_version,
        "original_asset_url": url,
        "immutable_asset_url": url,
        "content_sha256": digest,
        "hash_provenance": provenance,
        "mime_type": row.get("mime_type") or mimetypes.guess_type(url)[0],
        "file_name": row.get("file_name"),
        "original_width_px": row.get("original_width_px"),
        "original_height_px": row.get("original_height_px"),
        "dpi": row.get("dpi"),
        "transparency": row.get("transparency") if row.get("transparency") is not None else "unknown",
        "print_area_id": row.get("print_area_id"),
        "print_option_id": row.get("print_option_id"),
        "placement": _placement(row),
        "approval_status": row.get("status") or "pending_review",
        "approved_by_user_id": row.get("reviewed_by_user_id"),
        "approved_at": row.get("reviewed_at"),
        "preview_asset_url": row.get("mockup_image_url"),
        "printer_production_asset_url": url,
        "text_layer": text,
        "created_at": row.get("asset_created_at") or utc_iso(),
    }


def _flatten_artworks(product: Dict[str, Any]) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    seen = set()
    for group in product.get("artwork_groups") or []:
        for row in group.get("artworks") or []:
            key = row.get("id") or row.get("original_url") or _hash_json(row)
            if key not in seen:
                rows.append(dict(row))
                seen.add(key)
    for row in product.get("artworks") or []:
        key = row.get("id") or row.get("original_url") or _hash_json(row)
        if key not in seen:
            rows.append(dict(row))
            seen.add(key)
    if product.get("artwork"):
        row = dict(product.get("artwork") or {})
        key = row.get("id") or row.get("original_url") or _hash_json(row)
        if key not in seen:
            rows.append(row)
    return rows


def _hashable_asset(asset: Dict[str, Any]) -> Dict[str, Any]:
    return {key: deepcopy(value) for key, value in asset.items() if key not in {"created_at"}}


def canonical_design_spec(product: Dict[str, Any], product_version: int) -> Dict[str, Any]:
    assets = [
        artwork_asset_version(row, product_version)
        for row in _flatten_artworks(product)
        if row.get("original_url") or row.get("text_content")
    ]
    spec = {
        "contract_version": DESIGN_CONTRACT_VERSION,
        "product_id": product.get("id"),
        "product_version": product_version,
        "creator_id": product.get("creator_id") or product.get("band_id"),
        "store_id": product.get("store_id") or product.get("band_id"),
        "template_id": product.get("template_id"),
        "template_version": product.get("template_version"),
        "selected_template_variation_ids": list(product.get("selected_template_variation_ids") or []),
        "assets": assets,
        "text_layers": [row["text_layer"] for row in assets if row.get("text_layer")],
        "print_areas": sorted({str(row.get("print_area_id")) for row in assets if row.get("print_area_id")}),
        "production_operations": deepcopy(product.get("production_operation_lines") or []),
        "generated_at": utc_iso(),
    }
    hash_contract = {
        **{key: value for key, value in spec.items() if key not in {"generated_at", "assets"}},
        "assets": [_hashable_asset(asset) for asset in assets],
    }
    spec["design_sha256"] = _hash_json(hash_contract)
    return spec


def product_integrity_fields(product: Dict[str, Any], creator: Dict[str, Any], user: Any) -> Dict[str, Any]:
    current_version = max(int(product.get("product_version") or 0), 0)
    next_version = current_version + 1
    actor_id = getattr(user, "id", None) or (user or {}).get("id")
    actor_role = getattr(user, "role", None) or (user or {}).get("role")
    creator_id = creator.get("id") or product.get("band_id")
    fields = {
        "band_id": creator_id,
        "creator_id": creator_id,
        "creator_account_id": creator_id,
        "store_id": creator_id,
        "created_by_user_id": product.get("created_by_user_id") or actor_id,
        "created_by_role": product.get("created_by_role") or actor_role,
        "last_edited_by_user_id": actor_id,
        "last_edited_by_role": actor_role,
        "last_edited_at": utc_iso(),
        "product_version": next_version,
        "template_version": product.get("template_version") or product.get("template_updated_at") or "legacy-unversioned",
        "ownership_locked": True,
    }
    prepared = {**product, **fields}
    design = canonical_design_spec(prepared, next_version)
    fields["canonical_design_spec"] = design
    fields["design_sha256"] = design["design_sha256"]
    fields["artwork_asset_versions"] = design["assets"]
    return fields


def enrich_production_snapshot(snapshot: Dict[str, Any], product: Dict[str, Any], quantity: int) -> Dict[str, Any]:
    out = deepcopy(snapshot or {})
    product_version = int(product.get("product_version") or 1)
    design = deepcopy(product.get("canonical_design_spec") or canonical_design_spec(product, product_version))
    out.update({
        "snapshot_contract_version": "production_snapshot_v2",
        "creator_id": product.get("creator_id") or product.get("band_id"),
        "creator_account_id": product.get("creator_account_id") or product.get("band_id"),
        "store_id": product.get("store_id") or product.get("band_id"),
        "product_id": product.get("id"),
        "product_version": product_version,
        "template_id": product.get("template_id") or out.get("template_id"),
        "template_version": product.get("template_version") or "legacy-unversioned",
        "canonical_design_spec": design,
        "design_sha256": design.get("design_sha256"),
        "artwork_asset_versions": deepcopy(design.get("assets") or []),
        "text_layers": deepcopy(design.get("text_layers") or []),
        "production_operations": deepcopy(product.get("production_operation_lines") or out.get("production_operations") or []),
        "quantity": max(int(quantity or 1), 1),
        "snapshot_created_at": utc_iso(),
        "immutable": True,
    })
    out["snapshot_sha256"] = _hash_json({key: value for key, value in out.items() if key not in {"snapshot_created_at", "snapshot_sha256"}})
    return out


def install_design_integrity(routes_main_module: Any) -> None:
    if getattr(routes_main_module, "_launch_design_integrity_installed", False):
        return
    original_normalize = routes_main_module.normalize_template_product_payload
    original_snapshot = routes_main_module._build_production_snapshot

    async def wrapped_normalize(*, db, data, creator, user, allow_admin_publish=False):
        incoming_owner = data.get("band_id") or data.get("creator_id") or creator.get("id")
        if incoming_owner and incoming_owner != creator.get("id"):
            from fastapi import HTTPException
            raise HTTPException(status_code=409, detail="Product ownership cannot be changed through an ordinary edit")
        normalized = await original_normalize(
            db=db,
            data=data,
            creator=creator,
            user=user,
            allow_admin_publish=allow_admin_publish,
        )
        normalized.update(product_integrity_fields(normalized, creator, user))
        return normalized

    def wrapped_snapshot(product, template, product_variation, quantity):
        return enrich_production_snapshot(
            original_snapshot(product, template, product_variation, quantity),
            product,
            quantity,
        )

    routes_main_module.normalize_template_product_payload = wrapped_normalize
    routes_main_module._build_production_snapshot = wrapped_snapshot
    routes_main_module._launch_design_integrity_installed = True
