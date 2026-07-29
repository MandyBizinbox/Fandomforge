import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Factory, LogOut } from "lucide-react";
import NotificationBell from "./notifications/NotificationBell";
import PlatformBrand from "./branding/PlatformBrand";

function formatBadgeCount(value) {
  const count = Number(value || 0);
  if (count > 99) return "99+";
  return String(count);
}

function withManufacturingRulesLink(links = [], testidPrefix = "dash", notificationPath = "") {
  const isAdminDashboard = testidPrefix === "admin-dash" || String(notificationPath || "").startsWith("/admin/");
  if (!isAdminDashboard || links.some((link) => link.key === "manufacturing-rules" || link.to === "/admin/manufacturing-rules")) {
    return links;
  }

  const manufacturingLink = {
    to: "/admin/manufacturing-rules",
    label: "Manufacturing Rules",
    key: "manufacturing-rules",
    icon: <Factory size={14} />,
  };

  const output = [];
  let inserted = false;
  links.forEach((link) => {
    output.push(link);
    if (!inserted && link.key === "product-templates") {
      output.push(manufacturingLink);
      inserted = true;
    }
  });

  return inserted ? output : [...links, manufacturingLink];
}

export default function DashboardLayout({
  title,
  links,
  testidPrefix = "dash",
  notificationEndpoint = "",
  notificationPath = "",
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const navLinks = React.useMemo(
    () => withManufacturingRulesLink(links, testidPrefix, notificationPath),
    [links, testidPrefix, notificationPath]
  );

  return (
    <div className={`min-h-screen admin-workspace ${testidPrefix === "creator-dash" ? "creator-workspace" : ""} flex bg-[var(--ff-page-bg)] text-[var(--ff-page-text)]`}>
      <aside
        className="w-20 lg:w-64 admin-sidebar border-r border-[var(--ff-card-border)] bg-[var(--ff-card-bg)] text-[var(--ff-card-text)] flex flex-col min-h-screen sticky top-0"
        data-testid={`${testidPrefix}-sidebar`}
      >
        <button
          type="button"
          className="min-h-[92px] p-3 lg:p-6 border-b border-[var(--ff-card-border)] text-left flex items-center justify-center lg:justify-start overflow-hidden"
          onClick={() => navigate("/")}
          aria-label="Open platform home"
        >
          <span className="hidden lg:block w-full">
            <PlatformBrand className="max-h-12 max-w-[190px]" textClassName="font-display text-xl uppercase tracking-tight" showTagline />
          </span>
          <span className="lg:hidden">
            <PlatformBrand compact className="max-h-9 max-w-10" textClassName="font-display text-lg uppercase" />
          </span>
        </button>

        <nav className="flex-1 py-4 overflow-y-auto">
          {navLinks.map((link, index) => {
            if (link.type === "section") {
              return (
                <div
                  key={`${link.label}-${index}`}
                  className="hidden lg:block px-6 pt-5 pb-2 text-[10px] uppercase tracking-[0.22em] text-[var(--ff-muted-text)] font-bold"
                >
                  {link.label}
                </div>
              );
            }

            return (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                title={link.label}
                className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""} ${Number(link.badgeCount || 0) > 0 ? "sidebar-link-attention" : ""}`}
                data-testid={`${testidPrefix}-nav-${link.key}`}
              >
                <span className="shrink-0">{link.icon}</span>
                <span className="hidden lg:block min-w-0 flex-1 truncate">{link.label}</span>
                {Number(link.badgeCount || 0) > 0 && (
                  <span className="sidebar-link-badge" aria-label={`${link.badgeCount} pending`}>
                    {formatBadgeCount(link.badgeCount)}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-[var(--ff-card-border)] p-3 lg:p-4">
          <div className="hidden lg:block text-xs text-[var(--ff-muted-text)] mb-2 uppercase tracking-wider">{user?.name}</div>
          <div className="hidden lg:block text-[10px] text-[var(--ff-muted-text)] mb-3 break-all">{user?.email}</div>
          <button
            onClick={() => { logout(); navigate("/"); }}
            className="w-full flex items-center justify-center gap-2 border border-[var(--ff-card-border)] px-3 py-2 text-xs uppercase tracking-widest font-bold hover:bg-[var(--ff-button-primary-bg)] hover:text-[var(--ff-button-primary-text)] transition-colors"
            data-testid={`${testidPrefix}-logout-btn`}
            title="Sign out"
          >
            <LogOut size={14} /> <span className="hidden lg:inline">Sign out</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0" data-testid={`${testidPrefix}-main`}>
        <div className="admin-topbar sticky top-0 z-30 border-b border-[var(--ff-card-border)] bg-[var(--ff-header-bg)] text-[var(--ff-header-text)] backdrop-blur px-4 md:px-10 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="overline">{title}</div>
            <div className="text-xs opacity-70 truncate">{user?.name || user?.email}</div>
          </div>
          {notificationEndpoint && (
            <NotificationBell
              endpoint={notificationEndpoint}
              path={notificationPath}
              testidPrefix={testidPrefix}
            />
          )}
        </div>
        <div className="p-4 md:p-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
