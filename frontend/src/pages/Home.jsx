import React, { useMemo } from "react";
import Navbar from "../components/Navbar";
import PublicHomepageSections from "../components/public/PublicHomepageSections";
import { usePlatformConfig } from "../lib/platform";

function fallbackSections(platform) {
  const homepage = platform?.homepage || {};
  const platformName = platform?.platform_name || "Fandom Forge";
  return [
    {
      id: "fallback-hero",
      type: "hero",
      enabled: true,
      sort_order: 10,
      eyebrow: `${platformName} for communities`,
      title: homepage.hero_title || "Create merchandise for your community without buying stock or managing fulfilment.",
      subtitle: homepage.hero_subtitle || "Choose products, add artwork, set pricing and launch a dedicated storefront through the Creator Studio.",
      body_html: "",
      button_label: homepage.creator_cta_label || "Start Creating",
      button_url: homepage.creator_cta_url || "/register/creator",
      secondary_button_label: "See How It Works",
      secondary_button_url: "/how-it-works",
      image_url: "",
      settings: {},
    },
    {
      id: "fallback-how-it-works",
      type: "how_it_works",
      enabled: true,
      sort_order: 20,
      eyebrow: "How it works",
      title: "Create, price, publish, share and fulfil",
      subtitle: "The platform keeps product creation, pricing, orders and production information in one flow.",
      button_label: "View the Full Journey",
      button_url: "/how-it-works",
      settings: {},
    },
    {
      id: "fallback-audiences",
      type: "audience_cards",
      enabled: true,
      sort_order: 30,
      eyebrow: "Who it is for",
      title: "Merchandise for every kind of community",
      subtitle: "Creators, designers, gaming groups, racing communities, clubs, schools, teams, events and organisations can build through the same platform.",
      button_label: "Community Stores",
      button_url: "/clubs-schools-organisations",
      settings: {},
    },
    {
      id: "fallback-cta",
      type: "cta_banner",
      enabled: true,
      sort_order: 40,
      eyebrow: "Start creating",
      title: "Build your first product and storefront",
      subtitle: "Create your account, complete onboarding and use the Creator Studio to prepare your launch.",
      button_label: "Create Your Account",
      button_url: "/register/creator",
      secondary_button_label: "Creator Onboarding",
      secondary_button_url: "/creator-onboarding",
      settings: {},
    },
  ];
}

export default function Home() {
  const { platform } = usePlatformConfig();
  const sections = useMemo(() => {
    const configured = Array.isArray(platform?.homepage_sections) ? platform.homepage_sections : [];
    return configured.length ? configured : fallbackSections(platform);
  }, [platform]);

  return (
    <div className="min-h-screen page-shell">
      <Navbar />
      <PublicHomepageSections sections={sections} />
    </div>
  );
}
