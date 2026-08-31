import { useEffect, useState } from "react";
import { assetUrl, http } from "./api";
import { applyPlatformTheme } from "./theme";

export const DEFAULT_PLATFORM = {
  platform_name: "Fandom Forge",
  platform_tagline: "Merch made simple",
  brand_alt_text: "Fandom Forge",
  logo_url: "",
  logo_primary_url: "",
  logo_compact_url: "",
  logo_light_url: "",
  logo_dark_url: "",
  favicon_url: "",
  document_title: "Fandom Forge",

  primary_color: "#FF3B30",
  accent_color: "#FF7A1A",

  theme_mode: "light",
  background_color: "#FFFFFF",
  page_text_color: "",
  surface_background_color: "",
  surface_text_color: "",
  card_background_color: "",
  card_text_color: "",
  card_border_color: "",
  muted_text_color: "",
  input_background_color: "",
  input_text_color: "",
  input_border_color: "",

  header_background_color: "#FFFFFF",
  header_text_color: "#111111",

  button_primary_background_color: "#FF3B30",
  button_primary_text_color: "#FFFFFF",
  button_primary_border_color: "",
  button_alternate_background_color: "#FFFFFF",
  button_alternate_text_color: "#000000",
  button_alternate_border_color: "",
  button_secondary_border_color: "",

  support_email: "help@fandomforge.co.za",
  public_contact_email: "help@fandomforge.co.za",
  support_phone: "",
  support_whatsapp: "",

  modules: {
    creators_enabled: true,
    printers_enabled: true,
    printer_marketplace_enabled: true,
    sole_printer_mode: false,
  },

  homepage: {
    hero_title: "Buy Merch From Creators You Love",
    hero_subtitle: "Discover official merch, drops and custom apparel from creators, clubs, events and communities.",
    buyer_cta_label: "Shop Merch",
    buyer_cta_url: "/shop",
    creator_cta_label: "Start Creating",
    creator_cta_url: "/register/creator",
    printer_cta_label: "Apply as Printer",
    printer_cta_url: "/register/printer",
    featured_title: "Featured Drops",
    creators_title: "Browse Creators",
  },

  signup: {
    creator_signup_enabled: true,
    printer_signup_enabled: true,
    require_creator_approval: false,
    require_printer_approval: true,
    allow_manual_billing: true,
    allow_paystack_recurring_billing: true,
  },

  policies: {},
};

let cachedPlatform = null;
let platformRequest = null;

function applyPlatformDocumentBranding(platform = {}) {
  if (typeof document === "undefined") return;

  const platformName = String(platform.platform_name || DEFAULT_PLATFORM.platform_name).trim() || DEFAULT_PLATFORM.platform_name;
  document.title = String(platform.document_title || platformName).trim() || platformName;

  const favicon = platform.favicon_url ? assetUrl(platform.favicon_url) : "";
  if (favicon) {
    let node = document.querySelector('link[rel~="icon"]');
    if (!node) {
      node = document.createElement("link");
      node.rel = "icon";
      document.head.appendChild(node);
    }
    node.href = favicon;
  }
}

export function mergePlatformConfig(value = {}) {
  const source = value || {};
  const platformName = String(source.platform_name || DEFAULT_PLATFORM.platform_name).trim() || DEFAULT_PLATFORM.platform_name;
  const primaryLogo = source.logo_primary_url || source.logo_url || DEFAULT_PLATFORM.logo_primary_url;

  const merged = {
    ...DEFAULT_PLATFORM,
    ...source,
    platform_name: platformName,
    brand_alt_text: source.brand_alt_text || platformName,
    logo_url: source.logo_url || primaryLogo,
    logo_primary_url: primaryLogo,
    logo_compact_url: source.logo_compact_url || primaryLogo,
    logo_light_url: source.logo_light_url || primaryLogo,
    logo_dark_url: source.logo_dark_url || primaryLogo,
    document_title: source.document_title || platformName,
    support_email: source.support_email || DEFAULT_PLATFORM.support_email,
    public_contact_email: source.public_contact_email || source.support_email || DEFAULT_PLATFORM.public_contact_email,
    modules: { ...DEFAULT_PLATFORM.modules, ...(source.modules || {}) },
    homepage: { ...DEFAULT_PLATFORM.homepage, ...(source.homepage || {}) },
    signup: { ...DEFAULT_PLATFORM.signup, ...(source.signup || {}) },
    policies: { ...DEFAULT_PLATFORM.policies, ...(source.policies || {}) },
  };

  applyPlatformTheme(merged);
  applyPlatformDocumentBranding(merged);
  return merged;
}

async function loadPlatformConfig() {
  if (cachedPlatform) return cachedPlatform;
  if (!platformRequest) {
    platformRequest = http.get("/public/platform")
      .then((response) => {
        cachedPlatform = mergePlatformConfig(response.data);
        return cachedPlatform;
      })
      .catch(() => {
        cachedPlatform = mergePlatformConfig(DEFAULT_PLATFORM);
        return cachedPlatform;
      })
      .finally(() => {
        platformRequest = null;
      });
  }
  return platformRequest;
}

export function usePlatformConfig() {
  const [platform, setPlatform] = useState(() => cachedPlatform || mergePlatformConfig(DEFAULT_PLATFORM));
  const [loading, setLoading] = useState(!cachedPlatform);

  useEffect(() => {
    let mounted = true;

    loadPlatformConfig().then((resolved) => {
      if (!mounted) return;
      setPlatform(resolved);
      setLoading(false);
    });

    const handlePlatformUpdate = (event) => {
      const next = mergePlatformConfig(event?.detail || {});
      cachedPlatform = next;
      if (mounted) {
        setPlatform(next);
        setLoading(false);
      }
    };

    window.addEventListener("fandomforge:platform-updated", handlePlatformUpdate);
    return () => {
      mounted = false;
      window.removeEventListener("fandomforge:platform-updated", handlePlatformUpdate);
    };
  }, []);

  useEffect(() => {
    applyPlatformTheme(platform);
    applyPlatformDocumentBranding(platform);
  }, [platform]);

  return { platform, loading };
}

export function assetMaybe(url) {
  return url || "";
}
