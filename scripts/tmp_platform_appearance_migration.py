from pathlib import Path

root = Path(__file__).resolve().parents[1]


def replace_once(path: Path, old: str, new: str):
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match for {old[:90]!r}, found {count}")
    path.write_text(text.replace(old, new, 1))


models = root / "backend/models.py"
routes = root / "backend/routes_main.py"
platform = root / "frontend/src/lib/platform.js"
app = root / "frontend/src/App.js"
settings_route = root / "frontend/src/routes/AdminPlatformSettingsRoute.jsx"
instance = root / "frontend/src/components/admin/InstanceSettingsSectionPage.jsx"

# Backend canonical theme schema.
replace_once(models,
'''class PublicPlatformConfig(BaseModel):\n''',
'''def default_theme_palettes() -> Dict[str, Dict[str, str]]:\n    return {\n        "light": {\n            "background_color": "#FFFFFF",\n            "page_text_color": "#111111",\n            "surface_background_color": "#F7F7F8",\n            "surface_text_color": "#111111",\n            "card_background_color": "#FFFFFF",\n            "card_text_color": "#111111",\n            "card_border_color": "#D9DCE1",\n            "muted_text_color": "#6B7280",\n            "input_background_color": "#FFFFFF",\n            "input_text_color": "#111111",\n            "input_border_color": "#CDD1D6",\n            "header_background_color": "#FFFFFF",\n            "header_text_color": "#111111",\n            "button_primary_background_color": "",\n            "button_primary_text_color": "#FFFFFF",\n            "button_primary_border_color": "",\n            "button_alternate_background_color": "#111111",\n            "button_alternate_text_color": "#FFFFFF",\n            "button_alternate_border_color": "#111111",\n            "button_secondary_border_color": "#CDD1D6",\n        },\n        "dark": {\n            "background_color": "#0A0A0A",\n            "page_text_color": "#FFFFFF",\n            "surface_background_color": "#111111",\n            "surface_text_color": "#FFFFFF",\n            "card_background_color": "#161616",\n            "card_text_color": "#FFFFFF",\n            "card_border_color": "#343434",\n            "muted_text_color": "#A3A3A3",\n            "input_background_color": "#0F0F0F",\n            "input_text_color": "#FFFFFF",\n            "input_border_color": "#3A3A3A",\n            "header_background_color": "#0A0A0A",\n            "header_text_color": "#FFFFFF",\n            "button_primary_background_color": "",\n            "button_primary_text_color": "#FFFFFF",\n            "button_primary_border_color": "",\n            "button_alternate_background_color": "#FFFFFF",\n            "button_alternate_text_color": "#000000",\n            "button_alternate_border_color": "#FFFFFF",\n            "button_secondary_border_color": "#444444",\n        },\n    }\n\n\nclass PublicPlatformConfig(BaseModel):\n''')

replace_once(models,
'''    accent_color: Optional[str] = "#FF7A1A"\n    country: str = "ZA"\n''',
'''    accent_color: Optional[str] = "#FF7A1A"\n    storefront_theme_mode: Literal["light", "dark", "system"] = "light"\n    admin_theme_mode: Literal["light", "dark", "system"] = "dark"\n    allow_theme_toggle: bool = False\n    theme_palettes: Dict[str, Dict[str, str]] = Field(default_factory=default_theme_palettes)\n    country: str = "ZA"\n''')

replace_once(models,
'''    theme_mode: str = "dark"\n    background_color: str = "#0A0A0A"\n''',
'''    # Context-aware theme ownership. Flat fields below remain compatibility\n    # fallbacks until every legacy component has migrated to semantic tokens.\n    storefront_theme_mode: Literal["light", "dark", "system"] = "light"\n    admin_theme_mode: Literal["light", "dark", "system"] = "dark"\n    allow_theme_toggle: bool = False\n    theme_palettes: Dict[str, Dict[str, str]] = Field(default_factory=default_theme_palettes)\n    theme_mode: str = "dark"\n    background_color: str = "#0A0A0A"\n''')

# Backend normalization preserves an existing flat dark palette as compatibility input.
replace_once(routes,
'''def _normalize_platform_doc(doc: Optional[dict]) -> dict:\n    base = PlatformSettings().model_dump()\n    if doc:\n        base.update(dict(doc))\n    base["modules"] = normalize_modules(base.get("modules"))\n    if base.get("package_key") not in package_keys():\n        base["package_key"] = "full_marketplace"\n    return base\n''',
'''THEME_PALETTE_KEYS = [\n    "background_color", "page_text_color", "surface_background_color", "surface_text_color",\n    "card_background_color", "card_text_color", "card_border_color", "muted_text_color",\n    "input_background_color", "input_text_color", "input_border_color",\n    "header_background_color", "header_text_color",\n    "button_primary_background_color", "button_primary_text_color", "button_primary_border_color",\n    "button_alternate_background_color", "button_alternate_text_color", "button_alternate_border_color",\n    "button_secondary_border_color",\n]\n\n\ndef _normalize_platform_doc(doc: Optional[dict]) -> dict:\n    defaults = PlatformSettings().model_dump()\n    base = dict(defaults)\n    current = dict(doc or {})\n    if current:\n        base.update(current)\n\n    configured_palettes = current.get("theme_palettes")\n    default_palettes = defaults.get("theme_palettes") or {}\n    if isinstance(configured_palettes, dict):\n        base["theme_palettes"] = {\n            "light": {**(default_palettes.get("light") or {}), **(configured_palettes.get("light") or {})},\n            "dark": {**(default_palettes.get("dark") or {}), **(configured_palettes.get("dark") or {})},\n        }\n    else:\n        legacy_dark = dict(default_palettes.get("dark") or {})\n        for key in THEME_PALETTE_KEYS:\n            value = current.get(key)\n            if value not in (None, ""):\n                legacy_dark[key] = value\n        base["theme_palettes"] = {\n            "light": dict(default_palettes.get("light") or {}),\n            "dark": legacy_dark,\n        }\n\n    if base.get("storefront_theme_mode") not in {"light", "dark", "system"}:\n        base["storefront_theme_mode"] = "light"\n    if base.get("admin_theme_mode") not in {"light", "dark", "system"}:\n        base["admin_theme_mode"] = "dark"\n    base["modules"] = normalize_modules(base.get("modules"))\n    if base.get("package_key") not in package_keys():\n        base["package_key"] = "full_marketplace"\n    return base\n''')

replace_once(routes,
'''        "accent_color": settings.get("accent_color") or "#FF7A1A",\n        "theme_mode": settings.get("theme_mode") or "dark",\n''',
'''        "accent_color": settings.get("accent_color") or "#FF7A1A",\n        "storefront_theme_mode": settings.get("storefront_theme_mode") or "light",\n        "admin_theme_mode": settings.get("admin_theme_mode") or "dark",\n        "allow_theme_toggle": bool(settings.get("allow_theme_toggle", False)),\n        "theme_palettes": settings.get("theme_palettes") or PlatformSettings().model_dump().get("theme_palettes"),\n        "theme_mode": settings.get("theme_mode") or "dark",\n''')

replace_once(routes,
'''    accent_color: Optional[str] = None\n    theme_mode: Optional[str] = None\n''',
'''    accent_color: Optional[str] = None\n    storefront_theme_mode: Optional[Literal["light", "dark", "system"]] = None\n    admin_theme_mode: Optional[Literal["light", "dark", "system"]] = None\n    allow_theme_toggle: Optional[bool] = None\n    theme_palettes: Optional[Dict[str, Dict[str, str]]] = None\n    theme_mode: Optional[str] = None\n''')

replace_once(routes,
'''    for key in ["homepage", "signup", "policies"]:\n''',
'''    for key in ["homepage", "signup", "policies", "theme_palettes"]:\n''')

# Frontend config knows both palettes before Mongo responds.
replace_once(platform,
'''import { applyPlatformTheme } from "./theme";\n''',
'''import { DEFAULT_THEME_PALETTES, applyPlatformTheme, mergeThemePalettes } from "./theme";\n''')

replace_once(platform,
'''  // Keep browser fallbacks aligned with backend PlatformSettings defaults so\n  // the UI does not briefly render a different theme before Mongo settings load.\n  theme_mode: "dark",\n''',
'''  // Storefront and admin choose a semantic palette independently.\n  storefront_theme_mode: "light",\n  admin_theme_mode: "dark",\n  allow_theme_toggle: false,\n  theme_palettes: DEFAULT_THEME_PALETTES,\n\n  // Legacy flat values remain compatibility fallbacks during migration.\n  theme_mode: "dark",\n''')

replace_once(platform,
'''    policies: { ...DEFAULT_PLATFORM.policies, ...(source.policies || {}) },\n  };\n''',
'''    policies: { ...DEFAULT_PLATFORM.policies, ...(source.policies || {}) },\n    theme_palettes: mergeThemePalettes(source.theme_palettes || DEFAULT_PLATFORM.theme_palettes),\n  };\n''')

# React Router owns context changes; no history/DOM patching.
replace_once(app,
'''import React, { Suspense, lazy } from "react";\n''',
'''import React, { Suspense, lazy, useEffect } from "react";\n''')
replace_once(app,
'''import { usePlatformConfig } from "./lib/platform";\n''',
'''import { usePlatformConfig } from "./lib/platform";\nimport { applyPlatformTheme, resolveThemeMode } from "./lib/theme";\n''')
replace_once(app,
'''function PlatformToaster() {\n  const { platform } = usePlatformConfig();\n  return <Toaster theme={platform.theme_mode === "dark" ? "dark" : "light"} position="bottom-right" toastOptions={{ style: { background: "var(--ff-card-bg)", border: "1px solid var(--ff-card-border)", borderRadius: 0, color: "var(--ff-card-text)" } }} />;\n}\n''',
'''function PlatformThemeSync() {\n  const { platform } = usePlatformConfig();\n  const location = useLocation();\n\n  useEffect(() => {\n    applyPlatformTheme(platform, { pathname: location.pathname });\n    const configured = location.pathname.startsWith("/admin") ? platform.admin_theme_mode : platform.storefront_theme_mode;\n    if (configured !== "system" || typeof window === "undefined" || !window.matchMedia) return undefined;\n    const media = window.matchMedia("(prefers-color-scheme: dark)");\n    const sync = () => applyPlatformTheme(platform, { pathname: location.pathname });\n    media.addEventListener?.("change", sync);\n    return () => media.removeEventListener?.("change", sync);\n  }, [platform, location.pathname]);\n\n  return null;\n}\n\nfunction PlatformToaster() {\n  const { platform } = usePlatformConfig();\n  const location = useLocation();\n  return <Toaster theme={resolveThemeMode(platform, location.pathname)} position="bottom-right" toastOptions={{ style: { background: "var(--ff-card-bg)", border: "1px solid var(--ff-card-border)", borderRadius: 0, color: "var(--ff-card-text)" } }} />;\n}\n''')
replace_once(app,
'''<BrowserRouter><ImagePerformanceHints /><EntitlementNotice /><AppRoutes /><PlatformToaster /></BrowserRouter>''',
'''<BrowserRouter><PlatformThemeSync /><ImagePerformanceHints /><EntitlementNotice /><AppRoutes /><PlatformToaster /></BrowserRouter>''')

# Appearance gets its own concrete settings URL.
replace_once(settings_route,
'''import PlatformGeneralSettingsPage from "../components/admin/PlatformGeneralSettingsPage";\n''',
'''import PlatformGeneralSettingsPage from "../components/admin/PlatformGeneralSettingsPage";\nimport PlatformAppearanceSettingsPage from "../components/admin/PlatformAppearanceSettingsPage";\n''')
replace_once(settings_route,
'''  { to: "/admin/platform-settings/branding", label: "Brand & Theme" },\n''',
'''  { to: "/admin/platform-settings/branding", label: "Branding" },\n  { to: "/admin/platform-settings/appearance", label: "Appearance" },\n''')
replace_once(settings_route,
'''        <Route path="platform-settings/branding" element={<SettingsPage><InstanceSettingsSectionPage section="branding" /></SettingsPage>} />\n''',
'''        <Route path="platform-settings/branding" element={<SettingsPage><InstanceSettingsSectionPage section="branding" /></SettingsPage>} />\n        <Route path="platform-settings/appearance" element={<SettingsPage><PlatformAppearanceSettingsPage /></SettingsPage>} />\n''')

# Branding no longer exposes a second competing theme editor.
replace_once(instance,
'''        <Field label="Theme mode"><select className="input-base" value={settings.theme_mode || "dark"} onChange={(event) => patch("theme_mode", event.target.value)}><option value="dark">Dark</option><option value="light">Light</option></select></Field>\n      </section>\n\n      <section className="card space-y-4">\n        <div><p className="overline mb-1">Global theme</p><h3 className="font-display text-3xl uppercase">Semantic colours</h3><p className="text-sm text-[var(--ff-muted-text)] mt-1">These values publish the global --ff-* tokens consumed across the platform. Leave optional fields on Auto to use contrast-aware defaults.</p></div>\n        <div className="grid md:grid-cols-2 gap-4">\n          {BRAND_COLOUR_FIELDS.map(([key, label, allowAuto]) => <Field key={key} label={label}><ColorInput value={settings[key] || ""} onChange={(value) => patch(key, value)} allowAuto={allowAuto} /></Field>)}\n        </div>\n      </section>\n\n      <section className="card space-y-4">\n''',
'''      </section>\n\n      <section className="card space-y-4">\n''')

print("Platform Appearance migration applied")
