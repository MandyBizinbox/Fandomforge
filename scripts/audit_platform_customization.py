#!/usr/bin/env python3
"""Audit user-visible hard-coded branding and theme values.

Run from the repository root:
    python3 scripts/audit_platform_customization.py

The audit distinguishes launch blockers from compatibility fallbacks and visual
migration warnings. It exits non-zero only when a user-visible blocker remains.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCAN_ROOTS = [ROOT / "frontend" / "src", ROOT / "frontend" / "public", ROOT / "backend"]
EXCLUDED_PARTS = {
    "node_modules", "build", "dist", "venv", ".venv", "__pycache__", "uploads", "backups", "tests",
}
TEXT_SUFFIXES = {".js", ".jsx", ".ts", ".tsx", ".css", ".html", ".py", ".json", ".md"}


@dataclass(frozen=True)
class Rule:
    label: str
    pattern: re.Pattern[str]
    severity: str


RULES = [
    Rule("legacy-brand", re.compile(r"\b(?:MERCHFORGE|MerchForge|merchforge|ORDERHUB|OrderHub|orderhub)\b"), "blocker"),
    Rule("hardcoded-contact", re.compile(r"(?:info@theforgeza\.co\.za|admin@merchforge\.com|orderhub\.co\.za)", re.I), "blocker"),
    Rule("hardcoded-wordmark", re.compile(r"(?:MERCH\s*<span|Fandom\s*<span)", re.I), "blocker"),
    Rule("direct-primary-red", re.compile(r"#FF3B30", re.I), "warning"),
    Rule("direct-accent-orange", re.compile(r"#FF7A1A|#ff8c01", re.I), "warning"),
    Rule("direct-brand-class", re.compile(r"(?:bg|text|border)-\[#(?:FF3B30|FF7A1A|ff8c01)\]", re.I), "warning"),
]

# Files that define configurable defaults or central compatibility mappings
# legitimately contain the literal fallback values.
DEFAULT_VALUE_ALLOWLIST = {
    "frontend/src/lib/platform.js",
    "frontend/src/lib/theme.js",
    "frontend/src/index.css",
    "frontend/src/styles/theme-overrides.css",
    "frontend/src/platformThemeOverrides.css",
    "frontend/src/components/admin/InstanceBrandingSettings.jsx",
    "backend/routes_main.py",
    "backend/models.py",
}

# These literals are retained as documented compatibility fallbacks. They are
# not authoritative at runtime and therefore do not block launch.
COMPATIBILITY_ALLOWLIST = {
    ("legacy-brand", "backend/routes_main.py"): "legacy role migration comment/data compatibility",
    ("hardcoded-contact", "backend/routes_main.py"): "legacy route shadowed by routes_public_platform.py",
    ("hardcoded-contact", "frontend/src/pages/StaticContentPage.jsx"): "fallback replaced at runtime by the platform contact bridge",
    ("hardcoded-contact", "frontend/src/lib/platform.js"): "selector used only to replace the legacy fallback with configured contact details",
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


def is_comment_line(line: str) -> bool:
    value = line.strip()
    return value.startswith(("#", "//", "/*", "*", "<!--"))


def main() -> int:
    findings: list[tuple[str, str, str, int, str, str]] = []

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
                if not rule.pattern.search(line):
                    continue

                severity = rule.severity
                reason = ""
                compatibility_reason = COMPATIBILITY_ALLOWLIST.get((rule.label, rel))
                if compatibility_reason:
                    severity = "info"
                    reason = compatibility_reason
                elif rule.label == "legacy-brand" and is_comment_line(line):
                    severity = "info"
                    reason = "comment/documentation only"

                findings.append((severity, rule.label, rel, number, line.strip()[:240], reason))

    if not findings:
        print("Platform customization audit: no flagged literals found.")
        return 0

    counts = {"blocker": 0, "warning": 0, "info": 0}
    for severity, *_ in findings:
        counts[severity] = counts.get(severity, 0) + 1

    print(
        "Platform customization audit: "
        f"{counts['blocker']} blocker(s), {counts['warning']} warning(s), {counts['info']} informational finding(s)."
    )

    current = None
    order = {"blocker": 0, "warning": 1, "info": 2}
    for severity, label, path, number, text, reason in sorted(
        findings, key=lambda row: (order.get(row[0], 9), row[2], row[1], row[3])
    ):
        group = (severity, label, path)
        if group != current:
            print(f"\n[{severity.upper()}:{label}] {path}")
            current = group
        suffix = f"  ({reason})" if reason else ""
        print(f"  {number}: {text}{suffix}")

    print("\nClassification:")
    print("- BLOCKER: user-visible brand, wordmark or contact literal still bypasses Platform Settings.")
    print("- WARNING: visual legacy literal remains in source; central theme overrides must be verified in browser QA.")
    print("- INFO: documented fallback, migration compatibility or non-authoritative literal.")

    return 1 if counts["blocker"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
