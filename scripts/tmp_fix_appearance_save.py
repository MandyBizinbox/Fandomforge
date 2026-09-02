from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / "backend/routes_main.py"
text = path.read_text()

old_import = "from typing import Any, Dict, List, Optional\n"
new_import = "from typing import Any, Dict, List, Literal, Optional\n"
if text.count(old_import) != 1:
    raise SystemExit(f"Expected one typing import, found {text.count(old_import)}")
text = text.replace(old_import, new_import, 1)

old_nested = '''    for key in ["homepage", "signup", "policies", "theme_palettes"]:\n        if key in updates:\n            if key == "homepage": updates[key] = _deep_merge((current or {}).get(key) or DEFAULT_HOMEPAGE_SETTINGS, updates[key] or {})\n            if key == "signup": updates[key] = _deep_merge((current or {}).get(key) or DEFAULT_SIGNUP_SETTINGS, updates[key] or {})\n            if key == "policies": updates[key] = _deep_merge((current or {}).get(key) or DEFAULT_POLICY_SETTINGS, updates[key] or {})\n'''
new_nested = '''    for key in ["homepage", "signup", "policies", "theme_palettes"]:\n        if key in updates:\n            if key == "homepage": updates[key] = _deep_merge((current or {}).get(key) or DEFAULT_HOMEPAGE_SETTINGS, updates[key] or {})\n            if key == "signup": updates[key] = _deep_merge((current or {}).get(key) or DEFAULT_SIGNUP_SETTINGS, updates[key] or {})\n            if key == "policies": updates[key] = _deep_merge((current or {}).get(key) or DEFAULT_POLICY_SETTINGS, updates[key] or {})\n            if key == "theme_palettes":\n                defaults = PlatformSettings().model_dump().get("theme_palettes") or {}\n                existing = (current or {}).get("theme_palettes") or defaults\n                updates[key] = _deep_merge(existing, updates[key] or {})\n'''
if text.count(old_nested) != 1:
    raise SystemExit(f"Expected one nested settings merge block, found {text.count(old_nested)}")
text = text.replace(old_nested, new_nested, 1)

path.write_text(text)
print("Appearance save backend fix applied")
