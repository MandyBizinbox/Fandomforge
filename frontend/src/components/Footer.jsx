import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Mail, MessageCircle } from "lucide-react";

const DASHBOARD_PREFIXES = ["/admin", "/creator", "/printer", "/manager"];

export default function Footer() {
  const location = useLocation();
  const pathname = location.pathname || "";

  if (DASHBOARD_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return null;
  }

  return (
    <footer className="site-footer border-t border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] text-[var(--ff-card-text)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-10 py-10">
        <div className="grid gap-8 md:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_0.8fr]">
          <div>
            <div className="font-display text-3xl uppercase leading-none">
              Fandom<span className="brand-text">Forge</span>
            </div>
            <p className="text-sm text-[var(--ff-muted-text)] mt-3 max-w-md">
              Branded online merch stores for creators, schools, Scout groups, clubs, churches and communities. Share your store link; FandomForge handles printing, payments and fulfilment.
            </p>
            <div className="flex flex-col gap-3 mt-5 text-sm">
              <a href="mailto:info@theforgeza.co.za" className="inline-flex items-center gap-2 hover:text-[var(--ff-primary)]">
                <Mail size={16} /> info@theforgeza.co.za
              </a>
              <a href="https://wa.me/27712116050" className="inline-flex items-center gap-2 hover:text-[var(--ff-primary)]">
                <MessageCircle size={16} /> WhatsApp 071 211 6050
              </a>
            </div>
          </div>

          <FooterColumn title="FandomForge" links={[
            ["Home", "/"],
            ["Sell Online", "/sell"],
            ["About Us", "/about"],
            ["Contact Us", "/contact"],
          ]} />

          <FooterColumn title="For Creators" links={[
            ["Apply to Start a Store", "/register/creator"],
            ["Login", "/login"],
            ["How It Works", "/sell#how-it-works"],
            ["Store Privacy", "/sell#store-visibility"],
          ]} />

          <FooterColumn title="Support" links={[
            ["Contact Us", "/contact"],
            ["Order Help", "/contact"],
            ["Creator Help", "/contact"],
          ]} />

          <FooterColumn title="Legal" links={[
            ["Terms", "/shop-terms"],
            ["Privacy Policy", "/privacy-policy"],
            ["Refund Policy", "/shop-terms"],
          ]} />
        </div>

        <div className="border-t border-[var(--ff-card-border)] mt-8 pt-5 text-xs text-[var(--ff-muted-text)] flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} FandomForge. All rights reserved.</span>
          <span>Direct-link merch stores, made to order in South Africa.</span>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }) {
  return (
    <div>
      <div className="overline mb-3">{title}</div>
      <nav className="grid gap-2 text-sm">
        {links.map(([label, to]) => (
          <Link key={`${title}-${label}`} to={to} className="hover:text-[var(--ff-primary)]">{label}</Link>
        ))}
      </nav>
    </div>
  );
}
