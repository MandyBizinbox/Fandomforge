#!/usr/bin/env python3
"""Canonicalize isolated E2E gateway routing without runtime rebinding.

Temporary deterministic migration helper. Remove before merging.
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
ROUTES_PATH = BACKEND / "routes_main.py"
SERVER_PATH = BACKEND / "server.py"
SUPPORT_PATH = BACKEND / "e2e_support.py"
PATCH_PATH = BACKEND / "e2e_gateway_patch.py"


def canonicalize_routes(source: str) -> str:
    import_line = "from e2e_runtime import with_e2e_mock_gateway\n"
    shared_marker = "\n\n# =============================================================================\n# SHARED HELPERS\n"
    if import_line not in source:
        if shared_marker not in source:
            raise RuntimeError("routes_main shared-helper marker not found")
        source = source.replace(shared_marker, f"\n{import_line}{shared_marker}", 1)

    function_start = "def _default_payment_gateways() -> Dict[str, dict]:\n    return {\n"
    canonical_start = "def _default_payment_gateways() -> Dict[str, dict]:\n    gateways = {\n"
    if function_start in source:
        source = source.replace(function_start, canonical_start, 1)
    elif canonical_start not in source:
        raise RuntimeError("payment gateway defaults function shape not found")

    start = source.index(canonical_start)
    next_function = source.find("\n\ndef _gateway_has_secret", start)
    if next_function == -1:
        raise RuntimeError("gateway defaults end marker not found")
    block = source[start:next_function]
    return_line = "    return with_e2e_mock_gateway(gateways)"
    if return_line not in block:
        stripped = block.rstrip()
        if not stripped.endswith("    }"):
            raise RuntimeError("gateway defaults literal closing brace not found")
        block = stripped + "\n" + return_line + "\n"
        source = source[:start] + block + source[next_function:]

    if "install_e2e_mock_gateway" in source or "e2e_gateway_patch" in source:
        raise RuntimeError("runtime E2E gateway patch reference found in routes_main")
    return source


def canonicalize_server(source: str) -> str:
    import_line = "from e2e_runtime import e2e_enabled\n"
    dotenv_line = "from dotenv import load_dotenv\n"
    if import_line not in source:
        if dotenv_line not in source:
            raise RuntimeError("dotenv import marker not found in server")
        source = source.replace(dotenv_line, dotenv_line + import_line, 1)

    old_mode = (
        "E2E_MODE = (\n"
        "    os.environ.get(\"E2E_TEST_MODE\") == \"1\"\n"
        "    and os.environ.get(\"ENVIRONMENT\", \"development\").lower() != \"production\"\n"
        "    and db_name.startswith(\"fandomforge_e2e_\")\n"
        ")\n"
    )
    if old_mode in source:
        source = source.replace(old_mode, "E2E_MODE = e2e_enabled()\n", 1)
    elif "E2E_MODE = e2e_enabled()\n" not in source:
        raise RuntimeError("server E2E_MODE block not found")

    patch_block = (
        "if E2E_MODE:\n"
        "    from e2e_gateway_patch import install_e2e_mock_gateway\n"
        "    install_e2e_mock_gateway(routes_main_module)\n"
    )
    if patch_block in source:
        source = source.replace(patch_block, "", 1)

    if "e2e_gateway_patch" in source or "install_e2e_mock_gateway" in source:
        raise RuntimeError("server E2E gateway patch hook still present")
    return source


def canonicalize_support(source: str) -> str:
    source = source.replace("import os\n", "", 1)
    import_line = "from e2e_runtime import e2e_enabled\n"
    typing_line = "from typing import Any, Dict\n"
    if import_line not in source:
        if typing_line not in source:
            raise RuntimeError("e2e_support typing import marker not found")
        source = source.replace(typing_line, typing_line + "\n" + import_line, 1)

    old_predicate = (
        "\n\ndef e2e_enabled() -> bool:\n"
        "    return (\n"
        "        os.environ.get(\"E2E_TEST_MODE\") == \"1\"\n"
        "        and os.environ.get(\"ENVIRONMENT\", \"development\").lower() != \"production\"\n"
        "        and os.environ.get(\"DB_NAME\", \"\").startswith(\"fandomforge_e2e_\")\n"
        "    )\n"
    )
    if old_predicate in source:
        source = source.replace(old_predicate, "", 1)

    if "os.environ.get(\"E2E_TEST_MODE\")" in source:
        raise RuntimeError("duplicate E2E predicate still present in e2e_support")
    return source


def main() -> None:
    ROUTES_PATH.write_text(canonicalize_routes(ROUTES_PATH.read_text(encoding="utf-8")), encoding="utf-8")
    SERVER_PATH.write_text(canonicalize_server(SERVER_PATH.read_text(encoding="utf-8")), encoding="utf-8")
    SUPPORT_PATH.write_text(canonicalize_support(SUPPORT_PATH.read_text(encoding="utf-8")), encoding="utf-8")
    if PATCH_PATH.exists():
        PATCH_PATH.unlink()
    print("canonical-e2e-gateway-routing-ok")


if __name__ == "__main__":
    main()
