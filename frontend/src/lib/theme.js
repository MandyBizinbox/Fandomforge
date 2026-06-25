export const FALLBACK_THEME = {
  theme_mode: "light",
  primary_color: "#FF3B30",
  accent_color: "#FF7A1A",
  background_color: "#FFFFFF",
  page_text_color: "",
  surface_background_color: "",
  surface_text_color: "",
  card_background_color: "",
  card_text_color: "",
  card_border_color: "",
  muted_text_color: "",
  header_background_color: "#FFFFFF",
  header_text_color: "#111111",
  button_primary_background_color: "#FF3B30",
  button_primary_text_color: "#FFFFFF",
  button_alternate_background_color: "#FFFFFF",
  button_alternate_text_color: "#000000",
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

  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed;
  }

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
    return value <= 0.03928
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  };

  const r = convert(rgb.r);
  const g = convert(rgb.g);
  const b = convert(rgb.b);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function isLightColour(hex, fallback = false) {
  const luminance = relativeLuminance(hex);
  if (luminance === null) return fallback;
  return luminance > 0.55;
}

function toneFromBackground(background, mode) {
  return isLightColour(background, mode === "light") ? "light" : "dark";
}

function defaultsForTone(tone) {
  if (tone === "light") {
    return {
      pageText: "#111111",
      surfaceBg: "#FFFFFF",
      surfaceText: "#111111",
      cardBg: "#FFFFFF",
      cardText: "#111111",
      cardBorder: "rgba(0, 0, 0, 0.14)",
      mutedText: "#6B7280",
      inputBg: "#FFFFFF",
      inputText: "#111111",
      inputBorder: "rgba(0, 0, 0, 0.18)",
    };
  }

  return {
    pageText: "#FFFFFF",
    surfaceBg: "#111111",
    surfaceText: "#FFFFFF",
    cardBg: "#161616",
    cardText: "#FFFFFF",
    cardBorder: "rgba(255, 255, 255, 0.15)",
    mutedText: "#A3A3A3",
    inputBg: "#0f0f0f",
    inputText: "#FFFFFF",
    inputBorder: "rgba(255, 255, 255, 0.2)",
  };
}

export function normaliseTheme(platform = {}) {
  const mode = valueOrFallback(platform.theme_mode, FALLBACK_THEME.theme_mode);

  const background = valueOrFallback(
    platform.background_color,
    mode === "light" ? "#FFFFFF" : FALLBACK_THEME.background_color
  );

  const backgroundTone = toneFromBackground(background, mode);
  const toneDefaults = defaultsForTone(backgroundTone);

  const pageText = valueOrFallback(platform.page_text_color, toneDefaults.pageText);
  const surfaceBg = valueOrFallback(platform.surface_background_color, toneDefaults.surfaceBg);
  const surfaceText = valueOrFallback(platform.surface_text_color, toneDefaults.surfaceText);
  const cardBg = valueOrFallback(platform.card_background_color, toneDefaults.cardBg);
  const cardText = valueOrFallback(platform.card_text_color, toneDefaults.cardText);
  const cardBorder = valueOrFallback(platform.card_border_color, toneDefaults.cardBorder);
  const mutedText = valueOrFallback(platform.muted_text_color, toneDefaults.mutedText);

  const primary = valueOrFallback(platform.primary_color, FALLBACK_THEME.primary_color);
  const accent = valueOrFallback(platform.accent_color, FALLBACK_THEME.accent_color);

  const primaryButtonBg = valueOrFallback(
    platform.button_primary_background_color,
    primary
  );

  const primaryButtonText = valueOrFallback(
    platform.button_primary_text_color,
    "#FFFFFF"
  );

  const alternateButtonBg = valueOrFallback(
    platform.button_alternate_background_color,
    backgroundTone === "light" ? "#111111" : "#FFFFFF"
  );

  const alternateButtonText = valueOrFallback(
    platform.button_alternate_text_color,
    backgroundTone === "light" ? "#FFFFFF" : "#000000"
  );

  const primaryButtonBorder = valueOrFallback(
    platform.button_primary_border_color,
    primaryButtonBg
  );

  const alternateButtonBorder = valueOrFallback(
    platform.button_alternate_border_color,
    alternateButtonBg
  );

  const secondaryButtonIdleBorder = valueOrFallback(
    platform.button_secondary_border_color,
    backgroundTone === "light" ? "rgba(0, 0, 0, 0.22)" : "rgba(255, 255, 255, 0.22)"
  );

  const headerBg = valueOrFallback(
    platform.header_background_color,
    backgroundTone === "light" ? "#FFFFFF" : "#0A0A0A"
  );

  const headerText = valueOrFallback(
    platform.header_text_color,
    backgroundTone === "light" ? "#111111" : "#FFFFFF"
  );

  return {
    mode,
    backgroundTone,
    isLight: backgroundTone === "light",
    primary,
    accent,
    background,
    pageText,
    surfaceBg,
    surfaceText,
    cardBg,
    cardText,
    cardBorder,
    mutedText,
    inputBg: valueOrFallback(platform.input_background_color, toneDefaults.inputBg),
    inputText: valueOrFallback(platform.input_text_color, toneDefaults.inputText),
    inputBorder: valueOrFallback(platform.input_border_color, toneDefaults.inputBorder),
    headerBg,
    headerText,
    primaryButtonBg,
    primaryButtonText,
    primaryButtonBorder,
    alternateButtonBg,
    alternateButtonText,
    alternateButtonBorder,
    secondaryButtonIdleBorder,
  };
}

export function applyPlatformTheme(platform = {}) {
  if (typeof document === "undefined") return;

  const theme = normaliseTheme(platform);
  const root = document.documentElement;

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

  /*
   * Legacy variable aliases.
   */
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
