export const DEFAULT_THEME_PALETTES = {
  light: {
    background_color: "#FFFFFF",
    page_text_color: "#111111",
    surface_background_color: "#F7F7F8",
    surface_text_color: "#111111",
    card_background_color: "#FFFFFF",
    card_text_color: "#111111",
    card_border_color: "#D9DCE1",
    muted_text_color: "#6B7280",
    input_background_color: "#FFFFFF",
    input_text_color: "#111111",
    input_border_color: "#CDD1D6",
    header_background_color: "#FFFFFF",
    header_text_color: "#111111",
    button_primary_background_color: "",
    button_primary_text_color: "#FFFFFF",
    button_primary_border_color: "",
    button_alternate_background_color: "#111111",
    button_alternate_text_color: "#FFFFFF",
    button_alternate_border_color: "#111111",
    button_secondary_border_color: "#CDD1D6",
  },
  dark: {
    background_color: "#0A0A0A",
    page_text_color: "#FFFFFF",
    surface_background_color: "#111111",
    surface_text_color: "#FFFFFF",
    card_background_color: "#161616",
    card_text_color: "#FFFFFF",
    card_border_color: "#343434",
    muted_text_color: "#A3A3A3",
    input_background_color: "#0F0F0F",
    input_text_color: "#FFFFFF",
    input_border_color: "#3A3A3A",
    header_background_color: "#0A0A0A",
    header_text_color: "#FFFFFF",
    button_primary_background_color: "",
    button_primary_text_color: "#FFFFFF",
    button_primary_border_color: "",
    button_alternate_background_color: "#FFFFFF",
    button_alternate_text_color: "#000000",
    button_alternate_border_color: "#FFFFFF",
    button_secondary_border_color: "#444444",
  },
};

export const FALLBACK_THEME = {
  storefront_theme_mode: "light",
  admin_theme_mode: "dark",
  allow_theme_toggle: false,
  primary_color: "#FF3B30",
  accent_color: "#FF7A1A",
  theme_palettes: DEFAULT_THEME_PALETTES,
};

function valueOrFallback(value, fallback) {
  return value === undefined || value === null || value === "" ? fallback : value;
}

function normaliseHex(value) {
  if (!value || typeof value !== "string") return "";
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  return "";
}

function hexToRgb(hex) {
  const clean = normaliseHex(hex);
  if (!clean) return null;
  const value = clean.slice(1);
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function relativeLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const convert = (channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * convert(rgb.r) + 0.7152 * convert(rgb.g) + 0.0722 * convert(rgb.b);
}

export function contrastRatio(background, foreground) {
  const a = relativeLuminance(background);
  const b = relativeLuminance(foreground);
  if (a === null || b === null) return null;
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

export function mergeThemePalettes(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    light: { ...DEFAULT_THEME_PALETTES.light, ...(source.light || {}) },
    dark: { ...DEFAULT_THEME_PALETTES.dark, ...(source.dark || {}) },
  };
}

export function resolveThemeContext(pathname = "") {
  return String(pathname || "").startsWith("/admin") ? "admin" : "storefront";
}

function resolveSystemMode() {
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) return "dark";
  return "light";
}

export function resolveThemeMode(platform = {}, pathname = "") {
  const context = resolveThemeContext(pathname || (typeof window !== "undefined" ? window.location.pathname : ""));
  const configured = context === "admin"
    ? valueOrFallback(platform.admin_theme_mode, FALLBACK_THEME.admin_theme_mode)
    : valueOrFallback(platform.storefront_theme_mode, FALLBACK_THEME.storefront_theme_mode);

  let requested = configured;
  if (platform.allow_theme_toggle && typeof window !== "undefined") {
    const override = window.localStorage?.getItem("ff_theme_override");
    if (["light", "dark", "system"].includes(override)) requested = override;
  }
  return requested === "system" ? resolveSystemMode() : (["light", "dark"].includes(requested) ? requested : (context === "admin" ? "dark" : "light"));
}

function legacyPalette(platform, mode, context) {
  if (context !== "admin") return {};
  if (platform.theme_palettes && typeof platform.theme_palettes === "object") return {};
  const legacyMode = platform.theme_mode || "dark";
  if (mode !== legacyMode) return {};
  const keys = Object.keys(DEFAULT_THEME_PALETTES.dark);
  return Object.fromEntries(keys.filter((key) => platform[key] !== undefined && platform[key] !== null).map((key) => [key, platform[key]]));
}

export function normaliseTheme(platform = {}, options = {}) {
  const pathname = options.pathname || (typeof window !== "undefined" ? window.location.pathname : "");
  const context = resolveThemeContext(pathname);
  const mode = resolveThemeMode(platform, pathname);
  const palettes = mergeThemePalettes(platform.theme_palettes);
  const palette = { ...palettes[mode], ...legacyPalette(platform, mode, context) };
  const primary = valueOrFallback(platform.primary_color, FALLBACK_THEME.primary_color);
  const accent = valueOrFallback(platform.accent_color, FALLBACK_THEME.accent_color);
  const primaryButtonBg = valueOrFallback(palette.button_primary_background_color, primary);
  const primaryButtonText = valueOrFallback(palette.button_primary_text_color, "#FFFFFF");
  const alternateButtonBg = valueOrFallback(palette.button_alternate_background_color, mode === "light" ? "#111111" : "#FFFFFF");
  const alternateButtonText = valueOrFallback(palette.button_alternate_text_color, mode === "light" ? "#FFFFFF" : "#000000");

  return {
    context,
    mode,
    isLight: mode === "light",
    backgroundTone: mode,
    primary,
    accent,
    background: palette.background_color,
    pageText: palette.page_text_color,
    surfaceBg: palette.surface_background_color,
    surfaceText: palette.surface_text_color,
    cardBg: palette.card_background_color,
    cardText: palette.card_text_color,
    cardBorder: palette.card_border_color,
    mutedText: palette.muted_text_color,
    inputBg: palette.input_background_color,
    inputText: palette.input_text_color,
    inputBorder: palette.input_border_color,
    headerBg: palette.header_background_color,
    headerText: palette.header_text_color,
    primaryButtonBg,
    primaryButtonText,
    primaryButtonBorder: valueOrFallback(palette.button_primary_border_color, primaryButtonBg),
    alternateButtonBg,
    alternateButtonText,
    alternateButtonBorder: valueOrFallback(palette.button_alternate_border_color, alternateButtonBg),
    secondaryButtonIdleBorder: valueOrFallback(palette.button_secondary_border_color, mode === "light" ? "#CDD1D6" : "#444444"),
  };
}

export function applyPlatformTheme(platform = {}, options = {}) {
  if (typeof document === "undefined") return;
  const theme = normaliseTheme(platform, options);
  const root = document.documentElement;

  root.dataset.themeContext = theme.context;
  root.dataset.themeMode = theme.mode;
  root.dataset.themeBgTone = theme.backgroundTone;

  root.style.setProperty("--ff-primary", theme.primary);
  root.style.setProperty("--ff-accent", theme.accent);
  root.style.setProperty("--ff-page-bg", theme.background);
  root.style.setProperty("--ff-page-text", theme.pageText);
  root.style.setProperty("--ff-surface-bg", theme.surfaceBg);
  root.style.setProperty("--ff-surface-text", theme.surfaceText);
  root.style.setProperty("--ff-card-bg", theme.cardBg);
  root.style.setProperty("--ff-card-text", theme.cardText);
  root.style.setProperty("--ff-card-border", theme.cardBorder);
  root.style.setProperty("--ff-muted-text", theme.mutedText);
  root.style.setProperty("--ff-input-bg", theme.inputBg);
  root.style.setProperty("--ff-input-text", theme.inputText);
  root.style.setProperty("--ff-input-border", theme.inputBorder);
  root.style.setProperty("--ff-header-bg", theme.headerBg);
  root.style.setProperty("--ff-header-text", theme.headerText);
  root.style.setProperty("--ff-button-primary-bg", theme.primaryButtonBg);
  root.style.setProperty("--ff-button-primary-text", theme.primaryButtonText);
  root.style.setProperty("--ff-button-primary-border", theme.primaryButtonBorder);
  root.style.setProperty("--ff-button-alternate-bg", theme.alternateButtonBg);
  root.style.setProperty("--ff-button-alternate-text", theme.alternateButtonText);
  root.style.setProperty("--ff-button-alternate-border", theme.alternateButtonBorder);
  root.style.setProperty("--ff-button-secondary-idle-border", theme.secondaryButtonIdleBorder);

  root.style.setProperty("--bg-primary", theme.background);
  root.style.setProperty("--bg-secondary", theme.surfaceBg);
  root.style.setProperty("--bg-surface", theme.cardBg);
  root.style.setProperty("--text-primary", theme.pageText);
  root.style.setProperty("--text-secondary", theme.mutedText);
  root.style.setProperty("--text-muted", theme.mutedText);
  root.style.setProperty("--brand", theme.primaryButtonBg);
  root.style.setProperty("--brand-hover", theme.alternateButtonBg);
  root.style.setProperty("--button-primary-bg", theme.primaryButtonBg);
  root.style.setProperty("--button-primary-text", theme.primaryButtonText);
  root.style.setProperty("--button-primary-border", theme.primaryButtonBorder);
  root.style.setProperty("--button-alternate-bg", theme.alternateButtonBg);
  root.style.setProperty("--button-alternate-text", theme.alternateButtonText);
  root.style.setProperty("--button-alternate-border", theme.alternateButtonBorder);

  return theme;
}
