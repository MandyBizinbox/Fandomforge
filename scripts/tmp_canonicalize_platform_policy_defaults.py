#!/usr/bin/env python3
"""Move launch policy defaults into canonical route-owned settings.

Temporary deterministic migration helper. Remove before merging.
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
ROUTES_PATH = BACKEND / "routes_main.py"
SERVER_PATH = BACKEND / "server.py"
PATCH_PATH = BACKEND / "platform_launch_policy_patch.py"

LAUNCH_POLICY_DEFAULTS = {
    "intellectual_property_policy": "Approved Intellectual Property Policy content is required before broad creator onboarding.",
    "prohibited_content_policy": "Approved Prohibited Content Policy content is required before broad creator onboarding.",
    "copyright_complaint_procedure": "Approved Copyright Complaint Procedure content is required before broad creator onboarding.",
    "payout_policy": "Approved Payout Policy content is required before creator earnings and payout promises are published.",
    "store_suspension_termination_policy": "Approved Store Suspension and Termination Policy content is required before broad creator onboarding.",
}


def canonicalize_routes(source: str) -> str:
    if all(f'    "{key}": "{value}",' in source for key, value in LAUNCH_POLICY_DEFAULTS.items()):
        return source

    marker = '    "printer_terms": "Printer terms will be published here.",\n}\n\nPUBLIC_POLICY_KEYS = set(DEFAULT_POLICY_SETTINGS.keys())\n'
    if marker not in source:
        raise RuntimeError("canonical DEFAULT_POLICY_SETTINGS block marker not found")

    additions = "".join(
        f'    "{key}": "{value}",\n'
        for key, value in LAUNCH_POLICY_DEFAULTS.items()
    )
    replacement = (
        '    "printer_terms": "Printer terms will be published here.",\n'
        + additions
        + '}\n\nPUBLIC_POLICY_KEYS = set(DEFAULT_POLICY_SETTINGS.keys())\n'
    )
    source = source.replace(marker, replacement, 1)

    for key, value in LAUNCH_POLICY_DEFAULTS.items():
        line = f'    "{key}": "{value}",'
        if source.count(line) != 1:
            raise RuntimeError(f"canonical policy default missing or duplicated: {key}")
    return source


def canonicalize_server(source: str) -> str:
    source = source.replace(
        "from platform_launch_policy_patch import install_platform_launch_policy_patch\n",
        "",
        1,
    )
    source = source.replace(
        "install_platform_launch_policy_patch(routes_main_module)\n",
        "",
        1,
    )
    if "platform_launch_policy_patch" in source or "install_platform_launch_policy_patch" in source:
        raise RuntimeError("platform launch policy runtime patch still referenced by server.py")
    return source


def main() -> None:
    ROUTES_PATH.write_text(
        canonicalize_routes(ROUTES_PATH.read_text(encoding="utf-8")),
        encoding="utf-8",
    )
    SERVER_PATH.write_text(
        canonicalize_server(SERVER_PATH.read_text(encoding="utf-8")),
        encoding="utf-8",
    )
    if PATCH_PATH.exists():
        PATCH_PATH.unlink()

    if PATCH_PATH.exists():
        raise RuntimeError("platform launch policy patch file still exists")
    print("canonical-platform-policy-defaults-ok")


if __name__ == "__main__":
    main()
