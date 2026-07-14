from __future__ import annotations

from types import SimpleNamespace
from urllib.parse import quote

import pytest
from fastapi import HTTPException

import builder_text_artwork_patch as patch


def text_slot(text="Forge It", font="Montserrat", colour="#ff8c01"):
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200">'
        f'<text font-family="{font}" fill="{colour}">{text}</text>'
        "</svg>"
    )
    return {
        "id": "text-1",
        "text_layer": True,
        "text_content": text,
        "text_font_family": font,
        "text_font_weight": "700",
        "text_font_size": 160,
        "text_color": colour,
        "original_url": f"data:image/svg+xml;charset=utf-8,{quote(svg)}",
        "file_name": "forge-it.svg",
        "mime_type": "image/svg+xml",
        "print_area_id": "front",
        "placement": {"x": 10, "y": 20, "width": 60, "height": 25, "rotation": 0},
    }


def test_materialises_text_layer_as_stable_svg_file(tmp_path, monkeypatch):
    monkeypatch.setattr(patch, "_TEXT_UPLOAD_DIR", tmp_path)
    monkeypatch.setattr(patch, "_TEXT_PUBLIC_PREFIX", "/api/uploads/product-artwork/text")

    first = patch._materialize_text_slot(text_slot())
    second = patch._materialize_text_slot(text_slot())

    assert first["original_url"].startswith("/api/uploads/product-artwork/text/")
    assert first["original_url"] == second["original_url"]
    assert first["mime_type"] == "image/svg+xml"
    assert first["generated_artwork_file"] is True
    assert first["artwork_source_type"] == "generated_text_svg"
    assert first["artwork_content_sha256"]

    generated = tmp_path / first["original_url"].rsplit("/", 1)[-1]
    assert generated.exists()
    assert b"Forge It" in generated.read_bytes()
    assert len(list(tmp_path.glob("*.svg"))) == 1


def test_rejects_executable_svg(tmp_path, monkeypatch):
    monkeypatch.setattr(patch, "_TEXT_UPLOAD_DIR", tmp_path)
    bad = text_slot()
    bad["original_url"] = "data:image/svg+xml,%3Csvg%3E%3Cscript%3Ealert(1)%3C/script%3E%3C/svg%3E"

    with pytest.raises(HTTPException) as exc:
        patch._materialize_text_slot(bad)

    assert exc.value.status_code == 400


def test_order_snapshot_receives_file_url_and_editable_text_metadata(tmp_path, monkeypatch):
    monkeypatch.setattr(patch, "_TEXT_UPLOAD_DIR", tmp_path)
    monkeypatch.setattr(patch, "_TEXT_PUBLIC_PREFIX", "/api/uploads/product-artwork/text")

    def normalize_slot(row, index=0):
        return dict(row)

    def build_snapshot(product, template, variation, quantity):
        slot = product["artworks"][0]
        return {
            "artwork": {
                "id": slot["id"],
                "url": slot["original_url"],
                "file_name": slot["file_name"],
                "mime_type": slot["mime_type"],
            },
            "artworks": [
                {
                    "id": slot["id"],
                    "url": slot["original_url"],
                    "file_name": slot["file_name"],
                    "mime_type": slot["mime_type"],
                    "placement": slot["placement"],
                }
            ],
        }

    routes = SimpleNamespace(
        _normalize_product_artwork_slot=normalize_slot,
        _build_production_snapshot=build_snapshot,
    )
    patch.install_builder_text_artwork_patch(routes)

    slot = routes._normalize_product_artwork_slot(text_slot(), 0)
    product = {
        "artworks": [slot],
        "artwork_groups": [{"id": "group-1", "artworks": [slot]}],
        "artwork": slot,
    }
    snapshot = routes._build_production_snapshot(product, {}, {}, 1)

    assert snapshot["artwork"]["url"].startswith("/api/uploads/product-artwork/text/")
    assert snapshot["artwork"]["text_layer"] is True
    assert snapshot["artwork"]["text_content"] == "Forge It"
    assert snapshot["artwork"]["text_font_family"] == "Montserrat"
    assert snapshot["artwork"]["text_color"] == "#ff8c01"

    order_slot = snapshot["artworks"][0]
    assert order_slot["url"] == snapshot["artwork"]["url"]
    assert order_slot["text_content"] == "Forge It"
    assert order_slot["generated_artwork_file"] is True
