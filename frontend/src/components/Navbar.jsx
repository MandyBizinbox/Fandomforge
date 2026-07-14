import React, { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { ShoppingBag, User, LogOut, Menu, X } from "lucide-react";
import { usePlatformConfig } from "../lib/platform";
import PlatformBrand from "./branding/PlatformBrand";

export default function Navbar() {
  const { user, logout } = useAuth();
  const { items } = useCart();
  const navigate = useNavigate();
  const { platform } = usePlatformConfig();
  const [mobileOpen, setMobileOpen] = useState(false);

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
    `text-[11px] uppercase tracking-[0.13em] font-bold ${isActive ? "text-[var(--ff-primary)]" : "opacity-70 hover:opacity-100"}`;

  const mobileLinkClass = ({ isActive }) =>
    `block px-4 py-3 text-sm uppercase tracking-[0.15em] font-bold border-b border-[var(--ff-card-border)] ${isActive ? "text-[var(--ff-primary)]" : ""}`;

  const closeMobile = () => setMobileOpen(false);

  const goToDashboard = () => {
    closeMobile();
    navigate(dashPath);
  };

  const signOut = () => {
    closeMobile();
    logout();
    navigate("/");
  };

  return (
    <header
      className="fixed top-0 left-0 right-0 w-full z-[80] backdrop-blur-md border-b border-[var(--ff-card-border)]"
      style={{ backgroundColor: headerBackground, color: headerText }}
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-8 h-16 flex items-center justify-between gap-3 min-w-0">
        <Link to="/" onClick={closeMobile} className="flex items-center min-w-0 flex-1 lg:flex-none lg:w-[190px]">
          <PlatformBrand className="h-9 max-w-[180px]" textClassName="font-display text-xl sm:text-2xl uppercase tracking-tight" />
        </Link>

        <nav className="hidden lg:flex items-center justify-center gap-5 xl:gap-7 flex-1">
          <NavLink to="/" className={navClass}>Home</NavLink>
          <NavLink to="/become-a-creator" className={navClass}>Become a Creator</NavLink>
          <NavLink to="/how-it-works" className={navClass}>How It Works</NavLink>
          <NavLink to="/products-and-pricing" className={navClass}>Products & Pricing</NavLink>
          <NavLink to="/clubs-schools-organisations" className={navClass}>Community Stores</NavLink>
          <NavLink to="/faq" className={navClass}>FAQ</NavLink>
        </nav>

        <div className="flex items-center justify-end gap-1 sm:gap-3 flex-shrink-0 lg:w-[190px]">
          <Link
            to="/cart"
            onClick={closeMobile}
            className={`relative p-2 hover:text-[var(--ff-primary)] ${items.length > 0 ? "inline-flex" : "hidden md:inline-flex"}`}
            aria-label="Cart"
          >
            <ShoppingBag size={20} />
            {items.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-[var(--ff-primary)] text-[var(--ff-button-primary-text)] text-[10px] w-4 h-4 flex items-center justify-center font-bold">
                {items.length}
              </span>
            )}
          </Link>

          {user ? (
            <>
              <button type="button" onClick={goToDashboard} className="hidden md:inline-flex btn-secondary text-xs py-2 px-2 sm:px-3">
                <User size={14} /> <span>{accountLabel}</span>
              </button>
              <button type="button" onClick={signOut} className="hidden md:inline-flex p-2 hover:text-[var(--ff-primary)]" title="Sign out">
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <Link to="/register/creator" className="btn-primary text-xs py-2 px-3 hidden sm:inline-flex">
              Start Creating
            </Link>
          )}

          <button
            type="button"
            className="lg:hidden inline-flex items-center justify-center w-10 h-10 flex-shrink-0 border border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] text-[var(--ff-card-text)]"
            onClick={() => setMobileOpen((open) => !open)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="lg:hidden absolute top-16 left-0 right-0 z-[90] border-b border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] text-[var(--ff-card-text)] shadow-2xl max-h-[calc(100vh-4rem)] overflow-y-auto">
          <nav className="px-3 py-3">
            <NavLink to="/" onClick={closeMobile} className={mobileLinkClass}>Home</NavLink>
            <NavLink to="/become-a-creator" onClick={closeMobile} className={mobileLinkClass}>Become a Creator</NavLink>
            <NavLink to="/how-it-works" onClick={closeMobile} className={mobileLinkClass}>How It Works</NavLink>
            <NavLink to="/products-and-pricing" onClick={closeMobile} className={mobileLinkClass}>Products & Pricing</NavLink>
            <NavLink to="/creator-onboarding" onClick={closeMobile} className={mobileLinkClass}>Creator Onboarding</NavLink>
            <NavLink to="/clubs-schools-organisations" onClick={closeMobile} className={mobileLinkClass}>Community Stores</NavLink>
            <NavLink to="/creator-earnings" onClick={closeMobile} className={mobileLinkClass}>Creator Earnings</NavLink>
            <NavLink to="/shipping-production-returns" onClick={closeMobile} className={mobileLinkClass}>Shipping & Returns</NavLink>
            <NavLink to="/faq" onClick={closeMobile} className={mobileLinkClass}>FAQ</NavLink>
            <NavLink to="/contact" onClick={closeMobile} className={mobileLinkClass}>Contact</NavLink>
            {!user && <NavLink to="/login" onClick={closeMobile} className={mobileLinkClass}>Login</NavLink>}

            {user && (
              <div className="grid grid-cols-2 gap-3 mt-4">
                <button type="button" onClick={goToDashboard} className="btn-secondary justify-center text-xs py-2 px-3">
                  <User size={14} /> {accountLabel}
                </button>
                <button type="button" onClick={signOut} className="btn-secondary justify-center text-xs py-2 px-3">
                  <LogOut size={14} /> Sign Out
                </button>
              </div>
            )}

            <Link to="/register/creator" onClick={closeMobile} className="btn-primary w-full justify-center mt-4">
              Start Creating
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
