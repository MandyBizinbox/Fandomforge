import React, { useEffect } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { ShoppingBag, User, LogOut } from "lucide-react";
import { usePlatformConfig } from "../lib/platform";

export default function Navbar() {
  const { user, logout } = useAuth();
  const { items } = useCart();
  const navigate = useNavigate();
  const { platform } = usePlatformConfig();

  useEffect(() => {
    const root = document.documentElement;
    const primaryBg = platform.button_primary_background_color || platform.primary_color || "#FF3B30";
    const primaryText = platform.button_primary_text_color || "#FFFFFF";
    const alternateBg = platform.button_alternate_background_color || "#FFFFFF";
    const alternateText = platform.button_alternate_text_color || "#000000";

    root.style.setProperty("--brand", primaryBg);
    root.style.setProperty("--button-primary-bg", primaryBg);
    root.style.setProperty("--button-primary-text", primaryText);
    root.style.setProperty("--button-primary-border", primaryBg);
    root.style.setProperty("--button-alternate-bg", alternateBg);
    root.style.setProperty("--button-alternate-text", alternateText);
    root.style.setProperty("--button-alternate-border", alternateBg);
  }, [
    platform.primary_color,
    platform.button_primary_background_color,
    platform.button_primary_text_color,
    platform.button_alternate_background_color,
    platform.button_alternate_text_color,
  ]);

  const dashPath =
    user?.role === "super_admin" || user?.role === "admin"
      ? "/admin"
      : user?.role === "manager"
      ? "/manager"
      : user?.role === "creator"
      ? "/creator"
      : user?.role === "printer"
      ? "/printer"
      : "/account";

  const accountLabel =
    user?.role === "super_admin" || user?.role === "admin"
      ? "Admin"
      : user?.role === "manager"
      ? "Manager"
      : user?.role === "creator"
      ? "Creator"
      : user?.role === "printer"
      ? "Printer"
      : "Account";

  const headerBackground = platform.header_background_color || (platform.theme_mode === "light" ? "#FFFFFF" : "#0A0A0A");
  const headerText = platform.header_text_color || (platform.theme_mode === "light" ? "#111111" : "#FFFFFF");

  const navClass = ({ isActive }) =>
    `text-xs uppercase tracking-[0.15em] font-bold ${
      isActive ? "" : "opacity-70 hover:opacity-100"
    }`;

  return (
    <header
      className="fixed top-0 left-0 right-0 w-full z-50 backdrop-blur-md border-b border-[var(--ff-card-border)]"
      style={{ backgroundColor: headerBackground, color: headerText }}
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-10 h-16 flex items-center justify-between gap-2 min-w-0">
        <Link to="/" className="flex items-center gap-2 min-w-0 flex-shrink">
          {platform.logo_url ? <img src={platform.logo_url} alt={platform.platform_name} className="h-8 sm:h-9 max-w-[120px] sm:max-w-[180px] object-contain" /> : <><span className="font-display text-xl sm:text-2xl uppercase tracking-tight truncate">{String(platform.platform_name || "FandomForge").split(" ")[0]}</span><span className="font-display text-xl sm:text-2xl uppercase tracking-tight brand-text truncate">{String(platform.platform_name || "FandomForge").split(" ").slice(1).join(" ") || ""}</span></>}
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          <NavLink to="/" className={navClass}>Home</NavLink>
          <NavLink to="/sell" className={navClass}>Sell Online</NavLink>
          <NavLink to="/about" className={navClass}>About Us</NavLink>
          <NavLink to="/contact" className={navClass}>Contact Us</NavLink>
          {!user && <NavLink to="/login" className={navClass}>Login</NavLink>}
        </nav>

        <div className="flex items-center gap-1 sm:gap-3 flex-shrink-0">
          <Link to="/cart" className="relative p-2 hover:text-[var(--ff-primary)]" aria-label="Cart">
            <ShoppingBag size={20} />
            {items.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-[var(--ff-primary)] text-[var(--ff-button-primary-text)] text-[10px] w-4 h-4 flex items-center justify-center font-bold">
                {items.length}
              </span>
            )}
          </Link>

          {user ? (
            <>
              <button type="button" onClick={() => navigate(dashPath)} className="btn-secondary text-xs py-2 px-2 sm:px-3">
                <User size={14} /> <span className="hidden sm:inline">{accountLabel}</span>
              </button>
              <button type="button" onClick={() => { logout(); navigate("/"); }} className="p-2 hover:text-[var(--ff-primary)]" title="Sign out">
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <Link to="/sell" className="btn-primary text-xs py-2 px-3 hidden sm:inline-flex">
              Sell Online
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
