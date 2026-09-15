from __future__ import annotations

from urllib.parse import quote

import pytest
from fastapi import HTTPException

import generated_text_artwork as text_artwork


def text_slot(text="Forge It", font="Montserrat", colour="#ff8c01"):
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200">'
        f'<text font-family="{font}" fill="{colour}">{text}</text>'
        "</svg>"
    )
    return {
        "id": "text-1", "text_layer": True, "text_content": text,
        "text_font_family": font, "text_font_weight": "700",
        "text_font_size": 160, "text_color": colour,
        "original_url": f"data:image/svg+xml;charset=utf-8,{quote(svg)}",
        "file_name": "forge-it.svg", "mime_type": "image/svg+xml",
        "print_area_id": "front",
        "placement": {"x": 10, "y": 20, "width": 60, "height": 25, "rotation": 0},
    }


def test_materialises_text_layer_as_stable_svg_file(tmp_path, monkeypatch):
    monkeypatch.setattr(text_artwork, "TEXT_UPLOAD_DIR", tmp_path)
    first = text_artwork.materialize_text_slot(text_slot())
    second = text_artwork.materialize_text_slot(text_slot())
    assert first["original_url"] == second["original_url"]
    assert first["original_url"].startswith("/api/uploads/product-artwork/text/")
    assert first["generated_artwork_file"] is True
    generated = tmp_path / first["original_url"].rsplit("/", 1)[-1]
    assert generated.exists()
    assert b"Forge It" in generated.read_bytes()


def test_text_without_browser_data_url_gets_generated_and_materialised(tmp_path, monkeypatch):
    monkeypatch.setattr(text_artwork, "TEXT_UPLOAD_DIR", tmp_path)
    slot = text_slot()
    slot.pop("original_url")
    saved = text_artwork.materialize_text_slot(slot)
    assert saved["original_url"].startswith("/api/uploads/product-artwork/text/")
    assert saved["generated_artwork_file"] is True


def test_rejects_executable_svg(tmp_path, monkeypatch):
    monkeypatch.setattr(text_artwork, "TEXT_UPLOAD_DIR", tmp_path)
    bad = text_slot()
    bad["original_url"] = "data:image/svg+xml,%3Csvg%3E%3Cscript%3Ealert(1)%3C/script%3E%3C/svg%3E"
    with pytest.raises(HTTPException) as exc:
        text_artwork.materialize_text_slot(bad)
    assert exc.value.status_code == 400


def test_snapshot_receives_stable_url_and_editable_metadata(tmp_path, monkeypatch):
    monkeypatch.setattr(text_artwork, "TEXT_UPLOAD_DIR", tmp_path)
    slot = text_artwork.materialize_text_slot(text_slot())
    product = {"artworks": [slot], "artwork_groups": [{"id":"g1","artworks":[slot]}], "artwork": slot}
    snapshot = {
        "artwork": {"id": slot["id"], "url": slot["original_url"]},
        "artworks": [{"id": slot["id"], "url": slot["original_url"]}],
    }
    result = text_artwork.copy_text_metadata_to_snapshot(snapshot, product)
    assert result["artwork"]["text_content"] == "Forge It"
    assert result["artwork"]["text_font_family"] == "Montserrat"
    assert result["artworks"][0]["generated_artwork_file"] is True
