#!/usr/bin/env python3
"""Canonicalize production-model extra-field policy without runtime mutation.

Temporary migration helper. It is intentionally deterministic and idempotent;
remove it before merging the cleanup PR.
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODELS_PATH = ROOT / "backend" / "models.py"
SERVER_PATH = ROOT / "backend" / "server.py"
COMPAT_PATH = ROOT / "backend" / "production_model_compat.py"

TARGET_MODELS = (
    "ProductTemplatePrintArea",
    "ProductTemplatePrintOption",
    "ProductTemplateVariation",
    "ProductTemplateBase",
    "ProductTemplateCreate",
    "ProductTemplateUpdate",
    "ProductTemplate",
    "ProductArtworkSnapshot",
    "ProductArtworkPlacement",
    "ProductArtworkSlot",
    "ProductArtworkGroup",
    "ProductBase",
    "ProductCreate",
    "ProductUpdate",
    "Product",
    "ProductionSnapshot",
    "OrderItem",
)

CLASS_RE = re.compile(r"^class\s+([A-Za-z_][A-Za-z0-9_]*)\([^)]*\):\s*$")
MODEL_CONFIG_RE = re.compile(r'^\s{4}model_config\s*=\s*ConfigDict\(extra=["\'](?:allow|ignore|forbid)["\']\)\s*$')


def canonicalize_models(source: str) -> str:
    lines = source.splitlines()
    output: list[str] = []
    seen: set[str] = set()
    index = 0

    while index < len(lines):
        line = lines[index]
        match = CLASS_RE.match(line)
        if not match or match.group(1) not in TARGET_MODELS:
            output.append(line)
            index += 1
            continue

        name = match.group(1)
        seen.add(name)
        output.append(line)

        next_index = index + 1
        if next_index < len(lines) and MODEL_CONFIG_RE.match(lines[next_index]):
            output.append('    model_config = ConfigDict(extra="allow")')
            index = next_index + 1
        else:
            output.append('    model_config = ConfigDict(extra="allow")')
            output.append("")
            index += 1

    missing = sorted(set(TARGET_MODELS) - seen)
    if missing:
        raise RuntimeError(f"Missing expected model classes: {', '.join(missing)}")

    transformed = "\n".join(output) + "\n"
    for name in TARGET_MODELS:
        marker = f"class {name}("
        start = transformed.index(marker)
        next_class = transformed.find("\nclass ", start + len(marker))
        block = transformed[start : next_class if next_class != -1 else None]
        if 'model_config = ConfigDict(extra="allow")' not in block:
            raise RuntimeError(f"Canonical extra-field policy not applied to {name}")
    return transformed


def canonicalize_server(source: str) -> str:
    install_block = (
        "from production_model_compat import install_production_model_compat\n"
        "install_production_model_compat()\n"
    )
    if install_block in source:
        source = source.replace(install_block, "", 1)
    if "production_model_compat" in source or "install_production_model_compat" in source:
        raise RuntimeError("production_model_compat startup hook still present in server.py")
    return source


def main() -> None:
    before_models = MODELS_PATH.read_text(encoding="utf-8")
    after_models = canonicalize_models(before_models)
    MODELS_PATH.write_text(after_models, encoding="utf-8")

    before_server = SERVER_PATH.read_text(encoding="utf-8")
    after_server = canonicalize_server(before_server)
    SERVER_PATH.write_text(after_server, encoding="utf-8")

    if COMPAT_PATH.exists():
        COMPAT_PATH.unlink()

    print("canonical-production-model-policy-ok")


if __name__ == "__main__":
    main()
