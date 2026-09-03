"""Generated text artwork persistence for products and production snapshots."""
from __future__ import annotations

import base64
import binascii
import hashlib
import re
from copy import deepcopy
from pathlib import Path
from urllib.parse import quote, unquote_to_bytes

from fastapi import HTTPException

from storage import UPLOAD_ROOT

TEXT_UPLOAD_DIR = Path(UPLOAD_ROOT) / "product-artwork" / "text"
TEXT_PUBLIC_PREFIX = "/api/uploads/product-artwork/text"
DATA_URL_RE = re.compile(
    r"^data:(?P<mime>[^;,]+)?(?P<charset>;charset=[^;,]+)?(?P<base64>;base64)?,(?P<data>.*)$",
    re.IGNORECASE | re.DOTALL,
)
TEXT_METADATA_FIELDS = (
    "text_layer",
    "text_content",
    "text_font_family",
    "text_font_weight",
    "text_font_size",
    "text_color",
    "lock_aspect_ratio",
    "original_width_px",
    "original_height_px",
    "artwork_aspect_ratio",
    "generated_artwork_file",
    "artwork_source_type",
    "artwork_content_sha256",
)


def is_text_layer(slot: dict | None) -> bool:
    slot = slot or {}
    return bool(slot.get("text_layer") or slot.get("text_content"))


def _escape_svg(value: str) -> str:
    return (
        str(value or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def ensure_text_slot_source(slot: dict | None) -> dict:
    """Ensure editable text has a deterministic SVG data source before persistence."""
    next_slot = dict(slot or {})
    if not is_text_layer(next_slot) or next_slot.get("original_url"):
        return next_slot

    text = str(next_slot.get("text_content") or next_slot.get("text") or "Custom Text")[:240]
    font = str(next_slot.get("text_font_family") or "Arial")
    weight = str(next_slot.get("text_font_weight") or "700")
    size = max(24, min(int(float(next_slot.get("text_font_size") or 180)), 1200))
    colour = str(next_slot.get("text_color") or "#111111")
    lines = [line for line in text.splitlines() if line.strip()] or ["Custom Text"]
    width = max(320, min(2400, max(len(line) for line in lines) * int(size * 0.62) + int(size * 0.6)))
    height = max(160, min(2400, len(lines) * int(size * 1.35) + int(size * 0.6)))
    y = int(size * 0.85)
    tspans = [
        f'<tspan x="50%" y="{y + index * int(size * 1.28)}" text-anchor="middle">{_escape_svg(line)}</tspan>'
        for index, line in enumerate(lines)
    ]
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">'
        f'<rect width="100%" height="100%" fill="transparent"/>'
        f'<text font-family="{_escape_svg(font)}" font-size="{size}" font-weight="{_escape_svg(weight)}" fill="{_escape_svg(colour)}">'
        f'{"".join(tspans)}</text></svg>'
    )
    next_slot["original_url"] = f"data:image/svg+xml;charset=utf-8,{quote(svg)}"
    next_slot["file_name"] = next_slot.get("file_name") or "text-layer.svg"
    next_slot["mime_type"] = next_slot.get("mime_type") or "image/svg+xml"
    next_slot["original_width_px"] = next_slot.get("original_width_px") or 1000
    next_slot["original_height_px"] = next_slot.get("original_height_px") or 350
    next_slot["artwork_aspect_ratio"] = next_slot.get("artwork_aspect_ratio") or 2.85
    return next_slot


def _decode_svg_data_url(value: str) -> bytes:
    match = DATA_URL_RE.match(str(value or ""))
    if not match:
        raise HTTPException(status_code=400, detail="Generated text artwork is not a valid data URL")
    mime_type = str(match.group("mime") or "image/svg+xml").lower()
    if mime_type != "image/svg+xml":
        raise HTTPException(status_code=400, detail="Generated text artwork must be SVG")
    payload = match.group("data") or ""
    try:
        content = base64.b64decode(payload, validate=True) if match.group("base64") else unquote_to_bytes(payload)
    except (ValueError, binascii.Error) as exc:
        raise HTTPException(status_code=400, detail="Generated text artwork could not be decoded") from exc
    if len(content) < 20 or b"<svg" not in content.lower():
        raise HTTPException(status_code=400, detail="Generated text artwork does not contain a valid SVG document")
    lowered = content.lower()
    forbidden = (b"<script", b"javascript:", b"onload=", b"onerror=", b"<foreignobject")
    if any(token in lowered for token in forbidden):
        raise HTTPException(status_code=400, detail="Generated text artwork contains unsupported SVG content")
    return content


def materialize_text_slot(slot: dict | None) -> dict:
    """Persist generated SVG text as a stable content-addressed production file."""
    next_slot = ensure_text_slot_source(slot)
    if not is_text_layer(next_slot):
        return next_slot
    original_url = str(next_slot.get("original_url") or "")
    if original_url and not original_url.startswith("data:"):
        next_slot.setdefault("generated_artwork_file", True)
        next_slot.setdefault("artwork_source_type", "generated_text_svg")
        return next_slot
    if not original_url:
        return next_slot

    content = _decode_svg_data_url(original_url)
    digest = hashlib.sha256(content).hexdigest()
    TEXT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    file_name = f"{digest}.svg"
    destination = TEXT_UPLOAD_DIR / file_name
    if not destination.exists():
        destination.write_bytes(content)
    next_slot.update({
        "original_url": f"{TEXT_PUBLIC_PREFIX}/{file_name}",
        "file_name": next_slot.get("file_name") or "text-layer.svg",
        "mime_type": "image/svg+xml",
        "generated_artwork_file": True,
        "artwork_source_type": "generated_text_svg",
        "artwork_content_sha256": digest,
    })
    return next_slot


def materialize_product_artworks(product: dict | None) -> dict:
    prepared = deepcopy(product or {})
    prepared["artworks"] = [materialize_text_slot(slot) for slot in (prepared.get("artworks") or [])]
    groups = []
    for group in prepared.get("artwork_groups") or []:
        next_group = dict(group or {})
        next_group["artworks"] = [materialize_text_slot(slot) for slot in (next_group.get("artworks") or [])]
        groups.append(next_group)
    prepared["artwork_groups"] = groups
    by_id = {
        slot.get("id"): slot
        for group in groups
        for slot in (group.get("artworks") or [])
        if slot.get("id")
    }
    if by_id:
        prepared["artworks"] = [dict(by_id.get(slot.get("id")) or slot) for slot in prepared.get("artworks") or []]
    if is_text_layer(prepared.get("artwork") or {}):
        prepared["artwork"] = materialize_text_slot(prepared.get("artwork"))
    return prepared


def copy_text_metadata_to_snapshot(snapshot: dict, product: dict) -> dict:
    """Preserve editable text metadata alongside stable production file URLs."""
    snapshot = dict(snapshot or {})
    source_rows = []
    for group in product.get("artwork_groups") or []:
        source_rows.extend(group.get("artworks") or [])
    source_rows.extend(product.get("artworks") or [])
    source_rows = [dict(row or {}) for row in source_rows]
    by_id = {row.get("id"): row for row in source_rows if row.get("id")}
    by_url = {row.get("original_url"): row for row in source_rows if row.get("original_url")}

    def copy_metadata(target: dict | None, source: dict | None) -> None:
        if not target or not source or not is_text_layer(source):
            return
        for key in TEXT_METADATA_FIELDS:
            if key in source:
                target[key] = source.get(key)
        target["url"] = source.get("original_url") or target.get("url")
        target["file_name"] = source.get("file_name") or target.get("file_name")
        target["mime_type"] = source.get("mime_type") or target.get("mime_type") or "image/svg+xml"

    for target in snapshot.get("artworks") or []:
        copy_metadata(target, by_id.get(target.get("id")) or by_url.get(target.get("url")))
    primary = snapshot.get("artwork") or {}
    copy_metadata(primary, by_id.get(primary.get("id")) or by_url.get(primary.get("url")))
    snapshot["artwork"] = primary
    return snapshot
