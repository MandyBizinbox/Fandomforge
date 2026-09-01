from pathlib import Path

path = Path(__file__).resolve().parents[1] / "frontend/src/lib/theme.js"
text = path.read_text()

replacements = [
    ('input_background_color: "#0F0F0F",', 'input_background_color: "#0f0f0f",'),
    (
'''export function resolveThemeMode(platform = {}, pathname = "") {\n  const context = resolveThemeContext(pathname || (typeof window !== "undefined" ? window.location.pathname : ""));\n  const configured = context === "admin"\n''',
'''export function resolveThemeMode(platform = {}, pathname = "") {\n  const context = resolveThemeContext(pathname || (typeof window !== "undefined" ? window.location.pathname : ""));\n  const hasContextTheme = platform.storefront_theme_mode !== undefined\n    || platform.admin_theme_mode !== undefined\n    || (platform.theme_palettes && typeof platform.theme_palettes === "object");\n  if (!hasContextTheme && ["light", "dark"].includes(platform.theme_mode)) return platform.theme_mode;\n  const configured = context === "admin"\n'''),
    (
'''function legacyPalette(platform, mode, context) {\n  if (context !== "admin") return {};\n  if (platform.theme_palettes && typeof platform.theme_palettes === "object") return {};\n''',
'''function legacyPalette(platform, mode) {\n  if (platform.theme_palettes && typeof platform.theme_palettes === "object") return {};\n'''),
    ('...legacyPalette(platform, mode, context)', '...legacyPalette(platform, mode)'),
]

for old, new in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"theme legacy compatibility expected one match for {old[:80]!r}, found {count}")
    text = text.replace(old, new, 1)

path.write_text(text)
print("Legacy flat theme compatibility preserved")
