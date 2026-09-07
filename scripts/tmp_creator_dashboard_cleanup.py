#!/usr/bin/env python3
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DASHBOARD = ROOT / "frontend/src/pages/BandDashboard.jsx"


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return source.replace(old, new, 1)


def main() -> None:
    source = DASHBOARD.read_text(encoding="utf-8")

    source = replace_once(
        source,
        'import { Link, Route, Routes, useNavigate, useParams } from "react-router-dom";',
        'import { Link, Route, Routes, useNavigate } from "react-router-dom";',
        "react-router import",
    )
    source = replace_once(source, "  Trash2,\n", "", "Trash2 import")
    source = replace_once(source, "  Eye,\n", "", "Eye import")
    source = replace_once(
        source,
        'import AttributeVariationEditor from "../components/AttributeVariationEditor";\n',
        "",
        "legacy variation editor import",
    )

    # Remove two unused visibility helpers while this file is being cleaned.
    helper_pattern = re.compile(
        r'function creatorVisibilityLabel\(value\) \{.*?\n\}\n\n'
        r'function creatorVisibilityDescription\(value\) \{.*?\n\}\n\n',
        re.S,
    )
    source, helper_count = helper_pattern.subn("", source, count=1)
    if helper_count != 1:
        raise RuntimeError("unused creator visibility helper block missing or duplicated")

    # The canonical ProductBuilder owns both create/edit routes. Delete the unreachable former generation.
    product_form_pattern = re.compile(
        r'\nfunction ProductForm\(\) \{.*?\n\}\n\nfunction OrdersList\(\) \{',
        re.S,
    )
    source, form_count = product_form_pattern.subn("\nfunction OrdersList() {", source, count=1)
    if form_count != 1:
        raise RuntimeError("legacy ProductForm block missing or duplicated")

    source = replace_once(
        source,
        'function CreatorImageField({ label, value, onUpload, hint, requirements, inputId, previewClassName = "aspect-video" }) {',
        'function CreatorImageField({ label, value, onUpload, hint, requirements, inputId, previewClassName = "aspect-video", previewImageClassName = "object-contain p-3" }) {',
        "creator image field signature",
    )
    source = replace_once(
        source,
        '<img src={assetUrl(value)} alt={label} className="w-full h-full object-contain p-3" />',
        '<img src={assetUrl(value)} alt={label} className={`w-full h-full ${previewImageClassName}`} />',
        "creator image preview",
    )
    source = replace_once(
        source,
        '                  previewClassName="aspect-[16/6]"\n                  onUpload={(file) => uploadStoreImage(file, "banner_url")}',
        '                  previewClassName="aspect-[16/6]"\n                  previewImageClassName="object-cover"\n                  onUpload={(file) => uploadStoreImage(file, "banner_url")}',
        "store banner crop preview",
    )

    source = replace_once(
        source,
        '<div className="grid grid-cols-2 lg:grid-cols-5 gap-0 border border-[var(--ff-card-border)]">',
        '<div className="grid grid-cols-2 lg:grid-cols-5 gap-3">',
        "creator overview stat grid",
    )
    source = replace_once(
        source,
        '        ].map((s, i) => (\n          <div key={s.k} className={`p-6 ${i < 4 ? "border-r border-[var(--ff-card-border)]" : ""}`}>',
        '        ].map((s) => (\n          <div key={s.k} className="ff-admin-stat-card min-w-0">',
        "creator overview stat cards",
    )

    required = [
        '<Route path="products/new" element={<ProductBuilder mode="creator" backTo="/creator/products" />} />',
        '<Route path="products/:id" element={<ProductBuilder mode="creator" backTo="/creator/products" />} />',
        'previewImageClassName = "object-contain p-3"',
        'previewImageClassName="object-cover"',
        'className="grid grid-cols-2 lg:grid-cols-5 gap-3"',
        'className="ff-admin-stat-card min-w-0"',
    ]
    for needle in required:
        if needle not in source:
            raise RuntimeError(f"cleanup invariant missing: {needle}")

    forbidden = [
        "function ProductForm()",
        "useParams",
        "AttributeVariationEditor",
        "creatorVisibilityLabel",
        "creatorVisibilityDescription",
    ]
    for needle in forbidden:
        if needle in source:
            raise RuntimeError(f"dead creator dashboard code remains: {needle}")

    DASHBOARD.write_text(source, encoding="utf-8")
    print("creator-dashboard-cleanup-ok")


if __name__ == "__main__":
    main()
