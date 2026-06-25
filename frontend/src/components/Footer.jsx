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
        <div className="grid gap-8 md:grid-cols-[1.2fr_0.8fr_0.8fr]">
          <div>
            <div className="font-display text-3xl uppercase leading-none">
              Fandom<span className="brand-text">Forge</span>
            </div>
            <p className="text-sm text-[var(--ff-muted-text)] mt-3 max-w-md">
              Creator merch, made to order in South Africa. We help creators, groups and fans get official merch produced and fulfilled.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 mt-5 text-sm">
              <a href="mailto:info@theforgeza.co.za" className="inline-flex items-center gap-2 hover:text-[var(--ff-primary)]">
                <Mail size={16} /> info@theforgeza.co.za
              </a>
              <a href="https://wa.me/27712116050" className="inline-flex items-center gap-2 hover:text-[var(--ff-primary)]">
                <MessageCircle size={16} /> WhatsApp 071 211 6050
              </a>
            </div>
          </div>

          <div>
            <div className="overline mb-3">Help</div>
            <nav className="grid gap-2 text-sm">
              <Link to="/contact" className="hover:text-[var(--ff-primary)]">Contact Us</Link>
              <Link to="/delivery-terms" className="hover:text-[var(--ff-primary)]">Delivery Terms</Link>
              <Link to="/shop-terms" className="hover:text-[var(--ff-primary)]">Shop Terms</Link>
              <Link to="/privacy-policy" className="hover:text-[var(--ff-primary)]">Privacy Policy</Link>
            </nav>
          </div>

          <div>
            <div className="overline mb-3">Company</div>
            <div className="text-sm text-[var(--ff-muted-text)] space-y-1">
              <p>FandomForge (PTY) Ltd</p>
              <p>Reg: 2024/705706/07</p>
              <p>Durbanville, South Africa</p>
              <p>Support: Mon–Fri, 9am–4pm</p>
            </div>
          </div>
        </div>

        <div className="border-t border-[var(--ff-card-border)] mt-8 pt-5 text-xs text-[var(--ff-muted-text)] flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} FandomForge. All rights reserved.</span>
          <span>Made-to-order creator merch platform.</span>
        </div>
      </div>
    </footer>
  );
}
