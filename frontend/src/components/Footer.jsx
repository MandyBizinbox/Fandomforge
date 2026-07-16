import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Mail, MessageCircle, Phone } from "lucide-react";
import PlatformBrand from "./branding/PlatformBrand";
import { usePlatformConfig } from "../lib/platform";

const DASHBOARD_PREFIXES = ["/admin", "/creator", "/printer", "/manager"];

function isDashboardPath(pathname) {
  return DASHBOARD_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function digits(value) {
  return String(value || "").replace(/\D+/g, "");
}

export default function Footer() {
  const location = useLocation();
  const pathname = location.pathname || "";
  const { platform } = usePlatformConfig();

  if (isDashboardPath(pathname)) return null;

  const platformName = platform.platform_name || "Fandom Forge";
  const email = platform.public_contact_email || platform.support_email || "";
  const phone = platform.public_contact_phone || platform.support_phone || "";
  const whatsapp = platform.support_whatsapp || phone || "";

  return (
    <footer className="site-footer border-t border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] text-[var(--ff-card-text)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-10 py-10">
        <div className="grid gap-8 md:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_0.8fr]">
          <div>
            <PlatformBrand className="max-h-14 max-w-[220px]" textClassName="font-display text-3xl uppercase leading-none" showTagline />
            <p className="text-sm text-[var(--ff-muted-text)] mt-3 max-w-md">
              Create merchandise for creators, clubs, schools, teams, events and communities without carrying stock or managing the fulfilment workflow.
            </p>
            <div className="flex flex-col gap-3 mt-5 text-sm">
              {email && (
                <a href={`mailto:${email}`} className="inline-flex items-center gap-2 hover:text-[var(--ff-primary)]">
                  <Mail size={16} /> {email}
                </a>
              )}
              {phone && (
                <a href={`tel:${phone}`} className="inline-flex items-center gap-2 hover:text-[var(--ff-primary)]">
                  <Phone size={16} /> {phone}
                </a>
              )}
              {whatsapp && (
                <a href={`https://wa.me/${digits(whatsapp)}`} className="inline-flex items-center gap-2 hover:text-[var(--ff-primary)]">
                  <MessageCircle size={16} /> WhatsApp
                </a>
              )}
            </div>
          </div>

          <FooterColumn title={platformName} links={[
            ["Home", "/"],
            ["Become a Creator", "/become-a-creator"],
            ["How It Works", "/how-it-works"],
            ["Products & Pricing", "/products-and-pricing"],
          ]} />

          <FooterColumn title="For Creators" links={[
            ["Start Creating", "/register/creator"],
            ["Creator Onboarding", "/creator-onboarding"],
            ["Creator Earnings", "/creator-earnings"],
            ["Creator FAQ", "/faq"],
          ]} />

          <FooterColumn title="Communities" links={[
            ["Clubs, Schools & Organisations", "/clubs-schools-organisations"],
            ["Shipping, Production & Returns", "/shipping-production-returns"],
            ["Contact Support", "/contact"],
            ["Login", "/login"],
          ]} />

          <FooterColumn title="Legal" links={[
            ["Creator Terms", "/creator-terms"],
            ["Customer Terms", "/terms"],
            ["Privacy Policy", "/privacy"],
            ["Shipping Policy", "/shipping-policy"],
            ["Returns Policy", "/returns"],
          ]} />
        </div>

        <div className="border-t border-[var(--ff-card-border)] mt-8 pt-5 text-xs text-[var(--ff-muted-text)] flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} {platformName}. All rights reserved.</span>
          <span>{platform.platform_tagline || "Merchandise made for every community."}</span>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }) {
  return (
    <div>
      <div className="overline mb-3">{title}</div>
      <nav className="grid gap-2 text-sm" aria-label={`${title} links`}>
        {links.map(([label, to]) => (
          <Link key={`${title}-${label}`} to={to} className="hover:text-[var(--ff-primary)]">
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
