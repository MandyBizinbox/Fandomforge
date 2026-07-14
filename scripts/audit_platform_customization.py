#!/usr/bin/env python3
"""Audit user-visible hard-coded branding and theme values.

Run from the repository root:
    python3 scripts/audit_platform_customization.py

This is a launch audit, not an automatic rewrite. It reports remaining legacy
names, direct contact values, logo render patterns and common brand-colour
literals so each result can be classified as user-visible, compatibility-only,
semantic status styling or an intentional production constant.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCAN_ROOTS = [ROOT / "frontend" / "src", ROOT / "frontend" / "public", ROOT / "backend"]
EXCLUDED_PARTS = {
    "node_modules", "build", "dist", "venv", ".venv", "__pycache__", "uploads", "backups",
}
TEXT_SUFFIXES = {".js", ".jsx", ".ts", ".tsx", ".css", ".html", ".py", ".json", ".md"}


@dataclass(frozen=True)
class Rule:
    label: str
    pattern: re.Pattern[str]


RULES = [
    Rule("legacy-brand", re.compile(r"\b(?:MERCHFORGE|MerchForge|merchforge|ORDERHUB|OrderHub|orderhub)\b")),
    Rule("hardcoded-contact", re.compile(r"(?:info@theforgeza\.co\.za|admin@merchforge\.com|orderhub\.co\.za)", re.I)),
    Rule("hardcoded-logo-render", re.compile(r"(?:<img[^>]+(?:logo|brand)|MERCH\s*<span|Fandom\s*<span)", re.I)),
    Rule("direct-primary-red", re.compile(r"#FF3B30", re.I)),
    Rule("direct-accent-orange", re.compile(r"#FF7A1A|#ff8c01", re.I)),
    Rule("direct-brand-class", re.compile(r"(?:bg|text|border)-\[#(?:FF3B30|FF7A1A|ff8c01)\]", re.I)),
]

# Files that define the configurable defaults or the audit itself legitimately
# contain the literal fallback values.
DEFAULT_VALUE_ALLOWLIST = {
    "frontend/src/lib/platform.js",
    "frontend/src/lib/theme.js",
    "frontend/src/platformThemeOverrides.css",
    "frontend/src/components/admin/InstanceBrandingSettings.jsx",
    "backend/routes_main.py",
    "backend/models.py",
    "scripts/audit_platform_customization.py",
}


def iter_files():
    for base in SCAN_ROOTS:
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
                continue
            if any(part in EXCLUDED_PARTS for part in path.parts):
                continue
            yield path


def main() -> int:
    findings: list[tuple[str, str, int, str]] = []
    for path in iter_files():
        rel = path.relative_to(ROOT).as_posix()
        try:
            lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            continue
        for number, line in enumerate(lines, start=1):
            for rule in RULES:
                if rule.label.startswith("direct-") and rel in DEFAULT_VALUE_ALLOWLIST:
                    continue
                if rule.pattern.search(line):
                    findings.append((rule.label, rel, number, line.strip()[:240]))

    if not findings:
        print("Platform customization audit: no flagged literals found.")
        return 0

    print(f"Platform customization audit: {len(findings)} flagged occurrence(s).")
    current = None
    for label, path, number, text in findings:
        group = (label, path)
        if group != current:
            print(f"\n[{label}] {path}")
            current = group
        print(f"  {number}: {text}")

    print("\nClassification required:")
    print("- Replace user-visible brand/logo/contact literals with platform settings.")
    print("- Replace visual brand colours with --ff-* variables.")
    print("- Retain compatibility keys, migration comments and semantic status colours only when documented.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
