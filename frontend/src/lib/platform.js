import { useEffect, useState } from "react";
import { http } from "./api";
import { applyPlatformTheme } from "./theme";

export const DEFAULT_PLATFORM = {
  platform_name: "FandomForge",
  platform_tagline: "Merch made simple",
  logo_url: "",
  favicon_url: "",

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

  support_email: "",
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
    creator_cta_label: "Start Selling",
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

export function mergePlatformConfig(value = {}) {
  const merged = {
    ...DEFAULT_PLATFORM,
    ...(value || {}),
    modules: { ...DEFAULT_PLATFORM.modules, ...((value || {}).modules || {}) },
    homepage: { ...DEFAULT_PLATFORM.homepage, ...((value || {}).homepage || {}) },
    signup: { ...DEFAULT_PLATFORM.signup, ...((value || {}).signup || {}) },
    policies: { ...DEFAULT_PLATFORM.policies, ...((value || {}).policies || {}) },
  };

  applyPlatformTheme(merged);

  return merged;
}

export function usePlatformConfig() {
  const [platform, setPlatform] = useState(() => {
    applyPlatformTheme(DEFAULT_PLATFORM);
    return DEFAULT_PLATFORM;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    applyPlatformTheme(DEFAULT_PLATFORM);

    http.get("/public/platform")
      .then((res) => {
        if (!mounted) return;
        const merged = mergePlatformConfig(res.data);
        applyPlatformTheme(merged);
        setPlatform(merged);
      })
      .catch(() => {
        if (!mounted) return;
        applyPlatformTheme(DEFAULT_PLATFORM);
        setPlatform(DEFAULT_PLATFORM);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    applyPlatformTheme(platform);
  }, [platform]);

  return { platform, loading };
}

export function assetMaybe(url) {
  return url || "";
}
